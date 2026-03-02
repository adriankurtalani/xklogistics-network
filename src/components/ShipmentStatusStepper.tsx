"use client";

import type { ShipmentStatus } from "@/types/shipment";
import { SHIPMENT_STATUS_STEPS } from "@/types/shipment";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  currentStatus: ShipmentStatus;
  /** Timestamp from requests.created_at — when the transporter accepted the request. */
  requestAcceptedAt?: string | null;
  /** Timestamp from shipment_details.created_at — when the business filled in details. */
  shipmentCreatedAt?: string | null;
  /** Whether the business has confirmed delivery receipt. */
  deliveryConfirmed?: boolean;
  /** Timestamp from shipment_details.delivery_confirmed_at. */
  deliveryConfirmedAt?: string | null;
}

// ---------------------------------------------------------------------------
// Timeline step definitions
// ---------------------------------------------------------------------------

type StepState = "done" | "active" | "upcoming" | "waiting";

interface TimelineStep {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  state: StepState;
  timestamp?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTs(ts?: string | null): string | null {
  if (!ts) return null;
  try {
    return new Date(ts).toLocaleString("sq-AL", {
      day:    "2-digit",
      month:  "short",
      year:   "numeric",
      hour:   "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

function Icon({ d }: { d: string }) {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const STEP_ICONS: Record<string, React.ReactNode> = {
  request_accepted:   <Icon d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
  detajet_plotësuara: <Icon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />,
  ngarkuar:           <Icon d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />,
  në_transit:         <Icon d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />,
  dorëzuar:           <Icon d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />,
  delivery_confirmed: <Icon d="M4.5 12.75l6 6 9-13.5" />,
};

const STEP_META: Record<string, { label: string; description: string }> = {
  request_accepted:   { label: "Kërkesa u pranua",                 description: "Transportuesi pranoi kërkesën tuaj të transportit." },
  detajet_plotësuara: { label: "Detajet e dërgesës plotësuar",     description: "Biznesi ka konfirmuar kontaktin, adresën dhe peshën." },
  ngarkuar:           { label: "Malli u ngarkua",                  description: "Ngarkesa është vendosur në mjetin e transportit." },
  në_transit:         { label: "Në transit",                       description: "Mjeti është në rrugë drejt destinacionit." },
  dorëzuar:           { label: "Arritur — dorëzuar",               description: "Transportuesi ka shënuar mallin si të dorëzuar." },
  delivery_confirmed: { label: "Konfirmuar nga biznesi",           description: "Biznesi ka konfirmuar marrjen e mallit. Rruga u mbyll." },
};

// ---------------------------------------------------------------------------
// Dot component for each timeline node
// ---------------------------------------------------------------------------

function Dot({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 ring-4 ring-emerald-50">
        <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  if (state === "active") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 ring-4 ring-zinc-100">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
        </span>
      </div>
    );
  }
  if (state === "waiting") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400 ring-4 ring-amber-50">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
        </span>
      </div>
    );
  }
  // upcoming
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-zinc-300 bg-white ring-4 ring-zinc-50">
      <span className="h-2 w-2 rounded-full bg-zinc-300" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ShipmentStatusStepper (now a vertical timeline)
// ---------------------------------------------------------------------------

export function ShipmentStatusStepper({
  currentStatus,
  requestAcceptedAt,
  shipmentCreatedAt,
  deliveryConfirmed,
  deliveryConfirmedAt,
}: Props) {
  const currentIdx = SHIPMENT_STATUS_STEPS.findIndex((s) => s.key === currentStatus);

  // Build the ordered list of timeline steps
  const steps: TimelineStep[] = [
    // ── 1. Request accepted ────────────────────────────────────────────────
    {
      id:          "request_accepted",
      ...STEP_META.request_accepted,
      icon:        STEP_ICONS.request_accepted,
      state:       "done", // always done if we can render a timeline at all
      timestamp:   requestAcceptedAt,
    },

    // ── 2–5. Shipment status steps ─────────────────────────────────────────
    ...SHIPMENT_STATUS_STEPS.map((step, idx): TimelineStep => {
      let state: StepState;
      if (idx < currentIdx)       state = "done";
      else if (idx === currentIdx) state = "active";
      else                         state = "upcoming";

      // "dorëzuar" active but delivery not yet confirmed → waiting variant
      if (step.key === "dorëzuar" && idx === currentIdx && !deliveryConfirmed) {
        state = "active";
      }

      return {
        id:        step.key,
        ...STEP_META[step.key],
        icon:      STEP_ICONS[step.key],
        state,
        timestamp: step.key === "detajet_plotësuara" ? shipmentCreatedAt : null,
      };
    }),

    // ── 6. Business delivery confirmation ─────────────────────────────────
    {
      id:          "delivery_confirmed",
      ...STEP_META.delivery_confirmed,
      icon:        STEP_ICONS.delivery_confirmed,
      state:       deliveryConfirmed
                     ? "done"
                     : currentStatus === "dorëzuar"
                       ? "waiting"  // amber pulse — business action needed
                       : "upcoming",
      timestamp:   deliveryConfirmedAt,
    },
  ];

  return (
    <div className="w-full">
      {steps.map((step, i) => {
        const isLast   = i === steps.length - 1;
        const isDone   = step.state === "done";
        const isActive = step.state === "active" || step.state === "waiting";

        return (
          <div key={step.id} className="flex gap-4">
            {/* Left column: dot + connector line */}
            <div className="flex flex-col items-center">
              <Dot state={step.state} />
              {!isLast && (
                <div
                  className={`mt-1 w-0.5 flex-1 min-h-[2rem] ${
                    isDone   ? "bg-emerald-400"
                    : isActive ? "bg-gradient-to-b from-zinc-400 to-zinc-200"
                    : "border-l-2 border-dashed border-zinc-200 bg-transparent w-0"
                  }`}
                />
              )}
            </div>

            {/* Right column: content */}
            <div className={`pb-6 min-w-0 flex-1 ${isLast ? "pb-0" : ""}`}>
              {/* Icon + label row */}
              <div className="flex items-center gap-2 pt-1">
                <span className={`shrink-0 ${
                  isDone   ? "text-emerald-600"
                  : isActive ? "text-zinc-900"
                  : "text-zinc-300"
                }`}>
                  {step.icon}
                </span>
                <span className={`text-sm font-semibold leading-tight ${
                  isDone   ? "text-emerald-700"
                  : isActive ? "text-zinc-900"
                  : "text-zinc-400"
                }`}>
                  {step.label}
                </span>

                {/* State pill */}
                {step.state === "active" && (
                  <span className="shrink-0 rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white">
                    Aktual
                  </span>
                )}
                {step.state === "waiting" && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                    Pret konfirmim
                  </span>
                )}
              </div>

              {/* Description */}
              <p className={`mt-0.5 pl-6 text-xs leading-relaxed ${
                isDone || isActive ? "text-zinc-500" : "text-zinc-300"
              }`}>
                {step.description}
              </p>

              {/* Timestamp */}
              {formatTs(step.timestamp) && (
                <p className="mt-1 pl-6 text-xs text-zinc-400">
                  <span className="mr-1">🕐</span>
                  {formatTs(step.timestamp)}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
