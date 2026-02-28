"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { logAdminAction } from "@/lib/auditLog";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/Toast";

type Target = "all" | "transporter" | "business";
type NotifType = "info" | "success" | "warning" | "error";

const TARGET_LABELS: Record<Target, string> = { all: "Të gjithë përdoruesit", transporter: "Transportuesit", business: "Bizneset" };
const TYPE_LABELS:   Record<NotifType, string> = { info: "Informacion", success: "Sukses", warning: "Paralajmërim", error: "Gabim" };
const TYPE_COLORS:   Record<NotifType, string> = {
  info:    "bg-blue-50 border-blue-200 text-blue-800",
  success: "bg-emerald-50 border-emerald-200 text-emerald-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  error:   "bg-red-50 border-red-200 text-red-800",
};

interface BroadcastHistory { id: string; target: string; title: string; message: string; type: string; recipients: number; created_at: string }

export default function AdminBroadcastPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [adminId, setAdminId]           = useState("");
  const [target, setTarget]             = useState<Target>("all");
  const [title, setTitle]               = useState("");
  const [message, setMessage]           = useState("");
  const [notifType, setNotifType]       = useState<NotifType>("info");
  const [sending, setSending]           = useState(false);
  const [history, setHistory]           = useState<BroadcastHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/auth/login"); return; }
      const { data: u } = await supabase.from("users").select("role").eq("id", data.session.user.id).single();
      if (u?.role !== "admin") { router.replace("/dashboard/admin"); return; }
      setAdminId(data.session.user.id);
      setCheckingAuth(false);
      await fetchHistory();
    };
    void init();
  }, [router]);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    const { data } = await supabase.from("audit_log").select("id, details, created_at").eq("action", "broadcast_notification").order("created_at", { ascending: false }).limit(20);
    setHistory(
      (data ?? []).map((row) => ({
        id:         row.id,
        target:     (row.details as Record<string, unknown>)?.target as string ?? "—",
        title:      (row.details as Record<string, unknown>)?.title as string ?? "—",
        message:    (row.details as Record<string, unknown>)?.message as string ?? "—",
        type:       (row.details as Record<string, unknown>)?.type as string ?? "info",
        recipients: (row.details as Record<string, unknown>)?.recipients as number ?? 0,
        created_at: row.created_at as string,
      }))
    );
    setLoadingHistory(false);
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;
    setSending(true);

    // Fetch target user IDs
    let query = supabase.from("users").select("id");
    if (target !== "all") query = query.eq("role", target);
    const { data: userRows, error: userErr } = await query;

    if (userErr || !userRows?.length) {
      showToast(userErr?.message ?? "Nuk u gjetën përdorues.", "error");
      setSending(false);
      return;
    }

    // Batch insert notifications
    const notifications = userRows.map((u) => ({
      user_id: u.id,
      title:   title.trim(),
      message: message.trim(),
      type:    notifType,
      read:    false,
    }));

    const BATCH = 200;
    for (let i = 0; i < notifications.length; i += BATCH) {
      const { error } = await supabase.from("notifications").insert(notifications.slice(i, i + BATCH));
      if (error) { showToast(error.message, "error"); setSending(false); return; }
    }

    await logAdminAction({
      adminId,
      action: "broadcast_notification",
      details: { target, title: title.trim(), message: message.trim(), type: notifType, recipients: userRows.length },
    });

    showToast(`Njoftimi u dërgua te ${userRows.length} përdorues.`, "success");
    setTitle(""); setMessage(""); setTarget("all"); setNotifType("info");
    setSending(false);
    await fetchHistory();
  };

  if (checkingAuth) return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Njoftimet Masive"
        description="Dërgo njoftime në kohë reale te të gjithë ose një grup specifik përdoruesish."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Compose */}
        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-zinc-100">
          <h2 className="mb-5 text-sm font-semibold text-zinc-900">Kompozo Njoftimin</h2>
          <form onSubmit={handleSend} className="space-y-4">
            {/* Target */}
            <div>
              <label className="mb-2 block text-xs font-medium text-zinc-700">Destinatarët</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(TARGET_LABELS) as Target[]).map((t) => (
                  <button key={t} type="button" onClick={() => setTarget(t)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${target === t ? "bg-zinc-900 text-white border-zinc-900" : "border-zinc-300 text-zinc-600 hover:bg-zinc-50"}`}>
                    {TARGET_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Type */}
            <div>
              <label className="mb-2 block text-xs font-medium text-zinc-700">Lloji</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(TYPE_LABELS) as NotifType[]).map((t) => (
                  <button key={t} type="button" onClick={() => setNotifType(t)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${notifType === t ? TYPE_COLORS[t] + " font-bold" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"}`}>
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">Titulli <span className="text-red-500">*</span></label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder='p.sh. "Korridori i ri disponibël"' className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">Mesazhi <span className="text-red-500">*</span></label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Shkruaj mesazhin e njoftimit..." className="w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none" />
            </div>

            {/* Preview */}
            {(title || message) && (
              <div className={`rounded-lg border px-4 py-3 text-sm ${TYPE_COLORS[notifType]}`}>
                <p className="font-semibold">{title || "Titulli..."}</p>
                <p className="mt-1 text-xs opacity-80">{message || "Mesazhi..."}</p>
              </div>
            )}

            <button type="submit" disabled={sending || !title.trim() || !message.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60">
              {sending && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
              {sending ? "Duke dërguar..." : `Dërgo te ${TARGET_LABELS[target]}`}
            </button>
          </form>
        </section>

        {/* History */}
        <section className="rounded-xl bg-white shadow-sm ring-1 ring-zinc-100">
          <div className="border-b border-zinc-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-zinc-900">Historia e Dërgimeve</h2>
          </div>
          {loadingHistory ? (
            <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" /></div>
          ) : history.length === 0 ? (
            <p className="py-10 text-center text-xs text-zinc-400">Asnjë njoftim i dërguar ende.</p>
          ) : (
            <div className="divide-y divide-zinc-50 max-h-[500px] overflow-y-auto">
              {history.map((h) => (
                <div key={h.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[h.type as NotifType] ?? ""}`}>{TYPE_LABELS[h.type as NotifType] ?? h.type}</span>
                    <span className="text-xs text-zinc-400">{new Date(h.created_at).toLocaleString("sq-AL")}</span>
                  </div>
                  <p className="text-sm font-medium text-zinc-800">{h.title}</p>
                  <p className="text-xs text-zinc-500 mt-0.5 truncate">{h.message}</p>
                  <p className="text-xs text-zinc-400 mt-1">Destinatarët: <span className="font-medium">{TARGET_LABELS[h.target as Target] ?? h.target}</span> · {h.recipients} përdorues</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
