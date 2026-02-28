"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PageHeader } from "@/components/PageHeader";
import { StarDisplay } from "@/components/StarRating";

interface WeekBucket { week: string; count: number }
interface CorridorBucket { name: string; count: number }
interface ShipmentBucket { status: string; label: string; count: number }
interface TopTransporter { id: string; name: string; avg: number; count: number }
interface TopCorridor { name: string; count: number }

function Bar({ value, max, color = "bg-zinc-900" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 4;
  return (
    <div className="flex items-center gap-3">
      <div className="h-5 flex-1 overflow-hidden rounded-full bg-zinc-100">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-semibold text-zinc-700">{value}</span>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth]   = useState(true);
  const [loading, setLoading]             = useState(true);
  const [weeklyUsers, setWeeklyUsers]     = useState<WeekBucket[]>([]);
  const [corridorReqs, setCorridorReqs]   = useState<CorridorBucket[]>([]);
  const [shipmentStats, setShipmentStats] = useState<ShipmentBucket[]>([]);
  const [topTransporters, setTopTransporters] = useState<TopTransporter[]>([]);
  const [topCorridors, setTopCorridors]   = useState<TopCorridor[]>([]);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/auth/login"); return; }
      const { data: u } = await supabase.from("users").select("role").eq("id", data.session.user.id).single();
      if (u?.role !== "admin") { router.replace("/dashboard/admin"); return; }
      setCheckingAuth(false);
      await fetchAll();
    };
    void init();
  }, [router]);

  const fetchAll = async () => {
    setLoading(true);
    const [
      { data: userData },
      { data: reqData },
      { data: routeData },
      { data: shipData },
      { data: reviewData },
      { data: corridorData },
    ] = await Promise.all([
      supabase.from("users").select("id, created_at").order("created_at"),
      supabase.from("requests").select("id, status, route_id, created_at"),
      supabase.from("routes").select("id, corridor_id, transporter_id"),
      supabase.from("shipment_details").select("shipment_status"),
      supabase.from("reviews").select("reviewee_id, rating"),
      supabase.from("corridors").select("id, name"),
    ]);

    // Weekly new users (last 8 weeks)
    const now      = new Date();
    const buckets: Record<string, number> = {};
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      buckets[weekLabel(d)] = 0;
    }
    for (const u of userData ?? []) {
      const lbl = weekLabel(new Date(u.created_at));
      if (lbl in buckets) buckets[lbl]++;
    }
    setWeeklyUsers(Object.entries(buckets).map(([week, count]) => ({ week, count })));

    // Requests per corridor
    const corridorMap = Object.fromEntries((corridorData ?? []).map((c) => [c.id, c.name]));
    const routeCorridorMap = Object.fromEntries((routeData ?? []).map((r) => [r.id, r.corridor_id]));
    const corrCounts: Record<string, number> = {};
    for (const req of reqData ?? []) {
      const cid  = routeCorridorMap[req.route_id];
      const name = cid ? (corridorMap[cid] ?? "Pa koridor") : "Pa koridor";
      corrCounts[name] = (corrCounts[name] ?? 0) + 1;
    }
    setCorridorReqs(Object.entries(corrCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count })));

    // Shipment status distribution
    const statusMap: Record<string, number> = {};
    for (const s of shipData ?? []) statusMap[s.shipment_status] = (statusMap[s.shipment_status] ?? 0) + 1;
    const STATUS_LABELS: Record<string, string> = { "detajet_plotësuara": "Detajet plotësuara", "ngarkuar": "Ngarkuar", "në_transit": "Në transit", "dorëzuar": "Dorëzuar" };
    const STATUS_COLORS: Record<string, string> = { "detajet_plotësuara": "bg-blue-400", "ngarkuar": "bg-amber-400", "në_transit": "bg-orange-400", "dorëzuar": "bg-emerald-500" };
    setShipmentStats(Object.entries(statusMap).map(([status, count]) => ({ status, label: STATUS_LABELS[status] ?? status, count, color: STATUS_COLORS[status] ?? "bg-zinc-400" } as ShipmentBucket & { color: string })));

    // Top 5 transporters by avg rating
    const routeTransporterMap = Object.fromEntries((routeData ?? []).map((r) => [r.id, r.transporter_id]));
    const transRatings: Record<string, number[]> = {};
    for (const rev of reviewData ?? []) {
      transRatings[rev.reviewee_id] = [...(transRatings[rev.reviewee_id] ?? []), rev.rating];
    }
    const topTrans = Object.entries(transRatings)
      .map(([id, ratings]) => ({ id, avg: ratings.reduce((a, b) => a + b, 0) / ratings.length, count: ratings.length }))
      .sort((a, b) => b.avg - a.avg || b.count - a.count)
      .slice(0, 5);
    // Fetch names
    if (topTrans.length > 0) {
      const { data: transUsers } = await supabase.from("users").select("id, company_name").in("id", topTrans.map((t) => t.id));
      const nameMap = Object.fromEntries((transUsers ?? []).map((u) => [u.id, u.company_name ?? "—"]));
      setTopTransporters(topTrans.map((t) => ({ ...t, name: nameMap[t.id] ?? "—" })));
    }

    // Top 5 corridors by route count
    const corrRouteCounts: Record<string, number> = {};
    for (const r of routeData ?? []) {
      const name = r.corridor_id ? (corridorMap[r.corridor_id] ?? "Pa koridor") : "Pa koridor";
      corrRouteCounts[name] = (corrRouteCounts[name] ?? 0) + 1;
    }
    setTopCorridors(Object.entries(corrRouteCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })));

    setLoading(false);
  };

  if (checkingAuth) return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" /></div>;

  return (
    <div className="space-y-8">
      <PageHeader title="Analitika" description="Statistika dhe tendencat e platformës." />

      {loading ? (
        <div className="grid gap-5 md:grid-cols-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-52 animate-pulse rounded-xl bg-zinc-100" />)}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">

          {/* Weekly new users */}
          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-100">
            <h3 className="mb-4 text-sm font-semibold text-zinc-900">Regjistrime të reja (8 javë)</h3>
            <div className="space-y-2">
              {weeklyUsers.map((b) => (
                <div key={b.week}>
                  <div className="mb-0.5 flex justify-between text-xs text-zinc-500">
                    <span>{b.week}</span>
                  </div>
                  <Bar value={b.count} max={Math.max(...weeklyUsers.map((x) => x.count), 1)} color="bg-blue-500" />
                </div>
              ))}
            </div>
          </div>

          {/* Requests per corridor */}
          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-100">
            <h3 className="mb-4 text-sm font-semibold text-zinc-900">Kërkesa sipas korridorit</h3>
            {corridorReqs.length === 0 ? <p className="text-xs text-zinc-400">Nuk ka të dhëna.</p> : (
              <div className="space-y-2">
                {corridorReqs.map((b) => (
                  <div key={b.name}>
                    <p className="mb-0.5 text-xs text-zinc-600 truncate">{b.name}</p>
                    <Bar value={b.count} max={Math.max(...corridorReqs.map((x) => x.count), 1)} color="bg-purple-500" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Shipment status */}
          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-100">
            <h3 className="mb-4 text-sm font-semibold text-zinc-900">Dërgesat sipas statusit</h3>
            {shipmentStats.length === 0 ? <p className="text-xs text-zinc-400">Nuk ka dërgesa ende.</p> : (
              <div className="space-y-2">
                {(shipmentStats as (ShipmentBucket & { color: string })[]).map((b) => (
                  <div key={b.status}>
                    <p className="mb-0.5 text-xs text-zinc-600">{b.label}</p>
                    <Bar value={b.count} max={Math.max(...shipmentStats.map((x) => x.count), 1)} color={b.color} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top transporters */}
          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-100">
            <h3 className="mb-4 text-sm font-semibold text-zinc-900">Top 5 Transportuesit (vlerësim)</h3>
            {topTransporters.length === 0 ? <p className="text-xs text-zinc-400">Nuk ka vlerësime ende.</p> : (
              <div className="space-y-3">
                {topTransporters.map((t, i) => (
                  <div key={t.id} className="flex items-center gap-3">
                    <span className="w-5 text-center text-xs font-bold text-zinc-400">#{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-zinc-800">{t.name}</p>
                      <StarDisplay rating={t.avg} count={t.count} />
                    </div>
                    <span className="text-sm font-bold text-amber-500">{t.avg.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top corridors */}
          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-100 md:col-span-2">
            <h3 className="mb-4 text-sm font-semibold text-zinc-900">Top 5 Koridore (nga numri i rrugëve)</h3>
            {topCorridors.length === 0 ? <p className="text-xs text-zinc-400">Nuk ka të dhëna.</p> : (
              <div className="space-y-2">
                {topCorridors.map((b) => (
                  <div key={b.name}>
                    <p className="mb-0.5 text-xs text-zinc-600">{b.name}</p>
                    <Bar value={b.count} max={Math.max(...topCorridors.map((x) => x.count), 1)} color="bg-emerald-500" />
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

function weekLabel(date: Date): string {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d.toLocaleDateString("sq-AL", { month: "short", day: "numeric" });
}
