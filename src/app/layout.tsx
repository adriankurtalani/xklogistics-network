import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const getPlatformBranding = cache(async function getPlatformBranding() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      { global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }) } }
    );

    const { data } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["platform_name", "favicon_url"]);

    const map: Record<string, string> = {};
    for (const row of (data ?? []) as { key: string; value: string }[]) {
      map[row.key] = row.value;
    }

    return {
      title: map["platform_name"]?.trim() || "XK Logistics",
      faviconUrl: map["favicon_url"] || null,
    };
  } catch {
    return { title: "XK Logistics", faviconUrl: null };
  }
});

export async function generateMetadata(): Promise<Metadata> {
  const { title } = await getPlatformBranding();
  return {
    title,
    description:
      "Rrjeti i koordinimit logjistik që lidh transportuesit dhe bizneset përgjatë korridorit BE–Kosovë.",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { faviconUrl } = await getPlatformBranding();

  return (
    <html lang="en">
      <head>
        {faviconUrl && (
          <>
            <link rel="icon" href={faviconUrl} />
            <link rel="shortcut icon" href={faviconUrl} />
          </>
        )}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
