"use client";

import { useState, useMemo, useCallback } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";
import ReportSectionsTab from "@/components/admin/kpi-tabs/ReportSectionsTab";
import QuestionsTab from "@/components/admin/kpi-tabs/QuestionsTab";
import ChaptersTab from "@/components/admin/kpi-tabs/ChaptersTab";
import type { ReportSectionKpi, QuestionKpi, ChapterKpi } from "@/data/product-kpis";

interface ProductKpiData {
  reportSections: ReportSectionKpi[];
  questions: QuestionKpi[];
  chapters: ChapterKpi[];
}

const tabs = ["Report Sections", "Survey Questions", "Survey Chapters"] as const;
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

export default function ProductKpiDashboard() {
  const { data, loading, error } = useAdminFetch<ProductKpiData>("/api/admin/product-kpis");
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
    </div>
  );
}
