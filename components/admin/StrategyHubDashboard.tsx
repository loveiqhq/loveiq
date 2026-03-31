"use client";

import { startTransition, useDeferredValue, useMemo, useState } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";
import StrategyPlanningTab from "@/components/admin/StrategyPlanningTab";
import TimeRangeSelector from "@/components/admin/TimeRangeSelector";
import KpiDataTable, { type Column } from "@/components/admin/kpi-tabs/KpiDataTable";

type BenchmarkStatus = "good" | "watch" | "risk";
type QueuePriority = "high" | "medium" | "low";
type Confidence = "high" | "medium" | "low";
type OpportunityEffort = "low" | "medium" | "high";
type TimeToSignal = "fast" | "medium" | "slow";
type DecisionReviewState = "due" | "upcoming" | "stale" | "validated" | "missing-outcome";

interface StrategyData {
  days: number;
  generatedAt: string;
  northStar: Array<{
    key: string;
    label: string;
    delta: number;
    description: string;
    href: string;
    displayValue: string;
    drilldowns: Array<{ label: string; value: string; href: string }>;
  }>;
  northStarTree: Array<{
    label: string;
    href: string;
    drivers: Array<{ label: string; value: string; href: string }>;
  }>;
  goals: Array<{
    id: number;
    label: string;
    metricLabel: string;
    currentValue: number | null;
    targetValue: number;
    progressPct: number;
    deadline: string | null;
    status: "on-track" | "watch" | "off-track";
    href: string;
    drivers: Array<{ label: string; value: string; href: string }>;
  }>;
  benchmarks: Array<{
    key: string;
    label: string;
    description: string;
    referenceLabel: string;
    href: string;
    currentLabel: string;
    targetLabel: string;
    status: BenchmarkStatus;
  }>;
  workQueue: {
    summary: {
      openCases: number;
      overdueCases: number;
      highPriorityCases: number;
      flaggedSubmissions: number;
      scoringDisagreements: number;
      ambiguousCases: number;
      recentNotes: number;
      workflowCoverage: number;
    };
    items: Array<{
      title: string;
      detail: string;
      priority: QueuePriority;
      type: string;
      href: string;
      updatedAt: string;
    }>;
  };
  releaseImpact: {
    entries: Array<{
      id: number;
      title: string;
      category: string;
      eventDate: string;
      deltaSubmissions: number;
      deltaCompletionRate: number;
      deltaWaitlist: number;
      linkedChartCount: number;
      notes: string[];
      href: string;
    }>;
    annotations: Array<{ id: number; chartKey: string; annotationDate: string; note: string }>;
  };
  opportunities: {
    backlog: Array<{
      title: string;
      source: string;
      confidence: Confidence;
      effort: OpportunityEffort;
      timeToSignal: TimeToSignal;
      score: number;
      impact: string;
      detail: string;
      scoreInputs: {
        impact: number;
        confidence: number;
        effort: number;
        timeToSignal: number;
        formula: string;
      };
      href: string;
    }>;
    funnelLeakage: Array<{
      from: string;
      to: string;
      lossCount: number;
      lossRate: number;
      likelyCause: string;
      href: string;
    }>;
    archetypeMomentum: Array<{
      archetype: string;
      currentCount: number;
      previousCount: number;
      delta: number;
      href: string;
    }>;
    leaderboards: {
      channels: Array<{ source: string; total: number; completed: number; conversionRate: number }>;
      archetypes: Array<{ archetype: string; count: number; delta: number }>;
      workflow: Array<{ stage: string; submissions: number; color: string }>;
    };
  };
  forecasts: {
    generatedAt: string;
    modules: Array<{
      key: string;
      label: string;
      forecastValue: number;
      lowerBound: number;
      upperBound: number;
      confidence: Confidence;
      href: string;
    }>;
  };
  experiments: {
    summary: {
      total: number;
      active: number;
      pendingDecision: number;
    };
    items: Array<{
      id: number;
      name: string;
      status: string;
      primaryMetricKey: string;
      ownerEmail: string | null;
      decisionDate: string | null;
      href: string;
    }>;
  };
  decisionReview: {
    summary: {
      total: number;
      due: number;
      stale: number;
      awaitingOutcome: number;
      openReviews: number;
    };
    items: Array<{
      id: number;
      title: string;
      entryType: "decision" | "scoring-change" | "memo";
      status: "draft" | "approved" | "monitoring" | "validated" | "rolled-back";
      primaryMetricKey: string | null;
      ownerEmail: string | null;
      reviewDate: string | null;
      daysUntilReview: number | null;
      daysSinceUpdate: number;
      openReviewCount: number;
      expectedImpact: string | null;
      measuredOutcome: string | null;
      comparisonLabel: string;
      detail: string;
      reviewState: DecisionReviewState;
      href: string;
    }>;
  };
  briefGenerator: {
    generatedAt: string;
    packs: Array<{
      audience: "Executive" | "Strategy" | "Product" | "Growth" | "Tech";
      tone: BenchmarkStatus;
      headline: string;
      summary: string;
      bullets: string[];
      actions: string[];
      href: string;
      copyText: string;
    }>;
  };
  narrative: string[];
  analyst: {
    briefs: Array<{ role: string; summary: string }>;
  };
  guardrails: {
    healthy: number;
    breached: number;
    items: Array<{
      label: string;
      current: number;
      target: number;
      status: BenchmarkStatus;
      detail: string;
      href: string;
    }>;
  };
  triage: Array<{
    title: string;
    cause: string;
    confidence: Confidence;
    evidence: string;
    href: string;
  }>;
}

