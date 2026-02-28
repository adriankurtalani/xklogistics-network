"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { logAdminAction } from "@/lib/auditLog";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/Toast";

interface Announcement {
  id: string;
  message: string;
  color: "info" | "warning" | "error" | "success";
  is_active: boolean;
  created_at: string;
}

const COLOR_LABELS = { info: "Informacion", warning: "Paralajmërim", error: "Gabim", success: "Sukses" };
const COLOR_PREVIEW: Record<string, string> = {
  info:    "bg-blue-50 border-blue-200 text-blue-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  error:   "bg-red-50 border-red-200 text-red-800",
  success: "bg-emerald-50 border-emerald-200 text-emerald-800",
};

export default function AdminAnnouncementsPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [adminId, setAdminId]           = useState("");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading]           = useState(false);
  const [saving, setSaving]             = useState(false);
  const [togglingId, setTogglingId]     = useState<string | null>(null);
  const [deletingId, setDeletingId]     = useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [color, setColor]     = useState<Announcement["color"]>("info");

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/auth/login"); return; }
      const { data: u } = await supabase.from("users").select("role").eq("id", data.session.user.id).single();
      if (u?.role !== "admin") { router.replace("/dashboard/admin"); return; }
      setAdminId(data.session.user.id);
      setCheckingAuth(false);
      await fetchAnnouncements();
    };
    void init();
  }, [router]);

  const fetchAnnouncements = async () => {
    setLoading(true);
    const { data } = await supabase.from("announcements").select("*").order("created_at", { ascending: false });
    setAnnouncements((data ?? []) as Announcement[]);
    setLoading(false);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSaving(true);
    // Deactivate all others first
    await supabase.from("announcements").update({ is_active: false }).neq("id", "00000000-0000-0000-0000-000000000000");
    const { error } = await supabase.from("announcements").insert({ message: message.trim(), color, is_active: true });
    setSaving(false);
    if (error) { showToast(error.message, "error"); return; }
    await logAdminAction({ adminId, action: "create_announcement", details: { message, color } });
    showToast("Njoftimi u krijua dhe aktivizua.", "success");
    setMessage(""); setColor("info");
    await fetchAnnouncements();
  };

  const handleToggle = async (ann: Announcement) => {
    setTogglingId(ann.id);
    if (!ann.is_active) {
      // Deactivate all first, then activate this one
      await supabase.from("announcements").update({ is_active: false }).neq("id", "00000000-0000-0000-0000-000000000000");
    }
    await supabase.from("announcements").update({ is_active: !ann.is_active }).eq("id", ann.id);
    setTogglingId(null);
    await logAdminAction({ adminId, action: ann.is_active ? "deactivate_announcement" : "activate_announcement", targetId: ann.id });
    await fetchAnnouncements();
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    await supabase.from("announcements").delete().eq("id", id);
    setDeletingId(null);
    await logAdminAction({ adminId, action: "delete_announcement", targetId: id });
    showToast("Njoftimi u fshi.", "success");
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  };

  if (checkingAuth) return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" /></div>;

  const activeAnn = announcements.find((a) => a.is_active);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Banneri i Njoftimeve"
        description="Vendos një mesazh të dukshëm në faqe kryesore dhe brenda panelit."
      />

      {/* Current active preview */}
      {activeAnn && (
        <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${COLOR_PREVIEW[activeAnn.color]}`}>
          <span className="font-medium">Aktiv tani:</span>
          <span className="flex-1">{activeAnn.message}</span>
          <button type="button" onClick={() => handleToggle(activeAnn)} className="shrink-0 text-xs font-medium underline">
            Çaktivizo
          </button>
        </div>
      )}

      {/* Create form */}
      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-zinc-100">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Krijo Njoftim të Ri</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">Mesazhi</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              placeholder='p.sh. "Platforma do të jetë nën mirëmbajtje të Shtunën 22:00–24:00."'
              className="w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">Lloji</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(COLOR_LABELS) as Announcement["color"][]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${color === c ? COLOR_PREVIEW[c] + " font-bold" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"}`}
                >
                  {COLOR_LABELS[c]}
                </button>
              ))}
            </div>
          </div>
          {/* Live preview */}
          {message && (
            <div className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm ${COLOR_PREVIEW[color]}`}>
              <span className="font-medium">Pamje:</span> {message}
            </div>
          )}
          <div className="flex justify-end">
            <button type="submit" disabled={saving || !message.trim()} className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60">
              {saving && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
              {saving ? "Duke ruajtur..." : "Publikо & Aktivizo"}
            </button>
          </div>
        </form>
      </section>

      {/* History */}
      <section className="rounded-xl bg-white shadow-sm ring-1 ring-zinc-100">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">Historia e Njoftimeve</h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" /></div>
        ) : announcements.length === 0 ? (
          <div className="py-10 text-center text-sm text-zinc-400">Asnjë njoftim ende.</div>
        ) : (
          <div className="divide-y divide-zinc-50">
            {announcements.map((ann) => (
              <div key={ann.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_PREVIEW[ann.color]}`}>{COLOR_LABELS[ann.color]}</span>
                    {ann.is_active && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Aktiv</span>}
                  </div>
                  <p className="mt-1 text-sm text-zinc-800">{ann.message}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">{new Date(ann.created_at).toLocaleString("sq-AL")}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button type="button" disabled={togglingId === ann.id} onClick={() => handleToggle(ann)} className={`rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-60 ${ann.is_active ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>
                    {togglingId === ann.id ? "..." : ann.is_active ? "Çaktivizo" : "Aktivizo"}
                  </button>
                  <button type="button" disabled={deletingId === ann.id} onClick={() => handleDelete(ann.id)} className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60">
                    {deletingId === ann.id ? "..." : "Fshi"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
