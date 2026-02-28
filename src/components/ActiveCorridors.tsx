"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Corridor } from "@/types/corridor";

export function ActiveCorridors() {
  const [corridors, setCorridors] = useState<Corridor[]>([]);

  useEffect(() => {
    supabase
      .from("corridors")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .then(({ data }) => setCorridors((data ?? []) as Corridor[]));
  }, []);

  if (corridors.length === 0) return null;

  return (
    <div className="mt-6 flex flex-wrap justify-center gap-2">
      {corridors.map((c) => (
        <span
          key={c.id}
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {c.name}
        </span>
      ))}
    </div>
  );
}
