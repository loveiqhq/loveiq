"use client";

import { useMemo, useCallback } from "react";
import EmbeddedIntelligencePanel from "@/components/admin/EmbeddedIntelligencePanel";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import { useAdminQueryState } from "@/components/admin/hooks/useAdminQueryState";
import StatCard from "@/components/admin/StatCard";
import TimeRangeSelector from "@/components/admin/TimeRangeSelector";
import ReportSectionsTab from "@/components/admin/kpi-tabs/ReportSectionsTab";
import QuestionsTab from "@/components/admin/kpi-tabs/QuestionsTab";
import ChaptersTab from "@/components/admin/kpi-tabs/ChaptersTab";
import DiscriminationTab from "@/components/admin/kpi-tabs/DiscriminationTab";
import ExperienceHealthTab from "@/components/admin/kpi-tabs/ExperienceHealthTab";
import FeatureAdoptionTab from "@/components/admin/kpi-tabs/FeatureAdoptionTab";
import ProductIssueRadarTab from "@/components/admin/kpi-tabs/ProductIssueRadarTab";
import QuestionPortfolioTab from "@/components/admin/kpi-tabs/QuestionPortfolioTab";
import WhatChangedOverlay from "@/components/admin/WhatChangedOverlay";
import {
  PRODUCT_KPI_TABS,
  buildFunnelsHref,
  buildScorecardHref,
  parseAdminDays,
  parseProductKpiTab,
} from "@/lib/admin/drilldowns";
import type { ReportSectionKpi, QuestionKpi, ChapterKpi } from "@/data/product-kpis";
import type { ProductIssueRadarSnapshot } from "@/lib/admin/product-issue-types";

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

function escapeCSV(value: string): string {
  if (/^[=+\-@]/.test(value)) value = "'" + value;
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  if (rows.length === 0) return;
  // rows.length > 0 checked above.
  const headers = Object.keys(rows[0]!);
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
  const { searchParams, setQueryState } = useAdminQueryState();
  const days = parseAdminDays(searchParams.get("days"));
  const activeTab = parseProductKpiTab(searchParams.get("tab"));
  const selectedChapter = searchParams.get("chapter") || "all";
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<ProductKpiData>("/api/admin/product-kpis", params);
  const {
    data: issueRadarData,
    loading: issueRadarLoading,
    error: issueRadarError,
  } = useAdminFetch<ProductIssueRadarSnapshot>("/api/admin/product-kpis/issues", params);

  const stats = useMemo(() => {
    if (!data) return null;

    // reduce's seed is the first element; if the filtered array is empty, the
    // reduce returns it directly. `highestFriction` may legitimately be undefined
    // when data.reportSections itself is empty — handle below.
    const highestFriction = data.reportSections
      .filter((s) => s.frictionIndex != null)
      .reduce<
        (typeof data.reportSections)[number] | undefined
      >((max, s) => (max == null || (s.frictionIndex ?? -Infinity) > (max.frictionIndex ?? -Infinity) ? s : max), data.reportSections[0]);

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
    } else if (activeTab === "Survey Chapters") {
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
        <div className="flex items-center gap-3">
          <WhatChangedOverlay days={days} triggerLabel="What changed?" />
          <TimeRangeSelector
            value={days}
            onChange={(value) => setQueryState({ days: value > 0 ? value : null })}
          />
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-white/10 bg-surface p-4 sm:grid-cols-2 xl:grid-cols-3">
        <a
          href={buildScorecardHref({
            days,
            tab: activeTab === "Discrimination" ? "Trends" : "Scorecard",
          })}
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/20 hover:bg-white/10"
        >
          <p className="text-[11px] uppercase tracking-wide text-text-muted">Cross Drilldown</p>
          <p className="mt-1 text-sm font-semibold text-text-primary">Open Question Scorecard</p>
          <p className="mt-1 text-xs text-text-muted">
            Carry the current time window into question quality diagnostics.
          </p>
        </a>
        <a
          href={buildFunnelsHref({
            days,
            tab:
              activeTab === "Feature Adoption" || activeTab === "Discrimination"
                ? "Impact Comparison"
                : activeTab === "Survey Questions" || activeTab === "Survey Chapters"
                  ? "Cohort Analysis"
                  : "Conversion Funnel",
            groupBy:
              activeTab === "Survey Questions" || activeTab === "Survey Chapters"
                ? "utm"
                : undefined,
            comparison:
              activeTab === "Feature Adoption"
                ? "release"
                : activeTab === "Discrimination"
                  ? "version"
                  : undefined,
          })}
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/20 hover:bg-white/10"
        >
          <p className="text-[11px] uppercase tracking-wide text-text-muted">Cross Drilldown</p>
          <p className="mt-1 text-sm font-semibold text-text-primary">Open Funnel View</p>
          <p className="mt-1 text-xs text-text-muted">
            Jump from product friction into funnel cohorts, launch impact, or scoring-version
            comparison.
          </p>
        </a>
        <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-text-muted">Focused State</p>
          <p className="mt-1 text-sm font-semibold text-text-primary">
            {activeTab}
            {activeTab === "Survey Questions" && selectedChapter !== "all"
              ? ` · Chapter ${selectedChapter}`
              : ""}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            The current tab and chapter filter now persist in the URL for shareable drilldowns.
          </p>
        </div>
      </div>

      <EmbeddedIntelligencePanel surface="product" days={days || 30} title="Product Copilot" />
      <EmbeddedIntelligencePanel
        endpoint="/api/admin/explanations"
        surface="product"
        days={days || 30}
        title="Product Explanations"
      />
      <EmbeddedIntelligencePanel
        endpoint="/api/admin/path-intelligence"
        surface="product"
        days={days || 30}
        title="Product Path Intelligence"
      />
      <EmbeddedIntelligencePanel
        endpoint="/api/admin/lifecycle-intelligence"
        surface="product"
        days={days || 30}
        title="Product Lifecycle Intelligence"
      />

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
          {PRODUCT_KPI_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setQueryState({ tab })}
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
          disabled={
            activeTab === "Experience Health" ||
            activeTab === "Feature Adoption" ||
            activeTab === "Issue Radar" ||
            activeTab === "Question Portfolio"
          }
          className="flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-surface px-4 py-2 text-sm font-medium text-text-muted transition hover:bg-white/5 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
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
      {activeTab === "Experience Health" && <ExperienceHealthTab days={days} />}
      {activeTab === "Issue Radar" && (
        <ProductIssueRadarTab
          data={issueRadarData}
          loading={issueRadarLoading}
          error={issueRadarError}
        />
      )}
      {activeTab === "Question Portfolio" && (
        <QuestionPortfolioTab
          data={issueRadarData}
          loading={issueRadarLoading}
          error={issueRadarError}
        />
      )}
      {activeTab === "Survey Questions" && (
        <QuestionsTab
          data={data.questions}
          selectedChapter={selectedChapter}
          onChapterChange={(chapter) =>
            setQueryState({ chapter: chapter === "all" ? null : chapter, tab: "Survey Questions" })
          }
        />
      )}
      {activeTab === "Survey Chapters" && <ChaptersTab data={data.chapters} />}
      {activeTab === "Discrimination" && <DiscriminationTab days={days} />}
      {activeTab === "Feature Adoption" && <FeatureAdoptionTab days={days} />}
    </div>
  );
}