const TABS = [
  "North Star",
  "Work Queue",
  "Release Impact",
  "Opportunities",
  "Guardrails",
  "Decision Review",
  "Auto Briefs",
  "Strategy Planning",
] as const;
const benchmarkStatusClasses: Record<BenchmarkStatus, string> = {
  good: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  watch: "border-amber-500/20 bg-amber-500/10 text-amber-200",
  risk: "border-red-500/20 bg-red-500/10 text-red-300",
};
const goalStatusClasses: Record<StrategyData["goals"][number]["status"], string> = {
  "on-track": "bg-emerald-500/10 text-emerald-300",
  watch: "bg-amber-500/10 text-amber-200",
  "off-track": "bg-red-500/10 text-red-300",
};
const queuePriorityClasses: Record<QueuePriority, string> = {
  high: "bg-red-500/10 text-red-300",
  medium: "bg-amber-500/10 text-amber-200",
  low: "bg-white/10 text-text-muted",
};
const confidenceClasses: Record<Confidence, string> = {
  high: "bg-emerald-500/10 text-emerald-300",
  medium: "bg-amber-500/10 text-amber-200",
  low: "bg-white/10 text-text-muted",
};
const effortClasses: Record<OpportunityEffort, string> = {
  low: "bg-emerald-500/10 text-emerald-300",
  medium: "bg-amber-500/10 text-amber-200",
  high: "bg-red-500/10 text-red-300",
};
const timeToSignalClasses: Record<TimeToSignal, string> = {
  fast: "bg-emerald-500/10 text-emerald-300",
  medium: "bg-amber-500/10 text-amber-200",
  slow: "bg-white/10 text-text-muted",
};
const decisionReviewClasses: Record<DecisionReviewState, string> = {
  due: "bg-amber-500/10 text-amber-200",
  upcoming: "bg-white/10 text-text-muted",
  stale: "bg-red-500/10 text-red-300",
  validated: "bg-emerald-500/10 text-emerald-300",
  "missing-outcome": "bg-cyan-500/10 text-cyan-300",
};
const strategyRangeOptions = [
  { days: 7, label: "7d", ariaLabel: "Last 7 days" },
  { days: 30, label: "30d", ariaLabel: "Last 30 days" },
  { days: 90, label: "90d", ariaLabel: "Last 90 days" },
] as const;

const deltaColor = (delta: number) =>
  delta > 0 ? "text-emerald-300" : delta < 0 ? "text-red-300" : "text-text-muted";
const signed = (value: number, suffix = "") =>
  value === 0 ? `0${suffix}` : `${value > 0 ? "+" : ""}${value}${suffix}`;

const opportunityColumns = (): Column<StrategyData["opportunities"]["backlog"][number]>[] => [
  { key: "title", label: "Opportunity" },
  { key: "source", label: "Source" },
  { key: "impact", label: "Impact" },
  { key: "confidence", label: "Confidence" },
  { key: "effort", label: "Effort" },
  { key: "timeToSignal", label: "Time To Signal" },
  { key: "score", label: "Score", align: "right" },
];

