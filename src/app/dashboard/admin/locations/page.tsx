"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Location } from "@/types/location";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/Toast";

interface LocationForm {
  country: string;
  city: string;
  region: string;
}

const emptyForm: LocationForm = { country: "", city: "", region: "" };

export default function AdminLocationsPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [locations, setLocations]       = useState<Location[]>([]);
  const [loading, setLoading]           = useState(false);
  const [search, setSearch]             = useState("");
  const [countryFilter, setCountryFilter] = useState("");

  // Add
  const [showAdd, setShowAdd]   = useState(false);
  const [addForm, setAddForm]   = useState<LocationForm>(emptyForm);
  const [saving, setSaving]     = useState(false);

  // Edit
  const [editId, setEditId]     = useState<string | null>(null);
  const [editForm, setEditForm] = useState<LocationForm>(emptyForm);

  // Delete
  const [deletingId, setDeletingId]           = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // CSV import
  const csvRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/auth/login"); return; }
      const { data: u } = await supabase.from("users").select("role").eq("id", data.session.user.id).single();
      if (u?.role !== "admin") { router.replace("/dashboard/admin"); return; }
      setCheckingAuth(false);
      await fetchLocations();
    };
    void init();
  }, [router]);

  const fetchLocations = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("locations").select("*").order("country").order("city");
    if (error) showToast(error.message, "error");
    else setLocations((data ?? []) as Location[]);
    setLoading(false);
  };

  const countries = useMemo(() => [...new Set(locations.map((l) => l.country))].sort(), [locations]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return locations.filter((l) => {
      const matchSearch  = !q || l.city.toLowerCase().includes(q) || l.country.toLowerCase().includes(q) || (l.region ?? "").toLowerCase().includes(q);
      const matchCountry = !countryFilter || l.country === countryFilter;
      return matchSearch && matchCountry;
    });
  }, [locations, search, countryFilter]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!addForm.country || !addForm.city) { showToast("Vendi dhe qyteti janë të detyrueshëm.", "error"); return; }
    setSaving(true);
    const { error } = await supabase.from("locations").insert({
      country: addForm.country.trim(),
      city:    addForm.city.trim(),
      region:  addForm.region.trim() || null,
    });
    setSaving(false);
    if (error) { showToast(error.message, "error"); return; }
    showToast("Vendndodhja u shtua.", "success");
    setAddForm(emptyForm);
    setShowAdd(false);
    await fetchLocations();
  };

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editId) return;
    setSaving(true);
    const { error } = await supabase.from("locations").update({
      country: editForm.country.trim(),
      city:    editForm.city.trim(),
      region:  editForm.region.trim() || null,
    }).eq("id", editId);
    setSaving(false);
    if (error) { showToast(error.message, "error"); return; }
    showToast("Vendndodhja u përditësua.", "success");
    setEditId(null);
    await fetchLocations();
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const { error } = await supabase.from("locations").delete().eq("id", id);
    setDeletingId(null);
    setConfirmDeleteId(null);
    if (error) { showToast(error.message, "error"); return; }
    showToast("Vendndodhja u fshi.", "success");
    setLocations((prev) => prev.filter((l) => l.id !== id));
  };

  // CSV format: country,city,region (header row optional)
  const handleCSVImport = async (file: File) => {
    setImporting(true);
    const text  = await file.text();
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const rows: { country: string; city: string; region: string | null }[] = [];

    for (const line of lines) {
      const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
      if (parts.length < 2) continue;
      const [country, city, region] = parts;
      if (!country || !city || country.toLowerCase() === "country") continue; // skip header
      rows.push({ country, city, region: region || null });
    }

    if (rows.length === 0) { showToast("Asnjë rresht valid në CSV.", "error"); setImporting(false); return; }

    const { error } = await supabase.from("locations").insert(rows);
    setImporting(false);
    if (csvRef.current) csvRef.current.value = "";
    if (error) { showToast(error.message, "error"); return; }
    showToast(`${rows.length} vendndodhje u importuan.`, "success");
    await fetchLocations();
  };

  if (checkingAuth) {
    return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" /></div>;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Menaxhimi i Vendndodhjeve"
        description={`${locations.length} qytete në sistem.`}
        actions={
          <div className="flex gap-2">
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 ${importing ? "opacity-50 pointer-events-none" : ""}`}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {importing ? "Duke importuar..." : "Importo CSV"}
              <input ref={csvRef} type="file" accept=".csv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCSVImport(f); }} />
            </label>
            {!showAdd && (
              <button
                type="button"
                onClick={() => { setShowAdd(true); setEditId(null); }}
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Shto Qytet
              </button>
            )}
          </div>
        }
      />

      {/* CSV format hint */}
      <p className="text-xs text-zinc-400">
        Formati CSV: <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono">country,city,region</code> (një rresht për qytet, rreshti i parë mund të jetë header)
      </p>

      {/* Add form */}
      {showAdd && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Vendndodhje e Re</h2>
          <form onSubmit={handleAdd} className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">Shteti <span className="text-red-500">*</span></label>
              <input value={addForm.country} onChange={(e) => setAddForm((p) => ({ ...p, country: e.target.value }))} placeholder="Kosovë" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">Qyteti <span className="text-red-500">*</span></label>
              <input value={addForm.city} onChange={(e) => setAddForm((p) => ({ ...p, city: e.target.value }))} placeholder="Prishtinë" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">Rajoni (opsional)</label>
              <input value={addForm.region} onChange={(e) => setAddForm((p) => ({ ...p, region: e.target.value }))} placeholder="Prishtinë" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none" />
            </div>
            <div className="flex gap-2 sm:col-span-3">
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60">
                {saving && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                {saving ? "Duke ruajtur..." : "Shto"}
              </button>
              <button type="button" onClick={() => { setShowAdd(false); setAddForm(emptyForm); }} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50">Anulo</button>
            </div>
          </form>
        </section>
      )}

      {/* Edit form */}
      {editId && (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Ndrysho Vendndodhjen</h2>
          <form onSubmit={handleEdit} className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">Shteti</label>
              <input value={editForm.country} onChange={(e) => setEditForm((p) => ({ ...p, country: e.target.value }))} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">Qyteti</label>
              <input value={editForm.city} onChange={(e) => setEditForm((p) => ({ ...p, city: e.target.value }))} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">Rajoni</label>
              <input value={editForm.region} onChange={(e) => setEditForm((p) => ({ ...p, region: e.target.value }))} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none" />
            </div>
            <div className="flex gap-2 sm:col-span-3">
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60">
                {saving && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                {saving ? "Duke ruajtur..." : "Ruaj"}
              </button>
              <button type="button" onClick={() => setEditId(null)} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50">Anulo</button>
            </div>
          </form>
        </section>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Kërko qytet, shtet, rajon..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
        />
        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
        >
          <option value="">Të gjitha shtetet</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <p className="self-center text-xs text-zinc-500">{filtered.length} rezultate</p>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-100">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center text-sm text-zinc-400">Asnjë vendndodhje nuk u gjet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Qyteti</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Shteti</th>
                <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 md:table-cell">Rajoni</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">Veprime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map((loc) => (
                <tr key={loc.id} className="hover:bg-zinc-50/60">
                  <td className="px-5 py-3.5 font-medium text-zinc-900">{loc.city}</td>
                  <td className="px-5 py-3.5 text-zinc-600">{loc.country}</td>
                  <td className="hidden px-5 py-3.5 text-zinc-400 md:table-cell">{loc.region || "—"}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => { setEditId(loc.id); setEditForm({ country: loc.country, city: loc.city, region: loc.region ?? "" }); setShowAdd(false); }}
                        className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                      >
                        Ndrysho
                      </button>
                      {confirmDeleteId === loc.id ? (
                        <>
                          <button
                            type="button"
                            disabled={deletingId === loc.id}
                            onClick={() => handleDelete(loc.id)}
                            className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-60"
                          >
                            {deletingId === loc.id && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                            Konfirmo
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-zinc-500">Anulo</button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(loc.id)}
                          className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Fshi
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
