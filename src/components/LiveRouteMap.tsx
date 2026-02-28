"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useRouteMap } from "@/hooks/useRouteMap";

// Leaflet uses browser-only APIs — never run on the server
const LiveRouteMapContent = dynamic(
  () =>
    import("@/components/LiveRouteMapContent").then(
      (m) => m.LiveRouteMapContent,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[360px] w-full items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-blue-500" />
      </div>
    ),
  },
);

interface Props {
  /** The route whose driver we are watching. */
  routeId: string;
}

/**
 * LiveRouteMap
 *
 * Toggle panel for the business side.
 * Renders a "View Live Location" button; expanding it mounts the Leaflet
 * map and starts the Supabase Realtime subscription.
 */
export function LiveRouteMap({ routeId }: Props) {
  const [open, setOpen] = useState(false);
  const { position, trail, isLive, loading } = useRouteMap(
    open ? routeId : null, // only subscribe when panel is open
  );

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/60">
      {/* ── Header / toggle button ────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          {/* Pin icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span className="text-sm font-semibold text-blue-800">
            Live Driver Location
          </span>
          {/* Live / offline pill */}
          {open && !loading && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                isLive
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-zinc-100 text-zinc-500"
              }`}
            >
              {isLive && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
              )}
              {isLive ? "Live" : position ? "Last known" : "No signal"}
            </span>
          )}
        </div>

        {/* Chevron */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-4 w-4 text-blue-500 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ── Map panel ─────────────────────────────────────────────────── */}
      {open && (
        <div className="border-t border-blue-100 p-3">
          <LiveRouteMapContent
            position={position}
            trail={trail}
            isLive={isLive}
          />
          <p className="mt-2 text-center text-xs text-zinc-400">
            Map data © OpenStreetMap contributors · Updates every 5 s
          </p>
        </div>
      )}
    </div>
  );
}