const channelColumns = (): Column<
  StrategyData["opportunities"]["leaderboards"]["channels"][number]
>[] => [
  { key: "source", label: "Channel" },
  { key: "total", label: "Starts", align: "right" },
  { key: "completed", label: "Completed", align: "right" },
  { key: "conversionRate", label: "Conversion", align: "right", format: (value) => `${value}%` },
];

const archetypeColumns = (): Column<
  StrategyData["opportunities"]["leaderboards"]["archetypes"][number]
>[] => [
  { key: "archetype", label: "Archetype" },
  { key: "count", label: "Count", align: "right" },
  { key: "delta", label: "Delta", align: "right", format: (value) => signed(value as number) },
];

export default function StrategyHubDashboard() {
  const [days, setDays] = useState(30);
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("North Star");
  const [queueSearch, setQueueSearch] = useState("");
  const [impactSearch, setImpactSearch] = useState("");
  const [copiedAudience, setCopiedAudience] = useState<string | null>(null);
  const params = useMemo(() => ({ days: String(days) }), [days]);
  const { data, loading, error } = useAdminFetch<StrategyData>("/api/admin/strategy", params);
  const deferredQueueSearch = useDeferredValue(queueSearch);
  const deferredImpactSearch = useDeferredValue(impactSearch);

  const filteredQueue = useMemo(() => {
    const items = data?.workQueue.items ?? [];
    const needle = deferredQueueSearch.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(needle) || item.detail.toLowerCase().includes(needle)
    );
  }, [data, deferredQueueSearch]);

  const filteredReleaseImpact = useMemo(() => {
    const items = data?.releaseImpact.entries ?? [];
    const needle = deferredImpactSearch.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(needle) || item.category.toLowerCase().includes(needle)
    );
  }, [data, deferredImpactSearch]);

  async function copyBriefPack(
    audience: StrategyData["briefGenerator"]["packs"][number]["audience"],
    text: string
  ) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAudience(audience);
      window.setTimeout(
        () => setCopiedAudience((current) => (current === audience ? null : current)),
        2000
      );
    } catch {
      setCopiedAudience(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm text-red-400">
        {error || "Failed to load strategy hub."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-bold text-text-primary">Strategy Hub</h2>
          <p className="mt-1 text-sm text-text-muted">
            North-star tracking, queue pressure, release impact, ranked opportunities, and narrative
            summaries in one surface.
          </p>
        </div>
        <TimeRangeSelector
          value={days}
          onChange={(value) => startTransition(() => setDays(value))}
          options={strategyRangeOptions}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {data.northStar.map((metric) => (
          <a
            key={metric.key}
            href={metric.href}
            className="rounded-xl border border-white/10 bg-surface p-5 transition hover:border-white/20 hover:bg-white/5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-text-muted">{metric.label}</p>
                <p className="mt-1 font-serif text-2xl font-bold text-text-primary">
                  {metric.displayValue}
                </p>
              </div>
              <span className={`text-xs font-semibold ${deltaColor(metric.delta)}`}>
                {signed(
                  metric.delta,
                  metric.label === "Completion" || metric.label === "Engine Trust" ? "pp" : "%"
                )}
              </span>
            </div>
            <p className="mt-2 text-xs text-text-muted">{metric.description}</p>
            <div className="mt-4 space-y-2">
              {metric.drilldowns.map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                >
                  <p className="text-[11px] uppercase tracking-wide text-text-muted">
                    {item.label}
                  </p>
                  <p className="mt-1 text-sm text-text-primary">{item.value}</p>
                </div>
              ))}
            </div>
          </a>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-text-primary">Narrative Summary</h3>
          <p className="text-xs text-text-muted">
            Generated {new Date(data.generatedAt).toLocaleString()}
          </p>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {data.narrative.map((line) => (
            <div
              key={line}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-text-primary"
            >
              {line}
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {data.analyst.briefs.map((brief) => (
            <div
              key={brief.role}
              className="rounded-lg border border-white/10 bg-page px-4 py-3 text-sm text-text-primary"
            >
              <p className="text-[11px] uppercase tracking-wide text-text-muted">{brief.role}</p>
              <p className="mt-2">{brief.summary}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-1 rounded-lg border border-white/10 bg-surface p-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => startTransition(() => setActiveTab(tab))}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${activeTab === tab ? "bg-white/10 text-text-primary" : "text-text-muted hover:bg-white/5 hover:text-text-primary"}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "North Star" && (
        <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-text-primary">Goal Explainers</h3>
              <a
                href="/admin/goals?status=active"
                className="text-xs text-text-muted transition hover:text-text-primary"
              >
                Open goals
              </a>
            </div>
            <div className="mt-4 space-y-4">
              {data.goals.length === 0 && (
                <p className="text-sm text-text-muted">No active goals yet.</p>
              )}
              {data.goals.map((goal) => (
                <div key={goal.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={goal.href}
                          className="text-sm font-semibold text-text-primary transition hover:text-white"
                        >
                          {goal.label}
                        </a>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${goalStatusClasses[goal.status]}`}
                        >
                          {goal.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-text-muted">
                        {goal.metricLabel} · {goal.currentValue ?? "—"} / {goal.targetValue}
                        {goal.deadline
                          ? ` · due ${new Date(goal.deadline).toLocaleDateString()}`
                          : ""}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-text-primary">{goal.progressPct}%</p>
                  </div>
                  <div className="mt-3 h-2 w-full rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full ${goal.status === "on-track" ? "bg-emerald-500" : goal.status === "watch" ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${goal.progressPct}%` }}
                    />
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {goal.drivers.map((driver) => (
                      <a
                        key={driver.label}
                        href={driver.href}
                        className="rounded-lg border border-white/10 bg-surface px-3 py-3 transition hover:border-white/20 hover:bg-white/5"
                      >
                        <p className="text-[11px] uppercase tracking-wide text-text-muted">
                          {driver.label}
                        </p>
                        <p className="mt-1 text-sm text-text-primary">{driver.value}</p>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border border-white/10 bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-text-primary">North Star Tree</h3>
                <a
                  href="/admin/strategy"
                  className="text-xs text-text-muted transition hover:text-text-primary"
                >
                  Driver view
                </a>
              </div>
              <div className="mt-4 space-y-3">
                {data.northStarTree.map((node) => (
                  <a
                    key={node.label}
                    href={node.href}
                    className="block rounded-lg border border-white/10 bg-white/5 p-4 transition hover:border-white/20 hover:bg-white/10"
                  >
                    <p className="text-sm font-semibold text-text-primary">{node.label}</p>
                    <div className="mt-3 grid gap-3">
                      {node.drivers.map((driver) => (
                        <div
                          key={driver.label}
                          className="rounded-lg border border-white/10 bg-surface px-3 py-3"
                        >
                          <p className="text-[11px] uppercase tracking-wide text-text-muted">
                            {driver.label}
                          </p>
                          <p className="mt-1 text-sm text-text-primary">{driver.value}</p>
                        </div>
                      ))}
                    </div>
                  </a>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-text-primary">Benchmarks</h3>
                <a
                  href="/admin/benchmarks"
                  className="text-xs text-text-muted transition hover:text-text-primary"
                >
                  Manage
                </a>
              </div>
              <div className="mt-4 space-y-3">
                {data.benchmarks.map((benchmark) => (
                  <a
                    key={benchmark.key}
                    href={benchmark.href}
                    className="block rounded-lg border border-white/10 bg-white/5 p-4 transition hover:border-white/20 hover:bg-white/10"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-text-primary">
                            {benchmark.label}
                          </p>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${benchmarkStatusClasses[benchmark.status]}`}
                          >
                            {benchmark.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-text-muted">{benchmark.description}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-wide text-text-muted">
                          {benchmark.referenceLabel}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-text-primary">
                          {benchmark.currentLabel}
                        </p>
                        <p className="text-xs text-text-muted">target {benchmark.targetLabel}</p>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-text-primary">Forecast Watch</h3>
                <a
                  href="/admin/predictions"
                  className="text-xs text-text-muted transition hover:text-text-primary"
                >
                  Open forecasting
                </a>
              </div>
              <div className="mt-4 space-y-3">
                {data.forecasts.modules.map((module) => (
                  <a
                    key={module.key}
                    href={module.href}
                    className="block rounded-lg border border-white/10 bg-white/5 p-4 transition hover:border-white/20 hover:bg-white/10"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-text-primary">{module.label}</p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${confidenceClasses[module.confidence]}`}
                          >
                            {module.confidence}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-text-muted">
                          {module.lowerBound} - {module.upperBound}
                        </p>
                      </div>
                      <p className="text-lg font-semibold text-text-primary">
                        {module.forecastValue}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-text-primary">Experiment Registry</h3>
                <a
                  href="/admin/experiments"
                  className="text-xs text-text-muted transition hover:text-text-primary"
                >
                  Open registry
                </a>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <StatCard label="Total" value={data.experiments.summary.total} />
                <StatCard label="Active" value={data.experiments.summary.active} />
                <StatCard label="Decision Due" value={data.experiments.summary.pendingDecision} />
              </div>
              <div className="mt-4 space-y-3">
                {data.experiments.items.map((item) => (
                  <a
                    key={item.id}
                    href={item.href}
                    className="block rounded-lg border border-white/10 bg-white/5 p-4 transition hover:border-white/20 hover:bg-white/10"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                            {item.status}
                          </span>
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                            {item.primaryMetricKey}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-text-primary">{item.name}</p>
                      </div>
                      <div className="text-right text-xs text-text-muted">
                        <p>{item.ownerEmail ?? "Unassigned"}</p>
                        <p>
                          {item.decisionDate
                            ? new Date(item.decisionDate).toLocaleDateString()
                            : "No decision date"}
                        </p>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "Work Queue" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-8">
            <StatCard label="Open Cases" value={data.workQueue.summary.openCases} />
            <StatCard label="Overdue" value={data.workQueue.summary.overdueCases} />
            <StatCard label="High Priority" value={data.workQueue.summary.highPriorityCases} />
            <StatCard label="Flagged" value={data.workQueue.summary.flaggedSubmissions} />
            <StatCard label="Scoring Gaps" value={data.workQueue.summary.scoringDisagreements} />
            <StatCard label="Ambiguous" value={data.workQueue.summary.ambiguousCases} />
            <StatCard label="Notes" value={data.workQueue.summary.recentNotes} />
            <StatCard label="Workflow Coverage" value={data.workQueue.summary.workflowCoverage} />
          </div>
          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-text-primary">Unified Queue</h3>
              <input
                type="text"
                value={queueSearch}
                onChange={(event) => setQueueSearch(event.target.value)}
                placeholder="Search queue..."
                className="w-full max-w-sm rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-white/20 focus:outline-none"
              />
            </div>
            <div className="mt-4 space-y-3">
              {filteredQueue.length === 0 && (
                <p className="text-sm text-text-muted">No queue items match the current filter.</p>
              )}
              {filteredQueue.map((item) => (
                <a
                  key={`${item.type}-${item.title}-${item.updatedAt}`}
                  href={item.href}
                  className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/5 p-4 transition hover:border-white/20 hover:bg-white/10 xl:flex-row xl:items-center xl:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                        {item.type}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${queuePriorityClasses[item.priority]}`}
                      >
                        {item.priority}
                      </span>
                      <span className="text-sm font-semibold text-text-primary">{item.title}</span>
                    </div>
                    <p className="mt-1 text-sm text-text-muted">{item.detail}</p>
                  </div>
                  <p className="text-xs text-text-muted">
                    {new Date(item.updatedAt).toLocaleString()}
                  </p>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "Release Impact" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-text-primary">Release Impact Review</h3>
              <input
                type="text"
                value={impactSearch}
                onChange={(event) => setImpactSearch(event.target.value)}
                placeholder="Search releases..."
                className="w-full max-w-sm rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-white/20 focus:outline-none"
              />
            </div>
            <div className="mt-4 space-y-4">
              {filteredReleaseImpact.map((entry) => (
                <a
                  key={entry.id}
                  href={entry.href}
                  className="block rounded-lg border border-white/10 bg-white/5 p-4 transition hover:border-white/20 hover:bg-white/10"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                          {entry.category}
                        </span>
                        <p className="text-sm font-semibold text-text-primary">{entry.title}</p>
                      </div>
                      <p className="mt-1 text-xs text-text-muted">
                        {new Date(entry.eventDate).toLocaleDateString()} · {entry.linkedChartCount}{" "}
                        linked chart note(s)
                      </p>
                    </div>
                    <div className="grid gap-2 text-right sm:grid-cols-3">
                      <p className={`text-sm font-semibold ${deltaColor(entry.deltaSubmissions)}`}>
                        {signed(entry.deltaSubmissions)} starts
                      </p>
                      <p
                        className={`text-sm font-semibold ${deltaColor(entry.deltaCompletionRate)}`}
                      >
                        {signed(entry.deltaCompletionRate, "pp")} completion
                      </p>
                      <p className={`text-sm font-semibold ${deltaColor(entry.deltaWaitlist)}`}>
                        {signed(entry.deltaWaitlist)} waitlist
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {entry.notes.map((note) => (
                      <div
                        key={note}
                        className="rounded-lg border border-white/10 bg-surface px-3 py-3 text-sm text-text-muted"
                      >
                        {note}
                      </div>
                    ))}
                  </div>
                </a>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <h3 className="text-sm font-semibold text-text-primary">Anomaly Timeline Overlay</h3>
            <div className="mt-4 space-y-3">
              {data.releaseImpact.annotations.map((annotation) => (
                <div
                  key={annotation.id}
                  className="rounded-lg border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-cyan-300">
                      {annotation.chartKey}
                    </span>
                    <span className="text-xs text-text-muted">
                      {new Date(annotation.annotationDate).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-text-primary">{annotation.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "Opportunities" && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Backlog Items" value={data.opportunities.backlog.length} />
            <StatCard
              label="Avg Score"
              value={
                data.opportunities.backlog.length === 0
                  ? 0
                  : Math.round(
                      data.opportunities.backlog.reduce((sum, item) => sum + item.score, 0) /
                        data.opportunities.backlog.length
                    )
              }
            />
            <StatCard
              label="High Impact"
              value={data.opportunities.backlog.filter((item) => item.impact === "high").length}
            />
            <StatCard
              label="Low Effort"
              value={data.opportunities.backlog.filter((item) => item.effort === "low").length}
            />
            <StatCard
              label="Fast Signal"
              value={
                data.opportunities.backlog.filter((item) => item.timeToSignal === "fast").length
              }
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
            <div className="rounded-xl border border-white/10 bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Opportunity Backlog</h3>
                  <p className="mt-1 text-xs text-text-muted">
                    Ranked using impact, confidence, effort, and time-to-signal.
                  </p>
                </div>
                <a
                  href="/admin/predictions"
                  className="text-xs text-text-muted transition hover:text-text-primary"
                >
                  Open predictive insights
                </a>
              </div>
              <div className="mt-4">
                <KpiDataTable
                  data={data.opportunities.backlog}
                  columns={opportunityColumns()}
                  defaultSortKey="score"
                  defaultSortDir="desc"
                />
              </div>
              <div className="mt-4 grid gap-3">
                {data.opportunities.backlog.map((item) => (
                  <a
                    key={`${item.title}-${item.source}`}
                    href={item.href}
                    className="rounded-lg border border-white/10 bg-white/5 p-4 transition hover:border-white/20 hover:bg-white/10"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                        {item.source}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${confidenceClasses[item.confidence]}`}
                      >
                        {item.confidence}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-primary">
                        score {item.score}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-text-primary">{item.title}</p>
                    <p className="mt-1 text-sm text-text-muted">{item.detail}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${effortClasses[item.effort]}`}
                      >
                        effort {item.effort}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${timeToSignalClasses[item.timeToSignal]}`}
                      >
                        {item.timeToSignal} signal
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <ScoreInputPill label="Impact" value={item.scoreInputs.impact} />
                      <ScoreInputPill label="Confidence" value={item.scoreInputs.confidence} />
                      <ScoreInputPill label="Effort" value={item.scoreInputs.effort} />
                      <ScoreInputPill
                        label="Time To Signal"
                        value={item.scoreInputs.timeToSignal}
                      />
                    </div>
                    <p className="mt-3 text-[11px] uppercase tracking-wide text-text-muted">
                      {item.scoreInputs.formula}
                    </p>
                  </a>
                ))}
              </div>
            </div>
            <div className="space-y-6">
              <div className="rounded-xl border border-white/10 bg-surface p-5">
                <h3 className="text-sm font-semibold text-text-primary">
                  Funnel Leakage Attribution
                </h3>
                <div className="mt-4 space-y-3">
                  {data.opportunities.funnelLeakage.map((item) => (
                    <a
                      key={`${item.from}-${item.to}`}
                      href={item.href}
                      className="block rounded-lg border border-white/10 bg-white/5 p-4 transition hover:border-white/20 hover:bg-white/10"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-text-primary">
                            {item.from} {"->"} {item.to}
                          </p>
                          <p className="mt-1 text-sm text-text-muted">{item.likelyCause}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-red-300">{item.lossCount}</p>
                          <p className="text-xs text-text-muted">{item.lossRate}% loss</p>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-surface p-5">
                <h3 className="text-sm font-semibold text-text-primary">
                  Archetype Market Monitor
                </h3>
                <div className="mt-4 space-y-3">
                  {data.opportunities.archetypeMomentum.map((item) => (
                    <a
                      key={item.archetype}
                      href={item.href}
                      className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/20 hover:bg-white/10"
                    >
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{item.archetype}</p>
                        <p className="text-xs text-text-muted">
                          {item.currentCount} now · {item.previousCount} previous
                        </p>
                      </div>
                      <span className={`text-sm font-semibold ${deltaColor(item.delta)}`}>
                        {signed(item.delta)}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-surface p-5">
              <h3 className="text-sm font-semibold text-text-primary">Channel Leaderboard</h3>
              <div className="mt-4">
                <KpiDataTable
                  data={data.opportunities.leaderboards.channels}
                  columns={channelColumns()}
                  defaultSortKey="conversionRate"
                  defaultSortDir="desc"
                />
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-surface p-5">
              <h3 className="text-sm font-semibold text-text-primary">Archetype Leaderboard</h3>
              <div className="mt-4">
                <KpiDataTable
                  data={data.opportunities.leaderboards.archetypes}
                  columns={archetypeColumns()}
                  defaultSortKey="count"
                  defaultSortDir="desc"
                />
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-surface p-5">
              <h3 className="text-sm font-semibold text-text-primary">Workflow Stages</h3>
              <div className="mt-4 space-y-3">
                {data.opportunities.leaderboards.workflow.map((item) => (
                  <div
                    key={item.stage}
                    className="rounded-lg border border-white/10 bg-white/5 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <p className="text-sm font-semibold text-text-primary">{item.stage}</p>
                      </div>
                      <p className="text-sm font-semibold text-text-primary">{item.submissions}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "Guardrails" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Healthy" value={data.guardrails.healthy} />
            <StatCard label="Breached" value={data.guardrails.breached} />
            <StatCard label="Triage Cases" value={data.triage.length} />
            <StatCard label="Narrative Lines" value={data.narrative.length} />
          </div>

          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">Conversion Guardrails</h3>
            <div className="space-y-3">
              {data.guardrails.items.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="block rounded-lg border border-white/10 bg-white/5 p-4 transition hover:border-white/20 hover:bg-white/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-text-primary">{item.label}</p>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide ${benchmarkStatusClasses[item.status]}`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-text-muted">{item.detail}</p>
                    </div>
                    <p className="text-sm font-semibold text-text-primary">
                      {item.current}/{item.target}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">
              Root-Cause Triage Assistant
            </h3>
            <div className="space-y-3">
              {data.triage.map((item) => (
                <a
                  key={item.title}
                  href={item.href}
                  className="block rounded-lg border border-white/10 bg-white/5 p-4 transition hover:border-white/20 hover:bg-white/10"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${confidenceClasses[item.confidence]}`}
                    >
                      {item.confidence}
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                      {item.cause}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-text-primary">{item.title}</p>
                  <p className="mt-1 text-sm text-text-muted">{item.evidence}</p>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "Decision Review" && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Tracked Decisions" value={data.decisionReview.summary.total} />
            <StatCard label="Due Reviews" value={data.decisionReview.summary.due} />
            <StatCard label="Stale" value={data.decisionReview.summary.stale} />
            <StatCard
              label="Awaiting Outcome"
              value={data.decisionReview.summary.awaitingOutcome}
            />
            <StatCard label="Open Reviews" value={data.decisionReview.summary.openReviews} />
          </div>

          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  Decision Lifecycle Board
                </h3>
                <p className="mt-1 text-xs text-text-muted">
                  Sorted by stale follow-through, due review dates, and missing measured outcomes.
                </p>
              </div>
              <a
                href="/admin/changelog"
                className="text-xs text-text-muted transition hover:text-text-primary"
              >
                Open decision journal
              </a>
            </div>

            <div className="mt-4 space-y-3">
              {data.decisionReview.items.length === 0 && (
                <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-sm text-text-muted">
                  No decision review items in the selected window.
                </div>
              )}
              {data.decisionReview.items.map((item) => (
                <a
                  key={item.id}
                  href={item.href}
                  className="block rounded-lg border border-white/10 bg-white/5 p-4 transition hover:border-white/20 hover:bg-white/10"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <ReviewStateBadge state={item.reviewState} />
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                          {item.entryType}
                        </span>
                        {item.primaryMetricKey && (
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                            {item.primaryMetricKey}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm font-semibold text-text-primary">{item.title}</p>
                      <p className="mt-1 text-sm text-text-muted">{item.detail}</p>
                    </div>
                    <div className="grid gap-2 text-right sm:grid-cols-2 xl:grid-cols-4">
                      <MiniMetric label="Review Date" value={item.reviewDate ?? "Not set"} />
                      <MiniMetric
                        label="Days Until Review"
                        value={
                          item.daysUntilReview == null
                            ? "None"
                            : item.daysUntilReview >= 0
                              ? `${item.daysUntilReview}d`
                              : `${Math.abs(item.daysUntilReview)}d overdue`
                        }
                      />
                      <MiniMetric label="Open Reviews" value={String(item.openReviewCount)} />
                      <MiniMetric label="Updated" value={`${item.daysSinceUpdate}d ago`} />
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <NarrativeCard label="Expected vs Measured" value={item.comparisonLabel} />
                    <NarrativeCard
                      label="Measured Outcome"
                      value={item.measuredOutcome ?? "Measured outcome still missing."}
                    />
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "Auto Briefs" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Auto Brief Generator</h3>
                <p className="mt-1 text-xs text-text-muted">
                  Role-specific brief packs generated from goals, opportunity scores, release
                  impact, guardrails, and decision follow-through in the selected window.
                </p>
              </div>
              <p className="text-xs text-text-muted">
                Generated {new Date(data.briefGenerator.generatedAt).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {data.briefGenerator.packs.map((pack) => (
              <div key={pack.audience} className="rounded-xl border border-white/10 bg-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide ${benchmarkStatusClasses[pack.tone]}`}
                      >
                        {pack.tone}
                      </span>
                      <span className="text-xs uppercase tracking-wide text-text-muted">
                        {pack.audience}
                      </span>
                    </div>
                    <p className="mt-2 text-lg font-semibold text-text-primary">{pack.headline}</p>
                    <p className="mt-2 text-sm text-text-muted">{pack.summary}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <a
                      href={pack.href}
                      className="text-xs text-text-muted transition hover:text-text-primary"
                    >
                      Open source
                    </a>
                    <button
                      onClick={() => void copyBriefPack(pack.audience, pack.copyText)}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-text-primary transition hover:bg-white/10"
                    >
                      {copiedAudience === pack.audience ? "Copied" : "Copy Brief"}
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-text-muted">Signals</p>
                    <div className="mt-3 space-y-2">
                      {pack.bullets.map((line) => (
                        <div
                          key={line}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-text-primary"
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-text-muted">Actions</p>
                    <div className="mt-3 space-y-2">
                      {pack.actions.map((line) => (
                        <div
                          key={line}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-text-primary"
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4 rounded-lg border border-white/10 bg-page px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-text-muted">
                    Copy Preview
                  </p>
                  <pre className="mt-2 whitespace-pre-wrap text-sm text-text-primary">
                    {pack.copyText}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "Strategy Planning" && <StrategyPlanningTab />}
    </div>
  );
}

function ScoreInputPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-text-primary">{Math.round(value)}</p>
    </div>
  );
}

function ReviewStateBadge({ state }: { state: DecisionReviewState }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${decisionReviewClasses[state]}`}
    >
      {state.replace("-", " ")}
    </span>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-sm text-text-primary">{value}</p>
    </div>
  );
}

function NarrativeCard({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-surface px-3 py-3">
      <p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-2 text-sm text-text-primary">{value}</p>
    </div>
  );
}
