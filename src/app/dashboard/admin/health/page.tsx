"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/Toast";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SystemHealth {
  active_routes:           number;
  signal_lost_routes:      number;
  idle_routes:             number;
  expiring_requests:       number;
  expired_requests:        number;
  unconfirmed_deliveries:  number;
  failed_jobs_24h:         number;
  snapshot_at:             string;
}

interface SystemEvent {
  id:         string;
  event_type: string;
  source:     string;
  severity:   "info" | "warning" | "error" | "critical";
  message:    string;
  metadata:   Record<string, unknown> | null;
  created_at: string;
}

interface JobRun {
  id:               string;
  job_name:         string;
  triggered_by:     string;
  started_at:       string;
  finished_at:      string | null;
  status:           "running" | "success" | "failed";
  records_affected: number;
  error_message:    string | null;
}

// ─── Config: Edge Function jobs ───────────────────────────────────────────────

const JOBS = [
  {
    key:         "expire-stale-requests",
    label:       "Expire Stale Requests",
    description: "Auto-expires pending requests older than 48 h",
    schedule:    "Every 2 hours",
    icon:        "⏱",
  },
  {
    key:         "detect-signal-lost",
    label:       "Detect Signal Loss",
    description: "Flags in_transit routes with no GPS ping for > 10 min",
    schedule:    "Every 5 minutes",
    icon:        "📡",
  },
  {
    key:         "notify-unconfirmed-deliveries",
    label:       "Unconfirmed Deliveries",
    description: "Notifies admins of deliveries unconfirmed for > 72 h",
    schedule:    "9am & 9pm daily",
    icon:        "📦",
  },
  {
    key:         "detect-idle-routes",
    label:       "Detect Idle Routes",
    description: "Flags routes still 'available' after their departure date",
    schedule:    "6am daily",
    icon:        "🛣",
  },
] as const;

