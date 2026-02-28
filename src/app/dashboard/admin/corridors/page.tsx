"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Corridor } from "@/types/corridor";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/Toast";

interface CorridorForm {
  name: string;
  origin_country: string;
  destination_country: string;
  is_active: boolean;
}

const emptyForm: CorridorForm = { name: "", origin_country: "", destination_country: "", is_active: true };

export default function AdminCorridorsPage() {
  const router     = useRouter();
  const { showToast } = useToast();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [corridors, setCorridors]       = useState<Corridor[]>([]);
  const [loading, setLoading]           = useState(false);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);

  // Add form
  const [addForm, setAddForm]   = useState<CorridorForm>(emptyForm);
  const [showAdd, setShowAdd]   = useState(false);

  // Edit form
  const [editId, setEditId]     = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CorridorForm>(emptyForm);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/auth/login"); return; }
      const { data: user } = await supabase.from("users").select("role").eq("id", data.session.user.id).single();
      if (user?.role !== "admin") { router.replace("/dashboard/admin"); return; }
      setCheckingAuth(false);
      await fetchCorridors();
    };
    void init();
  }, [router]);

  const fetchCorridors = async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from("corridors")
      .select("*")
      .order("created_at", { ascending: false });
    if (err) setError(err.message);
    else setCorridors((data ?? []) as Corridor[]);
    setLoading(false);
  };

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!addForm.name || !addForm.origin_country || !addForm.destination_country) {
      setError("Plotëso të gjitha fushat."); return;
    }
    setSaving(true); setError(null);
    const { error: err } = await supabase.from("corridors").insert(addForm);
    setSaving(false);
    if (err) { setError(err.message); return; }
    showToast("Korridori u shtua.", "success");
    setAddForm(emptyForm);
    setShowAdd(false);
    await fetchCorridors();
  };

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editId) return;
    setSaving(true); setError(null);
    const { error: err } = await supabase.from("corridors").update(editForm).eq("id", editId);
    setSaving(false);
    if (err) { setError(err.message); return; }
    showToast("Korridori u përditësua.", "success");
    setEditId(null);
    await fetchCorridors();
  };

  const toggleActive = async (corridor: Corridor) => {
    const { error: err } = await supabase
      .from("corridors")
      .update({ is_active: !corridor.is_active })
      .eq("id", corridor.id);
    if (err) { showToast(err.message, "error"); return; }
    showToast(corridor.is_active ? "Korridori u çaktivizua." : "Korridori u aktivizua.", "success");
    await fetchCorridors();
  };

  if (checkingAuth) {
    return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Menaxhimi i Korridoreve"
        description="Shto, ndrysho ose çaktivizo korridoret e transportit."
        actions={
          !showAdd && !editId ? (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Shto Koridor
            </button>
          ) : undefined
        }
      />

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {/* Add form */}
      {showAdd && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Koridor i Ri</h2>
          <form onSubmit={handleAdd} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-zinc-700">Emri i Korridorit</label>
              <input
                value={addForm.name}
                onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                placeholder='p.sh. "Itali ↔ Kosovë"'
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">Vendi i Origjinës</label>
              <input
                value={addForm.origin_country}
                onChange={(e) => setAddForm((p) => ({ ...p, origin_country: e.target.value }))}
                placeholder="Itali"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">Vendi i Destinacionit</label>
              <input
                value={addForm.destination_country}
                onChange={(e) => setAddForm((p) => ({ ...p, destination_country: e.target.value }))}
                placeholder="Kosovë"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                id="add-active"
                type="checkbox"
                checked={addForm.is_active}
                onChange={(e) => setAddForm((p) => ({ ...p, is_active: e.target.checked }))}
                className="h-4 w-4 rounded border-zinc-300"
              />
              <label htmlFor="add-active" className="text-sm text-zinc-700">Aktiv</label>
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {saving && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                {saving ? "Duke ruajtur..." : "Shto"}
              </button>
              <button type="button" onClick={() => { setShowAdd(false); setError(null); }} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
                Anulo
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Edit form */}
      {editId && (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Ndrysho Korridorin</h2>
          <form onSubmit={handleEdit} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-zinc-700">Emri i Korridorit</label>
              <input
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">Vendi i Origjinës</label>
              <input
                value={editForm.origin_country}
                onChange={(e) => setEditForm((p) => ({ ...p, origin_country: e.target.value }))}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">Vendi i Destinacionit</label>
              <input
                value={editForm.destination_country}
                onChange={(e) => setEditForm((p) => ({ ...p, destination_country: e.target.value }))}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                id="edit-active"
                type="checkbox"
                checked={editForm.is_active}
                onChange={(e) => setEditForm((p) => ({ ...p, is_active: e.target.checked }))}
                className="h-4 w-4 rounded border-zinc-300"
              />
              <label htmlFor="edit-active" className="text-sm text-zinc-700">Aktiv</label>
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {saving && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                {saving ? "Duke ruajtur..." : "Ruaj"}
              </button>
              <button type="button" onClick={() => { setEditId(null); setError(null); }} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
                Anulo
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Corridors table */}
      <section className="rounded-xl bg-white shadow-sm ring-1 ring-zinc-100">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
          </div>
        ) : corridors.length === 0 ? (
          <div className="py-12 text-center text-sm text-zinc-400">Asnjë koridor nuk u gjet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Emri</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Origjina</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Destinacioni</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Statusi</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">Veprime</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {corridors.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-50/60">
                    <td className="px-5 py-3.5 font-medium text-zinc-900">{c.name}</td>
                    <td className="px-5 py-3.5 text-zinc-600">{c.origin_country}</td>
                    <td className="px-5 py-3.5 text-zinc-600">{c.destination_country}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${c.is_active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${c.is_active ? "bg-emerald-500" : "bg-zinc-400"}`} />
                        {c.is_active ? "Aktiv" : "Joaktiv"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => { setEditId(c.id); setEditForm({ name: c.name, origin_country: c.origin_country, destination_country: c.destination_country, is_active: c.is_active }); setShowAdd(false); }}
                          className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                        >
                          Ndrysho
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(c)}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium ${c.is_active ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
                        >
                          {c.is_active ? "Çaktivizo" : "Aktivizo"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
