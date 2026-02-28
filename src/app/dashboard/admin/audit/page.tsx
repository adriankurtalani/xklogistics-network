"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PageHeader } from "@/components/PageHeader";

interface AuditRow {
  id: string;
  admin_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  admin_name?: string;
}

const ACTION_LABELS: Record<string, string> = {
  update_hero_content:          "Ndryshoi hero",
  update_how_it_works_content:  "Ndryshoi hapat",
  create_announcement:          "Krijoi njoftim",
  activate_announcement:        "Aktivizoi njoftim",
  deactivate_announcement:      "Çaktivizoi njoftim",
  delete_announcement:          "Fshi njoftim",
  upload_media:                 "Ngarkoi media",
  delete_media:                 "Fshi media",
  broadcast_notification:       "Dërgoi njoftim masiv",
  update_system_setting:        "Ndryshoi cilësim",
  force_complete_shipment:      "Forcoi dorëzimin",
};

const ACTION_COLORS: Record<string, string> = {
  delete_announcement:    "bg-red-50 text-red-700",
  delete_media:           "bg-red-50 text-red-700",
  force_complete_shipment:"bg-amber-50 text-amber-700",
  broadcast_notification: "bg-blue-50 text-blue-700",
};

export default function AdminAuditPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [rows, setRows]                 = useState<AuditRow[]>([]);
  const [loading, setLoading]           = useState(false);
  const [search, setSearch]             = useState("");
  const [actionFilter, setActionFilter] = useState("");

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/auth/login"); return; }
      const { data: u } = await supabase.from("users").select("role").eq("id", data.session.user.id).single();
      if (u?.role !== "admin") { router.replace("/dashboard/admin"); return; }
      setCheckingAuth(false);
      await fetchLog();
    };
    void init();
  }, [router]);

  const fetchLog = async () => {
    setLoading(true);
    const { data } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(500);
    const logRows = (data ?? []) as AuditRow[];

    // Fetch admin names
    const adminIds = [...new Set(logRows.map((r) => r.admin_id))];
    if (adminIds.length > 0) {
      const { data: adminUsers } = await supabase.from("users").select("id, company_name, email").in("id", adminIds);
      const nameMap = Object.fromEntries((adminUsers ?? []).map((u) => [u.id, u.company_name || u.email || "Admin"]));
      setRows(logRows.map((r) => ({ ...r, admin_name: nameMap[r.admin_id] ?? "Admin" })));
    } else {
      setRows(logRows);
    }
    setLoading(false);
  };

  const uniqueActions = useMemo(() => [...new Set(rows.map((r) => r.action))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => {
      const matchQ = !q || r.action.includes(q) || (r.admin_name ?? "").toLowerCase().includes(q) || (r.target_id ?? "").includes(q);
      const matchA = !actionFilter || r.action === actionFilter;
      return matchQ && matchA;
    });
  }, [rows, search, actionFilter]);

  if (checkingAuth) return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" /></div>;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Regjistri i Auditit"
        description={`${rows.length} veprime të regjistruara. Vetëm-lexim.`}
      />

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Kërko veprim, admin, ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
        />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
        >
          <option value="">Të gjitha veprimet</option>
          {uniqueActions.map((a) => <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>)}
        </select>
        <p className="self-center text-xs text-zinc-500">{filtered.length} rezultate</p>
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-100">
        {loading ? (
          <div className="flex justify-center py-14"><div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-zinc-400">Asnjë veprim nuk u gjet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Data/Ora</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Veprimi</th>
                <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 md:table-cell">Admin</th>
                <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 lg:table-cell">Detaje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map((row) => (
                <tr key={row.id} className="hover:bg-zinc-50/60">
                  <td className="px-5 py-3 text-xs text-zinc-400 whitespace-nowrap">
                    {new Date(row.created_at).toLocaleString("sq-AL")}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ACTION_COLORS[row.action] ?? "bg-zinc-100 text-zinc-700"}`}>
                      {ACTION_LABELS[row.action] ?? row.action}
                    </span>
                    {row.target_type && <p className="mt-0.5 text-xs text-zinc-400">{row.target_type}{row.target_id ? ` · ${row.target_id.slice(0, 8)}…` : ""}</p>}
                  </td>
                  <td className="hidden px-5 py-3 text-xs text-zinc-600 md:table-cell">{row.admin_name ?? "—"}</td>
                  <td className="hidden px-5 py-3 lg:table-cell">
                    {row.details ? (
                      <details className="cursor-pointer">
                        <summary className="text-xs text-zinc-400 hover:text-zinc-700">Shiko detajet</summary>
                        <pre className="mt-1 max-w-xs overflow-x-auto rounded bg-zinc-50 p-2 text-xs text-zinc-600">
                          {JSON.stringify(row.details, null, 2)}
                        </pre>
                      </details>
                    ) : <span className="text-xs text-zinc-300">—</span>}
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
