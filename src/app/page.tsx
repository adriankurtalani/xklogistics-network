import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { ActiveCorridors } from "@/components/ActiveCorridors";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";

// Re-fetch from DB at most every 30 s; any admin save is reflected within half a minute
export const revalidate = 30;

interface HeroContent {
  title: string;
  subtitle: string;
  cta_transporter_label: string;
  cta_transporter_href: string;
  cta_business_label: string;
  cta_business_href: string;
}

interface Step { step: string; title: string; description: string }

const DEFAULT_HERO: HeroContent = {
  title:                 "Lidh ngarkesën. Transporto më smart.",
  subtitle:              "Rrjeti i koordinimit logjistik që lidh transportuesit dhe bizneset përgjatë korridorit BE–Kosovë. Publiko rrugët, gjej ngarkesa dhe ndiqe çdo kërkesë — gjithçka në një vend.",
  cta_transporter_label: "Regjistrohu si Transportues",
  cta_transporter_href:  "/auth/register?role=transporter",
  cta_business_label:    "Regjistrohu si Biznes",
  cta_business_href:     "/auth/register?role=business",
};

const DEFAULT_STEPS: Step[] = [
  { step: "01", title: "Regjistrohu dhe zgjidh rolin",     description: "Krijoni llogari si Transportues ose Biznes. Paneli dhe lejet tuaja janë të personalizuara sipas rolit tuaj që nga dita e parë." },
  { step: "02", title: "Publiko rrugë ose kërko ngarkesa", description: "Transportuesit publikojnë kapacitetin e lirë me origjinë, destinacion dhe datë nisje. Bizneset filtrojnë dhe gjejnë rrugën e duhur menjëherë." },
  { step: "03", title: "Kërko, prano dhe dërgo",           description: "Bizneset dërgojnë kërkesa transporti. Transportuesit shqyrtojnë dhe pranojnë ose refuzojnë. Pasi ndeshja bëhet, të dyja palët njoftohen menjëherë." },
];

export default async function LandingPage() {
  // Server-side fetch — runs before HTML is sent to the browser
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data } = await supabase
    .from("site_content")
    .select("key, value")
    .in("key", ["hero", "how_it_works", "logo"]);

  let hero    = DEFAULT_HERO;
  let steps   = DEFAULT_STEPS;
  let logoUrl: string | null = null;

  for (const row of data ?? []) {
    if (row.key === "hero")         hero    = row.value as HeroContent;
    if (row.key === "how_it_works") steps   = row.value as Step[];
    if (row.key === "logo" && (row.value as Record<string, string>)?.url)
      logoUrl = (row.value as Record<string, string>).url;
  }

  return (
    <div className="min-h-screen bg-white font-sans text-zinc-900">
      {/* Announcement banner renders client-side (needs sessionStorage for dismiss) */}
      <AnnouncementBanner />

      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="text-lg font-bold tracking-tight text-zinc-900">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="h-8 w-auto" />
          ) : (
            <>XK<span className="font-normal text-zinc-500">Logistics</span></>
          )}
        </span>
        <div className="flex items-center gap-3">
          <Link href="/auth/login" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
            Hyr
          </Link>
          <Link href="/auth/register" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
            Regjistrohu
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pb-24 pt-16 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Korridori BE ↔ Kosovë — aktiv tani
        </div>
        <h1 className="mt-4 text-5xl font-semibold leading-tight tracking-tight text-zinc-900 md:text-6xl">
          {hero.title}
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-zinc-500">
          {hero.subtitle}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href={hero.cta_transporter_href}
            className="inline-flex w-full items-center justify-center rounded-md bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800 sm:w-auto"
          >
            {hero.cta_transporter_label}
          </Link>
          <Link
            href={hero.cta_business_href}
            className="inline-flex w-full items-center justify-center rounded-md border border-zinc-300 bg-white px-6 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 sm:w-auto"
          >
            {hero.cta_business_label}
          </Link>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-zinc-100 bg-zinc-50 py-8">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-6 px-6 text-center md:grid-cols-4">
          {[
            { value: "Multi-koridor", label: "Korridore aktive" },
            { value: "Në kohë reale", label: "Dukshmëri rrugësh" },
            { value: "Sipas rolit",   label: "Kontroll aksesi" },
            { value: "Falas",         label: "Për të filluar" },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="text-xl font-semibold text-zinc-900">{stat.value}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <div className="mb-12 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Si funksionon</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
            Tre hapa deri tek ndeshja e parë
          </h2>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {steps.map((item) => (
            <div key={item.step} className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-6">
              <span className="text-3xl font-bold text-zinc-200">{item.step}</span>
              <h3 className="mt-3 text-base font-semibold text-zinc-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Corridor highlight */}
      <section className="bg-zinc-900 py-20 text-white">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Korridoret aktive</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">Rrjeti BE ↔ Kosovë</h2>
          <p className="mx-auto mt-4 max-w-lg text-zinc-400">
            Mbulojmë korridoret kryesore të ngarkesave ndërmjet Bashkimit Europian dhe Kosovës.
            Zgjerohemi vazhdimisht bazuar në kërkesën e tregut.
          </p>
          <ActiveCorridors />
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href={hero.cta_transporter_href} className="inline-flex w-full items-center justify-center rounded-md bg-white px-6 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-100 sm:w-auto">
              {hero.cta_transporter_label}
            </Link>
            <Link href={hero.cta_business_href} className="inline-flex w-full items-center justify-center rounded-md border border-zinc-600 bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800 sm:w-auto">
              {hero.cta_business_label}
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-100 bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-xs text-zinc-500 sm:flex-row">
          <span>
            © {new Date().getFullYear()}{" "}
            <span className="font-medium text-zinc-900">XKLogistics</span>.
            Të gjitha të drejtat e rezervuara.
          </span>
          <div className="flex gap-5">
            <Link href="/auth/login"    className="hover:text-zinc-900">Hyr</Link>
            <Link href="/auth/register" className="hover:text-zinc-900">Regjistrohu</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
