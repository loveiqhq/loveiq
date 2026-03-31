import { loadBenchmarkDefinitions, type AdminMetricOption } from "@/lib/admin/metric-library";
import {
  buildMetricRegistrySnapshot,
  formatMetricValue,
  type AdminMetricRegistrySnapshotEntry,
} from "@/lib/admin/metric-registry";
import { clampDays } from "@/lib/admin/next-level";
import { buildStrategySnapshot } from "@/lib/admin/strategy";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

export type MetricStatusState = "on-track" | "watch" | "off-track" | "critical";

type ReviewState = "fresh" | "due" | "overdue" | "unplanned";

interface AdminMetricStatusRow {
  id: number;
  admin_email: string;
  metric_key: string;
  status_state: MetricStatusState;
  status_reason: string | null;
  owner_email: string | null;
  review_due_at: string | null;
  last_reviewed_at: string | null;
  leading_indicator_key: string | null;
  leading_indicator_note: string | null;
  created_at: string;
  updated_at: string;
}

interface LeadingIndicatorDefault {
  key: string;
  note: string;
}

export interface MetricStatusBoardEntry {
  metricKey: string;
  label: string;
  currentValue: number | null;
  currentValueLabel: string;
  statusState: MetricStatusState;
  statusReason: string;
  statusOwnerEmail: string | null;
  reviewDueAt: string | null;
  lastReviewedAt: string | null;
  reviewState: ReviewState;
  linkedHref: string;
  trustMode: string;
  benchmarkTargetLabel: string | null;
  benchmarkWarningLabel: string | null;
  benchmarkDirection: "higher" | "lower" | null;
  leadingIndicatorKey: string | null;
  leadingIndicatorLabel: string | null;
  leadingIndicatorNote: string | null;
  metricDescription: string;
  updatedAt: string;
}

export interface MetricLeadingIndicatorItem {
  metricKey: string;
  metricLabel: string;
  statusState: MetricStatusState;
  leadingMetricKey: string;
  leadingMetricLabel: string;
  leadingMetricValueLabel: string;
  signalState: "positive" | "watch" | "negative";
  detail: string;
  href: string;
}

export interface MetricStatusSnapshot {
  generatedAt: string;
  days: number;
  summary: {
    totalMetrics: number;
    onTrack: number;
    watch: number;
    offTrack: number;
    critical: number;
    reviewDue: number;
    leadingSignalsAtRisk: number;
  };
  statuses: MetricStatusBoardEntry[];
  leadingIndicators: MetricLeadingIndicatorItem[];
  metricOptions: AdminMetricOption[];
}

const DEFAULT_LEADING_INDICATORS: Record<string, LeadingIndicatorDefault> = {
  total_submissions: {
    key: "waitlist_signups",
    note: "Demand usually moves before start volume, so signups are the earliest input signal.",
  },
  completion_rate: {
    key: "avg_duration_minutes",
    note: "Longer survey time is the earliest friction signal before completion visibly degrades.",
  },
  waitlist_to_start_rate: {
    key: "waitlist_signups",
    note: "Traffic mix shifts often show up in signups before activation efficiency changes.",
  },
  scored_count: {
    key: "completion_rate",
    note: "Scoring volume depends on how much started traffic actually completes.",
  },
  scoring_agreement: {
    key: "open_high_priority_cases",
    note: "Manual-case pressure is an early trust warning before engine confidence fully slips.",
  },
  report_view_rate: {
    key: "scored_count",
    note: "Report viewing weakens quickly when fewer scored outputs are reaching users cleanly.",
  },
  revenue_total: {
    key: "report_view_rate",
    note: "Commercial value usually drops after report engagement weakens.",
  },
};

const GUARDRAIL_TO_METRIC_KEY: Record<string, string> = {
  Completion: "completion_rate",
  "Scoring Agreement": "scoring_agreement",
  "High-Priority Queue": "open_high_priority_cases",
  "Ambiguous Scoring": "scoring_agreement",
};

function stateRank(state: MetricStatusState): number {
  if (state === "critical") return 0;
  if (state === "off-track") return 1;
  if (state === "watch") return 2;
  return 3;
}

function reviewState(reviewDueAt: string | null): ReviewState {
  if (!reviewDueAt) return "unplanned";
  const dueAt = new Date(reviewDueAt).getTime();
  if (Number.isNaN(dueAt)) return "unplanned";
  const remaining = dueAt - Date.now();
  if (remaining < 0) return "overdue";
  if (remaining <= 7 * 86_400_000) return "due";
  return "fresh";
}

