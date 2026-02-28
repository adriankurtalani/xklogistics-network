"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Route } from "@/types/route";
import type { Location } from "@/types/location";
import type { Corridor } from "@/types/corridor";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { RouteCardSkeleton } from "@/components/Skeleton";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import type { Review } from "@/types/review";
import { StarDisplay } from "@/components/StarRating";

const PAGE_SIZE = 12;

function locationLabel(loc?: Location | null): string {
  if (!loc) return "—";
  return `${loc.city}, ${loc.country}`;
}

function corridorLabel(corridors: Corridor[], corridorId?: string | null): string | null {
  if (!corridorId) return null;
  return corridors.find((c) => c.id === corridorId)?.name ?? null;
}

export default function BusinessDashboardPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [locations, setLocations] = useState<Location[]>([]);
  const [corridors, setCorridors] = useState<Corridor[]>([]);

  // Filter state
  const [originLocationId, setOriginLocationId] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [corridorId, setCorridorId] = useState("");
  const [departureDate, setDepartureDate] = useState("");

  // Results state
  const [routes, setRoutes] = useState<Route[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [minRating, setMinRating]       = useState(0);
  const [reviewsByTransporter, setReviewsByTransporter] = useState<Record<string, Review[]>>({});

  // Keep latest filter values accessible inside async functions
  const filtersRef = useRef({ originLocationId, destinationLocationId, corridorId, departureDate });
  useEffect(() => {
    filtersRef.current = { originLocationId, destinationLocationId, corridorId, departureDate };
  }, [originLocationId, destinationLocationId, corridorId, departureDate]);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/auth/login"); return; }
      setCheckingAuth(false);
      await Promise.all([fetchLocations(), fetchCorridors()]);
      await fetchRoutes(0, true);
    };
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const fetchLocations = async () => {
    const { data } = await supabase
      .from("locations")
      .select("*")
      .order("country", { ascending: true })
      .order("city", { ascending: true });
    setLocations((data ?? []) as Location[]);
  };

  const fetchCorridors = async () => {
    const { data } = await supabase
      .from("corridors")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });
    setCorridors((data ?? []) as Corridor[]);
  };

  const fetchRoutes = async (pageIndex: number, replace: boolean) => {
    replace ? setLoading(true) : setLoadingMore(true);
    setError(null);

    const { originLocationId, destinationLocationId, corridorId, departureDate } = filtersRef.current;
    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("routes")
      .select(
        "*, origin:locations!origin_location_id(*), destination:locations!destination_location_id(*)",
        { count: "exact" }
      )
      .eq("status", "available")
      .order("departure_date", { ascending: true })
      .range(from, to);

    if (corridorId)           query = query.eq("corridor_id", corridorId);
    if (originLocationId)     query = query.eq("origin_location_id", originLocationId);
    if (destinationLocationId) query = query.eq("destination_location_id", destinationLocationId);
    if (departureDate)        query = query.eq("departure_date", departureDate);

    const { data, error: routesError, count } = await query;

    if (routesError) {
      setError(routesError.message);
    } else {
      const fetched = (data ?? []) as Route[];
      const newRoutes = replace ? fetched : [...routes, ...fetched];
      setRoutes(newRoutes);
      setTotalCount(count ?? 0);
      setPage(pageIndex);

      // Fetch reviews for all transporters in the result set
      const transporterIds = [...new Set(newRoutes.map((r) => r.transporter_id))];
      if (transporterIds.length > 0) {
        const { data: revData } = await supabase
          .from("reviews")
          .select("*")
          .in("reviewee_id", transporterIds);
        const grouped: Record<string, Review[]> = {};
        for (const rev of (revData ?? []) as Review[]) {
          grouped[rev.reviewee_id] = [...(grouped[rev.reviewee_id] ?? []), rev];
        }
        setReviewsByTransporter((prev) => ({ ...prev, ...grouped }));
      }
    }

    replace ? setLoading(false) : setLoadingMore(false);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await fetchRoutes(0, true);
  };

  const handleLoadMore = async () => {
    await fetchRoutes(page + 1, false);
  };

  const handleRequestTransport = async (routeId: string) => {
    setError(null);
    setRequestingId(routeId);

    const { data } = await supabase.auth.getSession();
    if (!data.session) { setRequestingId(null); router.replace("/auth/login"); return; }

    const { error: insertError } = await supabase.from("requests").insert({
      route_id: routeId,
      business_id: data.session.user.id,
      status: "pending",
    });

    setRequestingId(null);

    if (insertError) {
      setError(insertError.message);
    } else {
      setRequestedIds((prev) => new Set(prev).add(routeId));
    }
  };

  const hasMore = routes.length < totalCount;

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
          title="Paneli i Biznesit"
          description="Kërko rrugë të disponueshme dhe kërko transport për dërgesat tuaja."
        />

        {/* Filters */}
        <section className="mb-8 rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-100">
          <h2 className="mb-4 text-sm font-semibold tracking-tight text-zinc-900">Filtrat</h2>
          <form className="grid gap-4 md:grid-cols-4 lg:grid-cols-5" onSubmit={handleSubmit}>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-600">
                Korridori
              </label>
              <select
                value={corridorId}
                onChange={(e) => setCorridorId(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              >
                <option value="">Të gjitha korridoret</option>
                {corridors.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-1">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-600">
                Origjina
              </label>
              <LocationAutocomplete
                locations={locations}
                value={originLocationId}
                onChange={setOriginLocationId}
                placeholder="Kërko qytetin e origjinës..."
              />
            </div>
            <div className="md:col-span-1">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-600">
                Destinacioni
              </label>
              <LocationAutocomplete
                locations={locations}
                value={destinationLocationId}
                onChange={setDestinationLocationId}
                placeholder="Kërko qytetin e destinacionit..."
              />
            </div>
            <div className="md:col-span-1">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-600">
                Data e nisjes
              </label>
              <input
                type="date"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
            <div className="md:col-span-1">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-600">
                Vlerësim minimal
              </label>
              <select
                value={minRating}
                onChange={(e) => setMinRating(Number(e.target.value))}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
              >
                <option value={0}>Të gjitha</option>
                <option value={3}>3+ yje</option>
                <option value={4}>4+ yje</option>
                <option value={5}>5 yje</option>
              </select>
            </div>
            <div className="flex items-end md:col-span-1">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {loading ? "Duke kërkuar..." : "Kërko"}
              </button>
            </div>
            {error && (
              <div className="md:col-span-4 lg:col-span-5">
                <p className="text-sm text-red-600" role="alert">{error}</p>
              </div>
            )}
          </form>
        </section>

        {/* Results */}
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-100">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
              Rrugët e Disponueshme
            </h2>
            {!loading && totalCount > 0 && (
              <p className="text-xs text-zinc-500">
                Duke shfaqur <span className="font-medium text-zinc-700">{routes.length}</span> nga{" "}
                <span className="font-medium text-zinc-700">{totalCount}</span> rrugë
              </p>
            )}
          </div>

          {loading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: PAGE_SIZE / 2 }).map((_, i) => (
                <RouteCardSkeleton key={i} />
              ))}
            </div>
          ) : routes.length === 0 ? (
            <EmptyState
              title="Asnjë rrugë nuk u gjet"
              description="Provo të ndryshosh origjinën, destinacionin ose datën e nisjes për të gjetur opsione."
            />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {routes.filter((route) => {
                  if (minRating === 0) return true;
                  const revs = reviewsByTransporter[route.transporter_id] ?? [];
                  if (revs.length === 0) return false;
                  const avg = revs.reduce((s, r) => s + r.rating, 0) / revs.length;
                  return avg >= minRating;
                }).map((route) => {
                  const alreadyRequested = requestedIds.has(route.id);
                  const transRevs   = reviewsByTransporter[route.transporter_id] ?? [];
                  const avgRating   = transRevs.length ? transRevs.reduce((s, r) => s + r.rating, 0) / transRevs.length : 0;
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
                          {transRevs.length > 0 && (
                            <div className="mt-1">
                              <StarDisplay rating={avgRating} count={transRevs.length} />
                            </div>
                          )}
                          <p className="mt-1 text-xs text-zinc-500">Nisja</p>
                          <p className="text-sm text-zinc-700">{route.departure_date}</p>
                        </div>
                        <StatusBadge variant={route.status} />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-zinc-600">
                          Kapaciteti i lirë:{" "}
                          <span className="font-medium">{route.available_capacity} kg</span>
                        </p>
                        {alreadyRequested ? (
                          <span className="rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                            Kërkesa u dërgua
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRequestTransport(route.id)}
                            disabled={requestingId === route.id}
                            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                          >
                            {requestingId === route.id ? "Duke dërguar..." : "Kërko Transport"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="mt-6 flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                  >
                    {loadingMore ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-zinc-900" />
                        Duke ngarkuar...
                      </>
                    ) : (
                      `Ngarko më shumë (${totalCount - routes.length} mbetur)`
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
    </div>
  );
}
