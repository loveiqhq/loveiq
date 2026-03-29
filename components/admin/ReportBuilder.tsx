"use client";

import { useState, useCallback } from "react";
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
    format: (v) => (v != null ? `${v} min` : "\u2014"),
  },
  { key: "waitlistTotal", label: "Waitlist Signups" },
  { key: "scoredCount", label: "Scored" },
];

export default function ReportBuilder() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/report-snapshot?days=${days}`, {
        headers: { "x-csrf-token": getCsrfToken() },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          (body as { error?: string } | null)?.error || `Request failed: ${res.status}`
        );
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  const handleCopyLink = useCallback(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const periodLabel =
    days === 0
      ? "All Time"
      : days === 1
        ? "Last 24 Hours"
        : days === 365
          ? "Last 1 Year"
          : `Last ${days} Days`;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-serif text-xl font-bold text-text-primary">Report Builder</h2>
        <div className="flex items-center gap-3">
          <TimeRangeSelector value={days} onChange={setDays} />
          <button
            onClick={generate}
            disabled={loading}
            className="rounded-lg bg-accent-purple px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-purple/80 disabled:opacity-50"
          >
            {loading ? "Generating\u2026" : "Generate Report"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-surface px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/5"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print / Save PDF
            </button>
            <button
              onClick={handleCopyLink}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-surface px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/5"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                <path d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              {copied ? "Coming soon!" : "Copy Link"}
            </button>
          </div>

          {/* Printable report */}
          <div id="printable-report" className="space-y-8 print:bg-white print:text-black">
            <style>{`
              @media print {
                body * { visibility: hidden; }
                #printable-report, #printable-report * { visibility: visible; }
                #printable-report { position: absolute; left: 0; top: 0; width: 100%; padding: 2rem; }
              }
            `}</style>

            {/* Header */}
            <div className="border-b border-white/10 pb-6 print:border-black/10">
              <h1 className="font-serif text-3xl font-bold text-text-primary print:text-black">
                LoveIQ Analytics Report
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
                by {data.generatedBy} &mdash; {periodLabel}
              </p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {summaryCards.map((card) => {
                const raw = data.summary[card.key];
                const display = card.format ? card.format(raw) : String(raw ?? "\u2014");
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

            {/* Archetype Breakdown */}
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

            {/* Daily Trend */}
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

            {/* Footer */}
            <div className="border-t border-white/10 pt-4 print:border-black/10">
              <p className="text-xs text-text-muted print:text-gray-400">
                LoveIQ &middot; Confidential &middot; Generated automatically
              </p>
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {!data && !loading && !error && (
        <div className="rounded-xl border border-white/10 bg-surface p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-text-muted"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          <h3 className="mt-4 font-serif text-lg font-semibold text-text-primary">
            Generate a Report
          </h3>
          <p className="mt-2 text-sm text-text-muted">
            Select a time range and click &ldquo;Generate Report&rdquo; to compile your analytics
            snapshot.
          </p>
        </div>
      )}
    </div>
  );
}