function benchmarkState(input: {
  value: number | null;
  target: number;
  warning: number;
  direction: "higher" | "lower";
}): MetricStatusState {
  if (input.value == null) return "watch";
  if (input.direction === "higher") {
    if (input.value >= input.target) return "on-track";
    if (input.value >= input.warning) return "watch";
    if (input.value >= input.warning * 0.8) return "off-track";
    return "critical";
  }
  if (input.value <= input.target) return "on-track";
  if (input.value <= input.warning) return "watch";
  if (input.value <= input.warning * 1.25) return "off-track";
  return "critical";
}

function signalStateFromMetricState(state: MetricStatusState): "positive" | "watch" | "negative" {
  if (state === "on-track") return "positive";
  if (state === "watch") return "watch";
  return "negative";
}

function deriveReason(input: {
  entry: AdminMetricRegistrySnapshotEntry;
  benchmark:
    | {
        targetValue: number;
        warningValue: number;
        direction: "higher" | "lower";
      }
    | undefined;
  derivedState: MetricStatusState;
  northStarDetail: string | null;
  guardrailDetail: string | null;
  leadingLabel: string | null;
}): string {
  const parts: string[] = [];

  if (input.benchmark) {
    parts.push(
      `${input.entry.current_value_label} against target ${formatMetricValue(
        input.benchmark.targetValue,
        input.entry.unit
      )} and warning ${formatMetricValue(input.benchmark.warningValue, input.entry.unit)}.`
    );
  } else if (input.entry.current_value_label !== "—") {
    parts.push(`Current value is ${input.entry.current_value_label}.`);
  } else {
    parts.push("Current metric value is not populated yet.");
  }

  if (input.guardrailDetail) {
    parts.push(input.guardrailDetail);
  } else if (input.northStarDetail) {
    parts.push(input.northStarDetail);
  }

  if (input.leadingLabel) {
    parts.push(`Track ${input.leadingLabel} as the earliest signal for this metric.`);
  }

  if (parts.length === 0) {
    return input.derivedState === "on-track"
      ? "Metric is currently healthy."
      : "Metric needs more explicit status context.";
  }

  return parts.join(" ");
}

async function fetchMetricStatusRows(): Promise<AdminMetricStatusRow[]> {
  try {
    const res = await supabaseFetch("/rest/v1/admin_metric_status?select=*&order=updated_at.desc", {
      headers: { Range: "0-199" },
    });
    if (!res.ok) return [];
    return (await res.json()) as AdminMetricStatusRow[];
  } catch (err) {
    logger.warn({ err }, "Metric status rows unavailable");
    return [];
  }
}

