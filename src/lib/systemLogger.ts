/**
 * systemLogger — client-side observability bridge
 *
 * Routes errors/events to:
 *  1. Sentry (if NEXT_PUBLIC_SENTRY_DSN is set)
 *  2. system_events table  (optional, for admin visibility)
 *  3. console (always, for local dev)
 */

import { supabase } from "./supabaseClient";

export type Severity = "info" | "warning" | "error" | "critical";

export interface SystemEvent {
  event_type: string;
  source:     string;
  severity:   Severity;
  message:    string;
  metadata?:  Record<string, unknown>;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function getSentry() {
  if (typeof window === "undefined") return null;
  try {
    // Dynamic so it doesn't hard-fail if Sentry DSN is absent
    return (globalThis as unknown as { Sentry?: typeof import("@sentry/nextjs") }).Sentry ?? null;
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Log a structured event.
 * @param persist   Write to `system_events` DB table (requires admin auth).
 *                  Set to false for high-frequency events (GPS ticks, etc.).
 */
export async function logEvent(event: SystemEvent, persist = false): Promise<void> {
  const { event_type, source, severity, message, metadata } = event;

  // 1. Console
  const consoleFn = severity === "error" || severity === "critical"
    ? console.error
    : severity === "warning"
    ? console.warn
    : console.info;

  consoleFn(`[${severity.toUpperCase()}] ${source} — ${message}`, metadata ?? "");

  // 2. Sentry (errors and criticals only, or pass any severity you want)
  if (severity === "error" || severity === "critical") {
    try {
      const Sentry = (await import("@sentry/nextjs"));
      if (Sentry && process.env.NEXT_PUBLIC_SENTRY_DSN) {
        Sentry.captureMessage(message, {
          level:  severity === "critical" ? "fatal" : "error",
          tags:   { source, event_type },
          extra:  metadata,
        });
      }
    } catch {
      // Sentry not available — silently continue
    }
  }

  // 3. Persist to system_events table (admin visibility)
  if (persist) {
    try {
      await supabase.from("system_events").insert({
        event_type,
        source,
        severity,
        message,
        metadata: metadata ?? null,
      });
    } catch {
      // Don't let logging failures disrupt the main flow
    }
  }
}

/** Shorthand helpers */
export const logInfo     = (source: string, msg: string, meta?: Record<string, unknown>) =>
  logEvent({ event_type: "info",     source, severity: "info",     message: msg, metadata: meta });

export const logWarning  = (source: string, msg: string, meta?: Record<string, unknown>) =>
  logEvent({ event_type: "warning",  source, severity: "warning",  message: msg, metadata: meta }, true);

export const logError    = (source: string, msg: string, meta?: Record<string, unknown>) =>
  logEvent({ event_type: "error",    source, severity: "error",    message: msg, metadata: meta }, true);

export const logCritical = (source: string, msg: string, meta?: Record<string, unknown>) =>
  logEvent({ event_type: "critical", source, severity: "critical", message: msg, metadata: meta }, true);

/**
 * Wrap a Supabase call and log + report any error automatically.
 * Usage:
 *   const data = await withErrorTracking("MyComponent", () =>
 *     supabase.from("routes").select("*"));
 */
export async function withErrorTracking<T>(
  source: string,
  fn: () => Promise<{ data: T | null; error: { message: string } | null }>,
): Promise<T | null> {
  const { data, error } = await fn();
  if (error) {
    await logError(source, error.message, { query: source });
    return null;
  }
  return data;
}
