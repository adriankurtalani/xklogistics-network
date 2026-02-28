"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ShipmentDocument, DocumentType } from "@/types/document";
import { DOCUMENT_TYPE_LABELS } from "@/types/document";

interface Props {
  shipmentId: string;
  uploaderId: string;
}

const ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png";

export function DocumentSection({ shipmentId, uploaderId }: Props) {
  const [docs, setDocs]           = useState<ShipmentDocument[]>([]);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [docType, setDocType]     = useState<DocumentType>("tjeter");
  const [error, setError]         = useState<string | null>(null);
  const fileRef                   = useRef<HTMLInputElement>(null);

  const fetchDocs = async () => {
    const { data } = await supabase
      .from("shipment_documents")
      .select("*")
      .eq("shipment_id", shipmentId)
      .order("created_at", { ascending: true });
    setDocs((data ?? []) as ShipmentDocument[]);
    setLoading(false);
  };

  useEffect(() => { void fetchDocs(); }, [shipmentId]);

  const handleUpload = async (file: File) => {
    setError(null);
    setUploading(true);
    const ext      = file.name.split(".").pop();
    const path     = `${shipmentId}/${crypto.randomUUID()}.${ext}`;

    const { error: storageErr } = await supabase.storage
      .from("shipment-documents")
      .upload(path, file);

    if (storageErr) { setError(storageErr.message); setUploading(false); return; }

    const { error: dbErr } = await supabase.from("shipment_documents").insert({
      shipment_id:   shipmentId,
      uploader_id:   uploaderId,
      file_name:     file.name,
      file_path:     path,
      document_type: docType,
    });

    if (dbErr) { setError(dbErr.message); setUploading(false); return; }

    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    await fetchDocs();
  };

  const handleDelete = async (doc: ShipmentDocument) => {
    setDeletingId(doc.id);
    setError(null);

    // Remove from Storage first
    const { error: storageErr } = await supabase.storage
      .from("shipment-documents")
      .remove([doc.file_path]);

    if (storageErr) {
      setError(storageErr.message);
      setDeletingId(null);
      setConfirmDeleteId(null);
      return;
    }

    // Remove DB record
    const { error: dbErr } = await supabase
      .from("shipment_documents")
      .delete()
      .eq("id", doc.id);

    setDeletingId(null);
    setConfirmDeleteId(null);

    if (dbErr) { setError(dbErr.message); return; }

    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
  };

  const handleDownload = async (doc: ShipmentDocument) => {
    const { data } = await supabase.storage
      .from("shipment-documents")
      .createSignedUrl(doc.file_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const fileIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return "📄";
    if (["jpg","jpeg","png"].includes(ext ?? "")) return "🖼️";
    return "📎";
  };

  return (
    <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-4">
      <p className="mb-3 text-xs font-semibold text-zinc-700">Dokumentet e Dërgesës</p>

      {loading ? (
        <p className="text-xs text-zinc-400">Duke ngarkuar...</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-zinc-400">Asnjë dokument i ngarkuar ende.</p>
      ) : (
        <div className="mb-3 space-y-1.5">
          {docs.map((doc) => (
            <div key={doc.id} className="rounded-md border border-zinc-100 bg-zinc-50">
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base">{fileIcon(doc.file_name)}</span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-zinc-800">{doc.file_name}</p>
                    <p className="text-xs text-zinc-400">{DOCUMENT_TYPE_LABELS[doc.document_type]}</p>
                  </div>
                </div>
                <div className="ml-3 flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleDownload(doc)}
                    className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700"
                  >
                    Shkarko
                  </button>
                  {confirmDeleteId === doc.id ? null : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(doc.id)}
                      className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      title="Fshi dokumentin"
                    >
                      Fshi
                    </button>
                  )}
                </div>
              </div>

              {/* Inline delete confirmation */}
              {confirmDeleteId === doc.id && (
                <div className="flex items-center justify-between border-t border-red-100 bg-red-50 px-3 py-2 rounded-b-md">
                  <p className="text-xs text-red-700">Konfirmo fshirjen e këtij dokumenti?</p>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                    >
                      Anulo
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(doc)}
                      disabled={deletingId === doc.id}
                      className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-60"
                    >
                      {deletingId === doc.id && (
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      )}
                      {deletingId === doc.id ? "Duke fshirë..." : "Po, fshi"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload area */}
      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value as DocumentType)}
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs focus:border-zinc-900 focus:outline-none"
        >
          {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          {uploading ? "Duke ngarkuar..." : "Ngarko dokument"}
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
          />
        </label>

        {error && <p className="w-full text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
