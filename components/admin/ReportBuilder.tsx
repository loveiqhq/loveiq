"use client";

import { useCallback, useMemo, useState } from "react";
import TimeRangeSelector from "./TimeRangeSelector";
import { getCsrfToken } from "@/lib/csrf-client";

interface ReportData {
  generatedAt: string;
  generatedBy: string;
  period: { days: number; since: string };
  summary: {
    totalSubmissions: number;
    completed: number;
    completionRate: number;
    avgDurationMin: number | null;
    waitlistTotal: number;
    scoredCount: number;
  };
  archetypeBreakdown: Array<{ name: string; count: number }>;
  dailyTrend: Array<{ date: string; count: number }>;
}

interface ExecutiveMemoData {
  generatedAt: string;
  generatedBy: string;
  period: { days: number; since: string };
  headline: string;
  metrics: {
    submissions: { current: number; prior: number; delta: number };
    completionRate: { current: number; prior: number; delta: number };
    waitlist: { current: number; prior: number; delta: number };
    activeExperiments: number;
    openInvestigations: number;
    reportCoverage: number;
    paidConversions: number;
  };
  sections: {
    wins: MemoItem[];
    risks: MemoItem[];
    watchlist: MemoItem[];
    decisions: MemoItem[];
    actions: MemoItem[];
  };
  trust: {
    source: string;
    mode: string;
    sampleSize: number;
    lastUpdated: string | null;
    freshnessHours: number | null;
    warning: string | null;
  };
}

interface MemoItem {
  title: string;
  detail: string;
  href: string;
}

const summaryCards: Array<{
  key: keyof ReportData["summary"];
  label: string;
  format?: (v: number | null) => string;
}> = [
  { key: "totalSubmissions", label: "Total Submissions" },
  { key: "completed", label: "Completed" },
  { key: "completionRate", label: "Completion Rate", format: (v) => `${v ?? 0}%` },
  {
    key: "avgDurationMin",
    label: "Avg Duration",
    format: (v) => (v != null ? `${v} min` : "—"),
  },
  { key: "waitlistTotal", label: "Waitlist Signups" },
  { key: "scoredCount", label: "Scored" },
];

const VIEW_TABS = ["Analytics Snapshot", "Executive Memo"] as const;
type ViewTab = (typeof VIEW_TABS)[number];
const reportRangeOptions = [
  { days: 7, label: "7d", ariaLabel: "Last 7 days" },
  { days: 30, label: "30d", ariaLabel: "Last 30 days" },
  { days: 90, label: "90d", ariaLabel: "Last 90 days" },
  { days: 180, label: "180d", ariaLabel: "Last 180 days" },
] as const;

function formatSigned(value: number, suffix = "") {
  if (value === 0) return `0${suffix}`;
  return `${value > 0 ? "+" : ""}${value}${suffix}`;
}

function formatPeriodLabel(days: number) {
  if (days === 0) return "All Time";
  if (days === 1) return "Last 24 Hours";
  if (days === 365) return "Last 1 Year";
  return `Last ${days} Days`;
}

function MemoSection({ title, items }: { title: string; items: MemoItem[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-surface p-5">
      <h3 className="font-serif text-lg font-semibold text-text-primary">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.length === 0 && (
          <p className="text-sm text-text-muted">No notable items in this lane.</p>
        )}
        {items.map((item) => (
          <a
            key={`${title}-${item.title}`}
            href={item.href}
            className="block rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/20 hover:bg-white/[0.07]"
          >
            <p className="text-sm font-medium text-text-primary">{item.title}</p>
            <p className="mt-2 text-sm text-text-muted">{item.detail}</p>
          </a>
        ))}
      </div>
    </div>
  );
}

