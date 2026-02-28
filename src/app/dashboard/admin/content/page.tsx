"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { logAdminAction } from "@/lib/auditLog";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/Toast";

interface HeroContent {
  title: string;
  subtitle: string;
  cta_transporter_label: string;
  cta_transporter_href: string;
  cta_business_label: string;
  cta_business_href: string;
}

interface HowItWorksStep {
  step: string;
  title: string;
  description: string;
}

const DEFAULT_HERO: HeroContent = {
  title:                  "Lidh ngarkesën. Transporto më smart.",
  subtitle:               "Rrjeti i koordinimit logjistik që lidh transportuesit dhe bizneset përgjatë korridorit BE–Kosovë.",
  cta_transporter_label:  "Regjistrohu si Transportues",
  cta_transporter_href:   "/auth/register?role=transporter",
  cta_business_label:     "Regjistrohu si Biznes",
  cta_business_href:      "/auth/register?role=business",
};

const DEFAULT_STEPS: HowItWorksStep[] = [
  { step: "01", title: "Regjistrohu dhe zgjidh rolin",      description: "Krijoni llogari si Transportues ose Biznes." },
  { step: "02", title: "Publiko rrugë ose kërko ngarkesa",  description: "Transportuesit publikojnë kapacitetin e lirë. Bizneset filtrojnë rrugën e duhur." },
  { step: "03", title: "Kërko, prano dhe dërgo",            description: "Bizneset dërgojnë kërkesa. Transportuesit pranojnë ose refuzojnë." },
];

export default function AdminContentPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [adminId, setAdminId]           = useState("");
  const [loadingHero, setLoadingHero]   = useState(true);
  const [loadingSteps, setLoadingSteps] = useState(true);
  const [savingHero, setSavingHero]     = useState(false);
  const [savingSteps, setSavingSteps]   = useState(false);

  const [hero, setHero]   = useState<HeroContent>(DEFAULT_HERO);
  const [steps, setSteps] = useState<HowItWorksStep[]>(DEFAULT_STEPS);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/auth/login"); return; }
      const { data: u } = await supabase.from("users").select("role").eq("id", data.session.user.id).single();
      if (u?.role !== "admin") { router.replace("/dashboard/admin"); return; }
      setAdminId(data.session.user.id);
      setCheckingAuth(false);
      await Promise.all([fetchHero(), fetchSteps()]);
    };
    void init();
  }, [router]);

  const fetchHero = async () => {
    setLoadingHero(true);
    const { data } = await supabase.from("site_content").select("value").eq("key", "hero").single();
    if (data?.value) setHero(data.value as HeroContent);
    setLoadingHero(false);
  };

  const fetchSteps = async () => {
    setLoadingSteps(true);
    const { data } = await supabase.from("site_content").select("value").eq("key", "how_it_works").single();
    if (data?.value) setSteps(data.value as HowItWorksStep[]);
    setLoadingSteps(false);
  };

  const handleSaveHero = async (e: FormEvent) => {
    e.preventDefault();
    setSavingHero(true);
    const { error } = await supabase.from("site_content").upsert({ key: "hero", value: hero, updated_at: new Date().toISOString() });
    setSavingHero(false);
    if (error) { showToast(error.message, "error"); return; }
    await logAdminAction({ adminId, action: "update_hero_content" });
    showToast("Seksioni Hero u ruajt.", "success");
  };

  const handleSaveSteps = async (e: FormEvent) => {
    e.preventDefault();
    setSavingSteps(true);
    const { error } = await supabase.from("site_content").upsert({ key: "how_it_works", value: steps, updated_at: new Date().toISOString() });
    setSavingSteps(false);
    if (error) { showToast(error.message, "error"); return; }
    await logAdminAction({ adminId, action: "update_how_it_works_content" });
    showToast("Hapat 'Si funksionon' u ruajtën.", "success");
  };

  const updateStep = (idx: number, field: keyof HowItWorksStep, value: string) => {
    setSteps((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  if (checkingAuth) {
    return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" /></div>;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Editori i Përmbajtjes"
        description="Ndrysho titujt, përshkrimet dhe butonët e faqes kryesore pa ndryshime kodi."
      />

      {/* Hero Editor */}
      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-zinc-100">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">Seksioni Hero</h2>
        <p className="mb-5 text-xs text-zinc-500">Titulli kryesor, nëntitulli dhe butonat CTA të faqes kryesore.</p>

        {loadingHero ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-9 animate-pulse rounded-md bg-zinc-100" />)}</div>
        ) : (
          <form onSubmit={handleSaveHero} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">Titulli kryesor</label>
              <input value={hero.title} onChange={(e) => setHero((p) => ({ ...p, title: e.target.value }))} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">Nëntitulli</label>
              <textarea value={hero.subtitle} onChange={(e) => setHero((p) => ({ ...p, subtitle: e.target.value }))} rows={3} className="w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Butoni Transportues — Teksti</label>
                <input value={hero.cta_transporter_label} onChange={(e) => setHero((p) => ({ ...p, cta_transporter_label: e.target.value }))} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Butoni Transportues — Linku</label>
                <input value={hero.cta_transporter_href} onChange={(e) => setHero((p) => ({ ...p, cta_transporter_href: e.target.value }))} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Butoni Biznes — Teksti</label>
                <input value={hero.cta_business_label} onChange={(e) => setHero((p) => ({ ...p, cta_business_label: e.target.value }))} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Butoni Biznes — Linku</label>
                <input value={hero.cta_business_href} onChange={(e) => setHero((p) => ({ ...p, cta_business_href: e.target.value }))} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none" />
              </div>
            </div>

            {/* Live preview */}
            <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4">
              <p className="mb-1 text-xs font-medium text-zinc-500">Pamje paraprake</p>
              <h1 className="text-xl font-bold text-zinc-900">{hero.title || "—"}</h1>
              <p className="mt-1 text-sm text-zinc-500">{hero.subtitle || "—"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-md bg-zinc-900 px-3 py-1 text-xs text-white">{hero.cta_transporter_label}</span>
                <span className="rounded-md border border-zinc-300 px-3 py-1 text-xs text-zinc-700">{hero.cta_business_label}</span>
              </div>
            </div>

            <div className="flex justify-end">
              <button type="submit" disabled={savingHero} className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60">
                {savingHero && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                {savingHero ? "Duke ruajtur..." : "Ruaj Hero"}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* How It Works Editor */}
      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-zinc-100">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">Si Funksionon — 3 Hapat</h2>
        <p className="mb-5 text-xs text-zinc-500">Ndrysho titullin dhe përshkrimin e secilit hap.</p>

        {loadingSteps ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-md bg-zinc-100" />)}</div>
        ) : (
          <form onSubmit={handleSaveSteps} className="space-y-4">
            {steps.map((step, idx) => (
              <div key={idx} className="rounded-lg border border-zinc-200 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white">{step.step}</span>
                  <span className="text-xs font-medium text-zinc-500">Hapi {idx + 1}</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700">Titulli</label>
                    <input value={step.title} onChange={(e) => updateStep(idx, "title", e.target.value)} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700">Përshkrimi</label>
                    <textarea value={step.description} onChange={(e) => updateStep(idx, "description", e.target.value)} rows={2} className="w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none" />
                  </div>
                </div>
              </div>
            ))}

            <div className="flex justify-end">
              <button type="submit" disabled={savingSteps} className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60">
                {savingSteps && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                {savingSteps ? "Duke ruajtur..." : "Ruaj Hapat"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
