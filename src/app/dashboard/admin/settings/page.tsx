"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { logAdminAction } from "@/lib/auditLog";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/Toast";

interface Setting { key: string; value: string }

const SETTING_META: Record<string, { label: string; description: string; type: "text" | "email" | "number" | "toggle" }> = {
  platform_name:     { label: "Emri i Platformës",       description: "Shfaqet në faqe kryesore dhe meta titull.",         type: "text"   },
  support_email:     { label: "Email Mbështetja",         description: "Email kontakti për platformën.",                   type: "email"  },
  vat_country:       { label: "Vendi (TVSH)",              description: "Shteti kryesor për qëllime ligjore.",              type: "text"   },
  maintenance_mode:  { label: "Mënyra e Mirëmbajtjes",   description: "Nëse aktiv, shfaqet banner mirëmbajtjeje për të gjithë.", type: "toggle" },
  max_route_capacity:{ label: "Kapaciteti Maks (kg)",     description: "Kufiri maksimal i kapacitetit të lejuar per rrugë.", type: "number" },
};

export default function AdminSettingsPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [adminId, setAdminId]           = useState("");
  const [settings, setSettings]         = useState<Record<string, string>>({});
  const [loading, setLoading]           = useState(false);
  const [saving, setSaving]             = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/auth/login"); return; }
      const { data: u } = await supabase.from("users").select("role").eq("id", data.session.user.id).single();
      if (u?.role !== "admin") { router.replace("/dashboard/admin"); return; }
      setAdminId(data.session.user.id);
      setCheckingAuth(false);
      await fetchSettings();
    };
    void init();
  }, [router]);

  const fetchSettings = async () => {
    setLoading(true);
    const { data } = await supabase.from("system_settings").select("key, value");
    const map: Record<string, string> = {};
    for (const row of (data ?? []) as Setting[]) map[row.key] = row.value;
    setSettings(map);
    setLoading(false);
  };

  const handleSave = async (key: string, e?: FormEvent) => {
    e?.preventDefault();
    setSaving(key);
    const { error } = await supabase.from("system_settings").upsert({ key, value: settings[key] ?? "", updated_at: new Date().toISOString() });
    setSaving(null);
    if (error) { showToast(error.message, "error"); return; }
    await logAdminAction({ adminId, action: "update_system_setting", targetId: key, details: { value: settings[key] } });
    showToast("Cilësimi u ruajt.", "success");
  };

  const handleToggle = async (key: string) => {
    const newVal = settings[key] === "true" ? "false" : "true";
    setSettings((p) => ({ ...p, [key]: newVal }));
    setSaving(key);
    const { error } = await supabase.from("system_settings").upsert({ key, value: newVal, updated_at: new Date().toISOString() });
    setSaving(null);
    if (error) { showToast(error.message, "error"); return; }
    await logAdminAction({ adminId, action: "update_system_setting", targetId: key, details: { value: newVal } });
    showToast(`${SETTING_META[key]?.label} u ${newVal === "true" ? "aktivizua" : "çaktivizua"}.`, "success");
  };

  if (checkingAuth) return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Cilësimet e Sistemit" description="Konfigurime globale të platformës." />

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-100" />)}</div>
      ) : (
        <div className="divide-y divide-zinc-100 rounded-xl bg-white shadow-sm ring-1 ring-zinc-100">
          {Object.entries(SETTING_META).map(([key, meta]) => (
            <div key={key} className="flex items-start justify-between gap-6 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-900">{meta.label}</p>
                <p className="text-xs text-zinc-500">{meta.description}</p>
              </div>

              {meta.type === "toggle" ? (
                <div className="flex items-center gap-2 shrink-0 pt-0.5">
                  {saving === key && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />}
                  <button
                    type="button"
                    onClick={() => handleToggle(key)}
                    disabled={saving === key}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-60 ${settings[key] === "true" ? "bg-zinc-900" : "bg-zinc-200"}`}
                    aria-pressed={settings[key] === "true"}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${settings[key] === "true" ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                  <span className="text-xs text-zinc-500">{settings[key] === "true" ? "Aktiv" : "Joaktiv"}</span>
                </div>
              ) : (
                <form onSubmit={(e) => handleSave(key, e)} className="flex items-center gap-2 shrink-0">
                  <input
                    type={meta.type}
                    value={settings[key] ?? ""}
                    onChange={(e) => setSettings((p) => ({ ...p, [key]: e.target.value }))}
                    className="w-48 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-900 focus:outline-none"
                  />
                  <button type="submit" disabled={saving === key} className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60">
                    {saving === key && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                    Ruaj
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Maintenance mode warning */}
      {settings["maintenance_mode"] === "true" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <strong>Kujdes:</strong> Mënyra e mirëmbajtjes është aktive. Të gjithë përdoruesit jo-admin do të shohin një banner mirëmbajtjeje.
        </div>
      )}
    </div>
  );
}
