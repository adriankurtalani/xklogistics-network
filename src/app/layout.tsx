import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { createClient } from "@supabase/supabase-js";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

async function getPlatformBranding() {
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
}

export async function generateMetadata(): Promise<Metadata> {
  const { title, faviconUrl } = await getPlatformBranding();
  return {
    title,
    description:
      "Rrjeti i koordinimit logjistik që lidh transportuesit dhe bizneset përgjatë korridorit BE–Kosovë.",
    ...(faviconUrl && { icons: { icon: faviconUrl } }),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
