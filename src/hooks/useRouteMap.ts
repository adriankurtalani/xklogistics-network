import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface DriverPosition {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  recordedAt: string;
}

export interface RouteMapState {
  position: DriverPosition | null; // latest smoothed point
  trail: DriverPosition[];         // last 100 points (breadcrumb path)
  isLive: boolean;                 // true = receiving pings within last 30 s
  loading: boolean;
}

/**
 * useRouteMap
 *
 * Fetches the driver's last known position and subscribes to live updates
 * via Supabase Realtime for a given route.
 *
 * RLS ensures only the business linked to an accepted request on this
 * route can read the data — no extra client-side check needed.
 */
export function useRouteMap(routeId: string | null): RouteMapState {
  const [state, setState] = useState<RouteMapState>({
    position: null,
    trail: [],
    isLive: false,
    loading: true,
  });

  // Track when the last ping was received to determine "live" status
  const lastPingRef = useRef<number>(0);
  const liveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!routeId) {
      setState({ position: null, trail: [], isLive: false, loading: false });
      return;
    }

    let cancelled = false;

    // ── 1. Fetch last 100 recorded points ──────────────────────────────────
    const loadInitial = async () => {
      const { data, error } = await supabase
        .from("driver_locations")
        .select("*")
        .eq("route_id", routeId)
        .order("recorded_at", { ascending: false })
        .limit(100);

      if (error) {
        console.error("[Map] Initial fetch failed:", error.code, error.message, error.hint);
      }

      if (cancelled) return;

      if (!data?.length) {
        setState((prev) => ({ ...prev, loading: false }));
        return;
      }

      // Reverse so trail is chronological (oldest → newest)
      // Support both recorded_at and created_at column names
      const pts: DriverPosition[] = (data as any[])
        .map((r) => ({
          lat:        r.latitude  ?? r.lat ?? 0,
          lng:        r.longitude ?? r.lng ?? 0,
          accuracy:   r.accuracy  ?? 999,
          speed:      r.speed     ?? null,
          heading:    r.heading   ?? null,
          recordedAt: r.recorded_at ?? r.created_at ?? new Date().toISOString(),
        }))
        .reverse();

      const latest = pts[pts.length - 1];
      const ageMs = Date.now() - new Date(latest.recordedAt ?? Date.now()).getTime();

      setState({
        position: latest,
        trail: pts,
        isLive: ageMs < 30_000, // consider "live" if last ping < 30 s ago
        loading: false,
      });

      lastPingRef.current = Date.now() - ageMs;
    };

    void loadInitial();

    // ── 2. Subscribe to new pings via Supabase Realtime ────────────────────
    const channel = supabase
      .channel(`live-route:${routeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "driver_locations",
          filter: `route_id=eq.${routeId}`,
        },
        (payload) => {
          if (cancelled) return;
          const r = payload.new as any;
          const pt: DriverPosition = {
            lat:        r.latitude  ?? r.lat ?? 0,
            lng:        r.longitude ?? r.lng ?? 0,
            accuracy:   r.accuracy  ?? 999,
            speed:      r.speed     ?? null,
            heading:    r.heading   ?? null,
            recordedAt: r.recorded_at ?? r.created_at ?? new Date().toISOString(),
          };

          lastPingRef.current = Date.now();

          setState((prev) => ({
            ...prev,
            position: pt,
            trail: [...prev.trail.slice(-99), pt],
            isLive: true,
          }));
        },
      )
      .subscribe();

    // ── 3. Poll every 10 s to flip isLive → false when pings stop ──────────
    liveTimerRef.current = setInterval(() => {
      const silentMs = Date.now() - lastPingRef.current;
      if (silentMs > 30_000) {
        setState((prev) => (prev.isLive ? { ...prev, isLive: false } : prev));
      }
    }, 10_000);

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
      if (liveTimerRef.current) clearInterval(liveTimerRef.current);
    };
  }, [routeId]);

  return state;
}
