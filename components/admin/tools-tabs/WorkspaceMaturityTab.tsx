"use client";

import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";

type Tone = "weak" | "medium" | "strong";
type Band = "foundational" | "developing" | "advanced" | "elite";

interface WorkspaceMaturityResponse {
  generatedAt: string;
  overallScore: number;
  band: Band;
  strengths: string[];
  gaps: string[];
  dimensions: Array<{
    key: string;
    label: string;
    score: number;
    tone: Tone;
    detail: string;
    metrics: Array<{ label: string; value: string }>;
    gaps: string[];
    nextStep: string;
  }>;
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-2 font-serif text-2xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function toneClasses(tone: Tone): string {
  if (tone === "strong") return "bg-emerald-500/10 text-emerald-300";
  if (tone === "medium") return "bg-amber-500/10 text-amber-200";
  return "bg-red-500/10 text-red-300";
}

function bandClasses(band: Band): string {
  if (band === "elite") return "bg-emerald-500/10 text-emerald-300";
  if (band === "advanced") return "bg-cyan-500/10 text-cyan-300";
  if (band === "developing") return "bg-amber-500/10 text-amber-200";
  return "bg-red-500/10 text-red-300";
}

export default function WorkspaceMaturityTab() {
  const { data, loading, error } = useAdminFetch<WorkspaceMaturityResponse>(
    "/api/admin/workspace-maturity"
  );

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
        {error || "Failed to load workspace maturity."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-surface p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${bandClasses(data.band)}`}
              >
                {data.band}
              </span>
            </div>
            <h2 className="mt-3 font-serif text-2xl font-bold text-text-primary">
              Workspace Maturity
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-text-muted">
              Cross-functional operating maturity across metrics, strategy, governance, execution,
              and internal distribution.
            </p>
          </div>
          <div className="text-right">
            <p className="font-serif text-4xl font-bold text-text-primary">{data.overallScore}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-text-muted">overall score</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-text-muted">
          Updated {new Date(data.generatedAt).toLocaleString()}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryTile label="Dimensions" value={String(data.dimensions.length)} />
        <SummaryTile label="Strengths" value={String(data.strengths.length)} />
        <SummaryTile label="Top Gaps" value={String(data.gaps.length)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <section>
          <h3 className="font-serif text-lg font-semibold text-text-primary">Dimension Scores</h3>
          <div className="mt-3 space-y-4">
            {data.dimensions.map((dimension) => (
              <div
                key={dimension.key}
                className="rounded-2xl border border-white/10 bg-surface p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${toneClasses(dimension.tone)}`}
                      >
                        {dimension.tone}
                      </span>
                    </div>
                    <p className="mt-3 text-lg font-semibold text-text-primary">
                      {dimension.label}
                    </p>
                    <p className="mt-1 text-sm text-text-muted">{dimension.detail}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-serif text-3xl font-bold text-text-primary">
                      {dimension.score}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-text-muted">score</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {dimension.metrics.map((metric) => (
                    <div
                      key={`${dimension.key}-${metric.label}`}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-3"
                    >
                      <p className="text-xs text-text-muted">{metric.label}</p>
                      <p className="mt-1 text-sm font-semibold text-text-primary">{metric.value}</p>
                    </div>
                  ))}
                </div>

                {dimension.gaps.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {dimension.gaps.map((gap) => (
                      <div
                        key={`${dimension.key}-${gap}`}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-text-muted"
                      >
                        {gap}
                      </div>
                    ))}
                  </div>
                )}

                <p className="mt-4 text-sm text-text-primary">{dimension.nextStep}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <div>
            <h3 className="font-serif text-lg font-semibold text-text-primary">
              Current Strengths
            </h3>
            <div className="mt-3 space-y-3">
              {data.strengths.length === 0 && (
                <div className="rounded-xl border border-white/10 bg-surface p-5 text-sm text-text-muted">
                  No maturity dimension is above the strong threshold yet.
                </div>
              )}
              {data.strengths.map((item) => (
                <div
                  key={item}
                  className="rounded-xl border border-white/10 bg-surface p-5 text-sm text-text-primary"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-serif text-lg font-semibold text-text-primary">Top Gaps</h3>
            <div className="mt-3 space-y-3">
              {data.gaps.length === 0 && (
                <div className="rounded-xl border border-white/10 bg-surface p-5 text-sm text-text-muted">
                  No major maturity gaps are currently flagged.
                </div>
              )}
              {data.gaps.map((item) => (
                <div
                  key={item}
                  className="rounded-xl border border-white/10 bg-surface p-5 text-sm text-text-muted"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
