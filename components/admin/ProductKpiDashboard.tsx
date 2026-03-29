"use client";

import { useState, useMemo, useCallback } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";
import TimeRangeSelector from "@/components/admin/TimeRangeSelector";
import ReportSectionsTab from "@/components/admin/kpi-tabs/ReportSectionsTab";
import QuestionsTab from "@/components/admin/kpi-tabs/QuestionsTab";
import ChaptersTab from "@/components/admin/kpi-tabs/ChaptersTab";
import DiscriminationTab from "@/components/admin/kpi-tabs/DiscriminationTab";
import type { ReportSectionKpi, QuestionKpi, ChapterKpi } from "@/data/product-kpis";

interface ProductKpiData {
  reportSections: ReportSectionKpi[];
  questions: QuestionKpi[];
  chapters: ChapterKpi[];
  meta?: {
    windowDays: number;
    windowLabel: string;
    totalSessions: number;
    dataSources: {
      reportSections: {
        source: "sample";
        itemCount: number;
        label: string;
      };
      questions: {
        source: "live";
        itemCount: number;
        coveragePct: number;
        label: string;
      };
      chapters: {
        source: "live";
        itemCount: number;
        coveragePct: number;
        label: string;
      };
    };
    warnings: string[];
  };
}

const tabs = ["Report Sections", "Survey Questions", "Survey Chapters", "Discrimination"] as const;
type Tab = (typeof tabs)[number];

function escapeCSV(value: string): string {
  if (/^[=+\-@]/.test(value)) value = "'" + value;
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(escapeCSV).join(","),
    ...rows.map((row) =>
      headers.map((h) => escapeCSV(row[h] == null ? "" : String(row[h]))).join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function sourceBadge(source: "live" | "sample") {
  return source === "live"
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
    : "border-amber-500/20 bg-amber-500/10 text-amber-300";
}

export default function ProductKpiDashboard() {
  const [days, setDays] = useState(0);
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<ProductKpiData>("/api/admin/product-kpis", params);
  const [activeTab, setActiveTab] = useState<Tab>("Report Sections");
  const [selectedChapter, setSelectedChapter] = useState("all");

  const stats = useMemo(() => {
    if (!data) return null;

    const highestFriction = data.reportSections
      .filter((s) => s.frictionIndex != null)
      .reduce(
        (max, s) => ((s.frictionIndex ?? -Infinity) > (max.frictionIndex ?? -Infinity) ? s : max),
        data.reportSections[0]
      );

    const chaptersWithData = data.chapters.filter((c) => c.completionPct != null);
    const avgCompletion =
      chaptersWithData.length > 0
        ? chaptersWithData.reduce((sum, c) => sum + (c.completionPct ?? 0), 0) /
          chaptersWithData.length
        : 0;

    return {
      totalSections: data.reportSections.length,
      totalQuestions: data.questions.length,
      totalChapters: data.chapters.length,
      highestFrictionSection: highestFriction
        ? `S${highestFriction.index}: ${highestFriction.section}`
        : "—",
      highestFrictionValue: highestFriction?.frictionIndex?.toFixed(2) ?? "—",
      avgCompletion: `${avgCompletion.toFixed(1)}%`,
    };
  }, [data]);

  const handleDownload = useCallback(() => {
    if (!data) return;
    const dateStr = new Date().toISOString().slice(0, 10);
    if (activeTab === "Report Sections") {
      downloadCsv(
        data.reportSections as unknown as Record<string, unknown>[],
        `kpi-report-sections-${dateStr}.csv`
      );
    } else if (activeTab === "Survey Questions") {
      const filtered =
        selectedChapter === "all"
          ? data.questions
          : data.questions.filter((q) => q.cId === selectedChapter);
      const suffix = selectedChapter === "all" ? "" : `-ch${selectedChapter}`;
      downloadCsv(
        filtered as unknown as Record<string, unknown>[],
        `kpi-questions${suffix}-${dateStr}.csv`
      );
    } else {
      downloadCsv(
        data.chapters as unknown as Record<string, unknown>[],
        `kpi-chapters-${dateStr}.csv`
      );
    }
  }, [data, activeTab, selectedChapter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-purple border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center text-red-300">
        {error || "Failed to load KPI data."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Time range */}
      <div className="flex items-center justify-between">
        <TimeRangeSelector value={days} onChange={setDays} />
      </div>

      {data.meta && (
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Data Trust & Coverage</h3>
              <p className="mt-1 text-xs text-text-muted">
                {data.meta.windowLabel} · {data.meta.totalSessions.toLocaleString()} sessions
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-text-muted">
              Mixed live + sample sources
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {Object.entries(data.meta.dataSources).map(([key, source]) => (
              <div key={key} className="rounded-lg border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-text-primary">
                    {key === "reportSections"
                      ? "Report Sections"
                      : key === "questions"
                        ? "Survey Questions"
                        : "Survey Chapters"}
                  </p>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sourceBadge(
                      source.source
                    )}`}
                  >
                    {source.source}
                  </span>
                </div>
                <p className="mt-1 text-xs text-text-muted">{source.label}</p>
                <p className="mt-3 text-lg font-semibold text-text-primary">
                  {source.itemCount.toLocaleString()}
                  {"coveragePct" in source && (
                    <span className="ml-2 text-xs font-medium text-text-muted">
                      {source.coveragePct}% coverage
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>

          {data.meta.warnings.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
                Warnings
              </p>
              <div className="mt-2 space-y-2">
                {data.meta.warnings.map((warning) => (
                  <p key={warning} className="text-sm text-amber-100/90">
                    {warning}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Report Sections" value={stats?.totalSections ?? 0} />
        <StatCard label="Survey Questions" value={stats?.totalQuestions ?? 0} />
        <StatCard label="Survey Chapters" value={stats?.totalChapters ?? 0} />
        <StatCard
          label="Highest Friction"
          value={stats?.highestFrictionValue ?? "—"}
          sub={stats?.highestFrictionSection}
        />
        <StatCard
          label="Avg Completion"
          value={stats?.avgCompletion ?? "—"}
          sub="across chapters"
        />
      </div>

      {/* Tab selector + download */}
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1 rounded-lg border border-white/10 bg-surface p-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
                activeTab === tab
                  ? "bg-white/10 text-text-primary"
                  : "text-text-muted hover:bg-white/5 hover:text-text-primary"
              }`}
            >
              {tab}
              {tab === "Report Sections" &&
                data.meta?.dataSources.reportSections.source === "sample" && (
                  <span className="ml-1.5 rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-medium text-yellow-400">
                    sample
                  </span>
                )}
              {tab === "Survey Questions" && data.meta?.dataSources.questions.source === "live" && (
                <span className="ml-1.5 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                  live
                </span>
              )}
              {tab === "Survey Chapters" && data.meta?.dataSources.chapters.source === "live" && (
                <span className="ml-1.5 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                  live
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          onClick={handleDownload}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-surface px-4 py-2 text-sm font-medium text-text-muted transition hover:bg-white/5 hover:text-text-primary"
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
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          Download CSV
        </button>
      </div>

      {/* Active tab */}
      {activeTab === "Report Sections" && <ReportSectionsTab data={data.reportSections} />}
      {activeTab === "Survey Questions" && (
        <QuestionsTab
          data={data.questions}
          selectedChapter={selectedChapter}
          onChapterChange={setSelectedChapter}
        />
      )}
      {activeTab === "Survey Chapters" && <ChaptersTab data={data.chapters} />}
      {activeTab === "Discrimination" && <DiscriminationTab days={days} />}
    </div>
  );
}
