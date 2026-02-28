"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Request } from "@/types/request";
import type { Route } from "@/types/route";
import type { Location } from "@/types/location";
import type { User } from "@/types/user";
import type { ShipmentDetails } from "@/types/shipment";
import type { Review } from "@/types/review";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { ShipmentFormModal } from "@/components/ShipmentFormModal";
import { ShipmentStatusStepper } from "@/components/ShipmentStatusStepper";
import { ReviewModal } from "@/components/ReviewModal";
import { DocumentSection } from "@/components/DocumentSection";
import { LiveRouteMap } from "@/components/LiveRouteMap";
import { downloadCSV, printTable } from "@/lib/exportUtils";

function locationLabel(loc?: Location | null): string {
  if (!loc) return "—";
  return `${loc.city}, ${loc.country}`;
}

export default function BusinessRequestsPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<Request[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [transporters, setTransporters] = useState<User[]>([]);
  const [shipments, setShipments] = useState<ShipmentDetails[]>([]);
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [userId, setUserId]       = useState<string>("");
  const [error, setError]         = useState<string | null>(null);

  const [shipmentTarget, setShipmentTarget] = useState<Request | null>(null);
  const [reviewTarget, setReviewTarget]     = useState<{ request: Request; transporterId: string; transporterName: string; routeLabel: string } | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/auth/login"); return; }
      setUserId(data.session.user.id);
      setCheckingAuth(false);
      await Promise.all([
        fetchData(data.session.user.id),
        fetchMyReviews(data.session.user.id),
      ]);
    };
    void init();
  }, [router]);

  const fetchMyReviews = async (uid: string) => {
    const { data } = await supabase.from("reviews").select("*").eq("reviewer_id", uid);
    setMyReviews((data ?? []) as Review[]);
  };

  const handleSubmitReview = async (rating: number, comment: string) => {
    if (!reviewTarget) return;
    const { error } = await supabase.from("reviews").insert({
      request_id:    reviewTarget.request.id,
      reviewer_id:   userId,
      reviewee_id:   reviewTarget.transporterId,
      reviewer_role: "business",
      rating,
      comment:       comment || null,
    });
    if (error) throw new Error(error.message);
    await fetchMyReviews(userId);
    setReviewTarget(null);
  };

  const fetchData = async (businessId: string) => {
    setLoading(true);
    setError(null);

    const { data: requestRows, error: requestError } = await supabase
      .from("requests")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (requestError) {
      setError(requestError.message);
      setLoading(false);
      return;
    }

    const typedRequests = (requestRows ?? []) as Request[];
    setRequests(typedRequests);

    if (typedRequests.length === 0) {
      setRoutes([]); setTransporters([]); setShipments([]);
      setLoading(false);
      return;
    }

    const requestIds = typedRequests.map((r) => r.id);
    const routeIds   = Array.from(new Set(typedRequests.map((r) => r.route_id)));

    // Fetch routes, shipments in parallel
    const [routeRes, shipmentRes] = await Promise.all([
      supabase
        .from("routes")
        .select("*, origin:locations!origin_location_id(*), destination:locations!destination_location_id(*)")
        .in("id", routeIds),
      supabase
        .from("shipment_details")
        .select("*")
        .in("request_id", requestIds),
    ]);

    if (routeRes.error) { setError(routeRes.error.message); setLoading(false); return; }

    const typedRoutes = (routeRes.data ?? []) as Route[];
    setRoutes(typedRoutes);
    setShipments((shipmentRes.data ?? []) as ShipmentDetails[]);

    const transporterIds = Array.from(new Set(typedRoutes.map((r) => r.transporter_id)));
    if (transporterIds.length === 0) { setTransporters([]); setLoading(false); return; }

    const { data: transporterRows } = await supabase
      .from("users")
      .select("id, company_name, role")
      .in("id", transporterIds);

    setTransporters((transporterRows ?? []) as User[]);
    setLoading(false);
  };

  const routeById = useMemo(() => {
    const map: Record<string, Route> = {};
    for (const r of routes) map[r.id] = r;
    return map;
  }, [routes]);

  const transporterById = useMemo(() => {
    const map: Record<string, User> = {};
    for (const t of transporters) map[t.id] = t;
    return map;
  }, [transporters]);

  const shipmentByRequestId = useMemo(() => {
    const map: Record<string, ShipmentDetails> = {};
    for (const s of shipments) map[s.request_id] = s;
    return map;
  }, [shipments]);

  const handleShipmentSubmit = async (formData: {
    contact_name: string;
    contact_phone: string;
    pickup_address: string;
    notes: string;
    weight_kg: string;
  }) => {
    if (!shipmentTarget) return;

    const { error: insertError } = await supabase.from("shipment_details").insert({
      request_id:     shipmentTarget.id,
      contact_name:   formData.contact_name,
      contact_phone:  formData.contact_phone,
      pickup_address: formData.pickup_address,
      notes:          formData.notes || null,
      weight_kg:      formData.weight_kg ? Number(formData.weight_kg) : null,
    });

    if (insertError) throw new Error(insertError.message);

    setShipmentTarget(null);
    const { data } = await supabase.auth.getSession();
    if (data.session) await fetchData(data.session.user.id);
  };

  if (checkingAuth) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Kërkesat e Mia"
        description="Ndiqni statusin e kërkesave dhe plotësoni detajet e dërgesës pasi transportuesi pranon."
        actions={
          requests.length > 0 ? (
            <div className="relative group">
              <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Eksporto
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div className="absolute right-0 top-full z-10 mt-1 hidden min-w-[140px] rounded-lg border border-zinc-200 bg-white py-1 shadow-lg group-hover:block">
                {(["csv", "pdf"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => {
                      const headers = ["Rruga", "Transportuesi", "Statusi Kërkesës", "Statusi Dërgesës", "Data"];
                      const rows = requests.map((req) => {
                        const route = routeById[req.route_id];
                        const trans = route ? transporterById[route.transporter_id] : undefined;
                        const ship  = shipmentByRequestId?.[req.id];
                        return [
                          route ? `${route.origin?.city ?? "?"} → ${route.destination?.city ?? "?"}` : "—",
                          trans?.company_name ?? "—",
                          req.status,
                          ship?.shipment_status ?? "—",
                          req.created_at ? new Date(req.created_at).toLocaleDateString("sq-AL") : "—",
                        ];
                      });
                      if (fmt === "csv") downloadCSV(headers, rows, "kerkesat");
                      else printTable("Historia e Kërkesave", headers, rows, `Gjithsej: ${requests.length} kërkesa`);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    {fmt === "csv" ? "CSV" : "PDF / Print"}
                  </button>
                ))}
              </div>
            </div>
          ) : undefined
        }
      />

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading && requests.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
        </div>
      ) : requests.length === 0 ? (
        <EmptyState
          title="Asnjë kërkesë ende"
          description="Kërko rrugë dhe kërko transport për t'i parë këtu të listuara."
        />
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            const route      = routeById[request.route_id];
            const transporter = route ? transporterById[route.transporter_id] : undefined;
            const shipment   = shipmentByRequestId[request.id];
            const routeLabel = route
              ? `${locationLabel(route.origin)} → ${locationLabel(route.destination)}`
              : "Rrugë";
            const needsShipment = request.status === "accepted" && !shipment;

            return (
              <div
                key={request.id}
                className={`rounded-xl border bg-white p-5 shadow-sm ${
                  needsShipment
                    ? "border-amber-200 ring-1 ring-amber-100"
                    : "border-zinc-100"
                }`}
              >
                {/* Top row */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-zinc-900">{routeLabel}</p>
                    {route && (
                      <p className="mt-0.5 text-xs text-zinc-500">
                        Nisja: <span className="font-medium text-zinc-700">{route.departure_date}</span>
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Transportuesi:{" "}
                      <span className="font-medium text-zinc-700">
                        {transporter?.company_name || "Transportues"}
                      </span>
                    </p>
                  </div>
                  <StatusBadge variant={request.status} />
                </div>

                {/* Accepted + no shipment → call to action */}
                {needsShipment && (
                  <div className="mt-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                    <div className="flex items-center gap-2 text-xs text-amber-800">
                      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                      <span>
                        <strong>Kërkohen detajet e dërgesës.</strong> Plotëso informacionet që transportuesi të kontaktojë dhe të marrë ngarkesën.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShipmentTarget(request)}
                      className="ml-4 shrink-0 rounded-lg bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                    >
                      Plotëso Tani
                    </button>
                  </div>
                )}

                {/* Accepted + shipment filled → stepper + live map + details + docs + review */}
                {request.status === "accepted" && shipment && (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-4">
                      <p className="mb-4 text-xs font-semibold text-zinc-500">Gjendja e dërgesës</p>
                      <ShipmentStatusStepper currentStatus={shipment.shipment_status} />
                    </div>

                    {/* Live map — only while driver is in transit */}
                    {route?.status === "in_transit" && (
                      <LiveRouteMap routeId={request.route_id} />
                    )}
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Detajet e Dërgesës
                        </div>
                        {shipment.shipment_status === "dorëzuar" && !myReviews.some((r) => r.request_id === request.id) && (
                          <button
                            type="button"
                            onClick={() => {
                              const r = routeById[request.route_id];
                              const t = r ? transporterById[r.transporter_id] : undefined;
                              setReviewTarget({ request, transporterId: r?.transporter_id ?? "", transporterName: t?.company_name ?? "Transportues", routeLabel: `${locationLabel(r?.origin)} → ${locationLabel(r?.destination)}` });
                            }}
                            className="rounded-md bg-amber-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-400"
                          >
                            Vlerëso Transportuesin
                          </button>
                        )}
                      </div>
                      <div className="grid gap-x-6 gap-y-1 text-xs text-zinc-700 md:grid-cols-2">
                        <p><span className="text-zinc-500">Kontakti:</span> <span className="font-medium">{shipment.contact_name}</span></p>
                        <p><span className="text-zinc-500">Telefoni:</span> <span className="font-medium">{shipment.contact_phone}</span></p>
                        <p className="md:col-span-2"><span className="text-zinc-500">Adresa:</span> <span className="font-medium">{shipment.pickup_address}</span></p>
                        {shipment.weight_kg && <p><span className="text-zinc-500">Pesha:</span> <span className="font-medium">{shipment.weight_kg} kg</span></p>}
                        {shipment.notes && <p className="md:col-span-2"><span className="text-zinc-500">Shënime:</span> <span className="font-medium">{shipment.notes}</span></p>}
                      </div>
                    </div>
                    <DocumentSection shipmentId={shipment.id} uploaderId={userId} />
                  </div>
                )}

                {/* Rejected */}
                {request.status === "rejected" && (
                  <p className="mt-3 text-xs text-zinc-500">
                    Kërkesa u refuzua nga transportuesi.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Shipment details modal */}
      {reviewTarget && (
        <ReviewModal
          revieweeName={reviewTarget.transporterName}
          revieweeRole="transporter"
          routeLabel={reviewTarget.routeLabel}
          onSubmit={handleSubmitReview}
          onClose={() => setReviewTarget(null)}
        />
      )}

      {shipmentTarget && (
        <ShipmentFormModal
          routeLabel={
            routeById[shipmentTarget.route_id]
              ? `${locationLabel(routeById[shipmentTarget.route_id].origin)} → ${locationLabel(routeById[shipmentTarget.route_id].destination)}`
              : "Rrugë"
          }
          onSubmit={handleShipmentSubmit}
          onClose={() => setShipmentTarget(null)}
        />
      )}
    </div>
  );
}
