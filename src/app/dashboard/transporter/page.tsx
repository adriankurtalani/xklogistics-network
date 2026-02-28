"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Route, RouteStatus } from "@/types/route";
import type { Location } from "@/types/location";
import type { Corridor } from "@/types/corridor";
import type { Request, RequestStatus } from "@/types/request";
import type { ShipmentDetails, ShipmentStatus } from "@/types/shipment";
import { SHIPMENT_STATUS_STEPS } from "@/types/shipment";
import type { Review } from "@/types/review";
import { ReviewModal } from "@/components/ReviewModal";
import { DocumentSection } from "@/components/DocumentSection";
import { StatusBadge } from "@/components/StatusBadge";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { RouteCardSkeleton } from "@/components/Skeleton";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useToast } from "@/components/Toast";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { TrackingActivator } from "@/components/TrackingActivator";
import { downloadCSV, printTable } from "@/lib/exportUtils";

interface PendingAction {
  requestId: string;
  status: RequestStatus;
  routeLabel: string;
}

function locationLabel(loc?: Location | null): string {
  if (!loc) return "—";
  return `${loc.city}, ${loc.country}`;
}

function corridorLabel(corridors: Corridor[], corridorId?: string | null): string | null {
  if (!corridorId) return null;
  return corridors.find((c) => c.id === corridorId)?.name ?? null;
}

