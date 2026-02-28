"use client";

import { useEffect } from "react";
import { useDriverTracking } from "@/hooks/useDriverTracking";

// Key written to localStorage so GPS auto-restarts after a page refresh
const LS_KEY = "xkl_active_gps_route";

interface Props {
  routeId: string;
  transporterId: string;
}

/**
 * TrackingActivator
 *
 * Rendered inside each in_transit route card.
 * - Handles GPS permission + start/stop lifecycle
 * - Persists the active route ID in localStorage so GPS restarts automatically
 *   if the driver refreshes the browser tab
 */
export function TrackingActivator({ routeId, transporterId }: Props) {
  const { state, startTracking, stopTracking } = useDriverTracking(
    routeId,
    transporterId,
  );

  // ── Auto-restart on mount if this route was previously active ────────────
  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored === routeId) {
      void startTracking();
    }
  // startTracking is stable (useCallback), routeId never changes per mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  // ── Persist active state so refresh auto-restarts ────────────────────────
  useEffect(() => {
    if (state.active) {
      localStorage.setItem(LS_KEY, routeId);
    } else {
      // Only clear if it's THIS route stored (not another one)
      if (localStorage.getItem(LS_KEY) === routeId) {
        localStorage.removeItem(LS_KEY);
      }
    }
  }, [state.active, routeId]);

  const handleStart = () => void startTracking();
  const handleStop = () => {
    localStorage.removeItem(LS_KEY);
    stopTracking();
  };

  // ── Requesting permission ────────────────────────────────────────────────
  if (state.permission === "requesting") {
    return (
      <div className="flex items-center gap-2 rounded-md bg-sky-50 px-3 py-1.5 text-xs text-sky-700">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-sky-500" />
        Requesting GPS permission…
      </div>
    );
  }

  // ── Permission denied ────────────────────────────────────────────────────
  if (state.permission === "denied") {
    return (
      <div className="rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700">
        <p className="font-semibold">GPS permission denied</p>
        <p className="mt-0.5 text-red-500">
          Allow location access in your browser settings, then reload.
        </p>
      </div>
    );
  }

  // ── Hard GPS error (not an upload error) ─────────────────────────────────
  if (state.error && !state.active) {
    return (
      <div className="rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700">
        <p className="font-semibold">GPS error</p>
        <p className="mt-0.5 text-red-500">{state.error}</p>
        <button
          type="button"
          onClick={handleStart}
          className="mt-1.5 rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-500"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Active — GPS is running ──────────────────────────────────────────────
  if (state.active) {
    return (
      <div className="flex flex-col gap-1.5">

        {/* Live indicator row */}
        <div className="flex items-center justify-between gap-3 rounded-md bg-emerald-50 px-3 py-1.5">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-semibold text-emerald-800">GPS Live</span>
          </div>
          <button
            type="button"
            onClick={handleStop}
            className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500"
          >
            Stop GPS
          </button>
        </div>

        {/* Waiting for first fix */}
        {!state.lastPoint && (
          <div className="flex items-center gap-2 rounded-md bg-sky-50 px-3 py-1.5 text-xs text-sky-700">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-sky-400" />
            Acquiring GPS fix… (may take up to 20 s)
          </div>
        )}

        {/* Upload error — shown inline so driver can see it without opening console */}
        {state.uploadError && (
          <div className="rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            <p className="font-semibold">Upload error — location not reaching server</p>
            <p className="mt-0.5 font-mono text-amber-700">{state.uploadError}</p>
          </div>
        )}

        {/* Live stats — only once first point arrives */}
        {state.lastPoint && (
          <div className="grid grid-cols-2 gap-x-3 rounded-md border border-zinc-100 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600">
            <p>
              <span className="text-zinc-400">Points sent </span>
              <span className="font-medium text-zinc-800">{state.pointCount}</span>
            </p>
            <p>
              <span className="text-zinc-400">Accuracy </span>
              <span className={`font-medium ${state.lastPoint.accuracy > 100 ? "text-amber-600" : "text-zinc-800"}`}>
                ±{Math.round(state.lastPoint.accuracy)} m
                {state.lastPoint.accuracy > 100 && " (low)"}
              </span>
            </p>
            {state.lastPoint.speed != null && (
              <p>
                <span className="text-zinc-400">Speed </span>
                <span className="font-medium text-zinc-800">
                  {Math.round(state.lastPoint.speed * 3.6)} km/h
                </span>
              </p>
            )}
            <p>
              <span className="text-zinc-400">Lat / Lng </span>
              <span className="font-medium text-zinc-800">
                {state.lastPoint.lat.toFixed(4)}, {state.lastPoint.lng.toFixed(4)}
              </span>
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Idle — not started ───────────────────────────────────────────────────
  return (
    <button
      type="button"
      onClick={handleStart}
      className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 active:scale-95 transition-transform"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none"
        viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      Start GPS Tracking
    </button>
  );
}
