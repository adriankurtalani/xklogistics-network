"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { logAdminAction } from "@/lib/auditLog";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/Toast";

interface Setting { key: string; value: string }

// These keys are managed in the Brand Identity section — excluded from the general list.
const BRAND_KEYS = new Set(["platform_name", "favicon_url"]);

const SETTING_META: Record<string, { label: string; description: string; type: "text" | "email" | "number" | "toggle" }> = {
  support_email:      { label: "Email Mbështetja",       description: "Email kontakti për platformën.",                      type: "email"  },
  vat_country:        { label: "Vendi (TVSH)",            description: "Shteti kryesor për qëllime ligjore.",                type: "text"   },
  maintenance_mode:   { label: "Mënyra e Mirëmbajtjes",  description: "Nëse aktiv, shfaqet banner mirëmbajtjeje për të gjithë.", type: "toggle" },
  max_route_capacity: { label: "Kapaciteti Maks (kg)",   description: "Kufiri maksimal i kapacitetit të lejuar per rrugë.", type: "number" },
};

export default function AdminSettingsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const [checkingAuth, setCheckingAuth]         = useState(true);
  const [adminId, setAdminId]                   = useState("");
  const [settings, setSettings]                 = useState<Record<string, string>>({});
  const [loading, setLoading]                   = useState(false);
  const [saving, setSaving]                     = useState<string | null>(null);
  const [faviconPreview, setFaviconPreview]      = useState<string | null>(null);
  const [uploadingFavicon, setUploadingFavicon]  = useState(false);

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

  const upsertSetting = async (key: string, value: string) => {
    const { error } = await supabase
      .from("system_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw error;
    await logAdminAction({ adminId, action: "update_system_setting", targetId: key, details: { value } });
  };

  const handleSave = async (key: string, e?: FormEvent) => {
    e?.preventDefault();
    setSaving(key);
    try {
      const value = settings[key] ?? "";
      await upsertSetting(key, value);
      // Apply brand changes instantly to the current tab
      if (key === "platform_name") applyTitleToTab(value);
      showToast("Cilësimi u ruajt.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gabim.", "error");
    } finally {
      setSaving(null);
    }
  };

  const handleToggle = async (key: string) => {
    const newVal = settings[key] === "true" ? "false" : "true";
    setSettings((p) => ({ ...p, [key]: newVal }));
    setSaving(key);
    try {
      await upsertSetting(key, newVal);
      showToast(`${SETTING_META[key]?.label} u ${newVal === "true" ? "aktivizua" : "çaktivizua"}.`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gabim.", "error");
    } finally {
      setSaving(null);
    }
  };

  // ── Favicon upload ────────────────────────────────────────────────────────
  const handleFaviconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Local preview immediately
    setFaviconPreview(URL.createObjectURL(file));
    void uploadFavicon(file);
  };

  const uploadFavicon = async (file: File) => {
    setUploadingFavicon(true);
    try {
      const ext      = file.name.split(".").pop() ?? "png";
      const path     = `favicon/favicon.${ext}`;

      // Upload (upsert — overwrite the old favicon)
      const { error: upErr } = await supabase.storage
        .from("platform-assets")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage
        .from("platform-assets")
        .getPublicUrl(path);

      const publicUrl = urlData.publicUrl;

      // Bust cache: append a timestamp so browsers re-fetch the new favicon
      const cachedUrl = `${publicUrl}?t=${Date.now()}`;

      await upsertSetting("favicon_url", cachedUrl);
      setSettings((p) => ({ ...p, favicon_url: cachedUrl }));

      // Apply to current browser tab immediately
      applyFaviconToTab(cachedUrl);

      showToast("Favicon u ndryshua me sukses.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Ngarkimi dështoi.", "error");
      setFaviconPreview(settings["favicon_url"] ?? null);
    } finally {
      setUploadingFavicon(false);
      if (faviconInputRef.current) faviconInputRef.current.value = "";
    }
  };

  const applyFaviconToTab = (url: string) => {
    if (typeof document === "undefined") return;
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = url;
  };

  const applyTitleToTab = (name: string) => {
    if (typeof document === "undefined" || !name.trim()) return;
    document.title = name.trim();
  };

  // Apply saved favicon + title on load
  useEffect(() => {
    const url  = settings["favicon_url"];
    const name = settings["platform_name"];
    if (url)  applyFaviconToTab(url);
    if (name) applyTitleToTab(name);
  }, [settings]);

  if (checkingAuth) return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
    </div>
  );

  const currentFavicon = faviconPreview ?? settings["favicon_url"] ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title="Cilësimet e Sistemit" description="Konfigurime globale të platformës." />

      {/* ── Brand Identity ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Identiteti i Markës</h2>
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-zinc-100">
          <div className="flex flex-col gap-6 px-5 py-5 sm:flex-row sm:items-center">

            {/* Favicon */}
            <div className="flex flex-col items-center gap-3">
              {/* Preview box */}
              <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50">
                {currentFavicon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={currentFavicon} alt="Favicon" className="h-10 w-10 object-contain" />
                ) : (
                  <svg className="h-8 w-8 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 20.25h18M3.75 3h16.5A.75.75 0 0121 3.75v13.5a.75.75 0 01-.75.75H3.75A.75.75 0 013 17.25V3.75A.75.75 0 013.75 3z" />
                  </svg>
                )}
                {uploadingFavicon && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/80">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
                  </div>
                )}
              </div>

              <input
                ref={faviconInputRef}
                type="file"
                accept=".ico,.png,.svg,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={handleFaviconChange}
              />
              <button
                type="button"
                disabled={uploadingFavicon}
                onClick={() => faviconInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                {uploadingFavicon ? "Duke ngarkuar…" : "Ndrysho Favicon"}
              </button>
              <p className="text-center text-xs text-zinc-400">PNG, ICO, SVG · max 1 MB</p>
            </div>

            {/* Divider */}
            <div className="hidden h-20 w-px bg-zinc-100 sm:block" />

            {/* Platform heading */}
            <div className="flex-1">
              <p className="mb-1 text-sm font-medium text-zinc-900">Emri i Platformës</p>
              <p className="mb-3 text-xs text-zinc-500">
                Shfaqet në titullin e sidebarit, tab-in e browser-it dhe meta titull.
              </p>
              <form
                onSubmit={(e) => handleSave("platform_name", e)}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  placeholder="p.sh. XKLogistics"
                  value={settings["platform_name"] ?? ""}
                  onChange={(e) => setSettings((p) => ({ ...p, platform_name: e.target.value }))}
                  className="w-64 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={saving === "platform_name"}
                  className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                >
                  {saving === "platform_name" && (
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  )}
                  Ruaj
                </button>
              </form>

              {/* Live preview pill */}
              {(settings["platform_name"] || currentFavicon) && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5">
                  {currentFavicon && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={currentFavicon} alt="" className="h-4 w-4 object-contain" />
                  )}
                  <span className="text-xs font-semibold text-zinc-800">
                    {settings["platform_name"] || "Emri i platformës"}
                  </span>
                  <span className="text-xs text-zinc-400">— preview sidebar</span>
                </div>
              )}
            </div>
          </div>

        </div>
      </section>

      {/* ── General settings ───────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Konfigurime Generale</h2>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-100" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 rounded-xl bg-white shadow-sm ring-1 ring-zinc-100">
            {Object.entries(SETTING_META)
              .filter(([key]) => !BRAND_KEYS.has(key))
              .map(([key, meta]) => (
                <div key={key} className="flex items-start justify-between gap-6 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-900">{meta.label}</p>
                    <p className="text-xs text-zinc-500">{meta.description}</p>
                  </div>

                  {meta.type === "toggle" ? (
                    <div className="flex shrink-0 items-center gap-2 pt-0.5">
                      {saving === key && (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
                      )}
                      <button
                        type="button"
                        onClick={() => handleToggle(key)}
                        disabled={saving === key}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-60 ${settings[key] === "true" ? "bg-zinc-900" : "bg-zinc-200"}`}
                        aria-pressed={settings[key] === "true"}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${settings[key] === "true" ? "translate-x-6" : "translate-x-1"}`} />
                      </button>
                      <span className="text-xs text-zinc-500">
                        {settings[key] === "true" ? "Aktiv" : "Joaktiv"}
                      </span>
                    </div>
                  ) : (
                    <form onSubmit={(e) => handleSave(key, e)} className="flex shrink-0 items-center gap-2">
                      <input
                        type={meta.type}
                        value={settings[key] ?? ""}
                        onChange={(e) => setSettings((p) => ({ ...p, [key]: e.target.value }))}
                        className="w-48 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-900 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={saving === key}
                        className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                      >
                        {saving === key && (
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        )}
                        Ruaj
                      </button>
                    </form>
                  )}
                </div>
              ))}
          </div>
        )}
      </section>

      {/* Maintenance mode warning */}
      {settings["maintenance_mode"] === "true" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <strong>Kujdes:</strong> Mënyra e mirëmbajtjes është aktive. Të gjithë përdoruesit jo-admin do të shohin një banner mirëmbajtjeje.
        </div>
      )}
    </div>
  );
}
