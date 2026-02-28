"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { logAdminAction } from "@/lib/auditLog";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/Toast";

interface MediaSlot {
  key: string;
  label: string;
  description: string;
  accept: string;
  recommended: string;
}

const SLOTS: MediaSlot[] = [
  { key: "logo",          label: "Logo Platformës",            description: "Shfaqet në navigim dhe footer.",                          accept: ".png,.svg,.webp",  recommended: "200×60 px, PNG/SVG" },
  { key: "hero_image",    label: "Imazhi Hero",                description: "Imazhi i sfondit ose ilustrimi kryesor në faqe.",         accept: ".jpg,.jpeg,.png,.webp", recommended: "1600×900 px" },
  { key: "how_it_works_image", label: "Ilustrimi 'Si Funksionon'", description: "Imazh opsional afër seksionit të hapave.",            accept: ".jpg,.jpeg,.png,.webp,.svg", recommended: "800×600 px" },
];

export default function AdminMediaPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [adminId, setAdminId]           = useState("");
  const [urls, setUrls]                 = useState<Record<string, string>>({});
  const [uploading, setUploading]       = useState<Record<string, boolean>>({});
  const [deleting, setDeleting]         = useState<Record<string, boolean>>({});

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/auth/login"); return; }
      const { data: u } = await supabase.from("users").select("role").eq("id", data.session.user.id).single();
      if (u?.role !== "admin") { router.replace("/dashboard/admin"); return; }
      setAdminId(data.session.user.id);
      setCheckingAuth(false);
      await fetchUrls();
    };
    void init();
  }, [router]);

  const fetchUrls = async () => {
    const keys = SLOTS.map((s) => s.key);
    const { data } = await supabase.from("site_content").select("key, value").in("key", keys);
    const result: Record<string, string> = {};
    for (const row of data ?? []) {
      if (typeof row.value === "string") result[row.key] = row.value;
      else if (row.value?.url) result[row.key] = row.value.url as string;
    }
    setUrls(result);
  };

  const handleUpload = async (slot: MediaSlot, file: File) => {
    setUploading((p) => ({ ...p, [slot.key]: true }));
    const ext  = file.name.split(".").pop();
    const path = `${slot.key}.${ext}`;

    // upsert in storage
    const { error: storageErr } = await supabase.storage.from("site-media").upload(path, file, { upsert: true });
    if (storageErr) { showToast(storageErr.message, "error"); setUploading((p) => ({ ...p, [slot.key]: false })); return; }

    const { data: urlData } = supabase.storage.from("site-media").getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    await supabase.from("site_content").upsert({ key: slot.key, value: { url: publicUrl }, updated_at: new Date().toISOString() });
    await logAdminAction({ adminId, action: "upload_media", targetType: "media", targetId: slot.key });

    setUrls((p) => ({ ...p, [slot.key]: publicUrl }));
    setUploading((p) => ({ ...p, [slot.key]: false }));
    if (fileRefs.current[slot.key]) fileRefs.current[slot.key]!.value = "";
    showToast(`${slot.label} u ngarkon me sukses.`, "success");
  };

  const handleDelete = async (slot: MediaSlot) => {
    setDeleting((p) => ({ ...p, [slot.key]: true }));
    const url = urls[slot.key];
    if (url) {
      const path = url.split("/site-media/")[1];
      if (path) await supabase.storage.from("site-media").remove([path]);
    }
    await supabase.from("site_content").delete().eq("key", slot.key);
    await logAdminAction({ adminId, action: "delete_media", targetType: "media", targetId: slot.key });
    setUrls((p) => { const n = { ...p }; delete n[slot.key]; return n; });
    setDeleting((p) => ({ ...p, [slot.key]: false }));
    showToast(`${slot.label} u fshi.`, "success");
  };

  if (checkingAuth) return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Menaxhimi i Imazheve"
        description="Ngarko ose ndrysho logon, imazhin hero dhe ilustrimet e platformës."
      />
      <p className="text-xs text-zinc-400">Kërkohet bucket <code className="rounded bg-zinc-100 px-1 font-mono">site-media</code> publik në Supabase Storage.</p>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {SLOTS.map((slot) => {
          const currentUrl = urls[slot.key];
          const isUploading = uploading[slot.key];
          const isDeleting  = deleting[slot.key];
          const isImage = currentUrl && !currentUrl.endsWith(".svg");

          return (
            <div key={slot.key} className="flex flex-col rounded-xl bg-white shadow-sm ring-1 ring-zinc-100">
              {/* Preview */}
              <div className="flex h-40 items-center justify-center overflow-hidden rounded-t-xl border-b border-zinc-100 bg-zinc-50">
                {currentUrl ? (
                  isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={currentUrl} alt={slot.label} className="h-full w-full object-contain p-3" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={currentUrl} alt={slot.label} className="h-16 w-auto" />
                  )
                ) : (
                  <div className="flex flex-col items-center gap-2 text-zinc-300">
                    <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-xs">Pa imazh</span>
                  </div>
                )}
              </div>

              {/* Info + actions */}
              <div className="flex flex-1 flex-col p-4">
                <p className="font-medium text-sm text-zinc-900">{slot.label}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{slot.description}</p>
                <p className="mt-1 text-xs text-zinc-400">Rekomandohet: {slot.recommended}</p>

                <div className="mt-4 flex gap-2">
                  <label className={`flex-1 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 ${isUploading ? "opacity-50 pointer-events-none" : ""}`}>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    {isUploading ? "Duke ngarkuar..." : currentUrl ? "Zëvendëso" : "Ngarko"}
                    <input
                      ref={(el) => { fileRefs.current[slot.key] = el; }}
                      type="file"
                      accept={slot.accept}
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(slot, f); }}
                    />
                  </label>
                  {currentUrl && (
                    <button type="button" disabled={isDeleting} onClick={() => handleDelete(slot)} className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60">
                      {isDeleting ? "..." : "Fshi"}
                    </button>
                  )}
                </div>

                {currentUrl && (
                  <a href={currentUrl} target="_blank" rel="noopener noreferrer" className="mt-2 truncate text-xs text-zinc-400 hover:text-zinc-600 hover:underline">
                    {currentUrl}
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
