import type { ReactNode } from "react";

interface DashboardCardProps {
  title?: string;
  description?: string;
  children: ReactNode;
}

export function DashboardCard({
  title,
  description,
  children,
}: DashboardCardProps) {
  return (
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-100">
      {(title || description) && (
        <header className="mb-4 space-y-1">
          {title && (
            <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
              {title}
            </h2>
          )}
          {description && (
            <p className="text-xs text-zinc-500">{description}</p>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

