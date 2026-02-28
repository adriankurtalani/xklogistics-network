"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { User, UserRole } from "@/types/user";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/Toast";

const ROLE_LABELS: Record<UserRole, string> = {
  transporter: "Transportues",
  business:    "Biznes",
  admin:       "Admin",
};

const ROLE_COLORS: Record<UserRole, string> = {
  transporter: "bg-blue-50 text-blue-700",
  business:    "bg-purple-50 text-purple-700",
  admin:       "bg-zinc-800 text-white",
};

function initials(user: User) {
  const name = user.company_name || user.email || "?";
  return name.slice(0, 2).toUpperCase();
}

function exportCSV(users: User[]) {
  const headers = ["ID", "Kompania", "Email", "Roli", "Telefoni", "TVSH", "Adresa", "Statusi", "Regjistruar"];
  const rows = users.map((u) => [
    u.id,
    u.company_name ?? "",
    u.email ?? "",
    u.role,
    u.phone ?? "",
    u.vat_number ?? "",
    u.address ?? "",
    u.is_suspended ? "Pezulluar" : "Aktiv",
    u.created_at ?? "",
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "perdoruesit.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [users, setUsers]               = useState<User[]>([]);
  const [loading, setLoading]           = useState(false);

  // filters
  const [search, setSearch]         = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");

  // action states
  const [suspendingId, setSuspendingId]   = useState<string | null>(null);
  const [deletingId, setDeletingId]       = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [resetEmailId, setResetEmailId]   = useState<string | null>(null);

  // drawer
  const [drawerUser, setDrawerUser]         = useState<User | null>(null);
  const [editRole, setEditRole]             = useState<UserRole>("business");
  const [savingRole, setSavingRole]         = useState(false);
  const drawerRef                           = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/auth/login"); return; }
      const { data: u } = await supabase.from("users").select("role").eq("id", data.session.user.id).single();
      if (u?.role !== "admin") { router.replace("/dashboard/admin"); return; }
      setCheckingAuth(false);
      await fetchUsers();
    };
    void init();
  }, [router]);

  // close drawer on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) setDrawerUser(null);
    };
    if (drawerUser) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [drawerUser]);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("users").select("*").order("created_at", { ascending: false });
    if (error) showToast(error.message, "error");
    else setUsers((data ?? []) as User[]);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      const matchSearch = !q
        || (u.company_name ?? "").toLowerCase().includes(q)
        || (u.email ?? "").toLowerCase().includes(q)
        || (u.phone ?? "").toLowerCase().includes(q);
      const matchRole   = roleFilter === "all" || u.role === roleFilter;
      const matchStatus = statusFilter === "all"
        || (statusFilter === "active" && !u.is_suspended)
        || (statusFilter === "suspended" && u.is_suspended);
      return matchSearch && matchRole && matchStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const handleToggleSuspend = async (user: User) => {
    setSuspendingId(user.id);
    const { error } = await supabase.from("users").update({ is_suspended: !user.is_suspended }).eq("id", user.id);
    setSuspendingId(null);
    if (error) { showToast(error.message, "error"); return; }
    showToast(user.is_suspended ? "Përdoruesi u aktivizua." : "Përdoruesi u pezullua.", "success");
    await fetchUsers();
    if (drawerUser?.id === user.id) setDrawerUser((p) => p ? { ...p, is_suspended: !p.is_suspended } : null);
  };

  const handleDeleteUser = async (userId: string) => {
    setDeletingId(userId);
    const { error } = await supabase.rpc("admin_delete_user", { target_user_id: userId });
    setDeletingId(null);
    setConfirmDeleteId(null);
    if (error) { showToast(error.message, "error"); return; }
    showToast("Përdoruesi u fshi.", "success");
    setDrawerUser(null);
    await fetchUsers();
  };

  const handleResetPassword = async (user: User) => {
    if (!user.email) { showToast("Ky përdorues nuk ka email.", "error"); return; }
    setResetEmailId(user.id);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email);
    setResetEmailId(null);
    if (error) { showToast(error.message, "error"); return; }
    showToast(`Email-i i rivendosjes u dërgua te ${user.email}`, "success");
  };

  const handleChangeRole = async () => {
    if (!drawerUser) return;
    setSavingRole(true);
    const { error } = await supabase.from("users").update({ role: editRole }).eq("id", drawerUser.id);
    setSavingRole(false);
    if (error) { showToast(error.message, "error"); return; }
    showToast("Roli u ndryshua.", "success");
    setDrawerUser((p) => p ? { ...p, role: editRole } : null);
    await fetchUsers();
  };

  const openDrawer = (user: User) => {
    setDrawerUser(user);
    setEditRole(user.role);
  };

  if (checkingAuth) {
    return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" /></div>;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Menaxhimi i Përdoruesve"
        description={`${users.length} përdorues të regjistruar në platformë.`}
        actions={
          <button
            type="button"
            onClick={() => exportCSV(filtered)}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Eksporto CSV
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Kërko kompani, email, telefon..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
        >
          <option value="all">Të gjitha rolet</option>
          <option value="transporter">Transportues</option>
          <option value="business">Biznes</option>
          <option value="admin">Admin</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
        >
          <option value="all">Të gjitha statuset</option>
          <option value="active">Aktiv</option>
          <option value="suspended">Pezulluar</option>
        </select>
      </div>

      {/* Results count */}
      <p className="text-xs text-zinc-500">
        Duke shfaqur <span className="font-medium text-zinc-700">{filtered.length}</span> nga{" "}
        <span className="font-medium text-zinc-700">{users.length}</span> përdorues
      </p>

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-100">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center text-sm text-zinc-400">Asnjë përdorues nuk u gjet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Përdoruesi</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Roli</th>
                <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 md:table-cell">Telefoni</th>
                <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 lg:table-cell">Regjistruar</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Statusi</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">Veprime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map((user) => (
                <tr key={user.id} className="hover:bg-zinc-50/60">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-700">
                        {initials(user)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-zinc-900">{user.company_name || "—"}</p>
                        <p className="truncate text-xs text-zinc-400">{user.email || "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[user.role]}`}>
                      {ROLE_LABELS[user.role]}
                    </span>
                  </td>
                  <td className="hidden px-5 py-3.5 text-zinc-600 md:table-cell">{user.phone || "—"}</td>
                  <td className="hidden px-5 py-3.5 text-xs text-zinc-400 lg:table-cell">
                    {user.created_at ? new Date(user.created_at).toLocaleDateString("sq-AL") : "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${user.is_suspended ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${user.is_suspended ? "bg-red-500" : "bg-emerald-500"}`} />
                      {user.is_suspended ? "Pezulluar" : "Aktiv"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openDrawer(user)}
                        className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                      >
                        Shiko
                      </button>
                      <button
                        type="button"
                        disabled={suspendingId === user.id}
                        onClick={() => handleToggleSuspend(user)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-60 ${user.is_suspended ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-amber-50 text-amber-700 hover:bg-amber-100"}`}
                      >
                        {suspendingId === user.id ? "..." : user.is_suspended ? "Aktivizo" : "Pezullo"}
                      </button>
                      {confirmDeleteId === user.id ? (
                        <>
                          <button
                            type="button"
                            disabled={deletingId === user.id}
                            onClick={() => handleDeleteUser(user.id)}
                            className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-60"
                          >
                            {deletingId === user.id && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                            Konfirmo
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-50">
                            Anulo
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(user.id)}
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

      {/* Slide-in Drawer */}
      {drawerUser && (
        <>
          <div className="fixed inset-0 z-30 bg-black/30" onClick={() => setDrawerUser(null)} />
          <div ref={drawerRef} className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col bg-white shadow-2xl">
            {/* Drawer header */}
            <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-5">
              <h2 className="text-base font-semibold text-zinc-900">Profili i Përdoruesit</h2>
              <button type="button" onClick={() => setDrawerUser(null)} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Avatar + name */}
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-200 text-lg font-bold text-zinc-700">
                  {initials(drawerUser)}
                </div>
                <div>
                  <p className="font-semibold text-zinc-900">{drawerUser.company_name || "Pa emër"}</p>
                  <p className="text-xs text-zinc-400">{drawerUser.email || "—"}</p>
                  <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[drawerUser.role]}`}>
                    {ROLE_LABELS[drawerUser.role]}
                  </span>
                </div>
              </div>

              {/* Profile fields */}
              <div className="space-y-3 rounded-xl bg-zinc-50 p-4 text-sm">
                {[
                  { label: "Email",   value: drawerUser.email },
                  { label: "Telefoni", value: drawerUser.phone },
                  { label: "TVSH Nr.", value: drawerUser.vat_number },
                  { label: "Adresa",  value: drawerUser.address },
                  { label: "Regjistruar", value: drawerUser.created_at ? new Date(drawerUser.created_at).toLocaleDateString("sq-AL") : null },
                ].map((f) => (
                  <div key={f.label} className="flex items-start justify-between gap-4">
                    <span className="text-zinc-500">{f.label}</span>
                    <span className="text-right font-medium text-zinc-800">{f.value || "—"}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Statusi</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${drawerUser.is_suspended ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {drawerUser.is_suspended ? "Pezulluar" : "Aktiv"}
                  </span>
                </div>
              </div>

              {/* Change role */}
              <div className="rounded-xl border border-zinc-200 p-4">
                <p className="mb-3 text-xs font-semibold text-zinc-700">Ndrysho Rolin</p>
                <div className="flex gap-2">
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
                  >
                    <option value="transporter">Transportues</option>
                    <option value="business">Biznes</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    type="button"
                    disabled={savingRole || editRole === drawerUser.role}
                    onClick={handleChangeRole}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                  >
                    {savingRole && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                    Ruaj
                  </button>
                </div>
              </div>
            </div>

            {/* Drawer footer actions */}
            <div className="space-y-2 border-t border-zinc-100 px-6 py-4">
              <button
                type="button"
                disabled={resetEmailId === drawerUser.id}
                onClick={() => handleResetPassword(drawerUser)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {resetEmailId === drawerUser.id ? "Duke dërguar..." : "Dërgo Email Rivendosjeje"}
              </button>
              <button
                type="button"
                disabled={!!suspendingId}
                onClick={() => handleToggleSuspend(drawerUser)}
                className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-60 ${drawerUser.is_suspended ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-amber-500 text-white hover:bg-amber-400"}`}
              >
                {drawerUser.is_suspended ? "Aktivizo Llogarinë" : "Pezullo Llogarinë"}
              </button>
              {confirmDeleteId === drawerUser.id ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="mb-2 text-center text-xs text-red-700">Fshirja është e pakthyeshme.</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setConfirmDeleteId(null)} className="flex-1 rounded-md border border-zinc-300 bg-white py-2 text-xs text-zinc-600 hover:bg-zinc-50">Anulo</button>
                    <button
                      type="button"
                      disabled={deletingId === drawerUser.id}
                      onClick={() => handleDeleteUser(drawerUser.id)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-red-600 py-2 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-60"
                    >
                      {deletingId === drawerUser.id && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                      Po, fshi
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(drawerUser.id)}
                  className="w-full rounded-lg border border-red-200 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                >
                  Fshi Llogarinë Përgjithmonë
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
