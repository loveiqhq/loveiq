"use client";

import BarChart from "@features/admin/ui/BarChart";
import StatCard from "@features/admin/ui/StatCard";
import type {
  ProductIssueRadarSnapshot,
  ProductIssueSeverity,
} from "@features/admin/server/product-issue-types";

const SEVERITY_CLASSES: Record<ProductIssueSeverity, string> = {
  critical: "bg-red-500/10 text-red-300",
  high: "bg-orange-500/10 text-orange-300",
  medium: "bg-amber-500/10 text-amber-200",
  watch: "bg-white/10 text-text-muted",
};

function categoryLabel(value: string) {
  return value.replace(/-/g, " ");
}

function dimensionLabel(value: string) {
  return value === "placement" ? "Embed Placement" : categoryLabel(value);
}

export default function ProductIssueRadarTab({
  data,
  loading,
  error,
}: {
  data: ProductIssueRadarSnapshot | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
        {error || "Failed to load product issue radar."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard
          label="Priority Issues"
          value={data.summary.priorityIssues}
          sub="mixed chapter + context + question clusters"
        />
        <StatCard
          label="Critical Questions"
          value={data.summary.criticalQuestions}
          sub="questions needing immediate intervention"
        />
        <StatCard
          label="Action Questions"
          value={data.summary.actionQuestions}
          sub="critical + action-ranked question portfolio items"
        />
        <StatCard
          label="Chapter Hotspots"
          value={data.summary.chapterHotspots}
          sub="chapters accumulating issue debt"
        />
        <StatCard
          label="Context Hotspots"
          value={data.summary.contextHotspots}
          sub="source, device, browser, and placement concentration"
        />
        <StatCard
          label="Low-Quality Questions"
          value={data.summary.lowQualityQuestions}
          sub="open-text questions producing weak signal"
        />
      </div>

      <section className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Issue Mix</h3>
            <p className="mt-1 text-xs text-text-muted">
              Last {data.days} days across abandonment, confusion, signal, quality, and pain.
            </p>
          </div>
          <p className="text-xs text-text-muted">
            Updated {new Date(data.generatedAt).toLocaleString()}
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {data.categorySummary.map((item) => (
            <div key={item.category} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-text-muted">
                  {categoryLabel(item.category)}
                </p>
                {item.topSeverity && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${SEVERITY_CLASSES[item.topSeverity]}`}
                  >
                    {item.topSeverity}
                  </span>
                )}
              </div>
              <p className="mt-2 text-2xl font-semibold text-text-primary">{item.count}</p>
              <p className="mt-1 text-xs text-text-muted">
                {item.topLabel ? `Top signal: ${item.topLabel}` : "No active hotspot in range."}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Priority Radar</h3>
              <p className="mt-1 text-xs text-text-muted">
                The highest-signal issue clusters spanning questions, chapters, and concentrated
                context hotspots.
              </p>
            </div>
            <a
              href="/admin/question-effectiveness"
              className="text-xs text-text-muted transition hover:text-text-primary"
            >
              Open Effectiveness
            </a>
          </div>

          <div className="mt-4 space-y-4">
            {data.priorityIssues.map((item) => (
              <a
                key={item.id}
                href={item.href}
                className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-white/20 hover:bg-white/10"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${SEVERITY_CLASSES[item.severity]}`}
                      >
                        {item.severity}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                        {categoryLabel(item.category)}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                        {dimensionLabel(item.dimension)}
                      </span>
                    </div>
                    <p className="mt-3 text-base font-semibold text-text-primary">{item.title}</p>
                    <p className="mt-1 text-sm text-text-muted">{item.summary}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wide text-text-muted">Impact</p>
                    <p className="mt-1 text-2xl font-semibold text-text-primary">
                      {item.impactScore}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">{item.confidence} confidence</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {item.evidence.map((entry) => (
                    <span
                      key={`${item.id}-${entry}`}
                      className="rounded-full border border-white/10 bg-surface px-3 py-1 text-xs text-text-muted"
                    >
                      {entry}
                    </span>
                  ))}
                </div>

                <p className="mt-4 text-sm text-text-primary">{item.recommendation}</p>
              </a>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-text-primary">Chapter Hotspots</h3>
              <a
                href="/admin/product-kpis?tab=Question%20Portfolio"
                className="text-xs text-text-muted transition hover:text-text-primary"
              >
                Open Portfolio
              </a>
            </div>
            <div className="mt-4">
              <BarChart
                items={data.chapterHotspots.map((item) => ({
                  label: `${item.label} · ${item.affectedQuestions}`,
                  value: item.score,
                }))}
                direction="horizontal"
              />
            </div>
          </div>

          {data.contextHotspots.map((group) => (
            <div key={group.dimension} className="rounded-xl border border-white/10 bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">
                    {dimensionLabel(group.dimension)} Hotspots
                  </h3>
                  <p className="mt-1 text-xs text-text-muted">
                    Where question friction is unusually concentrated by {group.dimension}.
                  </p>
                </div>
                <a
                  href="/admin/question-effectiveness"
                  className="text-xs text-text-muted transition hover:text-text-primary"
                >
                  Drill down
                </a>
              </div>
              <div className="mt-4 space-y-3">
                {group.items.map((item) => (
                  <a
                    key={`${group.dimension}-${item.label}`}
                    href={item.href}
                    className="block rounded-xl border border-white/10 bg-white/5 px-4 py-4 transition hover:border-white/20 hover:bg-white/10"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{item.label}</p>
                        <p className="mt-1 text-xs text-text-muted">{item.dominantReason}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-text-primary">{item.score}</p>
                        <p className="text-xs text-text-muted">
                          {item.affectedQuestions} questions
                        </p>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
