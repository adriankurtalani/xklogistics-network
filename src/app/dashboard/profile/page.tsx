"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/Toast";
import type { User } from "@/types/user";

export default function ProfilePage() {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [email,   setEmail]   = useState("");

  const [form, setForm] = useState({
    company_name: "",
    phone:        "",
    vat_number:   "",
    address:      "",
  });

  useEffect(() => {
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;

      setEmail(sessionData.session.user.email ?? "");

      const { data: userRow } = await supabase
        .from("users")
        .select("company_name, phone, vat_number, address")
        .eq("id", sessionData.session.user.id)
        .single();

      if (userRow) {
        const u = userRow as Partial<User>;
        setForm({
          company_name: u.company_name ?? "",
          phone:        u.phone        ?? "",
          vat_number:   u.vat_number   ?? "",
          address:      u.address      ?? "",
        });
      }

      setLoading(false);
    };
    void load();
  }, []);

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

    if (error) {
      showToast(error.message, "error");
    } else {
      showToast("Profili u ruajt me sukses.", "success");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
      </div>
    );
  }

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
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                Emri i kompanisë
              </label>
              <input
                type="text"
                value={form.company_name}
                onChange={set("company_name")}
                placeholder="p.sh. Transporti Berisha SH.P.K"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                Numri i TVSH-së (VAT)
              </label>
              <input
                type="text"
                value={form.vat_number}
                onChange={set("vat_number")}
                placeholder="p.sh. 811234567"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                Numri i telefonit
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={set("phone")}
                placeholder="p.sh. +383 44 123 456"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                Adresa e kompanisë
              </label>
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
            {saving && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            )}
            {saving ? "Duke ruajtur..." : "Ruaj ndryshimet"}
          </button>
        </div>
      </form>
    </div>
  );
}