export async function buildMetricStatusSnapshot(inputDays: number): Promise<MetricStatusSnapshot> {
  const days = clampDays(inputDays || 30, 7, 90);
  const [registrySnapshot, statusRows, benchmarkDefinitions, strategySnapshot] = await Promise.all([
    buildMetricRegistrySnapshot(),
    fetchMetricStatusRows(),
    loadBenchmarkDefinitions(),
    buildStrategySnapshot(days),
  ]);

  const rowByMetricKey = new Map(statusRows.map((row) => [row.metric_key, row]));
  const benchmarkByKey = new Map(
    benchmarkDefinitions.map((benchmark) => [benchmark.key, benchmark])
  );
  const northStarByKey = new Map(
    strategySnapshot.northStar.map((metric: any) => [metric.key, metric])
  );
  const guardrailByMetricKey = new Map(
    strategySnapshot.guardrails.items.map((item: any) => [
      GUARDRAIL_TO_METRIC_KEY[item.label] ?? item.label,
      item,
    ])
  );

  const baseStatuses = registrySnapshot.entries.map((entry) => {
    const row = rowByMetricKey.get(entry.metric_key);
    const benchmark = benchmarkByKey.get(entry.metric_key as any);
    const guardrail = guardrailByMetricKey.get(entry.metric_key);
    const derivedState = benchmark
      ? benchmarkState({
          value: entry.current_value,
          target: benchmark.targetValue,
          warning: benchmark.warningValue,
          direction: benchmark.direction,
        })
      : guardrail?.status === "risk"
        ? "off-track"
        : guardrail?.status === "watch"
          ? "watch"
          : entry.status === "watch"
            ? "watch"
            : "on-track";

    const defaultLeading = DEFAULT_LEADING_INDICATORS[entry.metric_key];
    const leadingIndicatorKey = row?.leading_indicator_key ?? defaultLeading?.key ?? null;
    const leadingIndicatorLabel =
      registrySnapshot.entries.find((item) => item.metric_key === leadingIndicatorKey)?.label ??
      registrySnapshot.availableMetrics.find((item) => item.key === leadingIndicatorKey)?.label ??
      null;

    return {
      metricKey: entry.metric_key,
      label: entry.label,
      currentValue: entry.current_value,
      currentValueLabel: entry.current_value_label,
      statusState: row?.status_state ?? derivedState,
      statusReason:
        row?.status_reason ??
        deriveReason({
          entry,
          benchmark,
          derivedState,
          northStarDetail: northStarByKey.get(entry.metric_key)?.description ?? null,
          guardrailDetail: guardrail?.detail ?? null,
          leadingLabel: leadingIndicatorLabel,
        }),
      statusOwnerEmail: row?.owner_email ?? entry.owner_email,
      reviewDueAt: row?.review_due_at ?? entry.review_due_at,
      lastReviewedAt: row?.last_reviewed_at ?? entry.last_reviewed_at,
      reviewState: reviewState(row?.review_due_at ?? entry.review_due_at),
      linkedHref: entry.linked_href,
      trustMode: entry.trust_mode,
      benchmarkTargetLabel: benchmark ? formatMetricValue(benchmark.targetValue, entry.unit) : null,
      benchmarkWarningLabel: benchmark
        ? formatMetricValue(benchmark.warningValue, entry.unit)
        : null,
      benchmarkDirection: benchmark?.direction ?? null,
      leadingIndicatorKey,
      leadingIndicatorLabel,
      leadingIndicatorNote: row?.leading_indicator_note ?? defaultLeading?.note ?? null,
      metricDescription: entry.metric_description,
      updatedAt: row?.updated_at ?? entry.updated_at,
    } satisfies MetricStatusBoardEntry;
  });

  const statusByMetricKey = new Map(baseStatuses.map((entry) => [entry.metricKey, entry]));

  const leadingIndicators = baseStatuses
    .filter((entry) => entry.leadingIndicatorKey && entry.leadingIndicatorKey !== entry.metricKey)
    .map((entry) => {
      const leading = statusByMetricKey.get(entry.leadingIndicatorKey!);
      const signalState = leading ? signalStateFromMetricState(leading.statusState) : "watch";

      return {
        metricKey: entry.metricKey,
        metricLabel: entry.label,
        statusState: entry.statusState,
        leadingMetricKey: entry.leadingIndicatorKey!,
        leadingMetricLabel:
          leading?.label ?? entry.leadingIndicatorLabel ?? entry.leadingIndicatorKey!,
        leadingMetricValueLabel: leading?.currentValueLabel ?? "—",
        signalState,
        detail:
          entry.leadingIndicatorNote ??
          `${leading?.label ?? entry.leadingIndicatorKey} is the earliest signal mapped to ${entry.label}.`,
        href: entry.linkedHref,
      } satisfies MetricLeadingIndicatorItem;
    })
    .sort((a, b) => {
      const signalWeight = (value: MetricLeadingIndicatorItem["signalState"]) =>
        value === "negative" ? 0 : value === "watch" ? 1 : 2;
      return (
        signalWeight(a.signalState) - signalWeight(b.signalState) ||
        stateRank(a.statusState) - stateRank(b.statusState) ||
        a.metricLabel.localeCompare(b.metricLabel)
      );
    });

  const statuses = baseStatuses.sort((a, b) => {
    return (
      stateRank(a.statusState) - stateRank(b.statusState) ||
      (a.reviewState === "overdue" ? -1 : 0) - (b.reviewState === "overdue" ? -1 : 0) ||
      a.label.localeCompare(b.label)
    );
  });

  return {
    generatedAt: new Date().toISOString(),
    days,
    summary: {
      totalMetrics: statuses.length,
      onTrack: statuses.filter((item) => item.statusState === "on-track").length,
      watch: statuses.filter((item) => item.statusState === "watch").length,
      offTrack: statuses.filter((item) => item.statusState === "off-track").length,
      critical: statuses.filter((item) => item.statusState === "critical").length,
      reviewDue: statuses.filter(
        (item) => item.reviewState === "due" || item.reviewState === "overdue"
      ).length,
      leadingSignalsAtRisk: leadingIndicators.filter((item) => item.signalState === "negative")
        .length,
    },
    statuses,
    leadingIndicators,
    metricOptions: registrySnapshot.availableMetrics,
  };
}
