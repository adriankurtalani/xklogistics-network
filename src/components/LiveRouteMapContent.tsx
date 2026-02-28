"use client";

import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Circle,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { DriverPosition } from "@/hooks/useRouteMap";

// ── Fix Leaflet default icon paths broken by Webpack ──────────────────────
// Using divIcon eliminates the need to copy PNG assets to /public
const truckIcon = L.divIcon({
  className: "",
  html: `
    <div style="
      position:relative;
      width:38px;height:38px;
      display:flex;align-items:center;justify-content:center;
    ">
      <span style="
        position:absolute;inset:0;
        border-radius:50%;
        background:rgba(37,99,235,0.25);
        animation:ping 1.4s cubic-bezier(0,0,0.2,1) infinite;
      "></span>
      <div style="
        width:30px;height:30px;border-radius:50%;
        background:#1d4ed8;border:3px solid #fff;
        box-shadow:0 2px 10px rgba(0,0,0,0.35);
        display:flex;align-items:center;justify-content:center;
        font-size:15px;
        position:relative;z-index:1;
      ">🚛</div>
    </div>
    <style>
      @keyframes ping {
        75%,100%{transform:scale(2);opacity:0}
      }
    </style>
  `,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
});

// ── Smooth auto-pan to follow the driver ──────────────────────────────────
function MapFollower({ position }: { position: DriverPosition | null }) {
  const map = useMap();
  useEffect(() => {
    if (!position) return;
    map.panTo([position.lat, position.lng], { animate: true, duration: 0.8 });
  }, [position, map]);
  return null;
}

// ── Props ─────────────────────────────────────────────────────────────────
interface Props {
  position: DriverPosition | null;
  trail: DriverPosition[];
  isLive: boolean;
}

export function LiveRouteMapContent({ position, trail, isLive }: Props) {
  const center: [number, number] = position
    ? [position.lat, position.lng]
    : [42.6629, 21.1655]; // Kosovo centre fallback

  const trailCoords = trail.map(
    (p) => [p.lat, p.lng] as [number, number],
  );

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-zinc-200 shadow-sm"
         style={{ height: 360 }}>

      {/* ── Leaflet Map ─────────────────────────────────────────────────── */}
      <MapContainer
        center={center}
        zoom={14}
        className="h-full w-full"
        zoomControl
        scrollWheelZoom
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
        />

        {/* Breadcrumb trail */}
        {trailCoords.length > 1 && (
          <Polyline
            positions={trailCoords}
            color="#3b82f6"
            weight={3}
            opacity={0.65}
            dashArray="10 5"
          />
        )}

        {/* GPS accuracy radius */}
        {position && (
          <Circle
            center={[position.lat, position.lng]}
            radius={position.accuracy}
            pathOptions={{
              color: "#3b82f6",
              fillColor: "#3b82f6",
              fillOpacity: 0.08,
              weight: 1,
            }}
          />
        )}

        {/* Driver truck marker */}
        {position && (
          <Marker
            position={[position.lat, position.lng]}
            icon={truckIcon}
          />
        )}

        <MapFollower position={position} />
      </MapContainer>

      {/* ── Overlay: status badge (top-left) ───────────────────────────── */}
      <div className="pointer-events-none absolute left-3 top-3 z-[1000]">
        {isLive ? (
          <div className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow backdrop-blur-sm ring-1 ring-emerald-200">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Driver Live
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-zinc-500 shadow backdrop-blur-sm ring-1 ring-zinc-200">
            <span className="h-2 w-2 rounded-full bg-zinc-400" />
            {position ? "Last known position" : "Waiting for driver…"}
          </div>
        )}
      </div>

      {/* ── Overlay: stats panel (bottom-left) ─────────────────────────── */}
      {position && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-lg bg-white/90 px-3 py-2 text-xs shadow backdrop-blur-sm ring-1 ring-zinc-100">
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-zinc-700">
            <p>
              <span className="text-zinc-400">Accuracy </span>
              <span className="font-medium">±{Math.round(position.accuracy)} m</span>
            </p>
            {position.speed != null && (
              <p>
                <span className="text-zinc-400">Speed </span>
                <span className="font-medium">
                  {Math.round(position.speed * 3.6)} km/h
                </span>
              </p>
            )}
            <p className="col-span-2 text-zinc-400">
              Updated{" "}
              {new Date(position.recordedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </p>
          </div>
        </div>
      )}

      {/* ── No position yet ─────────────────────────────────────────────── */}
      {!position && (
        <div className="pointer-events-none absolute inset-0 z-[1000] flex flex-col items-center justify-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-blue-500" />
          <p className="rounded-lg bg-white/80 px-3 py-1.5 text-xs text-zinc-500 shadow backdrop-blur-sm">
            Waiting for driver to start GPS tracking…
          </p>
        </div>
      )}
    </div>
  );
}
