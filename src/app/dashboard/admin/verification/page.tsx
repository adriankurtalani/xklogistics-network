"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PageHeader } from "@/components/PageHeader";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useToast } from "@/components/Toast";
import { logAdminAction } from "@/lib/auditLog";
import type { VerificationDocument, DocType } from "@/types/verificationDocument";
import {
  DOC_TYPE_LABELS,
  DOC_STATUS_LABELS,
  DOC_STATUS_COLORS,
  ALL_DOC_TYPES,
} from "@/types/verificationDocument";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TransporterWithDocs {
  id: string;
  company_name: string | null;
  email: string | null;
  is_verified: boolean;
  docs: VerificationDocument[];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminVerificationPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [checkingAuth, setCheckingAuth]   = useState(true);
  const [adminId, setAdminId]             = useState("");
  const [loading, setLoading]             = useState(false);
  const [transporters, setTransporters]   = useState<TransporterWithDocs[]>([]);
  const [filterStatus, setFilterStatus]   = useState<"all" | "pending" | "verified" | "unverified">("pending");

  // Per-doc action state
  const [actionDocId, setActionDocId]     = useState<string | null>(null);
  const [rejectReason, setRejectReason]   = useState("");
  const [rejectingDocId, setRejectingDocId] = useState<string | null>(null);

  // Per-transporter verify/revoke state
  const [togglingId, setTogglingId]       = useState<string | null>(null);

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/auth/login"); return; }
      const { data: u } = await supabase.from("users").select("role").eq("id", data.session.user.id).single();
      if (u?.role !== "admin") { router.replace("/dashboard/admin"); return; }
      setAdminId(data.session.user.id);
      setCheckingAuth(false);
      await fetchData();
    };
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // ── Fetch all verification docs joined with transporter info ──────────────
  const fetchData = async () => {
    setLoading(true);

    const { data: docs, error } = await supabase
      .from("verification_documents")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) { showToast(error.message, "error"); setLoading(false); return; }

    const allDocs = (docs ?? []) as VerificationDocument[];
    const transporterIds = [...new Set(allDocs.map((d) => d.transporter_id))];

    if (transporterIds.length === 0) { setTransporters([]); setLoading(false); return; }

    const { data: users } = await supabase
      .from("users")
      .select("id, company_name, email, is_verified")
      .in("id", transporterIds);

    const grouped: TransporterWithDocs[] = (users ?? []).map((u) => ({
      id:           u.id as string,
      company_name: u.company_name as string | null,
      email:        u.email as string | null,
      is_verified:  !!u.is_verified,
      docs:         allDocs.filter((d) => d.transporter_id === u.id),
    }));

    setTransporters(grouped);
    setLoading(false);
  };

  // ── Filtered view ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return transporters.filter((t) => {
      if (filterStatus === "pending")    return t.docs.some((d) => d.status === "pending");
      if (filterStatus === "verified")   return t.is_verified;
      if (filterStatus === "unverified") return !t.is_verified;
      return true;
    });
  }, [transporters, filterStatus]);

  const pendingCount = transporters.filter((t) => t.docs.some((d) => d.status === "pending")).length;

  // ── Approve a single document ─────────────────────────────────────────────
  const handleApproveDoc = async (doc: VerificationDocument) => {
    setActionDocId(doc.id);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("verification_documents")
      .update({ status: "approved", reviewed_by: adminId, reviewed_at: now, rejection_reason: null })
      .eq("id", doc.id);

    setActionDocId(null);
    if (error) { showToast(error.message, "error"); return; }

    await logAdminAction({ adminId, action: "approve_verification_doc", targetType: "verification_document", targetId: doc.id, details: { doc_type: doc.doc_type, transporter_id: doc.transporter_id } });
    showToast("Dokumenti u aprovua.", "success");
    await fetchData();
  };

  // ── Reject a single document ──────────────────────────────────────────────
  const handleRejectDoc = async (doc: VerificationDocument) => {
    if (!rejectReason.trim()) { showToast("Shkruaj arsyen e refuzimit.", "warning"); return; }

    setRejectingDocId(doc.id);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("verification_documents")
      .update({ status: "rejected", reviewed_by: adminId, reviewed_at: now, rejection_reason: rejectReason.trim() })
      .eq("id", doc.id);

    setRejectingDocId(null);
    setRejectReason("");
    if (error) { showToast(error.message, "error"); return; }

    // If the transporter was verified, revoke their badge when a doc is rejected
    const transporter = transporters.find((t) => t.id === doc.transporter_id);
    if (transporter?.is_verified) {
      await supabase.from("users").update({ is_verified: false }).eq("id", doc.transporter_id);
    }

    await logAdminAction({ adminId, action: "reject_verification_doc", targetType: "verification_document", targetId: doc.id, details: { doc_type: doc.doc_type, transporter_id: doc.transporter_id, reason: rejectReason.trim() } });
    showToast("Dokumenti u refuzua.", "info");
    await fetchData();
  };

  // ── Toggle transporter verified status ────────────────────────────────────
  const handleToggleVerified = async (t: TransporterWithDocs) => {
    const allApproved = ALL_DOC_TYPES.every((dt) =>
      t.docs.some((d) => d.doc_type === dt && d.status === "approved"),
    );

    if (!t.is_verified && !allApproved) {
      showToast("Të gjitha dokumentet duhet të jenë aprovuar para verifikimit.", "warning");
      return;
    }

    setTogglingId(t.id);
    const newValue = !t.is_verified;
    const { error } = await supabase.from("users").update({ is_verified: newValue }).eq("id", t.id);
    setTogglingId(null);
    if (error) { showToast(error.message, "error"); return; }

    await logAdminAction({ adminId, action: newValue ? "verify_transporter" : "revoke_verification", targetType: "user", targetId: t.id, details: { company_name: t.company_name } });

    // Send in-app notification to the transporter
    await supabase.from("notifications").insert({
      user_id: t.id,
      title:   newValue ? "Profili juaj u verifikua!" : "Verifikimi u revokua",
      message: newValue
        ? "Urime! Tani shfaqni çertifikatën 'Transportues i Verifikuar' në platformë."
        : "Verifikimi i profilit tuaj u revokua nga admini. Kontaktoni support për më shumë informacion.",
      type:    newValue ? "success" : "warning",
      read:    false,
    });

    showToast(newValue ? "Transportuesi u verifikua." : "Verifikimi u revokua.", newValue ? "success" : "info");
    await fetchData();
  };

  // ── Download a doc ────────────────────────────────────────────────────────
  const handleDownload = async (filePath: string) => {
    const { data } = await supabase.storage
      .from("verification-documents")
      .createSignedUrl(filePath, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  if (checkingAuth) {
    return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" /></div>;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Verifikimi i Transportuesve"
        description={`${pendingCount} transportues me dokumente në pritje.`}
      />

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {(["pending", "all", "verified", "unverified"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilterStatus(f)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              filterStatus === f
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {{ pending: "Në pritje", all: "Të gjithë", verified: "Verifikuar", unverified: "Pa verifikim" }[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-100 bg-white py-16 text-center shadow-sm">
          <svg className="mx-auto mb-3 h-10 w-10 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          <p className="text-sm text-zinc-500">Asnjë transportues nuk u gjet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((transporter) => {
            const allApproved = ALL_DOC_TYPES.every((dt) =>
              transporter.docs.some((d) => d.doc_type === dt && d.status === "approved"),
            );

            return (
              <div key={transporter.id} className="overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-sm">

                {/* Transporter header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                      {(transporter.company_name || transporter.email || "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-zinc-900">{transporter.company_name || "Pa emër"}</p>
                      <p className="text-xs text-zinc-400">{transporter.email || "—"}</p>
                    </div>
                    {transporter.is_verified && <VerifiedBadge size="sm" />}
                  </div>

                  {/* Verify / Revoke button */}
                  <button
                    type="button"
                    disabled={!!togglingId || (!transporter.is_verified && !allApproved)}
                    onClick={() => handleToggleVerified(transporter)}
                    title={!transporter.is_verified && !allApproved ? "Aprovo të gjitha dokumentet fillimisht" : ""}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 transition-colors ${
                      transporter.is_verified
                        ? "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                        : "bg-emerald-600 text-white hover:bg-emerald-500"
                    }`}
                  >
                    {togglingId === transporter.id && (
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                    )}
                    {transporter.is_verified ? "Revoko Verifikimin" : "Verifikoni Transportuesin"}
                  </button>
                </div>

                {/* Document rows */}
                <div className="divide-y divide-zinc-50">
                  {ALL_DOC_TYPES.map((docType: DocType) => {
                    const doc = transporter.docs.find((d) => d.doc_type === docType);
                    const isActioning = actionDocId === doc?.id;
                    const isRejecting = rejectingDocId === doc?.id;

                    return (
                      <div key={docType} className="px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-semibold text-zinc-700">{DOC_TYPE_LABELS[docType]}</p>
                              {doc ? (
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DOC_STATUS_COLORS[doc.status]}`}>
                                  {DOC_STATUS_LABELS[doc.status]}
                                </span>
                              ) : (
                                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-400">
                                  Nuk është ngarkuar
                                </span>
                              )}
                            </div>
                            {doc && (
                              <p className="mt-0.5 text-xs text-zinc-500">
                                <span className="text-zinc-400">Skedari: </span>{doc.file_name}
                                {doc.reviewed_at && (
                                  <span className="ml-2 text-zinc-400">
                                    · {new Date(doc.reviewed_at).toLocaleDateString("sq-AL")}
                                  </span>
                                )}
                              </p>
                            )}
                            {doc?.rejection_reason && (
                              <p className="mt-0.5 text-xs text-red-600">
                                <span className="font-medium">Arsyeja: </span>{doc.rejection_reason}
                              </p>
                            )}
                          </div>

                          {/* Actions */}
                          {doc && (
                            <div className="flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleDownload(doc.file_path)}
                                className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                              >
                                Shiko
                              </button>

                              {doc.status !== "approved" && (
                                <button
                                  type="button"
                                  disabled={isActioning}
                                  onClick={() => handleApproveDoc(doc)}
                                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
                                >
                                  {isActioning && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                                  Aprovo
                                </button>
                              )}

                              {doc.status !== "rejected" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRejectingDocId((prev) => prev === doc.id ? null : doc.id)
                                  }
                                  className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                                >
                                  Refuzo
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Inline rejection form */}
                        {rejectingDocId === doc?.id && (
                          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                            <p className="mb-2 text-xs font-medium text-red-800">Arsyeja e refuzimit</p>
                            <textarea
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              rows={2}
                              placeholder="p.sh. Dokumenti është i skadueshëm / jo legjibil..."
                              className="w-full resize-none rounded-md border border-red-200 bg-white px-3 py-2 text-xs focus:border-red-400 focus:outline-none"
                            />
                            <div className="mt-2 flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => { setRejectingDocId(null); setRejectReason(""); }}
                                className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                              >
                                Anulo
                              </button>
                              <button
                                type="button"
                                disabled={isRejecting}
                                onClick={() => doc && handleRejectDoc(doc)}
                                className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-60"
                              >
                                {isRejecting && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                                Konfirmo Refuzimin
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
