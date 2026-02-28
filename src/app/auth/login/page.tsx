"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// useSearchParams() must live inside a Suspense boundary for static export
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword(
      { email, password }
    );

    if (signInError || !data.user) {
      setLoading(false);
      setError(signInError?.message ?? "Login failed.");
      return;
    }

    const { data: userRow } = await supabase
      .from("users")
      .select("role")
      .eq("id", data.user.id)
      .single();

    const role: string =
      userRow?.role ?? data.user.user_metadata?.role ?? "";

    if (!userRow && role) {
      await supabase.from("users").insert({ id: data.user.id, role });
    }

    setLoading(false);

    if (!role) {
      setError("Nuk u gjet roli i llogarisë. Provo të regjistrohesh përsëri.");
      return;
    }

    const roleRedirect: Record<string, string> = {
      transporter: "/dashboard/transporter",
      business:    "/dashboard/business",
      admin:       "/dashboard/admin",
    };

    router.push(roleRedirect[role] ?? "/dashboard");
  };

  return (
    <div className="w-full max-w-md rounded-lg bg-white p-8 shadow">
      <h1 className="mb-2 text-2xl font-semibold text-zinc-900">Hyr në llogari</h1>
      <p className="mb-6 text-sm text-zinc-500">Mirë se kthehesh në XKLogistics.</p>
      {registered && (
        <div className="mb-4 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Llogaria u krijua me sukses! Mund të hysh tani.
        </div>
      )}
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="emri@kompania.com"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Fjalëkalimi</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
        {error && (
          <p className="text-sm text-red-600" role="alert">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {loading ? "Duke hyrë..." : "Hyr"}
        </button>
        <p className="text-center text-xs text-zinc-500">
          Nuk keni llogari?{" "}
          <a href="/auth/register" className="font-medium text-zinc-900 hover:underline">
            Regjistrohu
          </a>
        </p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <Suspense fallback={
        <div className="w-full max-w-md rounded-lg bg-white p-8 shadow flex justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