export default function ReportBuilder() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ReportData | null>(null);
  const [memo, setMemo] = useState<ExecutiveMemoData | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>("Analytics Snapshot");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [snapshotRes, memoRes] = await Promise.all([
        fetch(`/api/admin/report-snapshot?days=${days}`, {
          headers: { "x-csrf-token": getCsrfToken() },
        }),
        fetch(`/api/admin/executive-memo?days=${days}`, {
          headers: { "x-csrf-token": getCsrfToken() },
        }),
      ]);

      const [snapshotBody, memoBody] = await Promise.all([
        snapshotRes.json().catch(() => null),
        memoRes.json().catch(() => null),
      ]);

      if (!snapshotRes.ok) {
        throw new Error(
          (snapshotBody as { error?: string } | null)?.error ||
            `Request failed: ${snapshotRes.status}`
        );
      }
      if (!memoRes.ok) {
        throw new Error(
          (memoBody as { error?: string } | null)?.error || `Request failed: ${memoRes.status}`
        );
      }

      setData(snapshotBody as ReportData);
      setMemo(memoBody as ExecutiveMemoData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setData(null);
      setMemo(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  const handleCopy = useCallback(async () => {
    const text =
      activeTab === "Executive Memo" && memo
        ? [
            memo.headline,
            ...memo.sections.actions.map((item) => `Action: ${item.title} — ${item.detail}`),
          ].join("\n")
        : data
          ? [
              `LoveIQ analytics snapshot`,
              `Submissions: ${data.summary.totalSubmissions}`,
              `Completed: ${data.summary.completed}`,
              `Completion rate: ${data.summary.completionRate}%`,
              `Waitlist: ${data.summary.waitlistTotal}`,
            ].join("\n")
          : "";

    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [activeTab, data, memo]);

  const effectivePeriodDays = memo?.period?.days ?? data?.period?.days ?? days;
  const periodLabel = formatPeriodLabel(effectivePeriodDays);

  const memoMetricCards = useMemo(
    () =>
      memo
        ? [
            {
              label: "Submissions",
              value: `${memo.metrics.submissions.current}`,
              detail: `${formatSigned(memo.metrics.submissions.delta)} vs prior window`,
            },
            {
              label: "Completion Rate",
              value: `${memo.metrics.completionRate.current}%`,
              detail: `${formatSigned(memo.metrics.completionRate.delta, " pts")} vs prior`,
            },
            {
              label: "Waitlist",
              value: `${memo.metrics.waitlist.current}`,
              detail: `${formatSigned(memo.metrics.waitlist.delta)} vs prior window`,
            },
            {
              label: "Open Investigations",
              value: `${memo.metrics.openInvestigations}`,
              detail: `${memo.metrics.activeExperiments} active experiments`,
            },
          ]
        : [],
    [memo]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-xl font-bold text-text-primary">Report Builder</h2>
          <p className="mt-1 text-sm text-text-muted">
            Generate a numeric snapshot and an executive memo from the same admin truth layer.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TimeRangeSelector value={days} onChange={setDays} options={reportRangeOptions} />
          <button
            onClick={generate}
            disabled={loading}
            className="rounded-lg bg-accent-purple px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-purple/80 disabled:opacity-50"
          >
            {loading ? "Generating…" : "Generate Report"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      {data && memo && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 rounded-lg border border-white/10 bg-surface p-1">
              {VIEW_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                    activeTab === tab
                      ? "bg-white/10 text-text-primary"
                      : "text-text-muted hover:bg-white/5 hover:text-text-primary"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-surface px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/5"
              >
                Print / Save PDF
              </button>
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-surface px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/5"
              >
                {copied ? "Copied" : activeTab === "Executive Memo" ? "Copy Memo" : "Copy Snapshot"}
              </button>
            </div>
          </div>

          <div id="printable-report" className="space-y-8 print:bg-white print:text-black">
            <style>{`
              @media print {
                body * { visibility: hidden; }
                #printable-report, #printable-report * { visibility: visible; }
                #printable-report { position: absolute; left: 0; top: 0; width: 100%; padding: 2rem; }
              }
            `}</style>

            <div className="border-b border-white/10 pb-6 print:border-black/10">
              <h1 className="font-serif text-3xl font-bold text-text-primary print:text-black">
                {activeTab === "Executive Memo"
                  ? "LoveIQ Executive Memo"
                  : "LoveIQ Analytics Report"}
              </h1>
              <p className="mt-2 text-sm text-text-muted print:text-gray-500">
                Generated{" "}
                {new Date(data.generatedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                by {data.generatedBy} · {periodLabel}
              </p>
            </div>

            {activeTab === "Analytics Snapshot" && (
              <>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {summaryCards.map((card) => {
                    const raw = data.summary[card.key];
                    const display = card.format ? card.format(raw) : String(raw ?? "—");
                    return (
                      <div
                        key={card.key}
                        className="rounded-xl border border-white/10 bg-surface p-5 print:border-gray-200 print:bg-gray-50"
                      >
                        <p className="text-sm text-text-muted print:text-gray-500">{card.label}</p>
                        <p className="mt-1 font-serif text-2xl font-bold text-text-primary print:text-black">
                          {display}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {data.archetypeBreakdown.length > 0 && (
                  <div>
                    <h2 className="mb-4 font-serif text-xl font-bold text-text-primary print:text-black">
                      Archetype Distribution
                    </h2>
                    <div className="overflow-hidden rounded-xl border border-white/10 print:border-gray-200">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10 bg-white/5 print:border-gray-200 print:bg-gray-100">
                            <th className="px-4 py-3 text-left font-semibold text-text-primary print:text-black">
                              Archetype
                            </th>
                            <th className="px-4 py-3 text-right font-semibold text-text-primary print:text-black">
                              Count
                            </th>
                            <th className="px-4 py-3 text-left font-semibold text-text-primary print:text-black">
                              Distribution
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.archetypeBreakdown.map((arch) => {
                            const total = data.summary.scoredCount || 1;
                            const pct = Math.round((arch.count / total) * 100);
                            return (
                              <tr
                                key={arch.name}
                                className="border-b border-white/5 last:border-0 print:border-gray-100"
                              >
                                <td className="px-4 py-3 text-text-primary print:text-black">
                                  {arch.name}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums text-text-primary print:text-black">
                                  {arch.count}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10 print:bg-gray-200">
                                      <div
                                        className="h-full rounded-full bg-accent-purple print:bg-purple-500"
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    <span className="w-10 text-right text-xs tabular-nums text-text-muted print:text-gray-500">
                                      {pct}%
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {data.dailyTrend.length > 0 && (
                  <div>
                    <h2 className="mb-4 font-serif text-xl font-bold text-text-primary print:text-black">
                      Submission Trend
                    </h2>
                    <div className="overflow-hidden rounded-xl border border-white/10 p-5 print:border-gray-200">
                      <div className="flex items-end gap-px" style={{ height: 160 }}>
                        {(() => {
                          const max = Math.max(...data.dailyTrend.map((d) => d.count), 1);
                          return data.dailyTrend.map((d) => {
                            const h = Math.max((d.count / max) * 100, 2);
                            return (
                              <div
                                key={d.date}
                                className="group flex flex-1 flex-col items-center gap-1"
                              >
                                <span className="text-[9px] tabular-nums text-text-muted opacity-0 transition group-hover:opacity-100 print:opacity-100 print:text-gray-500">
                                  {d.count}
                                </span>
                                <div
                                  className="w-full rounded-t bg-accent-purple/70 transition-all group-hover:bg-accent-purple print:bg-purple-400"
                                  style={{ height: `${h}%` }}
                                />
                                {data.dailyTrend.length <= 31 && (
                                  <span className="mt-1 text-[8px] text-text-muted print:text-gray-500">
                                    {d.date.slice(5)}
                                  </span>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === "Executive Memo" && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-white/10 bg-surface p-6">
                  <p className="text-xs uppercase tracking-[0.24em] text-text-muted">
                    Executive Readout
                  </p>
                  <h2 className="mt-3 font-serif text-2xl font-semibold text-text-primary">
                    {memo.headline}
                  </h2>
                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {memoMetricCards.map((card) => (
                      <div
                        key={card.label}
                        className="rounded-xl border border-white/10 bg-white/5 p-4"
                      >
                        <p className="text-xs uppercase tracking-wider text-text-muted">
                          {card.label}
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-text-primary">
                          {card.value}
                        </p>
                        <p className="mt-2 text-xs text-text-muted">{card.detail}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-sm text-text-muted">
                    Trust: {memo.trust.mode} sample of {memo.trust.sampleSize} rows.
                    {memo.trust.warning ? ` ${memo.trust.warning}` : ""}
                  </p>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <MemoSection title="Wins" items={memo.sections.wins} />
                  <MemoSection title="Risks" items={memo.sections.risks} />
                  <MemoSection title="Watchlist" items={memo.sections.watchlist} />
                  <MemoSection title="Decisions" items={memo.sections.decisions} />
                </div>

                <MemoSection title="Recommended Actions" items={memo.sections.actions} />
              </div>
            )}

            <div className="border-t border-white/10 pt-4 print:border-black/10">
              <p className="text-xs text-text-muted print:text-gray-400">
                LoveIQ · Confidential · Generated automatically
              </p>
            </div>
          </div>
        </>
      )}

      {!data && !memo && !loading && !error && (
        <div className="rounded-xl border border-white/10 bg-surface p-12 text-center">
          <h3 className="font-serif text-lg font-semibold text-text-primary">Generate a Report</h3>
          <p className="mt-2 text-sm text-text-muted">
            Select a time range and generate both the analytics snapshot and the executive memo in
            one pass.
          </p>
        </div>
      )}
    </div>
  );
}
