"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import type {
  AdminKnowledgeSnapshot,
  AdminKnowledgeSurface,
} from "@features/admin/server/knowledge-types";

function toneClasses(tone: AdminKnowledgeSnapshot["artifacts"][number]["tone"]): string {
  if (tone === "good") return "border-emerald-500/20 bg-emerald-500/5";
  if (tone === "risk") return "border-red-500/20 bg-red-500/5";
  if (tone === "watch") return "border-amber-500/20 bg-amber-500/5";
  return "border-white/10 bg-white/5";
}

interface AdminKnowledgePanelProps {
  surface: AdminKnowledgeSurface;
  days?: number;
  title?: string;
}

export default function AdminKnowledgePanel({
  surface,
  days = 30,
  title,
}: AdminKnowledgePanelProps) {
  const params = useMemo(() => ({ surface, days: String(days) }), [days, surface]);
  const { data, loading, error } = useAdminFetch<AdminKnowledgeSnapshot>(
    "/api/admin/knowledge",
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
        {error || "Unable to load admin knowledge."}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-white/10 bg-surface p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
            Knowledge Memory
          </p>
          <h3 className="mt-2 font-serif text-2xl font-semibold text-text-primary">
            {title || "Admin Knowledge"}
          </h3>
          <p className="mt-2 max-w-4xl text-sm text-text-muted">{data.headline}</p>
          <p className="mt-2 max-w-4xl text-sm text-text-muted">{data.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.prompts.map((prompt) => (
            <span
              key={prompt.query}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-text-muted"
            >
              {prompt.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {data.artifacts.map((artifact) => (
          <a
            key={artifact.id}
            href={artifact.href}
            className={`rounded-xl border p-4 transition hover:border-white/20 hover:bg-white/[0.04] ${toneClasses(artifact.tone)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-medium text-text-primary">{artifact.title}</h4>
                  <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-text-muted">
                    {artifact.type}
                  </span>
                  <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-text-muted">
                    {artifact.confidence} confidence
                  </span>
                </div>
                <p className="mt-2 text-sm text-text-muted">{artifact.summary}</p>
              </div>
              <span className="text-xs text-text-muted">Open</span>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {artifact.evidence.map((evidence, index) => (
                <div
                  key={`${artifact.id}-${evidence.label}-${index}`}
                  className="rounded-lg border border-white/10 bg-page px-3 py-2"
                >
                  <p className="text-[11px] uppercase tracking-wide text-text-muted">
                    {evidence.label}
                  </p>
                  <p className="mt-1 text-sm text-text-primary">{evidence.value}</p>
                </div>
              ))}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
