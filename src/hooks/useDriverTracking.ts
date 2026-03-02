import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { GPSTracker } from "@/lib/gpsTracker";
import type { GPSPoint, OnPermission, SpoofEvent, SpoofReason } from "@/lib/gpsTracker";

export type PermissionState = "idle" | "requesting" | "granted" | "denied";

export interface TrackingState {
  active: boolean;
  permission: PermissionState;
  lastPoint: GPSPoint | null;
  pointCount: number;
  /** GPS hardware / permission errors */
  error: string | null;
  /** Supabase INSERT errors — separate so the UI can show them distinctly */
  uploadError: string | null;
  /** Number of suspicious GPS readings flagged since tracking started. */
  spoofWarnings: number;
  /** Most recent spoof event (reason + implied speed), or null if clean. */
  lastSpoofEvent: SpoofEvent | null;
  /** True when the tracker was auto-stopped due to repeated suspicious readings. */
  spoofBlocked: boolean;
}

/** Human-readable descriptions for each spoof reason shown in the UI. */
export const SPOOF_REASON_LABELS: Record<SpoofReason, string> = {
  impossible_coordinates: "Coordinates outside physical bounds",
  position_jump:         "Impossible position jump detected",
  speed_anomaly:         "Unrealistic speed detected",
};

/**
 * useDriverTracking
 *
 * Manages the full GPS tracking lifecycle for a transporter on a specific route.
 * Uploads every Kalman-smoothed point to driver_locations in Supabase.
 * Exposes uploadError separately so UI can diagnose RLS / schema problems.
 */
export function useDriverTracking(routeId: string, transporterId: string) {
  const trackerRef = useRef<GPSTracker | null>(null);

  const [state, setState] = useState<TrackingState>({
    active:         false,
    permission:     "idle",
    lastPoint:      null,
    pointCount:     0,
    error:          null,
    uploadError:    null,
    spoofWarnings:  0,
    lastSpoofEvent: null,
    spoofBlocked:   false,
  });

  // ── Upload a smoothed point ──────────────────────────────────────────────
  const uploadPoint = useCallback(async (point: GPSPoint) => {
    console.log("[GPS] Uploading point:", {
      route_id:  routeId,
      lat:       point.lat,
      lng:       point.lng,
      accuracy:  point.accuracy,
    });

    const { error } = await supabase
      .from("driver_locations")
      .insert({
        route_id:       routeId,
        transporter_id: transporterId,
        latitude:       point.lat,
        longitude:      point.lng,
        accuracy:       point.accuracy,
        speed:          point.speed,
        heading:        point.heading,
        altitude:       point.altitude,
        recorded_at:    new Date(point.ts).toISOString(),
      });

    if (error) {
      console.error("[GPS] INSERT failed:", error.code, error.message, error.details, error.hint);
      setState((prev) => ({ ...prev, uploadError: `${error.code}: ${error.message}` }));
      return;
    }

    console.log("[GPS] Inserted row OK — lat:", point.lat.toFixed(5), "lng:", point.lng.toFixed(5));

    setState((prev) => ({
      ...prev,
      lastPoint:   point,
      pointCount:  prev.pointCount + 1,
      uploadError: null,
    }));
  }, [routeId, transporterId]);

  // ── Permission callback ──────────────────────────────────────────────────
  const handlePermission = useCallback<OnPermission>((status) => {
    setState((prev) => ({
      ...prev,
      permission: status,
      active:     status === "granted" ? true : prev.active,
    }));
  }, []);

  // ── Spoof warning callback (individual suspicious reading) ────────────────
  const handleSpoofWarning = useCallback((event: SpoofEvent) => {
    setState((prev) => ({
      ...prev,
      spoofWarnings:  prev.spoofWarnings + 1,
      lastSpoofEvent: event,
    }));
  }, []);

  // ── Spoof detected callback (tracker auto-stopped after repeated flags) ───
  const handleSpoofDetected = useCallback((event: SpoofEvent) => {
    setState((prev) => ({
      ...prev,
      active:         false,
      spoofBlocked:   true,
      lastSpoofEvent: event,
    }));
  }, []);

  // ── Start ────────────────────────────────────────────────────────────────
  const startTracking = useCallback(async () => {
    if (trackerRef.current?.isRunning) return;

    setState((prev) => ({
      ...prev,
      error:          null,
      uploadError:    null,
      pointCount:     0,
      lastPoint:      null,
      permission:     "requesting",
      spoofWarnings:  0,
      lastSpoofEvent: null,
      spoofBlocked:   false,
    }));

    const tracker = new GPSTracker(
      uploadPoint,
      (err) => {
        const messages: Record<number, string> = {
          1: "GPS permission denied. Allow location access in browser settings.",
          2: "GPS signal unavailable. Enable location services.",
          3: "GPS request timed out. Check signal and try again.",
        };
        setState((prev) => ({
          ...prev,
          active: false,
          error:  messages[err.code] ?? `GPS error ${err.code}`,
        }));
      },
      handlePermission,
      handleSpoofWarning,
      handleSpoofDetected,
    );

    trackerRef.current = tracker;
    await tracker.start();
  }, [uploadPoint, handlePermission, handleSpoofWarning, handleSpoofDetected]);

  // ── Stop ─────────────────────────────────────────────────────────────────
  const stopTracking = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    setState((prev) => ({ ...prev, active: false, permission: "idle" }));
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => { trackerRef.current?.stop(); };
  }, []);

  return { state, startTracking, stopTracking };
}