export default function TransporterDashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [locations, setLocations] = useState<Location[]>([]);
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [shipments, setShipments] = useState<ShipmentDetails[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [updatingRequestId, setUpdatingRequestId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ request: Request; businessId: string; routeLabel: string } | null>(null);
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [userId, setUserId] = useState<string>("");

  const [originLocationId, setOriginLocationId] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [corridorId, setCorridorId] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [availableCapacity, setAvailableCapacity] = useState<number>(0);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/auth/login"); return; }
      setUserId(data.session.user.id);
      setCheckingAuth(false);
      await Promise.all([
        fetchLocations(),
        fetchCorridors(),
        fetchRoutes(data.session.user.id),
        fetchMyReviews(data.session.user.id),
      ]);
    };
    void init();
  }, [router]);

  const fetchLocations = async () => {
    const { data } = await supabase
      .from("locations")
      .select("*")
      .order("country", { ascending: true })
      .order("city", { ascending: true });
    setLocations((data ?? []) as Location[]);
  };

  const fetchMyReviews = async (uid: string) => {
    const { data } = await supabase.from("reviews").select("*").eq("reviewer_id", uid);
    setMyReviews((data ?? []) as Review[]);
  };

  const fetchCorridors = async () => {
    const { data } = await supabase
      .from("corridors")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });
    setCorridors((data ?? []) as Corridor[]);
  };

  const fetchRequests = async (routeIds: string[]) => {
    if (routeIds.length === 0) { setRequests([]); setShipments([]); return; }
    setLoadingRequests(true);

    const { data, error: requestsError } = await supabase
      .from("requests")
      .select("*")
      .in("route_id", routeIds)
      .order("created_at", { ascending: false });

    if (requestsError) {
      showToast(requestsError.message, "error");
      setLoadingRequests(false);
      return;
    }

    const typedRequests = (data ?? []) as Request[];
    setRequests(typedRequests);

    // Fetch shipment details for accepted requests
    const acceptedIds = typedRequests
      .filter((r) => r.status === "accepted")
      .map((r) => r.id);

    if (acceptedIds.length > 0) {
      const { data: shipmentData } = await supabase
        .from("shipment_details")
        .select("*")
        .in("request_id", acceptedIds);
      setShipments((shipmentData ?? []) as ShipmentDetails[]);
    } else {
      setShipments([]);
    }

    setLoadingRequests(false);
  };

  const fetchRoutes = async (transporterId: string) => {
    setLoadingRoutes(true);
    const { data, error: routesError } = await supabase
      .from("routes")
      .select("*, origin:locations!origin_location_id(*), destination:locations!destination_location_id(*)")
      .eq("transporter_id", transporterId)
      .order("created_at", { ascending: false });

    if (routesError) {
      setError(routesError.message);
      showToast(routesError.message, "error");
    } else {
      const typedRoutes = (data ?? []) as Route[];
      setRoutes(typedRoutes);
      await fetchRequests(typedRoutes.map((r) => r.id));
    }
    setLoadingRoutes(false);
  };

  const handleAddRoute = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFormLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) { setFormLoading(false); router.replace("/auth/login"); return; }

    const { user } = sessionData.session;
    const { error: insertError } = await supabase.from("routes").insert({
      transporter_id: user.id,
      origin_location_id: originLocationId,
      destination_location_id: destinationLocationId,
      corridor_id: corridorId || null,
      departure_date: departureDate,
      available_capacity: availableCapacity,
      status: "available",
    });

    if (insertError) {
      setError(insertError.message);
      showToast(insertError.message, "error");
      setFormLoading(false);
      return;
    }

    setOriginLocationId("");
    setDestinationLocationId("");
    setCorridorId("");
    setDepartureDate("");
    setAvailableCapacity(0);
    setIsAddModalOpen(false);
    showToast("Rruga u shtua me sukses.", "success");
    await fetchRoutes(user.id);
    setFormLoading(false);
  };

  const handleStatusChange = async (routeId: string, status: RouteStatus) => {
    const { error: updateError } = await supabase
      .from("routes")
      .update({ status })
      .eq("id", routeId);

    if (updateError) {
      showToast(updateError.message, "error");
      return;
    }

    showToast("Statusi i rrugës u përditësua.", "success");
    const { data: sessionData } = await supabase.auth.getSession();
    const transporterId = sessionData.session?.user.id;
    if (transporterId) await fetchRoutes(transporterId);
  };

  const confirmRequestAction = (request: Request, status: RequestStatus) => {
    const route = routes.find((r) => r.id === request.route_id);
    const routeLabel = route
      ? `${locationLabel(route.origin)} → ${locationLabel(route.destination)}`
      : "këtë rrugë";
    setPendingAction({ requestId: request.id, status, routeLabel });
  };

  const handleConfirmedAction = async () => {
    if (!pendingAction) return;
    const { requestId, status } = pendingAction;

    setUpdatingRequestId(requestId);
    const { error: updateError } = await supabase
      .from("requests")
      .update({ status })
      .eq("id", requestId);

    setUpdatingRequestId(null);
    setPendingAction(null);

    if (updateError) {
      showToast(updateError.message, "error");
      return;
    }

    showToast(
      status === "accepted" ? "Kërkesa u pranua." : "Kërkesa u refuzua.",
      status === "accepted" ? "success" : "info"
    );
    await fetchRequests(routes.map((r) => r.id));
  };

  const requestsByRoute = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const request of requests) {
      counts[request.route_id] = (counts[request.route_id] ?? 0) + 1;
    }
    return counts;
  }, [requests]);

  const shipmentByRequestId = useMemo(() => {
    const map: Record<string, ShipmentDetails> = {};
    for (const s of shipments) map[s.request_id] = s;
    return map;
  }, [shipments]);

  const handleDuplicateRoute = (route: Route) => {
    setOriginLocationId(route.origin_location_id);
    setDestinationLocationId(route.destination_location_id);
    setCorridorId(route.corridor_id ?? "");
    setAvailableCapacity(route.available_capacity);
    setDepartureDate(""); // user must pick a new date
    setIsAddModalOpen(true);
  };

  const handleSubmitReview = async (rating: number, comment: string) => {
    if (!reviewTarget) return;
    const { error } = await supabase.from("reviews").insert({
      request_id:    reviewTarget.request.id,
      reviewer_id:   userId,
      reviewee_id:   reviewTarget.businessId,
      reviewer_role: "transporter",
      rating,
      comment:       comment || null,
    });
    if (error) throw new Error(error.message);
    await fetchMyReviews(userId);
    setReviewTarget(null);
    showToast("Vlerësimi u dërgua.", "success");
  };

  const handleShipmentStatusChange = async (shipmentId: string, newStatus: ShipmentStatus) => {
    const { error } = await supabase
      .from("shipment_details")
      .update({ shipment_status: newStatus })
      .eq("id", shipmentId);

    if (error) { showToast(error.message, "error"); return; }

    setShipments((prev) =>
      prev.map((s) => s.id === shipmentId ? { ...s, shipment_status: newStatus } : s)
    );
    showToast("Statusi i dërgesës u përditësua.", "success");
  };

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-600">Duke kontrolluar hyrjen...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Paneli i Transportuesit"
          description="Menaxho rrugët tuaja dhe përgjigju kërkesave hyrëse të transportit."
          actions={
            <div className="flex flex-wrap gap-2">
              <div className="relative group">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Eksporto
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div className="absolute right-0 top-full z-10 mt-1 hidden min-w-[140px] rounded-lg border border-zinc-200 bg-white py-1 shadow-lg group-hover:block">
                  <button
                    type="button"
                    onClick={() => {
                      const headers = ["Origjina", "Destinacioni", "Korridori", "Data e nisjes", "Kapaciteti (kg)", "Statusi"];
                      const rows = routes.map((r) => [locationLabel(r.origin), locationLabel(r.destination), corridorLabel(corridors, r.corridor_id) ?? "—", r.departure_date, r.available_capacity, r.status]);
                      downloadCSV(headers, rows, "rruget");
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                  >CSV</button>
                  <button
                    type="button"
                    onClick={() => {
                      const headers = ["Origjina", "Destinacioni", "Korridori", "Data e nisjes", "Kapaciteti (kg)", "Statusi"];
                      const rows = routes.map((r) => [locationLabel(r.origin), locationLabel(r.destination), corridorLabel(corridors, r.corridor_id) ?? "—", r.departure_date, r.available_capacity, r.status]);
                      printTable("Rrugët e Mia", headers, rows, `Gjithsej: ${routes.length} rrugë`);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                  >PDF / Print</button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Shto Rrugë
              </button>
            </div>
          }
        />

        {error && (
          <div className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Routes section */}
        <section className="mb-8 rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-100">
          <h2 className="mb-4 text-sm font-semibold tracking-tight text-zinc-900">
            Rrugët e Mia
          </h2>
          {loadingRoutes ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3, 4].map((i) => <RouteCardSkeleton key={i} />)}
            </div>
          ) : routes.length === 0 ? (
            <EmptyState
              title="Asnjë rrugë ende"
              description="Shto rrugën tënde të parë për ta bërë kapacitetin tënd të dukshëm për bizneset."
              action={
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  className="inline-flex items-center rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                >
                  Shto rrugë
                </button>
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {routes.map((route) => {
                const requestCount = requestsByRoute[route.id] ?? 0;
                const usedCapacity = route.status === "completed" ? route.available_capacity : 0;
                const capacityPercent = route.available_capacity > 0
                  ? Math.min(100, Math.round((usedCapacity / route.available_capacity) * 100))
                  : 0;

                return (
                  <div
                    key={route.id}
                    className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-zinc-900">
                          {locationLabel(route.origin)} → {locationLabel(route.destination)}
                        </p>
                        {corridorLabel(corridors, route.corridor_id) && (
                          <span className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                            {corridorLabel(corridors, route.corridor_id)}
                          </span>
                        )}
                        <p className="mt-1 text-xs text-zinc-500">Nisja</p>
                        <p className="text-sm text-zinc-700">{route.departure_date}</p>
                      </div>
                      <StatusBadge variant={route.status} />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-zinc-600">
                        <span>Kapaciteti: <span className="font-medium">{route.available_capacity}</span></span>
                        <span>{capacityPercent}% përdorur</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${capacityPercent}%` }}
                        />
                      </div>
                    </div>
                    {/* GPS live tracking — visible only while route is in transit */}
                    {route.status === "in_transit" && (
                      <div className="border-t border-zinc-100 pt-3">
                        <p className="mb-1.5 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                          Live GPS Tracking
                        </p>
                        <TrackingActivator
                          routeId={route.id}
                          transporterId={userId}
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-zinc-600">
                        Kërkesat: <span className="font-medium">{requestCount}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => handleDuplicateRoute(route)}
                        className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                        title="Dupliko rrugën"
                      >
                        Dupliko
                      </button>
                      <select
                        value={route.status}
                        onChange={(e) =>
                          handleStatusChange(route.id, e.target.value as RouteStatus)
                        }
                        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      >
                        <option value="available">I lirë</option>
                        <option value="in_transit">Në transit</option>
                        <option value="completed">Kompletuar</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Incoming requests section */}
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-100">
          <h2 className="mb-4 text-sm font-semibold tracking-tight text-zinc-900">
            Kërkesat Hyrëse
          </h2>
          {loadingRequests ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <EmptyState
              title="Asnjë kërkesë ende"
              description="Kërkesat hyrëse të transportit për rrugët tuaja do të shfaqen këtu."
            />
          ) : (
            <div className="space-y-3">
              {requests.map((request) => {
                const route    = routes.find((r) => r.id === request.route_id);
                const shipment = shipmentByRequestId[request.id];
                return (
                  <div
                    key={request.id}
                    className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-4 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-zinc-900">
                          {route
                            ? `${locationLabel(route.origin)} → ${locationLabel(route.destination)}`
                            : "Rrugë"}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-xs text-zinc-500">Statusi</span>
                          <StatusBadge variant={request.status} />
                        </div>
                      </div>
                      {request.status === "pending" && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={updatingRequestId === request.id}
                            onClick={() => confirmRequestAction(request, "accepted")}
                            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
                          >
                            Prano
                          </button>
                          <button
                            type="button"
                            disabled={updatingRequestId === request.id}
                            onClick={() => confirmRequestAction(request, "rejected")}
                            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-60"
                          >
                            Refuzo
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Shipment details + status control */}
                    {request.status === "accepted" && shipment && (
                      <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-3">
                        <p className="text-xs font-semibold text-blue-700">Detajet e Dërgesës</p>
                        <div className="grid gap-x-6 gap-y-1 text-xs text-zinc-700 md:grid-cols-2">
                          <p><span className="text-zinc-500">Kontakti:</span> <span className="font-medium">{shipment.contact_name}</span></p>
                          <p><span className="text-zinc-500">Telefoni:</span> <span className="font-medium">{shipment.contact_phone}</span></p>
                          <p className="md:col-span-2"><span className="text-zinc-500">Adresa:</span> <span className="font-medium">{shipment.pickup_address}</span></p>
                          {shipment.weight_kg && (
                            <p><span className="text-zinc-500">Pesha:</span> <span className="font-medium">{shipment.weight_kg} kg</span></p>
                          )}
                          {shipment.notes && (
                            <p className="md:col-span-2"><span className="text-zinc-500">Shënime:</span> <span className="font-medium">{shipment.notes}</span></p>
                          )}
                        </div>
                        {/* Status update buttons */}
                        {shipment.shipment_status !== "dorëzuar" && (
                          <div className="flex flex-wrap gap-2 border-t border-blue-100 pt-3">
                            <span className="self-center text-xs text-zinc-500">Përditëso statusin:</span>
                            {SHIPMENT_STATUS_STEPS.filter((s) => s.key !== "detajet_plotësuara").map((step) => {
                              const currentIdx = SHIPMENT_STATUS_STEPS.findIndex((s) => s.key === shipment.shipment_status);
                              const stepIdx    = SHIPMENT_STATUS_STEPS.findIndex((s) => s.key === step.key);
                              const isNext     = stepIdx === currentIdx + 1;
                              if (!isNext) return null;
                              return (
                                <button
                                  key={step.key}
                                  type="button"
                                  onClick={() => handleShipmentStatusChange(shipment.id, step.key)}
                                  className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700"
                                >
                                  Shëno: {step.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {shipment.shipment_status === "dorëzuar" && (
                          <div className="flex items-center justify-between border-t border-blue-100 pt-2">
                            <div className="flex items-center gap-2 text-xs text-emerald-700">
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Dërgesa u dorëzua me sukses.
                            </div>
                            {!myReviews.some((r) => r.request_id === request.id) && (
                              <button
                                type="button"
                                onClick={() => setReviewTarget({ request, businessId: request.business_id, routeLabel: route ? `${locationLabel(route.origin)} → ${locationLabel(route.destination)}` : "Rrugë" })}
                                className="rounded-md bg-amber-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-400"
                              >
                                Vlerëso Biznesin
                              </button>
                            )}
                          </div>
                        )}
                        <DocumentSection shipmentId={shipment.id} uploaderId={userId} />
                      </div>
                    )}

                    {/* Accepted but business hasn't filled the form yet */}
                    {request.status === "accepted" && !shipment && (
                      <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Duke pritur që biznesi të plotësojë detajet e dërgesës…
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Add route modal */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-900">Shto Rrugë të Re</h2>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-sm text-zinc-500 hover:text-zinc-700"
                >
                  Mbyll
                </button>
              </div>
              <form className="grid gap-4 md:grid-cols-2" onSubmit={handleAddRoute}>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Origjina</label>
                  <LocationAutocomplete
                    locations={locations}
                    value={originLocationId}
                    onChange={setOriginLocationId}
                    placeholder="Kërko qytetin e origjinës..."
                    required
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Destinacioni</label>
                  <LocationAutocomplete
                    locations={locations}
                    value={destinationLocationId}
                    onChange={setDestinationLocationId}
                    placeholder="Kërko qytetin e destinacionit..."
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Korridori (opsional)</label>
                  <select
                    value={corridorId}
                    onChange={(e) => setCorridorId(e.target.value)}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  >
                    <option value="">Pa koridor</option>
                    {corridors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Data e Nisjes</label>
                  <input
                    type="date"
                    value={departureDate}
                    onChange={(e) => setDepartureDate(e.target.value)}
                    required
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Kapaciteti i Lirë (kg)</label>
                  <input
                    type="number"
                    min={0}
                    value={availableCapacity}
                    onChange={(e) => setAvailableCapacity(Number(e.target.value))}
                    required
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
                {error && (
                  <div className="md:col-span-2">
                    <p className="text-sm text-red-600" role="alert">{error}</p>
                  </div>
                )}
                <div className="md:col-span-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    Anulo
                  </button>
                  <button
                    type="submit"
                    disabled={formLoading}
                    className="inline-flex items-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                  >
                    {formLoading ? "Duke ruajtur..." : "Ruaj rrugën"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Review modal */}
        {reviewTarget && (
          <ReviewModal
            revieweeName="Biznes"
            revieweeRole="business"
            routeLabel={reviewTarget.routeLabel}
            onSubmit={handleSubmitReview}
            onClose={() => setReviewTarget(null)}
          />
        )}

        {/* Confirm accept/reject modal */}
        {pendingAction && (
          <ConfirmModal
            title={pendingAction.status === "accepted" ? "Prano kërkesën?" : "Refuzo kërkesën?"}
            description={`Jeni i sigurt që dëshironi të ${pendingAction.status === "accepted" ? "pranoni" : "refuzoni"} kërkesën për rrugën ${pendingAction.routeLabel}?`}
            confirmLabel={pendingAction.status === "accepted" ? "Po, prano" : "Po, refuzo"}
            variant={pendingAction.status === "rejected" ? "danger" : "primary"}
            loading={updatingRequestId === pendingAction.requestId}
            onConfirm={handleConfirmedAction}
            onCancel={() => setPendingAction(null)}
          />
        )}
    </div>
  );
}
