"use client";

import { useEffect, useRef, useState, KeyboardEvent } from "react";
import type { Location } from "@/types/location";

interface Props {
  locations: Location[];
  value: string;           // selected location id
  onChange: (id: string) => void;
  placeholder?: string;
  required?: boolean;
}

export function LocationAutocomplete({
  locations,
  value,
  onChange,
  placeholder = "Kërko qytet...",
  required,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // When value changes externally, reflect label in input
  useEffect(() => {
    if (!value) { setQuery(""); return; }
    const loc = locations.find((l) => l.id === value);
    if (loc) setQuery(`${loc.city}, ${loc.country}`);
  }, [value, locations]);

  // Close on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Filter locations by query
  const filtered = query.trim()
    ? locations.filter((l) => {
        const q = query.toLowerCase();
        return (
          l.city.toLowerCase().includes(q) ||
          l.country.toLowerCase().includes(q) ||
          (l.region ?? "").toLowerCase().includes(q)
        );
      })
    : locations;

  // Group by country
  const grouped = filtered.reduce<Record<string, Location[]>>((acc, loc) => {
    if (!acc[loc.country]) acc[loc.country] = [];
    acc[loc.country].push(loc);
    return acc;
  }, {});

  const flatFiltered = Object.values(grouped).flat();

  const handleSelect = (loc: Location) => {
    onChange(loc.id);
    setQuery(`${loc.city}, ${loc.country}`);
    setOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      setHighlighted((h) => Math.min(h + 1, flatFiltered.length - 1));
    } else if (e.key === "ArrowUp") {
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const loc = flatFiltered[highlighted];
      if (loc) handleSelect(loc);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          required={required && !value}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => { setOpen(true); setHighlighted(0); }}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange("");
            setOpen(true);
            setHighlighted(0);
          }}
          onKeyDown={handleKeyDown}
          className="w-full rounded-md border border-zinc-300 py-2 pl-3 pr-8 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        />
        {value ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
            tabIndex={-1}
            aria-label="Pastro"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </span>
        )}
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-lg">
          {Object.entries(grouped).map(([country, locs]) => {
            return (
              <div key={country}>
                <div className="sticky top-0 bg-zinc-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 border-b border-zinc-100">
                  {country}
                </div>
                {locs.map((loc) => {
                  const idx = flatFiltered.indexOf(loc);
                  return (
                    <button
                      key={loc.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); handleSelect(loc); }}
                      onMouseEnter={() => setHighlighted(idx)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                        idx === highlighted
                          ? "bg-zinc-900 text-white"
                          : "text-zinc-800 hover:bg-zinc-50"
                      }`}
                    >
                      <span className="font-medium">{loc.city}</span>
                      {loc.region && (
                        <span className={`text-xs ${idx === highlighted ? "text-zinc-300" : "text-zinc-400"}`}>
                          {loc.region}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {open && query.trim() && filtered.length === 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-500 shadow-lg">
          Asnjë qytet nuk u gjet për &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}
