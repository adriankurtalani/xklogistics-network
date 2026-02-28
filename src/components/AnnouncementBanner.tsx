"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

interface Announcement {
  id: string;
  message: string;
  color: "info" | "warning" | "error" | "success";
}

const COLOR_STYLES: Record<string, string> = {
  info:    "bg-blue-50 border-blue-200 text-blue-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  error:   "bg-red-50 border-red-200 text-red-800",
  success: "bg-emerald-50 border-emerald-200 text-emerald-800",
};

const ICON_PATHS: Record<string, string> = {
  info:    "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  warning: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  error:   "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z",
  success: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
};

export function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed]       = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id, message, color")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        const key = `dismissed_announcement_${data.id}`;
        if (sessionStorage.getItem(key)) { setDismissed(true); return; }
        setAnnouncement(data as Announcement);
      }
    };
    void fetch();
  }, []);

  if (!announcement || dismissed) return null;

  const dismiss = () => {
    sessionStorage.setItem(`dismissed_announcement_${announcement.id}`, "1");
    setDismissed(true);
  };

  const styles = COLOR_STYLES[announcement.color] ?? COLOR_STYLES.info;
  const icon   = ICON_PATHS[announcement.color]   ?? ICON_PATHS.info;

  return (
    <div className={`flex items-start justify-between gap-3 border-b px-4 py-2.5 text-sm ${styles}`}>
      <div className="flex items-center gap-2">
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
        <span>{announcement.message}</span>
      </div>
      <button type="button" onClick={dismiss} className="shrink-0 opacity-60 hover:opacity-100">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
