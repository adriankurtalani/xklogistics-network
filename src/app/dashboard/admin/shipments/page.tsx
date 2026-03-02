"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { logAdminAction } from "@/lib/auditLog";
import type { Request, RequestStatus } from "@/types/request";
import type { Route } from "@/types/route";
import type { User } from "@/types/user";
import type { ShipmentDetails } from "@/types/shipment";
import type { Location } from "@/types/location";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { ShipmentStatusStepper } from "@/components/ShipmentStatusStepper";
import { useToast } from "@/components/Toast";

function locLabel(loc?: Location | null) {
  return loc ? `${loc.city}, ${loc.country}` : "—";
}

export default function AdminShipmentsPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [adminId, setAdminId]           = useState("");
  const [requests, setRequests]         = useState<Request[]>([]);
  const [routes, setRoutes]             = useState<Route[]>([]);
  const [users, setUsers]               = useState<User[]>([]);
  const [shipments, setShipments]       = useState<ShipmentDetails[]>([]);
  const [loading, setLoading]           = useState(false);
  const [expandedId, setExpandedId]     = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"all" | RequestStatus>("all");
  const [search, setSearch]             = useState("");
  const [forcingId, setForcingId]       = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/auth/login"); return; }
      const { data: u } = await supabase.from("users").select("role").eq("id", data.session.user.id).single();
      if (u?.role !== "admin") { router.replace("/dashboard/admin"); return; }
      setAdminId(data.session.user.id);
      setCheckingAuth(false);
      await fetchAll();
    };
    void init();
  }, [router]);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: reqData }, { data: routeData }, { data: userData }, { data: shipData }] = await Promise.all([
      supabase.from("requests").select("*").order("created_at", { ascending: false }),
      supabase.from("routes").select("*, origin:locations!origin_location_id(*), destination:locations!destination_location_id(*)"),
      supabase.from("users").select("id, company_name, email, role"),
      supabase.from("shipment_details").select("*"),
    ]);
    setRequests((reqData ?? []) as Request[]);
    setRoutes((routeData ?? []) as Route[]);
    setUsers((userData ?? []) as User[]);
    setShipments((shipData ?? []) as ShipmentDetails[]);
    setLoading(false);
  };

  const routeById    = useMemo(() => Object.fromEntries(routes.map((r) => [r.id, r])), [routes]);
  const userById     = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const shipByReqId  = useMemo(() => Object.fromEntries(shipments.map((s) => [s.request_id, s])), [shipments]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return requests.filter((req) => {
      const route   = routeById[req.route_id];
      const biz     = userById[req.business_id];
      const trans   = route ? userById[route.transporter_id] : undefined;
      const matchQ  = !q
        || (biz?.company_name ?? "").toLowerCase().includes(q)
        || (trans?.company_name ?? "").toLowerCase().includes(q)
        || locLabel(route?.origin).toLowerCase().includes(q)
        || locLabel(route?.destination).toLowerCase().includes(q);
      const matchS  = statusFilter === "all" || req.status === statusFilter;
      return matchQ && matchS;
    });
  }, [requests, statusFilter, search, routeById, userById]);

  const handleForceComplete = async (req: Request) => {
    const shipment = shipByReqId[req.id];
    if (!shipment) { showToast("Nuk ka detaje dërgese për këtë kërkesë.", "error"); return; }
    setForcingId(req.id);
    const { error } = await supabase.from("shipment_details").update({ shipment_status: "dorëzuar" }).eq("id", shipment.id);
    setForcingId(null);
    if (error) { showToast(error.message, "error"); return; }
    await logAdminAction({ adminId, action: "force_complete_shipment", targetType: "shipment", targetId: shipment.id, details: { request_id: req.id } });
    showToast("Dërgesa u shënua si e dorëzuar.", "success");
    await fetchAll();
  };

  const statusCounts = useMemo(() => ({
    all:      requests.length,
    pending:  requests.filter((r) => r.status === "pending").length,
    accepted: requests.filter((r) => r.status === "accepted").length,
    rejected: requests.filter((r) => r.status === "rejected").length,
  }), [requests]);

  if (checkingAuth) return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" /></div>;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mbikëqyrja e Kërkesave"
        description="Të gjitha kërkesat dhe dërgesat platform-wide."
      />

      {/* Summary pills */}
      <div className="flex flex-wrap gap-2">
        {(["all", "pending", "accepted", "rejected"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${statusFilter === s ? "bg-zinc-900 text-white border-zinc-900" : "border-zinc-300 text-zinc-600 hover:bg-zinc-50"}`}
          >
            {s === "all" ? "Të gjitha" : s === "pending" ? "Pritëse" : s === "accepted" ? "Të pranuara" : "Të refuzuara"}
            {" "}
            <span className="opacity-70">({statusCounts[s]})</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Kërko kompani, qytet..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none sm:max-w-xs"
      />

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-14"><div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" /></div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 && <p className="py-10 text-center text-sm text-zinc-400">Asnjë kërkesë nuk u gjet.</p>}
          {filtered.map((req) => {
            const route    = routeById[req.route_id];
            const biz      = userById[req.business_id];
            const trans    = route ? userById[route.transporter_id] : undefined;
            const shipment = shipByReqId[req.id];
            const isExpanded = expandedId === req.id;

            return (
              <div key={req.id} className="rounded-xl bg-white shadow-sm ring-1 ring-zinc-100">
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
                  onClick={() => setExpandedId(isExpanded ? null : req.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-zinc-900 text-sm">
                        {locLabel(route?.origin)} → {locLabel(route?.destination)}
                      </p>
                      <StatusBadge variant={req.status} />
                      {shipment && <StatusBadge variant={shipment.shipment_status as never} />}
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Biznes: <span className="font-medium">{biz?.company_name ?? "—"}</span>
                      {" · "}
                      Transportues: <span className="font-medium">{trans?.company_name ?? "—"}</span>
                      {route && ` · Nisja: ${route.departure_date}`}
                    </p>
                  </div>
                  <svg className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="border-t border-zinc-100 px-5 py-4 space-y-4">
                    {/* Route details */}
                    <div className="grid gap-3 text-xs sm:grid-cols-2">
                      <div className="rounded-lg bg-zinc-50 p-3 space-y-1">
                        <p className="font-semibold text-zinc-700">Biznesi</p>
                        <p>{biz?.company_name ?? "—"}</p>
                        <p className="text-zinc-400">{biz?.email ?? "—"}</p>
                      </div>
                      <div className="rounded-lg bg-zinc-50 p-3 space-y-1">
                        <p className="font-semibold text-zinc-700">Transportuesi</p>
                        <p>{trans?.company_name ?? "—"}</p>
                        <p className="text-zinc-400">{trans?.email ?? "—"}</p>
                      </div>
                    </div>

                    {/* Shipment details + stepper */}
                    {shipment ? (
                      <div className="space-y-3">
                        <ShipmentStatusStepper
                          currentStatus={shipment.shipment_status}
                          requestAcceptedAt={req.created_at}
                          shipmentCreatedAt={shipment.created_at}
                          deliveryConfirmed={shipment.delivery_confirmed}
                          deliveryConfirmedAt={shipment.delivery_confirmed_at}
                        />
                        <div className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 text-zinc-700">
                          <p><span className="text-zinc-500">Kontakti:</span> {shipment.contact_name}</p>
                          <p><span className="text-zinc-500">Telefoni:</span> {shipment.contact_phone}</p>
                          <p className="sm:col-span-2"><span className="text-zinc-500">Adresa:</span> {shipment.pickup_address}</p>
                          {shipment.weight_kg && <p><span className="text-zinc-500">Pesha:</span> {shipment.weight_kg} kg</p>}
                          {shipment.notes && <p className="sm:col-span-2"><span className="text-zinc-500">Shënime:</span> {shipment.notes}</p>}
                        </div>
                        {shipment.shipment_status !== "dorëzuar" && (
                          <button
                            type="button"
                            disabled={forcingId === req.id}
                            onClick={() => handleForceComplete(req)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                          >
                            {forcingId === req.id && <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-600" />}
                            Shëno si Dorëzuar (Force)
                          </button>
                        )}
                      </div>
                    ) : req.status === "accepted" ? (
                      <p className="text-xs text-amber-600">Biznesi nuk ka plotësuar ende detajet e dërgesës.</p>
                    ) : null}

                    <p className="text-xs text-zinc-400">ID kërkese: {req.id}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
