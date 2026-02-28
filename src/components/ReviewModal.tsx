"use client";

import { FormEvent, useState } from "react";
import { StarInput } from "./StarRating";

interface Props {
  revieweeName: string;
  revieweeRole: "transporter" | "business";
  routeLabel: string;
  onSubmit: (rating: number, comment: string) => Promise<void>;
  onClose: () => void;
}

export function ReviewModal({ revieweeName, revieweeRole, routeLabel, onSubmit, onClose }: Props) {
  const [rating, setRating]   = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (rating === 0) { setError("Ju lutem zgjidhni një vlerësim."); return; }
    setError(null);
    setLoading(true);
    try {
      await onSubmit(rating, comment);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gabim i panjohur.");
      setLoading(false);
    }
  };

  const target = revieweeRole === "transporter" ? "Transportuesin" : "Biznesin";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-zinc-100 px-6 py-5">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Vlerëso {target}</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Rruga: <span className="font-medium text-zinc-700">{routeLabel}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          <div className="rounded-lg bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            <span className="text-zinc-500">Vlerëson:</span>{" "}
            <span className="font-semibold">{revieweeName}</span>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-zinc-700">Vlerësimi <span className="text-red-500">*</span></label>
            <StarInput value={rating} onChange={setRating} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">Koment (opsional)</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Ndaj përvojën tuaj me transportuesin / biznesin..."
              className="w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
              Anulo
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
              {loading ? "Duke dërguar..." : "Dërgo Vlerësimin"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
