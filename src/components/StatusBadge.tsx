type StatusVariant = "available" | "in_transit" | "completed" | "pending" | "accepted" | "rejected";

interface StatusBadgeProps {
  variant: StatusVariant;
}

const VARIANT_STYLES: Record<StatusVariant, string> = {
  available: "bg-emerald-50 text-emerald-700",
  in_transit: "bg-amber-50 text-amber-700",
  completed: "bg-zinc-100 text-zinc-600",
  pending: "bg-sky-50 text-sky-700",
  accepted: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
};

const VARIANT_LABELS: Record<StatusVariant, string> = {
  available: "Available",
  in_transit: "In transit",
  completed: "Completed",
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
};

export function StatusBadge({ variant }: StatusBadgeProps) {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium";

  return (
    <span className={`${base} ${VARIANT_STYLES[variant]}`}>
      {VARIANT_LABELS[variant]}
    </span>
  );
}

