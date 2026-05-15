"use client";

import { useMemo } from "react";
import BarChart from "@features/admin/ui/BarChart";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import KpiDataTable, { type Column } from "@features/admin/ui/kpi-tabs/KpiDataTable";
import StatCard from "@features/admin/ui/StatCard";

interface CreativeRow {
  creativeKey: string;
  source: string;
  medium: string;
  campaign: string;
  content: string;
  theme: string;
  starts: number;
  completionRate: number;
  scoredRate: number;
  reportViewRate: number;
  paidRate: number;
  recoveryRate: number;
  revenuePerStart: number;
  revenueTotal: number;
  qualityScore: number;
  confidence: "high" | "medium" | "low";
  attention: "scale" | "watch" | "fix" | "blindspot";
}

interface ThemeRow {
  theme: string;
  creatives: number;
  starts: number;
  completionRate: number;
  paidRate: number;
  revenueTotal: number;
  topCreative: string;
  confidence: "high" | "medium" | "low";
}

interface Recommendation {
  title: string;
  detail: string;
  tone: "scale" | "watch" | "risk" | "blindspot";
}

interface CreativeIntelligenceData {
  generatedAt: string;
  summary: {
    creatives: number;
    messageThemes: number;
    trackedStarts: number;
    highConfidenceWinners: number;
    blindspotStarts: number;
    avgPaidRate: number;
  };
  creatives: CreativeRow[];
  messageThemes: ThemeRow[];
  recommendations: Recommendation[];
  trust: {
    warning: string | null;
  };
}

const creativeColumns: Column<CreativeRow>[] = [
  { key: "source", label: "Source" },
  { key: "medium", label: "Medium" },
  { key: "campaign", label: "Campaign" },
  { key: "content", label: "Content" },
  { key: "theme", label: "Theme" },
  { key: "attention", label: "Attention" },
  { key: "confidence", label: "Confidence" },
  { key: "starts", label: "Starts", align: "right" },
  { key: "completionRate", label: "Completion", align: "right", format: (value) => `${value}%` },
  { key: "paidRate", label: "Paid", align: "right", format: (value) => `${value}%` },
  { key: "recoveryRate", label: "Recovery", align: "right", format: (value) => `${value}%` },
  { key: "qualityScore", label: "Quality", align: "right", format: (value) => `${value}` },
  { key: "revenuePerStart", label: "Rev / Start", align: "right", format: (value) => `$${value}` },
];

const themeColumns: Column<ThemeRow>[] = [
  { key: "theme", label: "Theme" },
  { key: "creatives", label: "Creatives", align: "right" },
  { key: "starts", label: "Starts", align: "right" },
  { key: "completionRate", label: "Completion", align: "right", format: (value) => `${value}%` },
  { key: "paidRate", label: "Paid", align: "right", format: (value) => `${value}%` },
  { key: "revenueTotal", label: "Revenue", align: "right", format: (value) => `$${value}` },
  { key: "topCreative", label: "Top Creative" },
  { key: "confidence", label: "Confidence" },
];

function recommendationTone(tone: Recommendation["tone"]) {
  if (tone === "scale") return "border-emerald-500/20 bg-emerald-500/5 text-emerald-300";
  if (tone === "risk") return "border-red-500/20 bg-red-500/5 text-red-300";
  if (tone === "blindspot") return "border-amber-500/20 bg-amber-500/5 text-amber-200";
  return "border-white/10 bg-white/5 text-text-primary";
}

export default function CreativeIntelligenceTab({ days }: { days: number }) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<CreativeIntelligenceData>(
    "/api/admin/growth/creative-intelligence",
    params
  );

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
        {error || "Failed to load creative intelligence."}
      </div>
    );
  }

  const themeItems = data.messageThemes.slice(0, 8).map((theme) => ({
    label: theme.theme,
    value: theme.starts,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Creative Intelligence</h3>
          <p className="mt-1 text-sm text-text-muted">
            Read campaign and creative performance by source, medium, campaign, and content instead
            of only by channel.
          </p>
        </div>
        <p className="text-xs text-text-muted">
          Updated {new Date(data.generatedAt).toLocaleString()}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard label="Tracked Starts" value={data.summary.trackedStarts.toLocaleString()} />
        <StatCard label="Creatives" value={data.summary.creatives} />
        <StatCard label="Themes" value={data.summary.messageThemes} />
        <StatCard label="Scale-Ready" value={data.summary.highConfidenceWinners} />
        <StatCard label="Blindspot Starts" value={data.summary.blindspotStarts.toLocaleString()} />
        <StatCard label="Avg Paid Rate" value={`${data.summary.avgPaidRate}%`} />
      </div>

      {data.trust.warning && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/90">
          {data.trust.warning}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        {data.recommendations.map((recommendation) => (
          <div
            key={recommendation.title}
            className={`rounded-xl border p-5 ${recommendationTone(recommendation.tone)}`}
          >
            <p className="text-xs uppercase tracking-wide opacity-80">{recommendation.tone}</p>
            <p className="mt-2 text-base font-semibold">{recommendation.title}</p>
            <p className="mt-2 text-sm opacity-90">{recommendation.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Top Message Themes</h3>
          {themeItems.length > 0 ? (
            <BarChart items={themeItems} direction="horizontal" />
          ) : (
            <p className="text-sm text-text-muted">No themed creative data in this window.</p>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Message Theme Performance</h3>
          <KpiDataTable
            data={data.messageThemes}
            columns={themeColumns}
            defaultSortKey="revenueTotal"
            defaultSortDir="desc"
          />
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">Creative Leaderboard</h3>
        <KpiDataTable
          data={data.creatives}
          columns={creativeColumns}
          defaultSortKey="qualityScore"
          defaultSortDir="desc"
        />
      </div>
    </div>
  );
}
