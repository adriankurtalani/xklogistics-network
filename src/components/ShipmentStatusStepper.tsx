"use client";

import type { ShipmentStatus } from "@/types/shipment";
import { SHIPMENT_STATUS_STEPS } from "@/types/shipment";

interface Props {
  currentStatus: ShipmentStatus;
}

export function ShipmentStatusStepper({ currentStatus }: Props) {
  const currentIdx = SHIPMENT_STATUS_STEPS.findIndex((s) => s.key === currentStatus);

  return (
    <div className="w-full">
      <div className="relative flex items-center justify-between">
        {/* Connector line */}
        <div className="absolute left-0 top-3.5 h-0.5 w-full bg-zinc-200" />
        <div
          className="absolute left-0 top-3.5 h-0.5 bg-emerald-500 transition-all duration-500"
          style={{ width: `${(currentIdx / (SHIPMENT_STATUS_STEPS.length - 1)) * 100}%` }}
        />

        {SHIPMENT_STATUS_STEPS.map((step, idx) => {
          const done    = idx < currentIdx;
          const active  = idx === currentIdx;
          const pending = idx > currentIdx;

          return (
            <div key={step.key} className="relative flex flex-col items-center">
              <div
                className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                  done    ? "border-emerald-500 bg-emerald-500"
                  : active ? "border-zinc-900 bg-zinc-900"
                  : "border-zinc-300 bg-white"
                }`}
              >
                {done ? (
                  <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className={`text-xs font-bold ${active ? "text-white" : "text-zinc-400"}`}>
                    {idx + 1}
                  </span>
                )}
              </div>
              <span
                className={`mt-2 whitespace-nowrap text-xs font-medium ${
                  done    ? "text-emerald-600"
                  : active ? "text-zinc-900"
                  : "text-zinc-400"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
