"use client";

import { useMemo } from "react";
import BarChart from "@features/admin/ui/BarChart";
import FunnelChart from "@features/admin/ui/funnel-tabs/FunnelChart";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import KpiDataTable, { type Column } from "@features/admin/ui/kpi-tabs/KpiDataTable";
import StatCard from "@features/admin/ui/StatCard";

interface PriorityItem {
  title: string;
  detail: string;
  tone: "good" | "watch" | "risk";
  href: string;
}

interface ChannelRow {
  source: string;
  signups: number;
  starts: number;
  startRate: number | null;
  completionRate: number;
  reportViewRate: number;
  paidRate: number;
  recoveryRate: number;
  revenuePerStart: number;
  efficiencyScore: number;
  confidence: "high" | "medium" | "low";
  action: "scale" | "watch" | "fix" | "blindspot";
}

interface CreativeRow {
  source: string;
  campaign: string;
  content: string;
  theme: string;
  starts: number;
  paidRate: number;
  qualityScore: number;
  attention: "scale" | "watch" | "fix" | "blindspot";
}

interface ThemeRow {
  theme: string;
  starts: number;
  paidRate: number;
}

interface GrowthControlTowerData {
  generatedAt: string;
  summary: {
    waitlistSignups: number;
    surveyStarts: number;
    completionRate: number;
    paidRate: number;
    viralCoefficient: number;
    recoveryRate: number;
    scaleChannels: number;
    blindspotStarts: number;
  };
  funnel: Array<{ name: string; count: number }>;
  priorities: PriorityItem[];
  topChannels: ChannelRow[];
  topCreatives: CreativeRow[];
  messageThemes: ThemeRow[];
  referrals: {
    totalInvites: number;
    uniqueReferrers: number;
    completionsFromInvites: number;
    viralCoefficient: number;
  };
  trustWarnings: string[];
}

const channelColumns: Column<ChannelRow>[] = [
  { key: "source", label: "Source" },
  { key: "action", label: "Action" },
  { key: "confidence", label: "Confidence" },
  { key: "starts", label: "Starts", align: "right" },
  { key: "completionRate", label: "Completion", align: "right", format: (value) => `${value}%` },
  { key: "paidRate", label: "Paid", align: "right", format: (value) => `${value}%` },
  { key: "revenuePerStart", label: "Rev / Start", align: "right", format: (value) => `$${value}` },
  { key: "efficiencyScore", label: "Efficiency", align: "right", format: (value) => `${value}` },
];

function priorityTone(tone: PriorityItem["tone"]) {
  if (tone === "good") return "border-emerald-500/20 bg-emerald-500/5";
  if (tone === "risk") return "border-red-500/20 bg-red-500/5";
  return "border-amber-500/20 bg-amber-500/5";
}

function actionBadge(action: ChannelRow["action"]) {
  if (action === "scale") return "bg-emerald-500/10 text-emerald-300";
  if (action === "fix") return "bg-red-500/10 text-red-300";
  if (action === "blindspot") return "bg-amber-500/10 text-amber-200";
  return "bg-white/10 text-text-muted";
}

export default function GrowthControlTowerTab({ days }: { days: number }) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<GrowthControlTowerData>(
    "/api/admin/growth/control-tower",
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
        {error || "Failed to load growth control tower."}
      </div>
    );
  }

  const themeItems = data.messageThemes.map((theme) => ({
    label: `${theme.theme} (${theme.paidRate}%)`,
    value: theme.starts,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Growth Control Tower</h3>
          <p className="mt-1 text-sm text-text-muted">
            One operating surface for acquisition, funnel health, message performance, recovery, and
            referral pressure.
          </p>
        </div>
        <p className="text-xs text-text-muted">
          Updated {new Date(data.generatedAt).toLocaleString()}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <StatCard label="Waitlist Signups" value={data.summary.waitlistSignups.toLocaleString()} />
        <StatCard label="Survey Starts" value={data.summary.surveyStarts.toLocaleString()} />
        <StatCard label="Completion" value={`${data.summary.completionRate}%`} />
        <StatCard label="Paid Rate" value={`${data.summary.paidRate}%`} />
        <StatCard label="Recovery" value={`${data.summary.recoveryRate}%`} />
        <StatCard label="Referral Coef." value={data.summary.viralCoefficient.toFixed(2)} />
        <StatCard label="Scale Channels" value={data.summary.scaleChannels} />
        <StatCard label="Blindspot Starts" value={data.summary.blindspotStarts.toLocaleString()} />
      </div>

      {data.trustWarnings.map((warning) => (
        <div
          key={warning}
          className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/90"
        >
          {warning}
        </div>
      ))}

      <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
        {data.priorities.map((item) => (
          <a
            key={item.title}
            href={item.href}
            className={`rounded-xl border p-5 transition hover:border-white/20 ${priorityTone(
              item.tone
            )}`}
          >
            <p className="text-xs uppercase tracking-wide text-text-muted">Priority</p>
            <p className="mt-2 text-base font-semibold text-text-primary">{item.title}</p>
            <p className="mt-2 text-sm text-text-muted">{item.detail}</p>
          </a>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Growth Funnel</h3>
          <FunnelChart stages={data.funnel} />
        </div>

        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Top Message Themes</h3>
          {themeItems.length > 0 ? (
            <BarChart items={themeItems} direction="horizontal" />
          ) : (
            <p className="text-sm text-text-muted">No message-theme data in this window.</p>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Channel Efficiency</h3>
          <KpiDataTable
            data={data.topChannels}
            columns={channelColumns}
            defaultSortKey="efficiencyScore"
            defaultSortDir="desc"
          />
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <h3 className="mb-4 text-sm font-medium text-text-primary">Creative Winners</h3>
            <div className="space-y-3">
              {data.topCreatives.map((creative) => (
                <div
                  key={`${creative.source}-${creative.campaign}-${creative.content}`}
                  className="rounded-lg border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-text-primary">{creative.content}</p>
                      <p className="mt-1 text-xs text-text-muted">
                        {creative.source} | {creative.campaign} | {creative.theme}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${actionBadge(creative.attention)}`}
                    >
                      {creative.attention}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-text-muted">
                    <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2">
                      <p>Starts</p>
                      <p className="mt-1 text-sm font-semibold text-text-primary">
                        {creative.starts}
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2">
                      <p>Paid</p>
                      <p className="mt-1 text-sm font-semibold text-text-primary">
                        {creative.paidRate}%
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2">
                      <p>Quality</p>
                      <p className="mt-1 text-sm font-semibold text-text-primary">
                        {creative.qualityScore}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {data.topCreatives.length === 0 && (
                <p className="text-sm text-text-muted">
                  No creative performance entries are available.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <h3 className="mb-4 text-sm font-medium text-text-primary">Referral Pulse</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard label="Invites" value={data.referrals.totalInvites.toLocaleString()} />
              <StatCard label="Referrers" value={data.referrals.uniqueReferrers.toLocaleString()} />
              <StatCard
                label="Invite Completions"
                value={data.referrals.completionsFromInvites.toLocaleString()}
              />
              <StatCard
                label="Viral Coefficient"
                value={data.referrals.viralCoefficient.toFixed(2)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
