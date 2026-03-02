"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Route } from "@/types/route";
import type { Location } from "@/types/location";
import type { Corridor } from "@/types/corridor";
import type { Request } from "@/types/request";
import type { User } from "@/types/user";
import type { ShipmentDetails, ShipmentStatus } from "@/types/shipment";
import type { Review } from "@/types/review";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { RouteCardSkeleton } from "@/components/Skeleton";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { StarDisplay } from "@/components/StarRating";
import { requestTransport } from "@/lib/requestTransport";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { ShipmentFormModal } from "@/components/ShipmentFormModal";
import { ReviewModal } from "@/components/ReviewModal";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 12;

const SHIPMENT_STATUS_ORDER: ShipmentStatus[] = [
  "detajet_plotësuara",
  "ngarkuar",
  "në_transit",
  "dorëzuar",
];

const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  detajet_plotësuara: "Detajet plotësuar",
  ngarkuar:           "Ngarkuar",
  në_transit:         "Në transit",
  dorëzuar:           "Dorëzuar",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function locationLabel(loc?: Location | null): string {
  return loc ? `${loc.city}, ${loc.country}` : "—";
}

function corridorLabel(corridors: Corridor[], cid?: string | null): string | null {
  if (!cid) return null;
  return corridors.find((c) => c.id === cid)?.name ?? null;
}

// ─── Mini progress bar ────────────────────────────────────────────────────────

