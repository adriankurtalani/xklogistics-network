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
import { EmptyState } from "@/components/EmptyState";
import { RouteCardSkeleton } from "@/components/Skeleton";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useToast } from "@/components/Toast";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { TrackingActivator } from "@/components/TrackingActivator";
import { downloadCSV, printTable } from "@/lib/exportUtils";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface PendingAction {
  requestId: string;
  status: RequestStatus;
  routeLabel: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function locationLabel(loc?: Location | null): string {
  return loc ? `${loc.city}, ${loc.country}` : "—";
}

function corridorLabel(corridors: Corridor[], cid?: string | null): string | null {
  if (!cid) return null;
  return corridors.find((c) => c.id === cid)?.name ?? null;
}

function daysUntil(dateStr: string): number {
  const now    = new Date();
  const target = new Date(dateStr);
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("sq-AL", {
    weekday: "short", day: "numeric", month: "short",
  });
}

// ─── Small atoms ─────────────────────────────────────────────────────────────

function SvgIcon({ d, cls = "h-5 w-5" }: { d: string; cls?: string }) {
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function CountBadge({ n, color }: { n: number; color: string }) {
  return (
    <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{n}</span>
  );
}

// ─── "Today's Focus" card ─────────────────────────────────────────────────────

interface FocusCardProps {
  icon: string;
  title: string;
  subtitle: string;
  buttonLabel?: string;
  onButton?: () => void;
  accent: "emerald" | "amber" | "blue" | "zinc";
}

function TodaysFocusCard({ icon, title, subtitle, buttonLabel, onButton, accent }: FocusCardProps) {
  const palettes = {
    emerald: { wrap: "from-emerald-600 to-emerald-500", btn: "bg-white text-emerald-700 hover:bg-emerald-50" },
    amber:   { wrap: "from-amber-500  to-amber-400",   btn: "bg-white text-amber-700  hover:bg-amber-50"   },
    blue:    { wrap: "from-blue-600   to-blue-500",    btn: "bg-white text-blue-700   hover:bg-blue-50"    },
    zinc:    { wrap: "from-zinc-700   to-zinc-600",    btn: "bg-white text-zinc-700   hover:bg-zinc-50"    },
  }[accent];

  return (
    <div className={`flex items-center justify-between gap-4 rounded-2xl bg-gradient-to-r ${palettes.wrap} px-5 py-4 text-white shadow-md`}>
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-3xl shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className="font-bold text-base leading-snug">{title}</p>
          <p className="mt-0.5 text-sm opacity-80 truncate">{subtitle}</p>
        </div>
      </div>
      {buttonLabel && onButton && (
        <button
          type="button"
          onClick={onButton}
          className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition-colors ${palettes.btn}`}
        >
          {buttonLabel}
        </button>
      )}
    </div>
  );
}

// ─── Shipment status stepper (inline mini) ───────────────────────────────────

function ShipmentMini({ shipment }: { shipment: ShipmentDetails }) {
  const idx = SHIPMENT_STATUS_STEPS.findIndex((s) => s.key === shipment.shipment_status);
  return (
    <div className="flex items-center gap-1">
      {SHIPMENT_STATUS_STEPS.map((s, i) => (
        <div
          key={s.key}
          title={s.label}
          className={`h-1.5 flex-1 rounded-full ${i <= idx ? "bg-emerald-500" : "bg-zinc-200"}`}
        />
      ))}
      <span className="ml-2 shrink-0 text-xs text-zinc-400">{SHIPMENT_STATUS_STEPS[idx]?.label}</span>
    </div>
  );
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Section({
  label,
  accent,
  count,
  action,
  children,
  empty,
  loading,
}: {
  label: string;
  accent: "emerald" | "amber" | "blue" | "zinc";
  count?: number;
  action?: React.ReactNode;
  children?: React.ReactNode;
  empty?: React.ReactNode;
  loading?: boolean;
}) {
  const bar = {
    emerald: "bg-emerald-500",
    amber:   "bg-amber-400",
    blue:    "bg-blue-500",
    zinc:    "bg-zinc-400",
  }[accent];

  const badge = {
    emerald: "bg-emerald-100 text-emerald-700",
    amber:   "bg-amber-100  text-amber-700",
    blue:    "bg-blue-100   text-blue-700",
    zinc:    "bg-zinc-100   text-zinc-500",
  }[accent];

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100">
      {/* Accent top bar */}
      <div className={`h-1 w-full ${bar}`} />
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-50">
        <div className="flex items-center">
          <h2 className="text-sm font-semibold text-zinc-900">{label}</h2>
          {count !== undefined && <CountBadge n={count} color={badge} />}
        </div>
        {action}
      </div>
      <div className="px-5 py-4">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2].map((i) => <RouteCardSkeleton key={i} />)}
          </div>
        ) : children ? children : empty}
      </div>
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TransporterDashboardPage() {
  const router     = useRouter();
  const { showToast } = useToast();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [locations, setLocations]   = useState<Location[]>([]);
  const [corridors, setCorridors]   = useState<Corridor[]>([]);
  const [routes, setRoutes]         = useState<Route[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [formLoading, setFormLoading]     = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [requests, setRequests]     = useState<Request[]>([]);
  const [shipments, setShipments]   = useState<ShipmentDetails[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [updatingRequestId, setUpdatingRequestId] = useState<string | null>(null);
  const [podShipmentIds, setPodShipmentIds] = useState<Set<string>>(new Set());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [pendingAction, setPendingAction]   = useState<PendingAction | null>(null);
  const [reviewTarget, setReviewTarget]     = useState<{ request: Request; businessId: string; routeLabel: string } | null>(null);
  const [myReviews, setMyReviews]   = useState<Review[]>([]);
  const [userId, setUserId]         = useState<string>("");
  const [companyName, setCompanyName] = useState("");
  const [completedOpen, setCompletedOpen] = useState(false);

  // Form state (add route modal)
  const [originLocationId, setOriginLocationId]           = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [corridorId, setCorridorId]         = useState("");
  const [departureDate, setDepartureDate]   = useState("");
  const [availableCapacity, setAvailableCapacity] = useState<number>(0);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/auth/login"); return; }
      setUserId(data.session.user.id);
      setCheckingAuth(false);
      const { data: uRow } = await supabase
        .from("users")
        .select("company_name")
        .eq("id", data.session.user.id)
        .single();
      if (uRow?.company_name) setCompanyName(uRow.company_name);
      await Promise.all([
        fetchLocations(),
        fetchCorridors(),
        fetchRoutes(data.session.user.id),
        fetchMyReviews(data.session.user.id),
      ]);
    };
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchLocations = async () => {
    const { data } = await supabase.from("locations").select("*").order("country").order("city");
    setLocations((data ?? []) as Location[]);
  };

  const fetchCorridors = async () => {
    const { data } = await supabase.from("corridors").select("*").eq("is_active", true).order("name");
    setCorridors((data ?? []) as Corridor[]);
  };

  const fetchMyReviews = async (uid: string) => {
    const { data } = await supabase.from("reviews").select("*").eq("reviewer_id", uid);
    setMyReviews((data ?? []) as Review[]);
  };

  const fetchRequests = async (routeIds: string[]) => {
    if (routeIds.length === 0) { setRequests([]); setShipments([]); return; }
    setLoadingRequests(true);

    const { data, error: reqErr } = await supabase
      .from("requests")
      .select("*")
      .in("route_id", routeIds)
      .order("created_at", { ascending: false });

    if (reqErr) { showToast(reqErr.message, "error"); setLoadingRequests(false); return; }

    const typedReqs = (data ?? []) as Request[];
    setRequests(typedReqs);

    const acceptedIds = typedReqs.filter((r) => r.status === "accepted").map((r) => r.id);
    if (acceptedIds.length > 0) {
      const { data: shipData } = await supabase
        .from("shipment_details")
        .select("*")
        .in("request_id", acceptedIds);

      const typed = (shipData ?? []) as ShipmentDetails[];
      setShipments(typed);

      const shipIds = typed.map((s) => s.id);
      if (shipIds.length > 0) {
        const { data: podData } = await supabase
          .from("shipment_documents")
          .select("shipment_id")
          .in("shipment_id", shipIds)
          .eq("document_type", "prove_dorezimi");
        setPodShipmentIds(new Set((podData ?? []).map((d) => (d as { shipment_id: string }).shipment_id)));
      } else {
        setPodShipmentIds(new Set());
      }
    } else {
      setShipments([]);
      setPodShipmentIds(new Set());
    }
    setLoadingRequests(false);
  };

  const fetchRoutes = async (transporterId: string) => {
    setLoadingRoutes(true);
    const { data, error: routesErr } = await supabase
      .from("routes")
      .select("*, origin:locations!origin_location_id(*), destination:locations!destination_location_id(*)")
      .eq("transporter_id", transporterId)
      .order("created_at", { ascending: false });

    if (routesErr) {
      setError(routesErr.message);
      showToast(routesErr.message, "error");
    } else {
      const typed = (data ?? []) as Route[];
      setRoutes(typed);
      await fetchRequests(typed.map((r) => r.id));
    }
    setLoadingRoutes(false);
  };

  // ── Mutations ─────────────────────────────────────────────────────────────

  const handleAddRoute = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFormLoading(true);
    const { data: sd } = await supabase.auth.getSession();
    if (!sd.session) { setFormLoading(false); router.replace("/auth/login"); return; }

    const { error: insertErr } = await supabase.from("routes").insert({
      transporter_id:          sd.session.user.id,
      origin_location_id:      originLocationId,
      destination_location_id: destinationLocationId,
      corridor_id:             corridorId || null,
      departure_date:          departureDate,
      available_capacity:      availableCapacity,
      status:                  "available",
    });

    if (insertErr) {
      setError(insertErr.message);
      showToast(insertErr.message, "error");
      setFormLoading(false);
      return;
    }

    setOriginLocationId(""); setDestinationLocationId("");
    setCorridorId(""); setDepartureDate(""); setAvailableCapacity(0);
    setIsAddModalOpen(false);
    showToast("Rruga u shtua me sukses.", "success");
    await fetchRoutes(sd.session.user.id);
    setFormLoading(false);
  };

  const handleStatusChange = async (routeId: string, status: RouteStatus) => {
    const { error } = await supabase.from("routes").update({ status }).eq("id", routeId);
    if (error) { showToast(error.message, "error"); return; }
    showToast("Statusi i rrugës u përditësua.", "success");
    const { data: sd } = await supabase.auth.getSession();
    if (sd.session?.user.id) await fetchRoutes(sd.session.user.id);
  };

  const confirmRequestAction = (request: Request, status: RequestStatus) => {
    const route = routes.find((r) => r.id === request.route_id);
    setPendingAction({
      requestId:  request.id,
      status,
      routeLabel: route ? `${locationLabel(route.origin)} → ${locationLabel(route.destination)}` : "—",
    });
  };

  const handleConfirmedAction = async () => {
    if (!pendingAction) return;
    setUpdatingRequestId(pendingAction.requestId);
    const { error } = await supabase
      .from("requests")
      .update({ status: pendingAction.status })
      .eq("id", pendingAction.requestId);
    setUpdatingRequestId(null);
    setPendingAction(null);
    if (error) { showToast(error.message, "error"); return; }
    showToast(
      pendingAction.status === "accepted" ? "Kërkesa u pranua." : "Kërkesa u refuzua.",
      pendingAction.status === "accepted" ? "success" : "info",
    );
    await fetchRequests(routes.map((r) => r.id));
  };

  const handleShipmentStatusChange = async (shipmentId: string, newStatus: ShipmentStatus) => {
    const isDelivered = newStatus === "dorëzuar";
    const { error } = await supabase
      .from("shipment_details")
      .update({ shipment_status: newStatus, ...(isDelivered ? { is_locked: true } : {}) })
      .eq("id", shipmentId);
    if (error) { showToast(error.message, "error"); return; }
    setShipments((prev) =>
      prev.map((s) =>
        s.id === shipmentId
          ? { ...s, shipment_status: newStatus, ...(isDelivered ? { is_locked: true } : {}) }
          : s,
      ),
    );
    showToast("Statusi i dërgesës u përditësua.", "success");
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

  const refetchPodForShipment = async (shipmentId: string) => {
    const { data } = await supabase
      .from("shipment_documents")
      .select("shipment_id")
      .eq("shipment_id", shipmentId)
      .eq("document_type", "prove_dorezimi")
      .limit(1);
    const has = (data ?? []).length > 0;
    setPodShipmentIds((prev) => {
      const next = new Set(prev);
      has ? next.add(shipmentId) : next.delete(shipmentId);
      return next;
    });
  };

  const handleDuplicateRoute = (route: Route) => {
    setOriginLocationId(route.origin_location_id);
    setDestinationLocationId(route.destination_location_id);
    setCorridorId(route.corridor_id ?? "");
    setAvailableCapacity(route.available_capacity);
    setDepartureDate("");
    setIsAddModalOpen(true);
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const shipmentByRequestId = useMemo(() => {
    const m: Record<string, ShipmentDetails> = {};
    for (const s of shipments) m[s.request_id] = s;
    return m;
  }, [shipments]);

  const requestsByRoute = useMemo(() => {
    const m: Record<string, Request[]> = {};
    for (const req of requests) m[req.route_id] = [...(m[req.route_id] ?? []), req];
    return m;
  }, [requests]);

  // Categorized routes
  const activeRoute    = useMemo(() => routes.find((r) => r.status === "in_transit"), [routes]);
  const upcomingRoutes = useMemo(
    () => routes
      .filter((r) => r.status === "available")
      .sort((a, b) => new Date(a.departure_date).getTime() - new Date(b.departure_date).getTime()),
    [routes],
  );
  const completedRoutes = useMemo(() => routes.filter((r) => r.status === "completed"), [routes]);

  // Categorized requests
  const pendingRequests  = useMemo(() => requests.filter((r) => r.status === "pending"),  [requests]);
  const acceptedRequests = useMemo(() => requests.filter((r) => r.status === "accepted"), [requests]);

  // Shipments needing POD before delivery can be marked
  const needsPodCount = useMemo(() => {
    return shipments.filter((s) => {
      const idx  = SHIPMENT_STATUS_STEPS.findIndex((st) => st.key === s.shipment_status);
      const next = SHIPMENT_STATUS_STEPS[idx + 1];
      return next?.key === "dorëzuar" && !podShipmentIds.has(s.id);
    }).length;
  }, [shipments, podShipmentIds]);

  // Today's Focus logic ──────────────────────────────────────────────────────
  type FocusItem = FocusCardProps;

  const todaysFocus = useMemo((): FocusItem => {
    if (activeRoute) {
      const label = `${locationLabel(activeRoute.origin)} → ${locationLabel(activeRoute.destination)}`;
      const activeShipments = (requestsByRoute[activeRoute.id] ?? [])
        .filter((r) => r.status === "accepted")
        .map((r) => shipmentByRequestId[r.id])
        .filter(Boolean);
      return {
        icon:        "🚚",
        accent:      "emerald",
        title:       `Jeni në rrugë drejt ${locationLabel(activeRoute.destination)}`,
        subtitle:    `${label} · ${activeShipments.length} dërgesa aktive`,
        buttonLabel: "Shiko Rrugën Aktive",
        onButton:    () => document.getElementById("active-route")?.scrollIntoView({ behavior: "smooth" }),
      };
    }
    if (needsPodCount > 0) {
      return {
        icon:        "📎",
        accent:      "amber",
        title:       `${needsPodCount} dërgesa kërkon ngarkimin e Provës së Dorëzimit`,
        subtitle:    "Ngarko dokumentin POD para se të shënosh dërgimin si dorëzuar.",
        buttonLabel: "Shiko Dërgesat",
        onButton:    () => document.getElementById("upcoming-routes")?.scrollIntoView({ behavior: "smooth" }),
      };
    }
    if (pendingRequests.length > 0) {
      return {
        icon:        "📬",
        accent:      "amber",
        title:       `${pendingRequests.length} kërkesë pret përgjigjen tuaj`,
        subtitle:    "Bizneset kanë kërkuar transport — prano ose refuzo.",
        buttonLabel: "Shiko Kërkesat",
        onButton:    () => document.getElementById("pending-requests")?.scrollIntoView({ behavior: "smooth" }),
      };
    }
    const nextRoute = upcomingRoutes[0];
    if (nextRoute) {
      const days = daysUntil(nextRoute.departure_date);
      return {
        icon:        "📅",
        accent:      "blue",
        title:       days === 0
          ? "Rruga tjetër niset sot!"
          : days === 1
          ? "Rruga tjetër niset nesër"
          : `Rruga tjetër niset pas ${days} ditësh`,
        subtitle:    `${locationLabel(nextRoute.origin)} → ${locationLabel(nextRoute.destination)} · ${formatDate(nextRoute.departure_date)}`,
        buttonLabel: "Shiko Rrugët",
        onButton:    () => document.getElementById("upcoming-routes")?.scrollIntoView({ behavior: "smooth" }),
      };
    }
    return {
      icon:    "✅",
      accent:  "zinc",
      title:   "Gjithçka në rregull!",
      subtitle: "Nuk keni asnjë detyrë urgjente. Shto rrugën tënde të ardhshme.",
      buttonLabel: "Shto Rrugë",
      onButton:    () => setIsAddModalOpen(true),
    };
  }, [activeRoute, pendingRequests, upcomingRoutes, needsPodCount, requestsByRoute, shipmentByRequestId]);

  // ── Shipment detail block (reused inside routes) ──────────────────────────

  const renderShipmentBlock = (request: Request, route: Route) => {
    const shipment = shipmentByRequestId[request.id];
    const routeLabel = `${locationLabel(route.origin)} → ${locationLabel(route.destination)}`;

    if (!shipment) {
      return (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <SvgIcon d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" cls="h-3.5 w-3.5 shrink-0" />
          Duke pritur që biznesi të plotësojë detajet e dërgesës…
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-zinc-200 bg-white text-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
          <div className="flex items-center gap-2 font-medium text-zinc-700">
            <SvgIcon d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" cls="h-3.5 w-3.5 text-zinc-400" />
            Dërgesa
          </div>
          <div className="flex items-center gap-1.5">
            {shipment.is_locked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                <SvgIcon d="M12 15v2m0 0v2m0-2h2m-2 0H10m6-8V7a4 4 0 10-8 0v2M5 21h14a2 2 0 002-2v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2z" cls="h-3 w-3" />
                Bllokuar
              </span>
            )}
            <StatusBadge variant={shipment.shipment_status as never} />
          </div>
        </div>

        {/* Mini progress */}
        <div className="px-3 pt-2.5 pb-1">
          <ShipmentMini shipment={shipment} />
        </div>

        {/* Details grid */}
        <div className="grid gap-x-4 gap-y-1 px-3 py-2 text-zinc-600 sm:grid-cols-2">
          <p><span className="text-zinc-400">Kontakti: </span><span className="font-medium">{shipment.contact_name}</span></p>
          <p><span className="text-zinc-400">Tel: </span><span className="font-medium">{shipment.contact_phone}</span></p>
          <p className="sm:col-span-2"><span className="text-zinc-400">Adresa: </span><span className="font-medium">{shipment.pickup_address}</span></p>
          {shipment.weight_kg && <p><span className="text-zinc-400">Pesha: </span><span className="font-medium">{shipment.weight_kg} kg</span></p>}
          {shipment.notes && <p className="sm:col-span-2"><span className="text-zinc-400">Shënime: </span>{shipment.notes}</p>}
        </div>

        {/* Status advance buttons */}
        {shipment.shipment_status !== "dorëzuar" && (
          <div className="border-t border-zinc-100 px-3 py-2.5 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-zinc-400">Shëno:</span>
              {SHIPMENT_STATUS_STEPS.filter((s) => s.key !== "detajet_plotësuara").map((step) => {
                const ci   = SHIPMENT_STATUS_STEPS.findIndex((s) => s.key === shipment.shipment_status);
                const si   = SHIPMENT_STATUS_STEPS.findIndex((s) => s.key === step.key);
                if (si !== ci + 1) return null;
                if (step.key === "dorëzuar" && !podShipmentIds.has(shipment.id)) return null;
                return (
                  <button
                    key={step.key}
                    type="button"
                    onClick={() => handleShipmentStatusChange(shipment.id, step.key)}
                    className="rounded-lg bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700"
                  >
                    {step.label} →
                  </button>
                );
              })}
            </div>

            {/* POD required warning */}
            {(() => {
              const ci   = SHIPMENT_STATUS_STEPS.findIndex((s) => s.key === shipment.shipment_status);
              const next = SHIPMENT_STATUS_STEPS[ci + 1];
              if (next?.key !== "dorëzuar" || podShipmentIds.has(shipment.id)) return null;
              return (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <SvgIcon d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" cls="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                  <span>
                    <strong>Kërkohet POD — </strong>
                    Ngarko <em>Provën e Dorëzimit</em> tek dokumentet para se të shënosh si "Dorëzuar".
                  </span>
                </div>
              );
            })()}
          </div>
        )}

        {/* Waiting for business confirmation */}
        {shipment.shipment_status === "dorëzuar" && !shipment.delivery_confirmed && (
          <div className="flex items-center gap-2 border-t border-zinc-100 px-3 py-2.5">
            <div className="flex-1 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
              <SvgIcon d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" cls="h-3.5 w-3.5 shrink-0 animate-pulse text-blue-500" />
              Duke pritur konfirmimin e pranimit nga biznesi…
            </div>
            {!myReviews.some((r) => r.request_id === request.id) && (
              <button
                type="button"
                onClick={() => setReviewTarget({ request, businessId: request.business_id, routeLabel })}
                className="shrink-0 rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-amber-400"
              >
                Vlerëso ★
              </button>
            )}
          </div>
        )}

        {/* Delivery confirmed */}
        {shipment.shipment_status === "dorëzuar" && shipment.delivery_confirmed && (
          <div className="flex items-center justify-between border-t border-zinc-100 px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
              <SvgIcon d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" cls="h-4 w-4" />
              Konfirmuar nga biznesi
              {shipment.delivery_confirmed_at && (
                <span className="font-normal text-emerald-600 ml-1">
                  · {new Date(shipment.delivery_confirmed_at).toLocaleDateString("sq-AL")}
                </span>
              )}
            </span>
            {!myReviews.some((r) => r.request_id === request.id) && (
              <button
                type="button"
                onClick={() => setReviewTarget({ request, businessId: request.business_id, routeLabel })}
                className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-amber-400"
              >
                Vlerëso ★
              </button>
            )}
          </div>
        )}

        {/* Documents — pre-select "Provë e Dorëzimit" when POD is the next required step */}
        <div className="border-t border-zinc-100 px-3 py-3">
          {(() => {
            const ci   = SHIPMENT_STATUS_STEPS.findIndex((s) => s.key === shipment.shipment_status);
            const next = SHIPMENT_STATUS_STEPS[ci + 1];
            const podNeeded = next?.key === "dorëzuar" && !podShipmentIds.has(shipment.id);
            return (
              <DocumentSection
                shipmentId={shipment.id}
                uploaderId={userId}
                isLocked={!!shipment.is_locked}
                defaultDocType={podNeeded ? "prove_dorezimi" : undefined}
                onUploadSuccess={() => refetchPodForShipment(shipment.id)}
              />
            );
          })()}
        </div>
      </div>
    );
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-5xl space-y-5">

      {/* ── Greeting bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">
            {companyName || "Transportues"}
          </h1>
          <p className="text-sm text-zinc-400">Paneli operacional</p>
        </div>
        <div className="flex gap-2">
          {/* Export dropdown */}
          <div className="relative group">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              <SvgIcon d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" cls="h-4 w-4" />
              Eksporto
            </button>
            <div className="absolute right-0 top-full z-10 mt-1 hidden min-w-[140px] rounded-xl border border-zinc-200 bg-white py-1 shadow-lg group-hover:block">
              <button
                type="button"
                onClick={() => {
                  const h = ["Origjina", "Destinacioni", "Data e nisjes", "Kapaciteti (kg)", "Statusi"];
                  const r = routes.map((r) => [locationLabel(r.origin), locationLabel(r.destination), r.departure_date, r.available_capacity, r.status]);
                  downloadCSV(h, r, "rruget");
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              >CSV</button>
              <button
                type="button"
                onClick={() => {
                  const h = ["Origjina", "Destinacioni", "Data e nisjes", "Kapaciteti (kg)", "Statusi"];
                  const r = routes.map((r) => [locationLabel(r.origin), locationLabel(r.destination), r.departure_date, r.available_capacity, r.status]);
                  printTable("Rrugët e Mia", h, r, `Total: ${routes.length} rrugë`);
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              >PDF / Print</button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            <SvgIcon d="M12 4v16m8-8H4" cls="h-4 w-4" />
            Shto Rrugë
          </button>
        </div>
      </div>

      {/* ── Today's Focus ─────────────────────────────────────────────────── */}
      {!loadingRoutes && (
        <TodaysFocusCard {...todaysFocus} />
      )}

      {/* ── Active Route (in transit) ──────────────────────────────────────── */}
      {(loadingRoutes || activeRoute) && (
        <section id="active-route">
          <Section
            label="Rruga Aktive"
            accent="emerald"
            loading={loadingRoutes}
          >
            {activeRoute && (() => {
              const routeReqs = requestsByRoute[activeRoute.id] ?? [];
              const accepted  = routeReqs.filter((r) => r.status === "accepted");
              const days      = daysUntil(activeRoute.departure_date);

              return (
                <div className="space-y-4">
                  {/* Route hero card */}
                  <div className="flex flex-col gap-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-bold text-emerald-900">
                          {locationLabel(activeRoute.origin)} → {locationLabel(activeRoute.destination)}
                        </p>
                        {corridorLabel(corridors, activeRoute.corridor_id) && (
                          <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            {corridorLabel(corridors, activeRoute.corridor_id)}
                          </span>
                        )}
                        <p className="mt-1 text-sm text-emerald-700">
                          Nisja: <strong>{formatDate(activeRoute.departure_date)}</strong>
                          {days === 0 && <span className="ml-2 font-semibold text-emerald-600">(Sot!)</span>}
                          {days === 1 && <span className="ml-2 text-emerald-600">(Nesër)</span>}
                        </p>
                        <p className="mt-0.5 text-xs text-emerald-600">
                          {accepted.length} dërgesa · {activeRoute.available_capacity} kg kapacitet
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-200 px-3 py-1 text-xs font-bold text-emerald-800 uppercase tracking-wide">
                        Në Transit
                      </span>
                    </div>

                    {/* GPS Tracking - PROMINENT */}
                    <div className="rounded-xl border border-emerald-200 bg-white p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        </span>
                        <p className="text-xs font-semibold text-zinc-700">GPS Live Tracking</p>
                      </div>
                      <TrackingActivator routeId={activeRoute.id} transporterId={userId} />
                    </div>

                    {/* Status dropdown */}
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-emerald-700 font-medium">Ndrysho statusin e rrugës:</p>
                      <select
                        value={activeRoute.status}
                        onChange={(e) => handleStatusChange(activeRoute.id, e.target.value as RouteStatus)}
                        className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-xs focus:outline-none"
                      >
                        <option value="available">I lirë</option>
                        <option value="in_transit">Në transit</option>
                        <option value="completed">Kompletuar</option>
                      </select>
                    </div>
                  </div>

                  {/* Shipments on this route */}
                  {accepted.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                        Dërgesat ({accepted.length})
                      </p>
                      {accepted.map((req) => (
                        <div key={req.id}>{renderShipmentBlock(req, activeRoute)}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </Section>
        </section>
      )}

      {/* ── Pending Requests ──────────────────────────────────────────────── */}
      <section id="pending-requests">
        <Section
          label="Kërkesat Hyrëse"
          accent="amber"
          count={pendingRequests.length}
          loading={loadingRequests}
          empty={
            <EmptyState
              title="Asnjë kërkesë hyrëse"
              description="Kur bizneset kërkojnë transport për rrugët tuaja, do të shfaqen këtu."
            />
          }
        >
          {pendingRequests.length > 0 && (
            <div className="space-y-3">
              {pendingRequests.map((req) => {
                const route = routes.find((r) => r.id === req.route_id);
                return (
                  <div
                    key={req.id}
                    className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-900">
                          {route
                            ? `${locationLabel(route.origin)} → ${locationLabel(route.destination)}`
                            : "—"}
                        </p>
                        {route && (
                          <p className="mt-0.5 text-xs text-zinc-500">
                            Nisja: {formatDate(route.departure_date)}
                            {" · "}Kapaciteti: {route.available_capacity} kg
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        Pret
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={updatingRequestId === req.id}
                        onClick={() => confirmRequestAction(req, "accepted")}
                        className="flex-1 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                      >
                        ✓ Prano
                      </button>
                      <button
                        type="button"
                        disabled={updatingRequestId === req.id}
                        onClick={() => confirmRequestAction(req, "rejected")}
                        className="flex-1 rounded-lg border border-red-200 bg-red-50 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                      >
                        ✕ Refuzo
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Accepted requests on available routes (not in transit) */}
          {acceptedRequests
            .filter((req) => {
              const route = routes.find((r) => r.id === req.route_id);
              return route && route.status !== "in_transit";
            })
            .length > 0 && (
            <div className="mt-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Pranuar — duke pritur nisjen
              </p>
              {acceptedRequests
                .filter((req) => {
                  const route = routes.find((r) => r.id === req.route_id);
                  return route && route.status !== "in_transit";
                })
                .map((req) => {
                  const route = routes.find((r) => r.id === req.route_id);
                  if (!route) return null;
                  return (
                    <div key={req.id} className="rounded-xl border border-zinc-200 p-3">
                      <p className="text-xs font-medium text-zinc-700 mb-2">
                        {locationLabel(route.origin)} → {locationLabel(route.destination)}
                        <span className="ml-2 text-zinc-400">· {formatDate(route.departure_date)}</span>
                      </p>
                      {renderShipmentBlock(req, route)}
                    </div>
                  );
                })}
            </div>
          )}
        </Section>
      </section>

      {/* ── Upcoming Routes ───────────────────────────────────────────────── */}
      <section id="upcoming-routes">
        <Section
          label="Rrugët e Ardhshme"
          accent="blue"
          count={upcomingRoutes.length}
          loading={loadingRoutes}
          action={
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
            >
              <SvgIcon d="M12 4v16m8-8H4" cls="h-3.5 w-3.5" />
              Shto
            </button>
          }
          empty={
            <EmptyState
              title="Asnjë rrugë e ardhshme"
              description="Shto rrugën tënde të parë për ta bërë kapacitetin tënd të dukshëm për bizneset."
              action={
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                >
                  Shto rrugën e parë
                </button>
              }
            />
          }
        >
          {upcomingRoutes.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {upcomingRoutes.map((route) => {
                const routeReqs  = requestsByRoute[route.id] ?? [];
                const pending    = routeReqs.filter((r) => r.status === "pending").length;
                const accepted   = routeReqs.filter((r) => r.status === "accepted").length;
                const days       = daysUntil(route.departure_date);
                const urgency    = days <= 1 ? "border-blue-400 bg-blue-50" : "border-zinc-200 bg-zinc-50/60";

                return (
                  <div key={route.id} className={`flex flex-col gap-3 rounded-xl border-2 p-4 text-sm ${urgency}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-zinc-900">
                          {locationLabel(route.origin)} → {locationLabel(route.destination)}
                        </p>
                        {corridorLabel(corridors, route.corridor_id) && (
                          <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                            {corridorLabel(corridors, route.corridor_id)}
                          </span>
                        )}
                        <p className="mt-1 text-xs text-zinc-500">
                          {formatDate(route.departure_date)}
                          {days === 0 && <span className="ml-1 font-semibold text-blue-600">(Sot)</span>}
                          {days === 1 && <span className="ml-1 text-blue-600">(Nesër)</span>}
                          {days > 1  && <span className="ml-1 text-zinc-400">({days}d)</span>}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {pending > 0 && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                            {pending} pritës
                          </span>
                        )}
                        {accepted > 0 && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            {accepted} pranuar
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Capacity bar */}
                    <div>
                      <div className="mb-1 flex justify-between text-xs text-zinc-500">
                        <span>Kapaciteti: <strong>{route.available_capacity} kg</strong></span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
                        <div className="h-full rounded-full bg-blue-400" style={{ width: `${Math.min(100, (accepted / Math.max(1, accepted + pending)) * 100)}%` }} />
                      </div>
                    </div>

                    {/* Actions row */}
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleDuplicateRoute(route)}
                        className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                      >
                        Dupliko
                      </button>
                      <select
                        value={route.status}
                        onChange={(e) => handleStatusChange(route.id, e.target.value as RouteStatus)}
                        className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs focus:border-zinc-900 focus:outline-none"
                      >
                        <option value="available">I lirë</option>
                        <option value="in_transit">Nis transitin</option>
                        <option value="completed">Kompletuar</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </section>

      {/* ── Completed Routes (collapsible) ────────────────────────────────── */}
      {completedRoutes.length > 0 && (
        <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100">
          <div className="h-1 w-full bg-zinc-300" />
          <button
            type="button"
            onClick={() => setCompletedOpen((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <div className="flex items-center">
              <h2 className="text-sm font-semibold text-zinc-500">Rrugët e Përfunduara</h2>
              <CountBadge n={completedRoutes.length} color="bg-zinc-100 text-zinc-500" />
            </div>
            <SvgIcon
              d="M19 9l-7 7-7-7"
              cls={`h-4 w-4 text-zinc-400 transition-transform ${completedOpen ? "rotate-180" : ""}`}
            />
          </button>
          {completedOpen && (
            <div className="border-t border-zinc-50 px-5 pb-5 pt-3 grid gap-3 sm:grid-cols-2">
              {completedRoutes.map((route) => {
                const routeReqs = requestsByRoute[route.id] ?? [];
                return (
                  <div key={route.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-zinc-700">
                        {locationLabel(route.origin)} → {locationLabel(route.destination)}
                      </p>
                      <span className="shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-500">✓ Kompletuar</span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {formatDate(route.departure_date)} · {routeReqs.filter((r) => r.status === "accepted").length} dërgesa
                    </p>
                    <button
                      type="button"
                      onClick={() => handleDuplicateRoute(route)}
                      className="mt-2 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-100"
                    >
                      Dupliko rrugën
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ── Add Route Modal ────────────────────────────────────────────────── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900">Shto Rrugë të Re</h2>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100"
              >
                <SvgIcon d="M6 18L18 6M6 6l12 12" cls="h-5 w-5" />
              </button>
            </div>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleAddRoute}>
              <div className="md:col-span-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Origjina</label>
                <LocationAutocomplete locations={locations} value={originLocationId} onChange={setOriginLocationId} placeholder="Kërko qytetin e origjinës..." required />
              </div>
              <div className="md:col-span-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Destinacioni</label>
                <LocationAutocomplete locations={locations} value={destinationLocationId} onChange={setDestinationLocationId} placeholder="Kërko qytetin e destinacionit..." required />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Korridori (opsional)</label>
                <select value={corridorId} onChange={(e) => setCorridorId(e.target.value)} className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none">
                  <option value="">Pa koridor</option>
                  {corridors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Data e Nisjes</label>
                <input type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} required className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Kapaciteti (kg)</label>
                <input type="number" min={0} value={availableCapacity} onChange={(e) => setAvailableCapacity(Number(e.target.value))} required className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none" />
              </div>
              {error && <p className="md:col-span-2 text-sm text-red-600">{error}</p>}
              <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="rounded-xl border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
                  Anulo
                </button>
                <button type="submit" disabled={formLoading} className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60">
                  {formLoading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-500 border-t-white" />}
                  {formLoading ? "Duke ruajtur…" : "Ruaj rrugën"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Review modal ──────────────────────────────────────────────────── */}
      {reviewTarget && (
        <ReviewModal
          revieweeName="Biznes"
          revieweeRole="business"
          routeLabel={reviewTarget.routeLabel}
          onSubmit={handleSubmitReview}
          onClose={() => setReviewTarget(null)}
        />
      )}

      {/* ── Confirm accept / reject modal ─────────────────────────────────── */}
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
