"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { PageHeader } from "@/components/PageHeader";
import { DashboardCard } from "@/components/DashboardCard";

interface Stats {
  totalUsers: number;
  transporters: number;
  businesses: number;
  suspended: number;
  totalRoutes: number;
  availableRoutes: number;
  totalRequests: number;
  pendingRequests: number;
  acceptedRequests: number;
  totalReviews: number;
  totalLocations: number;
  totalCorridors: number;
}

interface QuickLink {
  href: string;
  label: string;
  description: string;
  iconPath: string;
  color: string;
}

const QUICK_LINKS: QuickLink[] = [
  {
    href: "/dashboard/admin/users",
    label: "Përdoruesit",
    description: "Shiko profilee, ndrysho role, fshi ose pezullo llogari",
    iconPath: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
    color: "blue",
  },
  {
    href: "/dashboard/admin/reviews",
    label: "Vlerësimet",
    description: "Modero vlerësimet dhe komentet mes përdoruesve",
    iconPath: "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
    color: "amber",
  },
  {
    href: "/dashboard/admin/locations",
    label: "Vendet",
    description: "Shto, ndrysho ose fshi qytete nga sistemi",
    iconPath: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z",
    color: "emerald",
  },
  {
    href: "/dashboard/admin/corridors",
    label: "Koridoret",
    description: "Menaxho koridoret aktive dhe joaktive të transportit",
    iconPath: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    color: "purple",
  },
];

const colorMap: Record<string, string> = {
  blue:    "bg-blue-50 text-blue-700 border-blue-100",
  amber:   "bg-amber-50 text-amber-700 border-amber-100",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
  purple:  "bg-purple-50 text-purple-700 border-purple-100",
};
const iconBgMap: Record<string, string> = {
  blue:    "bg-blue-100 text-blue-600",
  amber:   "bg-amber-100 text-amber-600",
  emerald: "bg-emerald-100 text-emerald-600",
  purple:  "bg-purple-100 text-purple-600",
};

export default function AdminOverviewPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/auth/login"); return; }
      const { data: u } = await supabase.from("users").select("role").eq("id", data.session.user.id).single();
      if (u?.role !== "admin") { router.replace("/dashboard"); return; }
      setCheckingAuth(false);
      await fetchStats();
    };
    void init();
  }, [router]);

  const fetchStats = async () => {
    const [
      { data: users },
      { count: totalRoutes },
      { count: availableRoutes },
      { count: totalRequests },
      { count: pendingRequests },
      { count: acceptedRequests },
      { count: totalReviews },
      { count: totalLocations },
      { count: totalCorridors },
    ] = await Promise.all([
      supabase.from("users").select("role, is_suspended"),
      supabase.from("routes").select("*", { count: "exact", head: true }),
      supabase.from("routes").select("*", { count: "exact", head: true }).eq("status", "available"),
      supabase.from("requests").select("*", { count: "exact", head: true }),
      supabase.from("requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("requests").select("*", { count: "exact", head: true }).eq("status", "accepted"),
      supabase.from("reviews").select("*", { count: "exact", head: true }),
      supabase.from("locations").select("*", { count: "exact", head: true }),
      supabase.from("corridors").select("*", { count: "exact", head: true }),
    ]);

    const u = (users ?? []) as { role: string; is_suspended: boolean }[];
    setStats({
      totalUsers:       u.length,
      transporters:     u.filter((x) => x.role === "transporter").length,
      businesses:       u.filter((x) => x.role === "business").length,
      suspended:        u.filter((x) => x.is_suspended).length,
      totalRoutes:      totalRoutes ?? 0,
      availableRoutes:  availableRoutes ?? 0,
      totalRequests:    totalRequests ?? 0,
      pendingRequests:  pendingRequests ?? 0,
      acceptedRequests: acceptedRequests ?? 0,
      totalReviews:     totalReviews ?? 0,
      totalLocations:   totalLocations ?? 0,
      totalCorridors:   totalCorridors ?? 0,
    });
  };

  if (checkingAuth || !stats) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
      </div>
    );
  }

  const statGroups = [
    {
      title: "Përdoruesit",
      color: "blue",
      items: [
        { label: "Gjithsej",        value: stats.totalUsers },
        { label: "Transportues",    value: stats.transporters },
        { label: "Biznese",         value: stats.businesses },
        { label: "Pezulluar",       value: stats.suspended, highlight: stats.suspended > 0 },
      ],
    },
    {
      title: "Rrugët & Kërkesat",
      color: "zinc",
      items: [
        { label: "Gjithsej Rrugë",     value: stats.totalRoutes },
        { label: "Rrugë të Lira",      value: stats.availableRoutes },
        { label: "Gjithsej Kërkesa",   value: stats.totalRequests },
        { label: "Kërkesa Pritëse",    value: stats.pendingRequests, highlight: stats.pendingRequests > 0 },
        { label: "Kërkesa të Pranuara",value: stats.acceptedRequests },
      ],
    },
    {
      title: "Platforma",
      color: "zinc",
      items: [
        { label: "Vlerësime",   value: stats.totalReviews },
        { label: "Qytete",      value: stats.totalLocations },
        { label: "Koridore",    value: stats.totalCorridors },
      ],
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Paneli i Administratorit"
        description="Pasqyrë e plotë e platformës XKLogistics — statistika, menaxhim dhe mbikëqyrje."
      />

      {/* Stat groups */}
      {statGroups.map((group) => (
        <section key={group.title}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">{group.title}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {group.items.map((item) => (
              <DashboardCard key={item.label}>
                <p className="text-xs text-zinc-500">{item.label}</p>
                <p className={`mt-1 text-2xl font-bold ${item.highlight ? "text-red-600" : "text-zinc-900"}`}>
                  {item.value}
                </p>
              </DashboardCard>
            ))}
          </div>
        </section>
      ))}

      {/* Quick access panels */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Menaxhimi</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-start gap-4 rounded-xl border p-5 transition-shadow hover:shadow-md ${colorMap[link.color]}`}
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBgMap[link.color]}`}>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  {link.iconPath.split(" M").map((d, i) => (
                    <path key={i} strokeLinecap="round" strokeLinejoin="round" d={(i === 0 ? "" : "M") + d} />
                  ))}
                </svg>
              </div>
              <div>
                <p className="font-semibold">{link.label}</p>
                <p className="mt-0.5 text-xs opacity-75">{link.description}</p>
              </div>
              <svg className="ml-auto h-4 w-4 shrink-0 self-center opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
