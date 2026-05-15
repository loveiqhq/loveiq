"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import type {
  AdminGraphSurface,
  AdminSignalGraphSnapshot,
} from "@features/admin/server/graph-types";

interface AdminSignalGraphPanelProps {
  surface: AdminGraphSurface;
  days?: number;
  title?: string;
}

function toneClasses(tone: "good" | "watch" | "risk" | "neutral"): string {
  if (tone === "good") return "bg-emerald-500/10 text-emerald-300";
  if (tone === "risk") return "bg-red-500/10 text-red-300";
  if (tone === "watch") return "bg-amber-500/10 text-amber-200";
  return "bg-white/10 text-text-muted";
}

export default function AdminSignalGraphPanel({
  surface,
  days = 30,
  title,
}: AdminSignalGraphPanelProps) {
  const params = useMemo(() => ({ surface, days: String(days) }), [days, surface]);
  const { data, loading, error } = useAdminFetch<AdminSignalGraphSnapshot>(
    "/api/admin/graph",
    params
  );

  if (loading) {
    return (
      <section className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex items-center justify-center py-8">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-300">
        {error || "Unable to load admin graph."}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-white/10 bg-surface p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
            Signal Graph
          </p>
          <h3 className="mt-2 font-serif text-2xl font-semibold text-text-primary">
            {title || "Root-Cause Graph"}
          </h3>
          <p className="mt-2 max-w-4xl text-sm text-text-muted">{data.headline}</p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-text-muted">
          {data.nodes.length} nodes · {data.edges.length} edges
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr,0.85fr]">
        <div className="space-y-3">
          {data.focusPaths.map((path) => (
            <a
              key={path.id}
              href={path.href}
              className="block rounded-xl border border-white/10 bg-white/5 px-4 py-4 transition hover:border-white/20 hover:bg-white/[0.07]"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-text-primary">{path.title}</p>
                <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-text-muted">
                  {path.confidence}
                </span>
              </div>
              <p className="mt-2 text-sm text-text-muted">{path.summary}</p>
            </a>
          ))}
        </div>

        <div className="rounded-xl border border-white/10 bg-page p-4">
          <p className="text-sm font-semibold text-text-primary">Nodes In View</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.nodes.map((node) => (
              <a
                key={node.id}
                href={node.href}
                className={`rounded-full px-3 py-1 text-xs ${toneClasses(node.tone)}`}
              >
                {node.kind}: {node.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