function MiniProgress({ status }: { status: ShipmentStatus }) {
  const idx = SHIPMENT_STATUS_ORDER.indexOf(status);
  return (
    <div className="flex items-center gap-1.5 mt-2">
      {SHIPMENT_STATUS_ORDER.map((_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-colors ${
            i <= idx ? "bg-emerald-500" : "bg-zinc-200"
          }`}
        />
      ))}
      <span className="ml-1 shrink-0 text-xs font-medium text-zinc-500">
        {SHIPMENT_STATUS_LABELS[status]}
      </span>
    </div>
  );
}

// ─── "Next Action Required" card ─────────────────────────────────────────────

interface ActionCardProps {
  emoji: string;
  routeLabel: string;
  statusLine: string;
  actionLine: string;
  buttonLabel: string;
  loading?: boolean;
  variant: "amber" | "blue";
  onAction: () => void;
}

function ActionCard({
  emoji,
  routeLabel,
  statusLine,
  actionLine,
  buttonLabel,
  loading,
  variant,
  onAction,
}: ActionCardProps) {
  const c =
    variant === "amber"
      ? { wrap: "bg-amber-50 border-amber-200", title: "text-amber-900", sub: "text-amber-700", btn: "bg-amber-500 hover:bg-amber-600" }
      : { wrap: "bg-blue-50 border-blue-200",   title: "text-blue-900",  sub: "text-blue-700",  btn: "bg-blue-600 hover:bg-blue-700" };

  return (
    <div className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3.5 ${c.wrap}`}>
      <div className="min-w-0">
        <p className={`flex items-center gap-2 text-sm font-semibold ${c.title}`}>
          <span>{emoji}</span>
          <span className="truncate">{routeLabel}</span>
        </p>
        <p className={`mt-0.5 text-xs ${c.sub}`}>{statusLine}</p>
        <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${c.title}`}>
          <span>👉</span>
          {actionLine}
        </p>
      </div>
      <button
        type="button"
        disabled={loading}
        onClick={onAction}
        className={`shrink-0 rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-60 ${c.btn}`}
      >
        {loading ? "Duke procesuar…" : buttonLabel}
      </button>
    </div>
  );
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className={`rounded-xl px-4 py-2.5 text-center shadow-sm ring-1 ${color}`}>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs font-medium opacity-70">{label}</p>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  title,
  count,
  badge,
  right,
}: {
  title: string;
  count?: number;
  badge?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        {count !== undefined && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
            {count}
          </span>
        )}
        {badge}
      </div>
      {right}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function BusinessDashboardPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userId, setUserId]             = useState("");
  const [companyName, setCompanyName]   = useState("");

  // ── Search route ────────────────────────────────────────────────────────────
  const [locations, setLocations]   = useState<Location[]>([]);
  const [corridors, setCorridors]   = useState<Corridor[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [originId, setOriginId]             = useState("");
  const [destinationId, setDestinationId]   = useState("");
  const [corridorId, setCorridorId]         = useState("");
  const [departureDate, setDepartureDate]   = useState("");
  const [minRating, setMinRating]           = useState(0);
  const [routes, setRoutes]             = useState<Route[]>([]);
  const [totalCount, setTotalCount]     = useState(0);
  const [page, setPage]                 = useState(0);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [loadingMore, setLoadingMore]   = useState(false);
  const [routeError, setRouteError]     = useState<string | null>(null);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [reviewsByTransporter, setReviewsByTransporter] = useState<Record<string, Review[]>>({});
  const [verifiedTransporters, setVerifiedTransporters] = useState<Set<string>>(new Set());
  const [hasSearched, setHasSearched] = useState(false);

  const filtersRef = useRef({ originId, destinationId, corridorId, departureDate });
  useEffect(() => {
    filtersRef.current = { originId, destinationId, corridorId, departureDate };
  }, [originId, destinationId, corridorId, departureDate]);

  // ── My requests / shipments ──────────────────────────────────────────────────
  const [myRequests, setMyRequests]     = useState<Request[]>([]);
  const [myRouteMap, setMyRouteMap]     = useState<Record<string, Route>>({});
  const [transporterMap, setTransporterMap] = useState<Record<string, User>>({});
  const [shipmentMap, setShipmentMap]   = useState<Record<string, ShipmentDetails>>({});
  const [myReviews, setMyReviews]       = useState<Review[]>([]);
  const [loadingMine, setLoadingMine]   = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // ── Modals ───────────────────────────────────────────────────────────────────
  const [shipmentTarget, setShipmentTarget] = useState<{ request: Request; routeLabel: string } | null>(null);
  const [reviewTarget, setReviewTarget]     = useState<{
    request: Request;
    transporterId: string;
    transporterName: string;
    routeLabel: string;
  } | null>(null);

  // ── UI ───────────────────────────────────────────────────────────────────────
  const [deliveredOpen, setDeliveredOpen] = useState(false);

  // ── Init ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/auth/login"); return; }
      setUserId(data.session.user.id);
      setCheckingAuth(false);
      await Promise.all([
        fetchLocations(),
        fetchCorridors(),
        fetchMyData(data.session.user.id),
        fetchMyReviews(data.session.user.id),
      ]);
    };
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const fetchLocations = async () => {
    const { data } = await supabase.from("locations").select("*").order("country").order("city");
    setLocations((data ?? []) as Location[]);
  };

  const fetchCorridors = async () => {
    const { data } = await supabase.from("corridors").select("*").eq("is_active", true).order("name");
    setCorridors((data ?? []) as Corridor[]);
  };

  const fetchMyData = async (uid: string) => {
    setLoadingMine(true);

    const { data: uRow } = await supabase.from("users").select("company_name").eq("id", uid).single();
    if (uRow?.company_name) setCompanyName(uRow.company_name);

    const { data: reqData } = await supabase
      .from("requests")
      .select("*")
      .eq("business_id", uid)
      .order("created_at", { ascending: false });

    const reqs = (reqData ?? []) as Request[];
    setMyRequests(reqs);

    if (reqs.length === 0) { setLoadingMine(false); return; }

    const reqIds   = reqs.map((r) => r.id);
    const routeIds = [...new Set(reqs.map((r) => r.route_id))];

    const [routeRes, shipRes] = await Promise.all([
      supabase
        .from("routes")
        .select("*, origin:locations!origin_location_id(*), destination:locations!destination_location_id(*)")
        .in("id", routeIds),
      supabase.from("shipment_details").select("*").in("request_id", reqIds),
    ]);

    const routeMap: Record<string, Route> = {};
    for (const r of (routeRes.data ?? []) as Route[]) routeMap[r.id] = r;
    setMyRouteMap(routeMap);

    const shipMap: Record<string, ShipmentDetails> = {};
    for (const s of (shipRes.data ?? []) as ShipmentDetails[]) shipMap[s.request_id] = s;
    setShipmentMap(shipMap);

    const tIds = [...new Set((routeRes.data ?? [] as Route[]).map((r: Route) => r.transporter_id))];
    if (tIds.length > 0) {
      const { data: tData } = await supabase.from("users").select("id, company_name, role").in("id", tIds);
      const tMap: Record<string, User> = {};
      for (const t of (tData ?? []) as User[]) tMap[t.id] = t;
      setTransporterMap(tMap);
    }

    setLoadingMine(false);
  };

  const fetchMyReviews = async (uid: string) => {
    const { data } = await supabase.from("reviews").select("*").eq("reviewer_id", uid);
    setMyReviews((data ?? []) as Review[]);
  };

  const fetchRoutes = async (pageIndex: number, replace: boolean) => {
    replace ? setLoadingRoutes(true) : setLoadingMore(true);
    setRouteError(null);
    setHasSearched(true);

    const { originId, destinationId, corridorId, departureDate } = filtersRef.current;
    const from = pageIndex * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;

    let q = supabase
      .from("routes")
      .select("*, origin:locations!origin_location_id(*), destination:locations!destination_location_id(*)", { count: "exact" })
      .eq("status", "available")
      .order("departure_date", { ascending: true })
      .range(from, to);

    if (corridorId)     q = q.eq("corridor_id", corridorId);
    if (originId)       q = q.eq("origin_location_id", originId);
    if (destinationId)  q = q.eq("destination_location_id", destinationId);
    if (departureDate)  q = q.eq("departure_date", departureDate);

    const { data, error, count } = await q;
    if (error) {
      setRouteError(error.message);
    } else {
      const fetched    = (data ?? []) as Route[];
      const newRoutes  = replace ? fetched : [...routes, ...fetched];
      setRoutes(newRoutes);
      setTotalCount(count ?? 0);
      setPage(pageIndex);

      const tIds = [...new Set(newRoutes.map((r) => r.transporter_id))];
      if (tIds.length > 0) {
        const [revRes, userRes] = await Promise.all([
          supabase.from("reviews").select("*").in("reviewee_id", tIds),
          supabase.from("users").select("id, is_verified").in("id", tIds),
        ]);
        const grouped: Record<string, Review[]> = {};
        for (const rev of (revRes.data ?? []) as Review[]) {
          grouped[rev.reviewee_id] = [...(grouped[rev.reviewee_id] ?? []), rev];
        }
        setReviewsByTransporter((prev) => ({ ...prev, ...grouped }));
        const verSet = new Set<string>(
          ((userRes.data ?? []) as { id: string; is_verified: boolean }[])
            .filter((u) => u.is_verified)
            .map((u) => u.id),
        );
        setVerifiedTransporters((prev) => new Set([...prev, ...verSet]));
      }
    }
    replace ? setLoadingRoutes(false) : setLoadingMore(false);
  };

  const handleSearchSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await fetchRoutes(0, true);
  };

  const handleRequestTransport = async (routeId: string) => {
    setRouteError(null);
    setRequestingId(routeId);
    const { data: sd } = await supabase.auth.getSession();
    if (!sd.session) { setRequestingId(null); router.replace("/auth/login"); return; }
    const result = await requestTransport(routeId, sd.session.user.id);
    setRequestingId(null);
    if (!result.success) {
      setRouteError(result.message);
      if (["route_not_available", "no_capacity", "route_not_found"].includes(result.errorCode ?? "")) {
        setRoutes((prev) => prev.filter((r) => r.id !== routeId));
      }
    } else {
      setRequestedIds((prev) => new Set(prev).add(routeId));
    }
  };

  const handleShipmentSubmit = async (formData: {
    contact_name: string; contact_phone: string;
    pickup_address: string; notes: string; weight_kg: string;
  }) => {
    if (!shipmentTarget) return;
    const { error } = await supabase.from("shipment_details").insert({
      request_id:     shipmentTarget.request.id,
      contact_name:   formData.contact_name,
      contact_phone:  formData.contact_phone,
      pickup_address: formData.pickup_address,
      notes:          formData.notes || null,
      weight_kg:      formData.weight_kg ? Number(formData.weight_kg) : null,
    });
    if (error) throw new Error(error.message);
    setShipmentTarget(null);
    await fetchMyData(userId);
  };

  const handleConfirmDelivery = async (shipmentId: string, requestId: string) => {
    setConfirmingId(shipmentId);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("shipment_details")
      .update({ delivery_confirmed: true, delivery_confirmed_at: now })
      .eq("id", shipmentId);
    if (!error) {
      const req = myRequests.find((r) => r.id === requestId);
      if (req?.route_id) await supabase.from("routes").update({ status: "completed" }).eq("id", req.route_id);
    }
    setConfirmingId(null);
    await fetchMyData(userId);
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

  // ── Derived data ──────────────────────────────────────────────────────────────

  const reviewedRequestIds = useMemo(
    () => new Set(myReviews.map((r) => r.request_id)),
    [myReviews],
  );

  const activeRequests = useMemo(
    () =>
      myRequests.filter((req) => {
        if (req.status === "rejected") return false;
        const s = shipmentMap[req.id];
        if (!s) return true;
        return !(s.shipment_status === "dorëzuar" && s.delivery_confirmed);
      }),
    [myRequests, shipmentMap],
  );

  const deliveredRequests = useMemo(
    () =>
      myRequests.filter((req) => {
        const s = shipmentMap[req.id];
        return s?.shipment_status === "dorëzuar" && s.delivery_confirmed === true;
      }),
    [myRequests, shipmentMap],
  );

  const actionsNeeded = useMemo(() => {
    const items: Array<{
      type: "fill_details" | "confirm_delivery";
      request: Request;
      shipment?: ShipmentDetails;
      routeLabel: string;
    }> = [];
    for (const req of myRequests) {
      if (req.status !== "accepted") continue;
      const route      = myRouteMap[req.route_id];
      const routeLabel = route
        ? `${locationLabel(route.origin)} → ${locationLabel(route.destination)}`
        : "—";
      const s = shipmentMap[req.id];
      if (!s) {
        items.push({ type: "fill_details", request: req, routeLabel });
      } else if (s.shipment_status === "dorëzuar" && !s.delivery_confirmed) {
        items.push({ type: "confirm_delivery", request: req, shipment: s, routeLabel });
      }
    }
    return items;
  }, [myRequests, shipmentMap, myRouteMap]);

  const hasMore = routes.length < totalCount;

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-5xl space-y-6">

      {/* ── Welcome + stats ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">
            Mirë se vini{companyName ? `, ${companyName}` : ""}!
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Paneli juaj i logjistikës — gjithçka në një vend.
          </p>
        </div>
        <div className="flex gap-2">
          <StatPill
            value={activeRequests.length}
            label="Aktive"
            color="bg-white ring-zinc-100 text-zinc-900"
          />
          <StatPill
            value={deliveredRequests.length}
            label="Dorëzuara"
            color="bg-white ring-zinc-100 text-emerald-600"
          />
          {actionsNeeded.length > 0 && (
            <StatPill
              value={actionsNeeded.length}
              label="Veprime"
              color="bg-amber-50 ring-amber-200 text-amber-700"
            />
          )}
        </div>
      </div>

      {/* ── Actions Required ────────────────────────────────────────────────── */}
      {actionsNeeded.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
            </span>
            <h2 className="text-sm font-semibold text-zinc-900">
              Veprime të Nevojshme
            </h2>
          </div>
          {actionsNeeded.map((item) =>
            item.type === "fill_details" ? (
              <ActionCard
                key={item.request.id}
                variant="amber"
                emoji="🚛"
                routeLabel={item.routeLabel}
                statusLine={`Statusi: ${item.request.status === "accepted" ? "Pranuar" : item.request.status}`}
                actionLine="Plotëso detajet e dërgesës"
                buttonLabel="Plotëso Tani"
                onAction={() => {
                  const r = myRouteMap[item.request.route_id];
                  setShipmentTarget({
                    request:    item.request,
                    routeLabel: r
                      ? `${locationLabel(r.origin)} → ${locationLabel(r.destination)}`
                      : "—",
                  });
                }}
              />
            ) : (
              <ActionCard
                key={item.request.id}
                variant="blue"
                emoji="📦"
                routeLabel={item.routeLabel}
                statusLine="Transportuesi ka shënuar mallin si të dorëzuar"
                actionLine="Konfirmo marrjen e mallit"
                buttonLabel="Konfirmo Dorëzimin"
                loading={confirmingId === item.shipment?.id}
                onAction={() =>
                  item.shipment && handleConfirmDelivery(item.shipment.id, item.request.id)
                }
              />
            ),
          )}
        </section>
      )}

      {/* ── My Active Shipments ─────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100">
        <div className="px-5 py-4">
          <SectionHeader
            title="Dërgesat Aktive"
            count={activeRequests.length}
            right={
              <Link
                href="/dashboard/business/requests"
                className="text-xs text-zinc-400 hover:text-zinc-800 hover:underline transition-colors"
              >
                Shiko detaje të plota →
              </Link>
            }
          />
        </div>

        {loadingMine ? (
          <div className="flex justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
          </div>
        ) : activeRequests.length === 0 ? (
          <div className="px-5 pb-6">
            <EmptyState
              title="Nuk keni dërgesa aktive"
              description="Kërkoni një rrugë dhe dërgoni kërkesën tuaj të parë."
            />
          </div>
        ) : (
          <div className="divide-y divide-zinc-50">
            {activeRequests.map((req) => {
              const route      = myRouteMap[req.route_id];
              const shipment   = shipmentMap[req.id];
              const transporter = route ? transporterMap[route.transporter_id] : undefined;
              const routeLabel = route
                ? `${locationLabel(route.origin)} → ${locationLabel(route.destination)}`
                : "—";

              let statusNode: React.ReactNode;
              if (req.status === "pending") {
                statusNode = (
                  <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-zinc-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-300 animate-pulse" />
                    Duke pritur konfirmimin e transportuesit…
                  </span>
                );
              } else if (req.status === "accepted" && !shipment) {
                statusNode = (
                  <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                    ⚠ Kërkon plotësimin e detajeve
                  </span>
                );
              } else if (shipment) {
                if (shipment.shipment_status === "dorëzuar" && !shipment.delivery_confirmed) {
                  statusNode = (
                    <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-blue-600">
                      📦 Kërkon konfirmimin tuaj të dorëzimit
                    </span>
                  );
                } else {
                  statusNode = <MiniProgress status={shipment.shipment_status} />;
                }
              }

              return (
                <div key={req.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-zinc-900 truncate">{routeLabel}</p>
                      <StatusBadge variant={req.status} />
                    </div>
                    {transporter && (
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {transporter.company_name}
                        {route?.departure_date && (
                          <span className="text-zinc-400"> · Nisja: {route.departure_date}</span>
                        )}
                      </p>
                    )}
                    {statusNode}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {req.status === "accepted" && !shipment && (
                      <button
                        type="button"
                        onClick={() =>
                          setShipmentTarget({ request: req, routeLabel })
                        }
                        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                      >
                        Plotëso
                      </button>
                    )}
                    {shipment?.shipment_status === "dorëzuar" && !shipment.delivery_confirmed && (
                      <button
                        type="button"
                        disabled={confirmingId === shipment.id}
                        onClick={() => handleConfirmDelivery(shipment.id, req.id)}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        {confirmingId === shipment.id ? "…" : "Konfirmo"}
                      </button>
                    )}
                    <Link
                      href="/dashboard/business/requests"
                      className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                    >
                      Detaje
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Search Route ────────────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100">
        <div className="border-b border-zinc-50 px-5 py-4">
          <SectionHeader
            title="Kërko Rrugë"
            right={
              <span className="text-xs text-zinc-400">Gjej transportues të disponueshëm</span>
            }
          />
        </div>
        <div className="px-5 py-4">
          <form onSubmit={handleSearchSubmit} className="space-y-3">

            {/* Primary row: Origin → Destination + Search button */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-zinc-600">Origjina</label>
                <LocationAutocomplete
                  locations={locations}
                  value={originId}
                  onChange={setOriginId}
                  placeholder="Qyteti i origjinës…"
                />
              </div>
              <div className="hidden sm:flex items-center pb-1.5 text-zinc-400 text-lg font-light">→</div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-zinc-600">Destinacioni</label>
                <LocationAutocomplete
                  locations={locations}
                  value={destinationId}
                  onChange={setDestinationId}
                  placeholder="Qyteti i destinacionit…"
                />
              </div>
              <div className="sm:pb-0">
                <button
                  type="submit"
                  disabled={loadingRoutes}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                >
                  {loadingRoutes ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-500 border-t-white" />
                      Duke kërkuar…
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
                      </svg>
                      Kërko
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Advanced toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              <svg
                className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
              {showAdvanced ? "Fshih filtrat e avancuara" : "Filtrat e avancuara"}
            </button>

            {/* Advanced filters */}
            {showAdvanced && (
              <div className="grid gap-3 rounded-xl bg-zinc-50 p-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Korridori</label>
                  <select
                    value={corridorId}
                    onChange={(e) => setCorridorId(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
                  >
                    <option value="">Të gjitha korridoret</option>
                    {corridors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Data e nisjes</label>
                  <input
                    type="date"
                    value={departureDate}
                    onChange={(e) => setDepartureDate(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Vlerësim minimal</label>
                  <select
                    value={minRating}
                    onChange={(e) => setMinRating(Number(e.target.value))}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
                  >
                    <option value={0}>Të gjitha</option>
                    <option value={3}>3+ yje</option>
                    <option value={4}>4+ yje</option>
                    <option value={5}>5 yje</option>
                  </select>
                </div>
              </div>
            )}

            {routeError && <p className="text-sm text-red-600" role="alert">{routeError}</p>}
          </form>
        </div>

        {/* Route results */}
        {hasSearched && (
          <div className="border-t border-zinc-100 px-5 pb-5">
            <div className="flex items-center justify-between py-4">
              <p className="text-sm font-medium text-zinc-700">
                {loadingRoutes
                  ? "Duke kërkuar…"
                  : `${totalCount} rrugë u gjetën`}
              </p>
              {!loadingRoutes && totalCount > 0 && (
                <p className="text-xs text-zinc-400">
                  Duke shfaqur {routes.length} nga {totalCount}
                </p>
              )}
            </div>

            {loadingRoutes ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => <RouteCardSkeleton key={i} />)}
              </div>
            ) : routes.length === 0 ? (
              <EmptyState
                title="Asnjë rrugë nuk u gjet"
                description="Provo të ndryshosh origjinën, destinacionin ose datën e nisjes."
              />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  {routes
                    .filter((r) => {
                      if (minRating === 0) return true;
                      const revs = reviewsByTransporter[r.transporter_id] ?? [];
                      if (!revs.length) return false;
                      return revs.reduce((s, v) => s + v.rating, 0) / revs.length >= minRating;
                    })
                    .map((route) => {
                      const already    = requestedIds.has(route.id);
                      const revs       = reviewsByTransporter[route.transporter_id] ?? [];
                      const avgRating  = revs.length
                        ? revs.reduce((s, v) => s + v.rating, 0) / revs.length
                        : 0;
                      const cLabel = corridorLabel(corridors, route.corridor_id);

                      return (
                        <div
                          key={route.id}
                          className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 text-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-zinc-900">
                                {locationLabel(route.origin)} → {locationLabel(route.destination)}
                              </p>
                              {cLabel && (
                                <span className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                                  {cLabel}
                                </span>
                              )}
                              {revs.length > 0 && (
                                <div className="mt-1">
                                  <StarDisplay rating={avgRating} count={revs.length} />
                                </div>
                              )}
                              {verifiedTransporters.has(route.transporter_id) && (
                                <div className="mt-1.5">
                                  <VerifiedBadge size="sm" />
                                </div>
                              )}
                              <p className="mt-1.5 text-xs text-zinc-500">
                                Nisja:{" "}
                                <span className="font-medium text-zinc-700">{route.departure_date}</span>
                              </p>
                            </div>
                            <StatusBadge variant={route.status} />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-zinc-600">
                              Kapaciteti:{" "}
                              <span className="font-medium">{route.available_capacity} kg</span>
                            </p>
                            {already ? (
                              <span className="rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                                Kërkesa u dërgua ✓
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleRequestTransport(route.id)}
                                disabled={requestingId === route.id}
                                className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                              >
                                {requestingId === route.id ? "Duke dërguar…" : "Kërko Transport"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>

                {hasMore && (
                  <div className="mt-5 flex justify-center">
                    <button
                      type="button"
                      onClick={() => fetchRoutes(page + 1, false)}
                      disabled={loadingMore}
                      className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                    >
                      {loadingMore ? (
                        <>
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-zinc-900" />
                          Duke ngarkuar…
                        </>
                      ) : (
                        `Ngarko më shumë (${totalCount - routes.length} mbetur)`
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </section>

      {/* ── My Delivered Shipments ───────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100">
        <button
          type="button"
          onClick={() => setDeliveredOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-900">Dërgesat e Dorëzuara</h2>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
              {deliveredRequests.length}
            </span>
          </div>
          <svg
            className={`h-4 w-4 text-zinc-400 transition-transform ${deliveredOpen ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {deliveredOpen && (
          <div className="border-t border-zinc-50 px-5 pb-5 pt-3">
            {deliveredRequests.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-400">
                Nuk keni dërgesa të dorëzuara ende.
              </p>
            ) : (
              <div className="space-y-2">
                {deliveredRequests.map((req) => {
                  const route       = myRouteMap[req.route_id];
                  const shipment    = shipmentMap[req.id];
                  const transporter = route ? transporterMap[route.transporter_id] : undefined;
                  const routeLabel  = route
                    ? `${locationLabel(route.origin)} → ${locationLabel(route.destination)}`
                    : "—";
                  const reviewed = reviewedRequestIds.has(req.id);

                  return (
                    <div
                      key={req.id}
                      className="flex items-center justify-between gap-4 rounded-xl bg-emerald-50/50 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-500 text-sm">✓</span>
                          <p className="text-sm font-medium text-zinc-900 truncate">{routeLabel}</p>
                        </div>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {transporter?.company_name && (
                            <>
                              <span className="font-medium">{transporter.company_name}</span>
                            </>
                          )}
                          {shipment?.delivery_confirmed_at && (
                            <span className="ml-1 text-zinc-400">
                              · {new Date(shipment.delivery_confirmed_at).toLocaleDateString("sq-AL")}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {!reviewed && route && transporter ? (
                          <button
                            type="button"
                            onClick={() =>
                              setReviewTarget({
                                request:          req,
                                transporterId:    route.transporter_id,
                                transporterName:  transporter.company_name ?? "—",
                                routeLabel,
                              })
                            }
                            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                          >
                            Vlerëso ★
                          </button>
                        ) : reviewed ? (
                          <span className="rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-700">
                            Vlerësuar ✓
                          </span>
                        ) : null}
                        <Link
                          href="/dashboard/business/requests"
                          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                        >
                          Detaje
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {shipmentTarget && (
        <ShipmentFormModal
          routeLabel={shipmentTarget.routeLabel}
          onClose={() => setShipmentTarget(null)}
          onSubmit={handleShipmentSubmit}
        />
      )}
      {reviewTarget && (
        <ReviewModal
          revieweeName={reviewTarget.transporterName}
          revieweeRole="transporter"
          routeLabel={reviewTarget.routeLabel}
          onClose={() => setReviewTarget(null)}
          onSubmit={handleSubmitReview}
        />
      )}
    </div>
  );
}
