"use client";

import { useMemo } from "react";
import BarChart from "@/components/admin/BarChart";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import KpiDataTable, { type Column } from "@/components/admin/kpi-tabs/KpiDataTable";
import StatCard from "@/components/admin/StatCard";
import type {
  GeoLanguageExpansionSnapshot,
  LanguageExpansionRow,
  RegionExpansionRow,
} from "@/lib/admin/geo-language-expansion";

const regionColumns: Column<RegionExpansionRow>[] = [
  { key: "region", label: "Region" },
  { key: "dominantLanguage", label: "Dominant Language" },
  { key: "attention", label: "Attention" },
  { key: "starts", label: "Starts", align: "right" },
  { key: "profiles", label: "Profiles", align: "right" },
  {
    key: "completionRate",
    label: "Completion",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "reportViewRate",
    label: "Report View",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "paidRate",
    label: "Paid",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "resumedShare",
    label: "Resumed",
    align: "right",
    format: (value) => `${value}%`,
  },
  { key: "frictionScore", label: "Friction", align: "right" },
  { key: "readinessScore", label: "Readiness", align: "right" },
];

const languageColumns: Column<LanguageExpansionRow>[] = [
  { key: "language", label: "Language" },
  { key: "topRegion", label: "Top Region" },
  { key: "attention", label: "Attention" },
  { key: "starts", label: "Starts", align: "right" },
  { key: "profiles", label: "Profiles", align: "right" },
  {
    key: "completionRate",
    label: "Completion",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "reportViewRate",
    label: "Report View",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "paidRate",
    label: "Paid",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "resumedShare",
    label: "Resumed",
    align: "right",
    format: (value) => `${value}%`,
  },
  { key: "frictionScore", label: "Friction", align: "right" },
  { key: "readinessScore", label: "Readiness", align: "right" },
];

function recommendationTone(tone: GeoLanguageExpansionSnapshot["recommendations"][number]["tone"]) {
  if (tone === "expand") return "border-emerald-500/20 bg-emerald-500/5 text-emerald-300";
  if (tone === "risk") return "border-red-500/20 bg-red-500/5 text-red-300";
  if (tone === "blindspot") return "border-amber-500/20 bg-amber-500/5 text-amber-200";
  return "border-white/10 bg-white/5 text-text-primary";
}

export default function GeographicMapTab({ days }: { days: number }) {
  const params = useMemo(() => ({ days: String(days > 0 ? days : 30) }), [days]);
  const { data, loading, error } = useAdminFetch<GeoLanguageExpansionSnapshot>(
    "/api/admin/growth/geography",
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
        {error || "Failed to load geo/language expansion."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Geo & Language Expansion</h3>
          <p className="mt-1 max-w-4xl text-sm text-text-muted">
            Rank regions and language clusters by readiness, conversion quality, and localized
            friction before scaling acquisition or localization work.
          </p>
        </div>
        <p className="text-xs text-text-muted">
          Updated {new Date(data.generatedAt).toLocaleString()}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Starts" value={data.summary.totalStarts.toLocaleString()} />
        <StatCard label="Regions" value={data.summary.uniqueRegions} />
        <StatCard label="Languages" value={data.summary.uniqueLanguages} />
        <StatCard label="Ready Regions" value={data.summary.readyRegions} />
        <StatCard label="At-Risk Regions" value={data.summary.atRiskRegions} />
        <StatCard label="Blindspots" value={data.summary.blindspots} />
        <StatCard label="Top Region" value={data.summary.strongestRegion ?? "No data"} />
        <StatCard label="Top Language" value={data.summary.strongestLanguage ?? "No data"} />
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

      <div className="grid gap-3 xl:grid-cols-4">
        {data.trust.notes.map((note) => (
          <div
            key={note}
            className="rounded-xl border border-white/10 bg-surface p-4 text-sm text-text-muted"
          >
            {note}
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr,1.2fr]">
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Top Regions By Starts</h3>
          {data.topRegions.length > 0 ? (
            <BarChart items={data.topRegions} direction="horizontal" />
          ) : (
            <p className="text-sm text-text-muted">No region data in this window.</p>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Region Expansion Readiness</h3>
          <KpiDataTable
            data={data.regions}
            columns={regionColumns}
            defaultSortKey="readinessScore"
            defaultSortDir="desc"
          />
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">Language Expansion Readiness</h3>
        <KpiDataTable
          data={data.languages}
          columns={languageColumns}
          defaultSortKey="readinessScore"
          defaultSortDir="desc"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {data.regions.slice(0, 4).map((region) => (
          <div key={region.region} className="rounded-xl border border-white/10 bg-surface p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                {region.attention}
              </span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                {region.dominantLanguage}
              </span>
            </div>
            <p className="mt-3 text-base font-semibold text-text-primary">{region.region}</p>
            <p className="mt-2 text-sm text-text-muted">{region.lead}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <StatCard label="Readiness" value={region.readinessScore} />
              <StatCard label="Friction" value={region.frictionScore} />
              <StatCard label="Paid" value={`${region.paidRate}%`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
