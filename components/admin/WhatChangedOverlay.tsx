"use client";

import { useMemo, useState } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import type { WhatChangedSnapshot } from "@/lib/admin/release-impact";

interface WhatChangedOverlayProps {
  days: number;
  metricKey?: string | null;
  triggerLabel?: string;
}

function kindClasses(kind: "release" | "decision" | "experiment" | "annotation") {
  if (kind === "release") return "bg-emerald-500/10 text-emerald-300";
  if (kind === "decision") return "bg-fuchsia-500/10 text-fuchsia-300";
  if (kind === "experiment") return "bg-amber-500/10 text-amber-200";
  return "bg-cyan-500/10 text-cyan-300";
}

export default function WhatChangedOverlay({
  days,
  metricKey,
  triggerLabel = "What changed?",
}: WhatChangedOverlayProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const params = useMemo(() => {
    const next: Record<string, string> = { days: String(days > 0 ? days : 30) };
    if (metricKey) next.metricKey = metricKey;
    return next;
  }, [days, metricKey]);
  const { data, loading, error } = useAdminFetch<WhatChangedSnapshot>(
    "/api/admin/what-changed",
    params
  );

  const items = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLowerCase();
    return data.items.filter((item) => {
      if (!needle) return true;
      return [item.title, item.detail, item.category, item.metricKey]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(needle));
    });
  }, [data, search]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-muted transition hover:bg-white/10 hover:text-text-primary"
      >
        {triggerLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-[#140f1d] shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <h3 className="font-serif text-xl font-semibold text-text-primary">What Changed</h3>
                <p className="mt-1 text-sm text-text-muted">
                  Recent releases, decisions, experiments, and annotations for the current window.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-muted transition hover:bg-white/10 hover:text-text-primary"
              >
                Close
              </button>
            </div>

            <div className="border-b border-white/10 px-5 py-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search release, decision, experiment, or note"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-white/20 focus:outline-none"
                />
                {data && (
                  <div className="flex flex-wrap gap-2 text-xs text-text-muted">
                    <span className="rounded-full bg-white/5 px-3 py-2">
                      {data.summary.releases} releases
                    </span>
                    <span className="rounded-full bg-white/5 px-3 py-2">
                      {data.summary.decisions} decisions
                    </span>
                    <span className="rounded-full bg-white/5 px-3 py-2">
                      {data.summary.experiments} experiments
                    </span>
                    <span className="rounded-full bg-white/5 px-3 py-2">
                      {data.summary.annotations} notes
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              {loading && (
                <div className="flex items-center justify-center py-24">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
                </div>
              )}

              {!loading && (error || !data) && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
                  {error || "Failed to load change timeline."}
                </div>
              )}

              {!loading && data && (
                <div className="space-y-3">
                  {items.map((item) => (
                    <a
                      key={item.id}
                      href={item.href}
                      className="block rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${kindClasses(
                                item.kind
                              )}`}
                            >
                              {item.kind}
                            </span>
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                              {item.category}
                            </span>
                            {item.metricKey && (
                              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                                {item.metricKey}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 font-medium text-text-primary">{item.title}</p>
                          <p className="mt-2 text-sm text-text-muted">{item.detail}</p>
                        </div>
                        <p className="text-xs text-text-muted">
                          {new Date(item.date).toLocaleDateString()}
                        </p>
                      </div>
                    </a>
                  ))}
                  {items.length === 0 && (
                    <div className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-text-muted">
                      No changes match the current filters.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
