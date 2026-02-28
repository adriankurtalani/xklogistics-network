"use client";

import { FormEvent, useState } from "react";

interface ShipmentFormData {
  contact_name: string;
  contact_phone: string;
  pickup_address: string;
  notes: string;
  weight_kg: string;
}

interface Props {
  routeLabel: string;
  onSubmit: (data: ShipmentFormData) => Promise<void>;
  onClose: () => void;
}

export function ShipmentFormModal({ routeLabel, onSubmit, onClose }: Props) {
  const [form, setForm] = useState<ShipmentFormData>({
    contact_name: "",
    contact_phone: "",
    pickup_address: "",
    notes: "",
    weight_kg: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof ShipmentFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gabim i panjohur.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-100 px-6 py-5">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Detajet e Dërgesës</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Rruga: <span className="font-medium text-zinc-700">{routeLabel}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Info banner */}
        <div className="mx-6 mt-4 flex items-start gap-3 rounded-lg bg-blue-50 px-4 py-3 text-xs text-blue-700">
          <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Kërkesa juaj u pranua. Plotësoni informacionet e mëposhtme që transportuesi të kontaktojë personin përgjegjës dhe të marrë ngarkesën.
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                Emri i kontaktit <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.contact_name}
                onChange={set("contact_name")}
                required
                placeholder="p.sh. Artan Berisha"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                Numri i telefonit <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={form.contact_phone}
                onChange={set("contact_phone")}
                required
                placeholder="p.sh. +383 44 123 456"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              Adresa e ngarkimit <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.pickup_address}
              onChange={set("pickup_address")}
              required
              placeholder="p.sh. Rruga Nënë Tereza, Nr. 12, Prishtinë"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              Pesha e ngarkesës (kg)
            </label>
            <input
              type="number"
              min={0}
              value={form.weight_kg}
              onChange={set("weight_kg")}
              placeholder="p.sh. 500"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              Shënime shtesë
            </label>
            <textarea
              value={form.notes}
              onChange={set("notes")}
              rows={3}
              placeholder="p.sh. Mallra të brishta, kujdes gjatë ngarkimit..."
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600" role="alert">{error}</p>
          )}

          <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              Anulo
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {loading && (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              )}
              {loading ? "Duke dërguar..." : "Dërgo Detajet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