type JobKey = (typeof JOBS)[number]["key"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: string): string {
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (secs < 60)   return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function formatTs(ts: string): string {
  return new Date(ts).toLocaleString("sq-AL", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<SystemEvent["severity"], { dot: string; row: string; badge: string }> = {
  info:     { dot: "bg-blue-400",    row: "",                       badge: "bg-blue-100 text-blue-700"    },
  warning:  { dot: "bg-amber-400",   row: "bg-amber-50/40",         badge: "bg-amber-100 text-amber-700"  },
  error:    { dot: "bg-red-500",     row: "bg-red-50/40",           badge: "bg-red-100 text-red-700"      },
  critical: { dot: "bg-red-700",     row: "bg-red-100/60",          badge: "bg-red-200 text-red-900"      },
};

const STATUS_STYLES = {
  running: "bg-blue-100 text-blue-700",
  success: "bg-emerald-100 text-emerald-700",
  failed:  "bg-red-100 text-red-700",
};

function StatCard({
  label, value, sub, accent,
}: { label: string; value: number; sub?: string; accent: "red" | "amber" | "blue" | "emerald" | "zinc" }) {
  const colors = {
    red:     "border-red-200 bg-red-50 text-red-700",
    amber:   "border-amber-200 bg-amber-50 text-amber-700",
    blue:    "border-blue-200 bg-blue-50 text-blue-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    zinc:    "border-zinc-200 bg-zinc-50 text-zinc-700",
  }[accent];

  return (
    <div className={`rounded-2xl border p-4 ${colors}`}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="mt-0.5 text-sm font-medium">{label}</p>
      {sub && <p className="mt-0.5 text-xs opacity-70">{sub}</p>}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SystemHealthPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [health,   setHealth]   = useState<SystemHealth | null>(null);
  const [events,   setEvents]   = useState<SystemEvent[]>([]);
  const [jobRuns,  setJobRuns]  = useState<JobRun[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [triggering, setTriggering] = useState<JobKey | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SystemEvent["severity"] | "all">("all");
  const realtimeSub = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/auth/login"); return; }
      const { data: u } = await supabase.from("users").select("role").eq("id", data.session.user.id).single();
      if (u?.role !== "admin") { router.replace("/dashboard/admin"); return; }
      setCheckingAuth(false);
      await fetchAll();
      subscribeToEvents();
    };
    void init();
    return () => { realtimeSub.current?.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // ── Data fetching ───────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [healthRes, eventsRes, runsRes] = await Promise.all([
      supabase.from("v_system_health").select("*").single(),
      supabase.from("system_events").select("*").order("created_at", { ascending: false }).limit(80),
      supabase.from("background_job_runs").select("*").order("started_at", { ascending: false }).limit(40),
    ]);
    if (healthRes.data)  setHealth(healthRes.data as SystemHealth);
    if (eventsRes.data)  setEvents(eventsRes.data as SystemEvent[]);
    if (runsRes.data)    setJobRuns(runsRes.data as JobRun[]);
    setLoading(false);
  }, []);

  // ── Realtime: prepend new system_events as they arrive ─────────────────────
  const subscribeToEvents = useCallback(() => {
    realtimeSub.current = supabase
      .channel("realtime:system_events")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "system_events" },
        (payload) => {
          setEvents((prev) => [payload.new as SystemEvent, ...prev].slice(0, 80));
          // Also refresh health stats
          supabase.from("v_system_health").select("*").single().then(({ data }) => {
            if (data) setHealth(data as SystemHealth);
          });
        },
      )
      .subscribe();
  }, []);

  // ── Manual job trigger ──────────────────────────────────────────────────────
  const triggerJob = async (jobKey: JobKey) => {
    setTriggering(jobKey);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

      const res = await fetch(
        `${supabaseUrl}/functions/v1/${jobKey}`,
        {
          method:  "POST",
          headers: {
            "Authorization":   `Bearer ${token}`,
            "Content-Type":    "application/json",
            "x-triggered-by":  "admin_manual",
          },
          body: "{}",
        },
      );

      if (res.ok) {
        const result = await res.json() as Record<string, unknown>;
        showToast(`Job "${jobKey}" kompletuar: ${JSON.stringify(result)}`, "success");
        await fetchAll();
      } else {
        const err = await res.text();
        showToast(`Gabim: ${err}`, "error");
      }
    } catch (e) {
      showToast(`Gabim rrjeti: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setTriggering(null);
    }
  };

  // ── Filtered events ─────────────────────────────────────────────────────────
  const filteredEvents = severityFilter === "all"
    ? events
    : events.filter((e) => e.severity === severityFilter);

  // ── Loading / auth ──────────────────────────────────────────────────────────
  if (checkingAuth) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
      </div>
    );
  }

  const hasWarnings =
    (health?.signal_lost_routes ?? 0) > 0 ||
    (health?.idle_routes ?? 0) > 0 ||
    (health?.expiring_requests ?? 0) > 0 ||
    (health?.unconfirmed_deliveries ?? 0) > 0 ||
    (health?.failed_jobs_24h ?? 0) > 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title="Shëndeti i Sistemit"
        description="Monitorim i punëve automatike dhe ngjarjeve të sistemit në kohë reale."
        actions={
          <button
            type="button"
            onClick={fetchAll}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
          >
            <svg className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Rifresko
          </button>
        }
      />

      {/* ── Warning banner ───────────────────────────────────────────────── */}
      {hasWarnings && !loading && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="mt-0.5 text-amber-500 text-lg shrink-0">⚠</span>
          <div className="text-sm text-amber-800">
            <p className="font-semibold">Ka probleme aktive që kërkojnë vëmendje</p>
            <ul className="mt-1 space-y-0.5 text-xs opacity-90">
              {(health?.signal_lost_routes ?? 0) > 0       && <li>• {health!.signal_lost_routes} rrugë kanë humbur sinjalin GPS</li>}
              {(health?.idle_routes ?? 0) > 0               && <li>• {health!.idle_routes} rrugë janë joaktive (data kaloi)</li>}
              {(health?.expiring_requests ?? 0) > 0         && <li>• {health!.expiring_requests} kërkesa janë afer skadimit (&gt;48h)</li>}
              {(health?.unconfirmed_deliveries ?? 0) > 0    && <li>• {health!.unconfirmed_deliveries} dorëzime pa konfirmim (&gt;72h)</li>}
              {(health?.failed_jobs_24h ?? 0) > 0           && <li>• {health!.failed_jobs_24h} punë dështuan në 24h e fundit</li>}
            </ul>
          </div>
        </div>
      )}

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <StatCard label="Rrugë Aktive"        value={health?.active_routes ?? 0}          accent="emerald" />
        <StatCard label="GPS Humbur"           value={health?.signal_lost_routes ?? 0}     accent={health?.signal_lost_routes ? "red" : "zinc"} sub="in_transit, no ping" />
        <StatCard label="Rrugë Joaktive"       value={health?.idle_routes ?? 0}            accent={health?.idle_routes ? "amber" : "zinc"} sub="date passed" />
        <StatCard label="Kërkesa Skaduese"     value={health?.expiring_requests ?? 0}      accent={health?.expiring_requests ? "amber" : "zinc"} sub="+48h pending" />
        <StatCard label="Kërkesa Skaduar"      value={health?.expired_requests ?? 0}       accent="zinc" />
        <StatCard label="Dorëzime Pa Konfirm." value={health?.unconfirmed_deliveries ?? 0} accent={health?.unconfirmed_deliveries ? "amber" : "zinc"} sub="+72h" />
        <StatCard label="Punë Dështuar (24h)"  value={health?.failed_jobs_24h ?? 0}        accent={health?.failed_jobs_24h ? "red" : "zinc"} />
      </div>

      {/* ── Main grid: jobs + events ──────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-5">

        {/* Left: scheduled jobs ─────────────────────────────────────────── */}
        <div className="space-y-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-zinc-900">Punët e Planifikuara</h2>

          {JOBS.map((job) => {
            const lastRun = jobRuns.find((r) => r.job_name === job.key);
            const isRunning = triggering === job.key;

            return (
              <div key={job.key} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
                      <span>{job.icon}</span>
                      {job.label}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">{job.description}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      Planifikim: <span className="font-medium">{job.schedule}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => triggerJob(job.key)}
                    title="Ekzekuto manualisht"
                    className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                  >
                    {isRunning ? (
                      <span className="flex items-center gap-1">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
                        Running…
                      </span>
                    ) : "▶ Run"}
                  </button>
                </div>

                {/* Last run info */}
                {lastRun && (
                  <div className="mt-3 flex items-center justify-between border-t border-zinc-50 pt-2.5 text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLES[lastRun.status]}`}>
                      {lastRun.status}
                    </span>
                    <span className="text-zinc-400">
                      {lastRun.records_affected} records
                      {" · "}
                      {timeAgo(lastRun.started_at)}
                      {" · "}
                      <span className="capitalize">{lastRun.triggered_by.replace("_", " ")}</span>
                    </span>
                  </div>
                )}
                {!lastRun && (
                  <p className="mt-2 text-xs text-zinc-300 italic">Nuk ka ekzekutime ende.</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Right: realtime event feed ───────────────────────────────────── */}
        <div className="lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">
              Ngjarjet e Sistemit
              <span className="relative ml-2 inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            </h2>
            <div className="flex gap-1">
              {(["all", "warning", "error", "critical", "info"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverityFilter(s)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    severityFilter === s
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-500 hover:bg-zinc-100"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
              </div>
            ) : filteredEvents.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-400">
                Asnjë ngjarje{severityFilter !== "all" ? ` me severity "${severityFilter}"` : ""} ende.
              </p>
            ) : (
              <div className="divide-y divide-zinc-50 overflow-y-auto max-h-[640px]">
                {filteredEvents.map((evt) => {
                  const s = SEVERITY_STYLES[evt.severity];
                  return (
                    <div key={evt.id} className={`flex gap-3 px-4 py-3 ${s.row}`}>
                      {/* Dot */}
                      <div className="mt-1.5 flex shrink-0 flex-col items-center">
                        <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                      </div>
                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${s.badge}`}>
                            {evt.severity}
                          </span>
                          <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">
                            {evt.source}
                          </span>
                          <span className="ml-auto shrink-0 text-xs text-zinc-400">
                            {timeAgo(evt.created_at)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-800">{evt.message}</p>
                        {evt.metadata && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-600">
                              metadata
                            </summary>
                            <pre className="mt-1 overflow-x-auto rounded bg-zinc-50 p-2 text-xs text-zinc-600">
                              {JSON.stringify(evt.metadata, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Job run history ─────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Historiku i Ekzekutimeve</h2>
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100">
          {jobRuns.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">Nuk ka ekzekutime ende.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-zinc-100 bg-zinc-50 text-zinc-500">
                  <tr>
                    {["Punë", "Trigger", "Filloi", "Mbaroi", "Statusi", "Rekorde", "Gabim"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {jobRuns.map((run) => (
                    <tr key={run.id} className="hover:bg-zinc-50/50">
                      <td className="px-4 py-2.5 font-medium text-zinc-800">{run.job_name}</td>
                      <td className="px-4 py-2.5 text-zinc-500 capitalize">{run.triggered_by.replace("_", " ")}</td>
                      <td className="px-4 py-2.5 text-zinc-500">{formatTs(run.started_at)}</td>
                      <td className="px-4 py-2.5 text-zinc-500">
                        {run.finished_at ? formatTs(run.finished_at) : <span className="italic text-blue-400">running…</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_STYLES[run.status]}`}>
                          {run.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-zinc-600">{run.records_affected}</td>
                      <td className="px-4 py-2.5 max-w-xs truncate text-red-600">
                        {run.error_message ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
