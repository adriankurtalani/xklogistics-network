"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { UserRole } from "@/types/user";
import { ToastProvider } from "@/components/Toast";
import { NotificationBell } from "@/components/NotificationBell";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const ROLE_LABELS: Record<UserRole, string> = {
  transporter: "Transportues",
  business: "Biznes",
  admin: "Administrator",
};

const ROLE_COLORS: Record<UserRole, string> = {
  transporter: "bg-blue-100 text-blue-700",
  business: "bg-emerald-100 text-emerald-700",
  admin: "bg-purple-100 text-purple-700",
};

// Role → allowed path prefixes
const ROLE_ALLOWED_PREFIXES: Record<UserRole, string[]> = {
  transporter: ["/dashboard/transporter", "/dashboard/profile"],
  business:    ["/dashboard/business",    "/dashboard/profile"],
  admin:       ["/dashboard/admin", "/dashboard/transporter", "/dashboard/business", "/dashboard/profile"],
};

// Role → default redirect
const ROLE_HOME: Record<UserRole, string> = {
  transporter: "/dashboard/transporter",
  business:    "/dashboard/business",
  admin:       "/dashboard/admin",
};

function Icon({ path, className = "h-4 w-4" }: { path: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

const PROFILE_NAV_ITEM: NavItem = {
  href: "/dashboard/profile",
  label: "Profili Im",
  icon: <Icon path="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
};

const NAV_GROUPS: Record<UserRole, NavGroup[]> = {
  transporter: [
    {
      title: "Paneli",
      items: [
        {
          href: "/dashboard/transporter",
          label: "Ballina",
          exact: true,
          icon: <Icon path="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />,
        },
        {
          href: "/dashboard/transporter",
          label: "Rrugët e Mia",
          icon: <Icon path="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />,
        },
        {
          href: "/dashboard/transporter",
          label: "Kërkesat Hyrëse",
          icon: <Icon path="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />,
        },
      ],
    },
    { title: "Llogaria", items: [PROFILE_NAV_ITEM] },
  ],
  business: [
    {
      title: "Paneli",
      items: [
        {
          href: "/dashboard/business",
          label: "Kërko Rrugë",
          exact: true,
          icon: <Icon path="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />,
        },
        {
          href: "/dashboard/business/requests",
          label: "Kërkesat e Mia",
          icon: <Icon path="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />,
        },
      ],
    },
    { title: "Llogaria", items: [PROFILE_NAV_ITEM] },
  ],
  admin: [
    {
      title: "Pasqyrë",
      items: [
        {
          href: "/dashboard/admin",
          label: "Përmbledhje",
          exact: true,
          icon: <Icon path="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
        },
      ],
    },
    {
      title: "Menaxhimi",
      items: [
        { href: "/dashboard/admin/users",     label: "Përdoruesit",  icon: <Icon path="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /> },
        { href: "/dashboard/admin/reviews",   label: "Vlerësimet",   icon: <Icon path="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /> },
        { href: "/dashboard/admin/shipments", label: "Dërgesat",     icon: <Icon path="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /> },
        { href: "/dashboard/admin/locations", label: "Vendet",       icon: <Icon path="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" /> },
        { href: "/dashboard/admin/corridors", label: "Koridoret",    icon: <Icon path="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> },
      ],
    },
    {
      title: "Përmbajtja",
      items: [
        { href: "/dashboard/admin/content",       label: "Editori",         icon: <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /> },
        { href: "/dashboard/admin/announcements", label: "Njoftimet",       icon: <Icon path="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /> },
        { href: "/dashboard/admin/media",         label: "Media",           icon: <Icon path="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /> },
        { href: "/dashboard/admin/broadcast",     label: "Njoftim Masiv",   icon: <Icon path="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /> },
      ],
    },
    {
      title: "Sistemi",
      items: [
        { href: "/dashboard/admin/analytics", label: "Analitika",  icon: <Icon path="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> },
        { href: "/dashboard/admin/settings",  label: "Cilësimet",  icon: <Icon path="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" /> },
        { href: "/dashboard/admin/audit",     label: "Regjistri",  icon: <Icon path="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /> },
      ],
    },
    { title: "Llogaria", items: [PROFILE_NAV_ITEM] },
  ],
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [role, setRole]         = useState<UserRole | null>(null);
  const [userId, setUserId]     = useState<string>("");
  const [email, setEmail]       = useState<string>("");
  const [loading, setLoading]   = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) { router.replace("/auth/login"); return; }

      setEmail(sessionData.session.user.email ?? "");
      setUserId(sessionData.session.user.id);

      const { data: userRow, error } = await supabase
        .from("users")
        .select("role")
        .eq("id", sessionData.session.user.id)
        .single();

      if (error || !userRow) { router.replace("/auth/login"); return; }

      const userRole = userRow.role as UserRole;
      setRole(userRole);
      setLoading(false);
    };

    void loadUser();
  }, [router]);

  // Close sidebar on route change (mobile)
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  // Route guard: redirect if accessing a path not allowed for this role
  useEffect(() => {
    if (!role || !pathname) return;
    const allowed = ROLE_ALLOWED_PREFIXES[role];
    const canAccess = allowed.some((prefix) => pathname.startsWith(prefix));
    if (!canAccess) router.replace(ROLE_HOME[role]);
  }, [role, pathname, router]);

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.replace("/auth/login");
  };

  const initials = email
    ? email.slice(0, 2).toUpperCase()
    : role?.slice(0, 2).toUpperCase() ?? "??";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
          <p className="text-sm text-zinc-500">Duke ngarkuar panelin…</p>
        </div>
      </div>
    );
  }

  const navGroups = role ? NAV_GROUPS[role] : [];

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-zinc-50">

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar */}
        <aside className={`
          fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-white shadow-lg
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0 lg:shadow-sm
        `}>

          {/* Brand */}
          <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-zinc-100 px-5">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              <span className="text-base font-bold tracking-tight text-zinc-900">
                XK<span className="font-normal text-zinc-400">Logistics</span>
              </span>
            </div>
            <div className="flex items-center gap-1">
              {userId && <NotificationBell userId={userId} />}
              {/* Close button — mobile only */}
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 lg:hidden"
                aria-label="Mbyll menynë"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* User section */}
          <div className="border-b border-zinc-100 px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-zinc-900">{email || "—"}</p>
                {role && (
                  <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[role]}`}>
                    {ROLE_LABELS[role]}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {navGroups.map((group) => (
              <div key={group.title} className="mb-5">
                <p className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
                  {group.title}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = item.exact
                      ? pathname === item.href
                      : pathname?.startsWith(item.href);

                    return (
                      <button
                        key={`${group.title}-${item.label}`}
                        type="button"
                        onClick={() => router.push(item.href)}
                        className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-100 ${
                          active
                            ? "bg-zinc-900 text-white shadow-sm"
                            : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                        }`}
                      >
                        <span className={`shrink-0 ${active ? "text-white" : "text-zinc-400 group-hover:text-zinc-600"}`}>
                          {item.icon}
                        </span>
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Logout */}
          <div className="shrink-0 border-t border-zinc-100 p-3">
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-500 transition-all hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              <svg className="h-4 w-4 shrink-0 text-zinc-400 group-hover:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
              </svg>
              {loggingOut ? "Duke dalë…" : "Dil nga llogaria"}
            </button>
          </div>
        </aside>

        {/* Main content — offset by sidebar on desktop */}
        <div className="flex min-h-screen w-full flex-col lg:pl-64">

          {/* Mobile top bar */}
          <div className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 lg:hidden">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100"
              aria-label="Hap menynë"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-base font-bold tracking-tight text-zinc-900">
              XK<span className="font-normal text-zinc-400">Logistics</span>
            </span>
            {userId && <div className="ml-auto"><NotificationBell userId={userId} /></div>}
          </div>

          <main className="flex-1">
            <AnnouncementBanner />
            <div className="p-4 sm:p-6 lg:p-8">{children}</div>
          </main>
        </div>

      </div>
    </ToastProvider>
  );
}
