"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Review } from "@/types/review";
import type { User } from "@/types/user";
import { PageHeader } from "@/components/PageHeader";
import { StarDisplay } from "@/components/StarRating";
import { useToast } from "@/components/Toast";

interface EnrichedReview extends Review {
  reviewer_name: string;
  reviewee_name: string;
}

export default function AdminReviewsPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [checkingAuth, setCheckingAuth]   = useState(true);
  const [reviews, setReviews]             = useState<EnrichedReview[]>([]);
  const [loading, setLoading]             = useState(false);
  const [deletingId, setDeletingId]       = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [minRating, setMinRating]         = useState(0);
  const [roleFilter, setRoleFilter]       = useState<"all" | "business" | "transporter">("all");

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/auth/login"); return; }
      const { data: u } = await supabase.from("users").select("role").eq("id", data.session.user.id).single();
      if (u?.role !== "admin") { router.replace("/dashboard/admin"); return; }
      setCheckingAuth(false);
      await fetchReviews();
    };
    void init();
  }, [router]);

  const fetchReviews = async () => {
    setLoading(true);
    const { data: revData, error: revErr } = await supabase
      .from("reviews")
      .select("*")
      .order("created_at", { ascending: false });

    if (revErr) { showToast(revErr.message, "error"); setLoading(false); return; }

    const revs = (revData ?? []) as Review[];
    if (revs.length === 0) { setReviews([]); setLoading(false); return; }

    // Fetch all involved user profiles
    const userIds = [...new Set([...revs.map((r) => r.reviewer_id), ...revs.map((r) => r.reviewee_id)])];
    const { data: userData } = await supabase.from("users").select("id, company_name, email").in("id", userIds);
    const userMap = Object.fromEntries(
      ((userData ?? []) as Pick<User, "id" | "company_name" | "email">[]).map((u) => [
        u.id,
        u.company_name || u.email || "—",
      ])
    );

    setReviews(
      revs.map((r) => ({
        ...r,
        reviewer_name: userMap[r.reviewer_id] ?? "—",
        reviewee_name: userMap[r.reviewee_id] ?? "—",
      }))
    );
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const { error } = await supabase.from("reviews").delete().eq("id", id);
    setDeletingId(null);
    setConfirmDeleteId(null);
    if (error) { showToast(error.message, "error"); return; }
    showToast("Vlerësimi u fshi.", "success");
    setReviews((prev) => prev.filter((r) => r.id !== id));
  };

  const filtered = useMemo(() => {
    return reviews.filter((r) => {
      const matchRating = minRating === 0 || r.rating >= minRating;
      const matchRole   = roleFilter === "all" || r.reviewer_role === roleFilter;
      return matchRating && matchRole;
    });
  }, [reviews, minRating, roleFilter]);

  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : "—";

  if (checkingAuth) {
    return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" /></div>;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Moderimi i Vlerësimeve"
        description={`${reviews.length} vlerësime gjithsej — mesatare: ${avgRating} ★`}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={minRating}
          onChange={(e) => setMinRating(Number(e.target.value))}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
        >
          <option value={0}>Të gjitha vlerësimet</option>
          <option value={1}>1+ ★</option>
          <option value={2}>2+ ★</option>
          <option value={3}>3+ ★</option>
          <option value={4}>4+ ★</option>
          <option value={5}>5 ★</option>
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
        >
          <option value="all">Të gjitha llojet</option>
          <option value="business">Nga Bizneset</option>
          <option value="transporter">Nga Transportuesit</option>
        </select>
        <p className="self-center text-xs text-zinc-500">
          {filtered.length} rezultate
        </p>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-100">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center text-sm text-zinc-400">Asnjë vlerësim nuk u gjet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Vlerësuesi</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Vlerësoi</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Nota</th>
                <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 md:table-cell">Komenti</th>
                <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 lg:table-cell">Data</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">Veprime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map((rev) => (
                <tr key={rev.id} className="hover:bg-zinc-50/60">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-zinc-900">{rev.reviewer_name}</p>
                    <span className={`text-xs ${rev.reviewer_role === "business" ? "text-purple-600" : "text-blue-600"}`}>
                      {rev.reviewer_role === "business" ? "Biznes" : "Transportues"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-zinc-700">{rev.reviewee_name}</td>
                  <td className="px-5 py-3.5">
                    <StarDisplay rating={rev.rating} size="sm" />
                  </td>
                  <td className="hidden px-5 py-3.5 text-zinc-600 md:table-cell max-w-xs">
                    {rev.comment ? (
                      <p className="truncate">{rev.comment}</p>
                    ) : (
                      <span className="text-zinc-400 italic">Pa koment</span>
                    )}
                  </td>
                  <td className="hidden px-5 py-3.5 text-xs text-zinc-400 lg:table-cell">
                    {new Date(rev.created_at).toLocaleDateString("sq-AL")}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {confirmDeleteId === rev.id ? (
                        <>
                          <button
                            type="button"
                            disabled={deletingId === rev.id}
                            onClick={() => handleDelete(rev.id)}
                            className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-60"
                          >
                            {deletingId === rev.id && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                            Konfirmo
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-zinc-500">
                            Anulo
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(rev.id)}
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
