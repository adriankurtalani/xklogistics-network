"use client";

interface Props {
  /** "sm" fits inline in text/cards; "md" is the default standalone badge */
  size?: "sm" | "md";
}

/**
 * VerifiedBadge
 *
 * Displayed next to any transporter whose is_verified flag is true.
 * Shows a shield-check icon + "Transportues i Verifikuar" label.
 */
export function VerifiedBadge({ size = "md" }: Props) {
  if (size === "sm") {
    return (
      <span
        title="Transportues i Verifikuar nga XKLogistics"
        className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200"
      >
        <svg
          className="h-3 w-3 shrink-0 text-blue-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
          />
        </svg>
        Verifikuar
      </span>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 ring-1 ring-blue-200">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600">
        <svg
          className="h-4 w-4 text-white"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
          />
        </svg>
      </div>
      <div>
        <p className="text-xs font-bold text-blue-800">Transportues i Verifikuar</p>
        <p className="text-xs text-blue-600">Dokumentet e verifikuara nga XKLogistics</p>
      </div>
    </div>
  );
}
