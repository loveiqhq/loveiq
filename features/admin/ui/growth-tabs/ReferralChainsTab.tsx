"use client";

import { useMemo } from "react";
import BarChart from "@features/admin/ui/BarChart";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import KpiDataTable, { type Column } from "@features/admin/ui/kpi-tabs/KpiDataTable";
import StatCard from "@features/admin/ui/StatCard";
import type {
  ReferralIntelligenceSnapshot,
  ReferralReferrerRow,
  ReferralSegmentRow,
} from "@features/admin/server/referral-intelligence";

const referrerColumns: Column<ReferralReferrerRow>[] = [
  { key: "email", label: "Referrer" },
  { key: "segmentLabel", label: "Segment" },
  { key: "attention", label: "Attention" },
  { key: "invites", label: "Invites", align: "right" },
  {
    key: "recipientCoverageRate",
    label: "Recipient Capture",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "conversionRate",
    label: "Conversion",
    align: "right",
    format: (value) => `${value}%`,
  },
  { key: "chainDepth", label: "Chain Depth", align: "right" },
  { key: "downstreamReferrers", label: "Downstream", align: "right" },
  { key: "qualityScore", label: "Quality", align: "right" },
  { key: "suspiciousScore", label: "Risk", align: "right" },
  { key: "topMethod", label: "Top Method" },
];

const segmentColumns: Column<ReferralSegmentRow>[] = [
  { key: "segmentLabel", label: "Segment" },
  { key: "referrers", label: "Referrers", align: "right" },
  { key: "invites", label: "Invites", align: "right" },
  { key: "completions", label: "Completions", align: "right" },
  {
    key: "conversionRate",
    label: "Conversion",
    align: "right",
    format: (value) => `${value}%`,
  },
  { key: "avgChainDepth", label: "Avg Depth", align: "right" },
  { key: "avgQualityScore", label: "Avg Quality", align: "right" },
  { key: "flaggedReferrers", label: "Flagged", align: "right" },
];

function recommendationTone(tone: ReferralIntelligenceSnapshot["recommendations"][number]["tone"]) {
  if (tone === "scale") return "border-emerald-500/20 bg-emerald-500/5 text-emerald-300";
  if (tone === "risk") return "border-red-500/20 bg-red-500/5 text-red-300";
  if (tone === "blindspot") return "border-amber-500/20 bg-amber-500/5 text-amber-200";
  return "border-white/10 bg-white/5 text-text-primary";
}

export default function ReferralChainsTab({ days }: { days: number }) {
  const params = useMemo(() => ({ days: String(days > 0 ? days : 30) }), [days]);
  const { data, loading, error } = useAdminFetch<ReferralIntelligenceSnapshot>(
    "/api/admin/growth/referrals",
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
        {error || "Failed to load referral intelligence."}
      </div>
    );
  }

  const methodItems = data.methods.map((method) => ({
    label: `${method.method} (${method.count})`,
    value: method.count,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Referral Intelligence</h3>
          <p className="mt-1 max-w-4xl text-sm text-text-muted">
            Read referral performance by invite quality, chain depth, suspicious patterns, and the
            referrer segments that are producing the strongest loops.
          </p>
        </div>
        <p className="text-xs text-text-muted">
          Updated {new Date(data.generatedAt).toLocaleString()}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Invites" value={data.summary.totalInvites.toLocaleString()} />
        <StatCard label="Unique Referrers" value={data.summary.uniqueReferrers.toLocaleString()} />
        <StatCard
          label="Invite Completions"
          value={data.summary.completionsFromInvites.toLocaleString()}
        />
        <StatCard label="Viral Coefficient" value={data.summary.viralCoefficient.toFixed(2)} />
        <StatCard label="Avg Chain Depth" value={data.summary.avgChainDepth} />
        <StatCard label="High-Quality Referrers" value={data.summary.highQualityReferrers} />
        <StatCard label="Suspicious Referrers" value={data.summary.suspiciousReferrers} />
        <StatCard label="Blindspot Invites" value={data.summary.blindspotInvites} />
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

      <div className="grid gap-6 xl:grid-cols-[0.85fr,1.15fr]">
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Invite Method Mix</h3>
          {methodItems.length > 0 ? (
            <BarChart items={methodItems} direction="horizontal" />
          ) : (
            <p className="text-sm text-text-muted">No referral methods in this window.</p>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Segment Quality</h3>
          <KpiDataTable
            data={data.segments}
            columns={segmentColumns}
            defaultSortKey="avgQualityScore"
            defaultSortDir="desc"
          />
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">Referrer Quality Leaderboard</h3>
        <KpiDataTable
          data={data.referrers}
          columns={referrerColumns}
          defaultSortKey="qualityScore"
          defaultSortDir="desc"
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-text-primary">Suspicious Referral Patterns</h3>
            <p className="mt-1 text-sm text-text-muted">
              Use this as a review queue, not as automatic fraud adjudication.
            </p>
          </div>
          <p className="text-xs text-text-muted">
            Recipient capture coverage: {data.trust.recipientCoverageRate}%
          </p>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {data.suspicious.length > 0 ? (
            data.suspicious.map((entry) => (
              <div
                key={entry.email}
                className="rounded-xl border border-red-500/20 bg-red-500/5 p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-red-300">
                    Risk {entry.suspiciousScore}
                  </span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                    {entry.topMethod}
                  </span>
                </div>
                <p className="mt-3 text-base font-semibold text-text-primary">{entry.email}</p>
                <p className="mt-2 text-sm text-text-muted">
                  {entry.invites} invites, chain depth {entry.chainDepth}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {entry.reasons.map((reason) => (
                    <span
                      key={reason}
                      className="rounded-full border border-red-500/20 bg-white/5 px-2 py-1 text-xs text-red-100/90"
                    >
                      {reason}
                    </span>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-text-muted">
              No suspicious referral patterns crossed the review threshold in this window.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
