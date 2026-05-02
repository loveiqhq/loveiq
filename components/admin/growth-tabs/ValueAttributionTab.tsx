"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import KpiDataTable, { type Column } from "@/components/admin/kpi-tabs/KpiDataTable";
import StatCard from "@/components/admin/StatCard";
import type {
  ValueRealizationArchetypeRow,
  ValueRealizationChannelRow,
  ValueRealizationSignalRow,
  ValueRealizationSnapshot,
} from "@/lib/admin/value-realization";

const signalColumns: Column<ValueRealizationSignalRow>[] = [
  { key: "signal", label: "Signal" },
  { key: "audience", label: "Audience", align: "right" },
  {
    key: "monetizationRate",
    label: "Monetization",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "monetizationLift",
    label: "Monetization Lift",
    align: "right",
    format: (value) => `${value}pp`,
  },
  {
    key: "retentionRate",
    label: "Retention",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "retentionLift",
    label: "Retention Lift",
    align: "right",
    format: (value) => `${value}pp`,
  },
  {
    key: "referralRate",
    label: "Referral",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "upgradeIntentLift",
    label: "Upgrade Proxy Lift",
    align: "right",
    format: (value) => `${value}pp`,
  },
  { key: "strongestOutcome", label: "Strongest Outcome" },
];

const channelColumns: Column<ValueRealizationChannelRow>[] = [
  { key: "source", label: "Channel" },
  { key: "starts", label: "Starts", align: "right" },
  {
    key: "revenuePerStart",
    label: "Rev / Start",
    align: "right",
    format: (value) => `$${value}`,
  },
  {
    key: "monetizationRate",
    label: "Monetization",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "referralRate",
    label: "Referral",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "retentionRate",
    label: "Retention",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "upgradeIntentRate",
    label: "Upgrade Proxy",
    align: "right",
    format: (value) => `${value}%`,
  },
  { key: "valueRealizationScore", label: "Value Score", align: "right" },
];

const archetypeColumns: Column<ValueRealizationArchetypeRow>[] = [
  { key: "archetype", label: "Archetype" },
  { key: "starts", label: "Starts", align: "right" },
  {
    key: "revenuePerStart",
    label: "Rev / Start",
    align: "right",
    format: (value) => `$${value}`,
  },
  {
    key: "monetizationRate",
    label: "Monetization",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "referralRate",
    label: "Referral",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "retentionRate",
    label: "Retention",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "upgradeIntentRate",
    label: "Upgrade Proxy",
    align: "right",
    format: (value) => `${value}%`,
  },
  { key: "valueRealizationScore", label: "Value Score", align: "right" },
];

function recommendationTone(tone: ValueRealizationSnapshot["recommendations"][number]["tone"]) {
  if (tone === "scale") return "border-emerald-500/20 bg-emerald-500/5 text-emerald-300";
  if (tone === "risk") return "border-red-500/20 bg-red-500/5 text-red-300";
  if (tone === "blindspot") return "border-amber-500/20 bg-amber-500/5 text-amber-200";
  return "border-white/10 bg-white/5 text-text-primary";
}

export default function ValueAttributionTab({ days }: { days: number }) {
  const params = useMemo(() => ({ days: String(days > 0 ? days : 30) }), [days]);
  const { data, loading, error } = useAdminFetch<ValueRealizationSnapshot>(
    "/api/admin/growth/value-attribution",
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
        {error || "Failed to load value realization."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Value Realization</h3>
          <p className="mt-1 max-w-4xl text-sm text-text-muted">
            Model which realized-value signals most strongly correlate with monetization, retention,
            referral behavior, and an upgrade-intent proxy.
          </p>
        </div>
        <p className="text-xs text-text-muted">
          Updated {new Date(data.generatedAt).toLocaleString()}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Starts" value={data.summary.starts.toLocaleString()} />
        <StatCard label="Monetized" value={data.summary.monetizedCount.toLocaleString()} />
        <StatCard label="Retained" value={data.summary.retainedCount.toLocaleString()} />
        <StatCard label="Referred" value={data.summary.referredCount.toLocaleString()} />
        <StatCard label="Upgrade Proxy" value={data.summary.upgradeIntentCount.toLocaleString()} />
        <StatCard
          label="Top Monetization Signal"
          value={data.summary.strongestMonetizationSignal ?? "No data"}
        />
        <StatCard
          label="Top Retention Signal"
          value={data.summary.strongestRetentionSignal ?? "No data"}
        />
        <StatCard
          label="Top Referral Signal"
          value={data.summary.strongestReferralSignal ?? "No data"}
        />
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

      <div className="grid gap-3 xl:grid-cols-3">
        {data.trust.notes.map((note) => (
          <div
            key={note}
            className="rounded-xl border border-white/10 bg-surface p-4 text-sm text-text-muted"
          >
            {note}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">Predictive Signals</h3>
        <KpiDataTable
          data={data.signals}
          columns={signalColumns}
          defaultSortKey="strongestLift"
          defaultSortDir="desc"
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">Value By Channel</h3>
        <KpiDataTable
          data={data.channels}
          columns={channelColumns}
          defaultSortKey="valueRealizationScore"
          defaultSortDir="desc"
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">Value By Archetype</h3>
        <KpiDataTable
          data={data.archetypes}
          columns={archetypeColumns}
          defaultSortKey="valueRealizationScore"
          defaultSortDir="desc"
        />
      </div>
    </div>
  );
}
