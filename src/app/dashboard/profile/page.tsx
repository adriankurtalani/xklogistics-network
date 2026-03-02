"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { PageHeader } from "@/components/PageHeader";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useToast } from "@/components/Toast";
import type { User, UserRole } from "@/types/user";
import type { VerificationDocument, DocType } from "@/types/verificationDocument";
import {
  ALL_DOC_TYPES,
  DOC_TYPE_LABELS,
  DOC_TYPE_DESCRIPTIONS,
  DOC_STATUS_LABELS,
  DOC_STATUS_COLORS,
} from "@/types/verificationDocument";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function overallVerifStatus(
  isVerified: boolean,
  docs: VerificationDocument[],
): "verified" | "pending" | "none" {
  if (isVerified) return "verified";
  if (docs.some((d) => d.status === "pending")) return "pending";
  return "none";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProfilePage() {
  const { showToast } = useToast();

  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [email, setEmail]         = useState("");
  const [role, setRole]           = useState<UserRole | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  const [form, setForm] = useState({
    company_name: "",
    phone:        "",
    vat_number:   "",
    address:      "",
  });

  // Verification docs state
  const [verDocs, setVerDocs]       = useState<VerificationDocument[]>([]);
  const [verLoading, setVerLoading] = useState(false);
  const [uploadingType, setUploadingType] = useState<DocType | null>(null);
  const fileRefs = useRef<Partial<Record<DocType, HTMLInputElement | null>>>({});

  // ── Load profile ──────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;

      setEmail(sessionData.session.user.email ?? "");

      const { data: userRow } = await supabase
        .from("users")
        .select("company_name, phone, vat_number, address, role, is_verified")
        .eq("id", sessionData.session.user.id)
        .single();

      if (userRow) {
        const u = userRow as Partial<User>;
        setRole(u.role ?? null);
        setIsVerified(!!u.is_verified);
        setForm({
          company_name: u.company_name ?? "",
          phone:        u.phone        ?? "",
          vat_number:   u.vat_number   ?? "",
          address:      u.address      ?? "",
        });

        if (u.role === "transporter") {
          await fetchVerDocs(sessionData.session.user.id);
        }
      }

      setLoading(false);
    };
    void load();
  }, []);

  const fetchVerDocs = async (uid: string) => {
    setVerLoading(true);
    const { data } = await supabase
      .from("verification_documents")
      .select("*")
      .eq("transporter_id", uid);
    setVerDocs((data ?? []) as VerificationDocument[]);
    setVerLoading(false);
  };

  // ── Profile form ──────────────────────────────────────────────────────────
  const set = (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return;

    const { error } = await supabase
      .from("users")
      .update({
        company_name: form.company_name || null,
        phone:        form.phone        || null,
        vat_number:   form.vat_number   || null,
        address:      form.address      || null,
      })
      .eq("id", sessionData.session.user.id);

    setSaving(false);
    if (error) showToast(error.message, "error");
    else showToast("Profili u ruajt me sukses.", "success");
  };

  // ── Document upload ───────────────────────────────────────────────────────
  const handleUploadDoc = async (docType: DocType, file: File) => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return;

    const uid = sessionData.session.user.id;
    setUploadingType(docType);

    const ext      = file.name.split(".").pop();
    const filePath = `${uid}/${docType}.${ext}`;

    // Delete existing file in Storage first (ignore error if not found)
    await supabase.storage.from("verification-documents").remove([filePath]);

    const { error: uploadErr } = await supabase.storage
      .from("verification-documents")
      .upload(filePath, file, { upsert: true });

    if (uploadErr) {
      showToast(uploadErr.message, "error");
      setUploadingType(null);
      return;
    }

    // Upsert the DB row — update if exists, insert if not
    const existing = verDocs.find((d) => d.doc_type === docType);

    if (existing) {
      const { error: dbErr } = await supabase
        .from("verification_documents")
        .update({
          file_path:        filePath,
          file_name:        file.name,
          status:           "pending",
          reviewed_by:      null,
          reviewed_at:      null,
          rejection_reason: null,
        })
        .eq("id", existing.id);

      if (dbErr) { showToast(dbErr.message, "error"); setUploadingType(null); return; }
    } else {
      const { error: dbErr } = await supabase
        .from("verification_documents")
        .insert({
          transporter_id: uid,
          doc_type:       docType,
          file_path:      filePath,
          file_name:      file.name,
          status:         "pending",
        });

      if (dbErr) { showToast(dbErr.message, "error"); setUploadingType(null); return; }
    }

    showToast("Dokumenti u ngarkua. Do të rishikohet nga admini.", "success");
    setUploadingType(null);
    await fetchVerDocs(uid);

    // Clear the file input
    const ref = fileRefs.current[docType];
    if (ref) ref.value = "";
  };

  const handleDownloadDoc = async (filePath: string) => {
    const { data } = await supabase.storage
      .from("verification-documents")
      .createSignedUrl(filePath, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
      </div>
    );
  }

  const verifStatus = overallVerifStatus(isVerified, verDocs);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Profili im"
        description="Menaxho informacionet e kompanisë tuaj të cilat shfaqen tek transportuesit dhe bizneset."
      />

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Account info — read only */}
        <section className="rounded-xl border border-zinc-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Llogaria</h2>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">Email</label>
            <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
              <svg className="mr-2 h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {email}
            </div>
            <p className="mt-1 text-xs text-zinc-400">Email-i nuk mund të ndryshohet.</p>
          </div>
        </section>

        {/* Company info */}
        <section className="rounded-xl border border-zinc-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Informacioni i Kompanisë</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-zinc-700">Emri i kompanisë</label>
              <input
                type="text"
                value={form.company_name}
                onChange={set("company_name")}
                placeholder="p.sh. Transporti Berisha SH.P.K"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">Numri i TVSH-së (VAT)</label>
              <input
                type="text"
                value={form.vat_number}
                onChange={set("vat_number")}
                placeholder="p.sh. 811234567"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">Numri i telefonit</label>
              <input
                type="tel"
                value={form.phone}
                onChange={set("phone")}
                placeholder="p.sh. +383 44 123 456"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-zinc-700">Adresa e kompanisë</label>
              <textarea
                value={form.address}
                onChange={set("address")}
                rows={2}
                placeholder="p.sh. Rruga Agim Ramadani, Nr. 5, Prishtinë 10000"
                className="w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {saving && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
            {saving ? "Duke ruajtur..." : "Ruaj ndryshimet"}
          </button>
        </div>
      </form>

      {/* ── Verification section — transporters only ─────────────────────── */}
      {role === "transporter" && (
        <section className="mt-6 rounded-xl border border-zinc-100 bg-white p-6 shadow-sm">

          {/* Header */}
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Verifikimi i Transportuesit</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Ngarko dokumentet e mëposhtme. Pas shqyrtimit nga admini, profili yt do të marrë
                <span className="mx-1 font-medium text-blue-700">Çertifikatën e Verifikimit</span>
                e cila rrit besimin e bizneseve.
              </p>
            </div>
            {isVerified && <VerifiedBadge size="sm" />}
          </div>

          {/* Overall status banner */}
          {verifStatus === "verified" && (
            <div className="mb-4">
              <VerifiedBadge size="md" />
            </div>
          )}
          {verifStatus === "pending" && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <svg className="h-4 w-4 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Dokumentet tuaja janë nën shqyrtim. Do të njoftoheni kur admini të vendosë.
            </div>
          )}
          {verifStatus === "none" && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-600">
              <svg className="h-4 w-4 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Ngarko të tre dokumentet për të aplikuar për verifikim.
            </div>
          )}

          {/* Document slots */}
          {verLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-700" />
            </div>
          ) : (
            <div className="space-y-3">
              {ALL_DOC_TYPES.map((docType) => {
                const doc = verDocs.find((d) => d.doc_type === docType);
                const isUploading = uploadingType === docType;

                return (
                  <div
                    key={docType}
                    className={`rounded-lg border p-4 ${
                      doc?.status === "approved" ? "border-emerald-200 bg-emerald-50/40" :
                      doc?.status === "rejected" ? "border-red-200 bg-red-50/40" :
                      doc?.status === "pending"  ? "border-amber-200 bg-amber-50/40" :
                      "border-zinc-200 bg-zinc-50/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-zinc-800">
                            {DOC_TYPE_LABELS[docType]}
                          </p>
                          {doc && (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DOC_STATUS_COLORS[doc.status]}`}>
                              {DOC_STATUS_LABELS[doc.status]}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-zinc-500">{DOC_TYPE_DESCRIPTIONS[docType]}</p>

                        {doc && (
                          <p className="mt-1 truncate text-xs text-zinc-600">
                            <span className="text-zinc-400">Skedari: </span>
                            <span className="font-medium">{doc.file_name}</span>
                          </p>
                        )}

                        {doc?.status === "rejected" && doc.rejection_reason && (
                          <p className="mt-1 text-xs text-red-600">
                            <span className="font-medium">Arsyeja: </span>
                            {doc.rejection_reason}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {doc && (
                          <button
                            type="button"
                            onClick={() => handleDownloadDoc(doc.file_path)}
                            className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700"
                          >
                            Shkarko
                          </button>
                        )}

                        {/* Upload / Re-upload button — hidden when approved */}
                        {doc?.status !== "approved" && (
                          <label className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium ${
                            isUploading ? "pointer-events-none opacity-50 border-zinc-200 text-zinc-400" :
                            doc?.status === "rejected"
                              ? "border-red-300 text-red-700 hover:bg-red-50"
                              : "border-zinc-300 text-zinc-600 hover:bg-zinc-100"
                          }`}>
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            {isUploading ? "Duke ngarkuar..." : doc ? "Ringarko" : "Ngarko"}
                            <input
                              ref={(el) => { fileRefs.current[docType] = el; }}
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void handleUploadDoc(docType, f);
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
