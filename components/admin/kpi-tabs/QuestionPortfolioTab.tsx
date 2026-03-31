"use client";

import { useMemo, useState } from "react";
import type {
  ProductIssueRadarSnapshot,
  ProductPortfolioStatus,
  QuestionPortfolioItem,
} from "@/lib/admin/product-issue-types";

const STATUS_CLASSES: Record<ProductPortfolioStatus, string> = {
  critical: "bg-red-500/10 text-red-300",
  action: "bg-orange-500/10 text-orange-300",
  watch: "bg-amber-500/10 text-amber-200",
  healthy: "bg-emerald-500/10 text-emerald-300",
};

const INPUT_CLASS =
  "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-white/20 focus:outline-none";

function metricLabel(value: number | null, suffix = "") {
  if (value == null) return "—";
  return `${value}${suffix}`;
}

function topReasonPreview(item: QuestionPortfolioItem) {
  return item.reasons.slice(0, 2).join(" • ");
}

export default function QuestionPortfolioTab({
  data,
  loading,
  error,
}: {
  data: ProductIssueRadarSnapshot | null;
  loading: boolean;
  error: string | null;
}) {
  const [statusFilter, setStatusFilter] = useState<ProductPortfolioStatus | "all">("all");
  const [chapterFilter, setChapterFilter] = useState("all");
  const [search, setSearch] = useState("");

  const chapterOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.portfolio.map((item) => item.chapterId))].sort(
      (left, right) => Number(left) - Number(right)
    );
  }, [data]);

  const filtered = useMemo(() => {
    const items = data?.portfolio ?? [];
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== "all" && item.portfolioStatus !== statusFilter) return false;
      if (chapterFilter !== "all" && item.chapterId !== chapterFilter) return false;
      if (!needle) return true;
      return (
        item.qId.toLowerCase().includes(needle) ||
        item.questionText.toLowerCase().includes(needle) ||
        item.reasons.some((reason) => reason.toLowerCase().includes(needle))
      );
    });
  }, [chapterFilter, data, search, statusFilter]);

  const spotlight = filtered.slice(0, 5);

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
        {error || "Failed to load question portfolio."}
      </div>
    );
  }

  const counts = {
    critical: data.portfolio.filter((item) => item.portfolioStatus === "critical").length,
    action: data.portfolio.filter((item) => item.portfolioStatus === "action").length,
    watch: data.portfolio.filter((item) => item.portfolioStatus === "watch").length,
    healthy: data.portfolio.filter((item) => item.portfolioStatus === "healthy").length,
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(["critical", "action", "watch", "healthy"] as const).map((status) => (
          <div key={status} className="rounded-xl border border-white/10 bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-text-muted">
                {status === "action" ? "Needs Action" : status}
              </p>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${STATUS_CLASSES[status]}`}
              >
                {status}
              </span>
            </div>
            <p className="mt-2 font-serif text-2xl font-bold text-text-primary">{counts[status]}</p>
            <p className="mt-1 text-xs text-text-muted">
              {status === "healthy"
                ? "questions performing with acceptable signal and low friction"
                : "questions currently landing in this portfolio state"}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search question, Q ID, or issue..."
            className={`${INPUT_CLASS} min-w-[240px] flex-1`}
          />
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as ProductPortfolioStatus | "all")
            }
            className={INPUT_CLASS}
          >
            <option value="all">All states</option>
            <option value="critical">Critical</option>
            <option value="action">Needs action</option>
            <option value="watch">Watch</option>
            <option value="healthy">Healthy</option>
          </select>
          <select
            value={chapterFilter}
            onChange={(event) => setChapterFilter(event.target.value)}
            className={INPUT_CLASS}
          >
            <option value="all">All chapters</option>
            {chapterOptions.map((chapter) => (
              <option key={chapter} value={chapter}>
                Chapter {chapter}
              </option>
            ))}
          </select>
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-text-muted">
            Showing {filtered.length} of {data.portfolio.length} questions
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Portfolio Spotlight</h3>
            <p className="mt-1 text-xs text-text-muted">
              Highest-ranked questions by combined friction, signal, abandonment, confusion, and
              quality risk.
            </p>
          </div>
          <a
            href="/admin/research"
            className="text-xs text-text-muted transition hover:text-text-primary"
          >
            Open Research
          </a>
        </div>

        <div className="mt-4 space-y-4">
          {spotlight.map((item) => (
            <div key={item.qId} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                      #{item.rank}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${STATUS_CLASSES[item.portfolioStatus]}`}
                    >
                      {item.portfolioStatus}
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                      {item.qId}
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                      chapter {item.chapterId}
                    </span>
                  </div>
                  <p className="mt-3 text-base font-semibold text-text-primary">
                    {item.questionText}
                  </p>
                  <p className="mt-1 text-sm text-text-muted">
                    {topReasonPreview(item) || item.recommendation}
                  </p>
                </div>
                <div className="grid gap-2 text-right text-xs text-text-muted sm:grid-cols-2">
                  <div>
                    <p>Attention</p>
                    <p className="mt-1 text-lg font-semibold text-text-primary">
                      {item.attentionScore}
                    </p>
                  </div>
                  <div>
                    <p>Signal</p>
                    <p className="mt-1 text-lg font-semibold text-text-primary">
                      {item.signalScore}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <MetricCard label="Lifecycle" value={item.lifecycleAction} />
                <MetricCard label="Effectiveness" value={String(item.effectivenessScore)} />
                <MetricCard label="Quality" value={metricLabel(item.qualityScore)} />
                <MetricCard label="Pain Mentions" value={String(item.painMentions)} />
                <MetricCard label="Primary Context" value={item.dominantContext ?? "—"} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {item.reasons.slice(0, 5).map((reason) => (
                  <span
                    key={`${item.qId}-${reason}`}
                    className="rounded-full border border-white/10 bg-surface px-3 py-1 text-xs text-text-muted"
                  >
                    {reason}
                  </span>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-3 text-xs">
                <a
                  href={item.hrefs.effectiveness}
                  className="text-text-muted transition hover:text-text-primary"
                >
                  Effectiveness
                </a>
                <a
                  href={item.hrefs.scorecard}
                  className="text-text-muted transition hover:text-text-primary"
                >
                  Scorecard
                </a>
                <a
                  href={item.hrefs.lifecycle}
                  className="text-text-muted transition hover:text-text-primary"
                >
                  Lifecycle
                </a>
                <a
                  href={item.hrefs.research}
                  className="text-text-muted transition hover:text-text-primary"
                >
                  Research
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border border-white/10 bg-surface">
        <table className="w-full min-w-[1120px] text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/5 text-left text-text-muted">
              <th className="px-4 py-3 font-medium">Rank</th>
              <th className="px-4 py-3 font-medium">Question</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Attention</th>
              <th className="px-4 py-3 text-right font-medium">Signal</th>
              <th className="px-4 py-3 text-right font-medium">Completion</th>
              <th className="px-4 py-3 text-right font-medium">Skip</th>
              <th className="px-4 py-3 text-right font-medium">Backtrack</th>
              <th className="px-4 py-3 text-right font-medium">Quality</th>
              <th className="px-4 py-3 text-right font-medium">Pain</th>
              <th className="px-4 py-3 font-medium">Context</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.qId} className="border-b border-white/5 transition hover:bg-white/5">
                <td className="px-4 py-3 text-text-primary">{item.rank}</td>
                <td className="px-4 py-3">
                  <div className="max-w-[360px]">
                    <p className="font-medium text-text-primary">
                      {item.qId} · {item.questionText}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      Chapter {item.chapterId} · {topReasonPreview(item) || item.recommendation}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${STATUS_CLASSES[item.portfolioStatus]}`}
                  >
                    {item.portfolioStatus}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-text-primary">{item.attentionScore}</td>
                <td className="px-4 py-3 text-right text-text-primary">{item.signalScore}</td>
                <td className="px-4 py-3 text-right text-text-primary">{item.completionRate}%</td>
                <td className="px-4 py-3 text-right text-text-primary">{item.skipRate}%</td>
                <td className="px-4 py-3 text-right text-text-primary">{item.backtrackRate}%</td>
                <td className="px-4 py-3 text-right text-text-primary">
                  {metricLabel(item.qualityScore)}
                </td>
                <td className="px-4 py-3 text-right text-text-primary">{item.painMentions}</td>
                <td className="px-4 py-3 text-text-muted">{item.dominantContext ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface px-3 py-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-text-primary">{value}</p>
    </div>
  );
}
