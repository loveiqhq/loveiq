// Stateless utility helpers for strategy.ts. Extracted to keep the main module
// focused on the snapshot orchestration. None of these reach into request state
// or external services — they're pure functions over plain values.

import {
  buildFunnelsHref,
  buildGoalsHref,
  buildProductKpiHref,
  buildScorecardHref,
} from "@/lib/admin/drilldowns";
import { METRIC_LABELS, PIPELINE_STAGE_ORDER } from "@/lib/admin/strategy/constants";
import type { StrategyPipelineSnapshot } from "@/lib/admin/strategy/types";

export const round1 = (value: number) => Math.round(value * 10) / 10;
export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
export const clampDays = (days: number) =>
  Number.isNaN(days) ? 30 : Math.min(Math.max(days, 7), 90);
export const shiftDays = (base: Date, days: number) => {
  const copy = new Date(base);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
};
export const completionRate = (rows: Array<{ status: string }>) =>
  rows.length === 0
    ? 0
    : round1((rows.filter((row) => row.status === "completed").length / rows.length) * 100);
export const durationMinutes = (rows: Array<{ duration_ms: number | null }>) => {
  const durations = rows
    .map((row) => row.duration_ms)
    .filter((value): value is number => value != null && value > 0);
  return durations.length === 0
    ? null
    : round1(durations.reduce((sum, value) => sum + value, 0) / durations.length / 60_000);
};

export const formatMetric = (value: number | null, unit: "percent" | "minutes" | "count") =>
  value == null
    ? "—"
    : unit === "percent"
      ? `${round1(value)}%`
      : unit === "minutes"
        ? `${round1(value)}m`
        : value.toLocaleString();

export const delta = (current: number, previous: number) =>
  previous === 0 ? (current === 0 ? 0 : 100) : round1(((current - previous) / previous) * 100);

export const benchmarkStatus = (
  value: number | null,
  direction: "higher" | "lower",
  target: number,
  warning: number
) => {
  if (value == null) return "watch";
  if (direction === "higher") return value >= target ? "good" : value >= warning ? "watch" : "risk";
  return value <= target ? "good" : value <= warning ? "watch" : "risk";
};

export const normalizeSubmission = (value: unknown) =>
  Array.isArray(value) ? (value[0] ?? null) : value;

export const priorityWeight = (value: string) =>
  value === "high" ? 0 : value === "medium" ? 1 : 2;

export const inRange = (value: string, start: string, end: string) => value >= start && value < end;

export const countInRange = (
  rows: Array<{ created_date_time: string }>,
  start: string,
  end: string
) => rows.filter((row) => inRange(row.created_date_time, start, end)).length;

export const completionInRange = (
  rows: Array<{ created_date_time: string; status: string }>,
  start: string,
  end: string
) => completionRate(rows.filter((row) => inRange(row.created_date_time, start, end)));

export const stageValue = (pipeline: StrategyPipelineSnapshot, label: string) =>
  pipeline.stages.find((stage) => stage.label === label)?.value ?? 0;

export const metricLabel = (key: string) => METRIC_LABELS.get(key) ?? key;

export const topGap = (values: Record<string, number> | null | undefined) => {
  if (!values) return null;
  const sorted = Object.values(values)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a);
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return Math.round(sorted[0]! * 10) / 10;
  return Math.round((sorted[0]! - sorted[1]!) * 10) / 10;
};

export const confidenceToScore = (value: "high" | "medium" | "low") =>
  value === "high" ? 90 : value === "medium" ? 65 : 40;

export const effortToScore = (value: "low" | "medium" | "high") =>
  value === "low" ? 85 : value === "medium" ? 60 : 35;

export const timeToSignalScore = (value: "fast" | "medium" | "slow") =>
  value === "fast" ? 85 : value === "medium" ? 60 : 35;

export const daysUntilDate = (value: string | null) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`).getTime();
  if (Number.isNaN(parsed)) return null;
  return Math.ceil((parsed - Date.now()) / 86_400_000);
};

export const daysSinceIso = (value: string) => {
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.floor((Date.now() - parsed) / 86_400_000));
};

// ────────────────────────────────────────────────────────────────────────────
// Pipeline normalization — takes the raw RPC response and coerces it into the
// canonical StrategyPipelineSnapshot shape (stages in the correct order,
// numeric values, conversion-rate fallbacks). Extracted from strategy.ts.
// ────────────────────────────────────────────────────────────────────────────

export function normalizeConversionPipeline(raw: unknown): StrategyPipelineSnapshot {
  const rawObj = raw as Record<string, unknown> | null;
  const rawStages =
    rawObj?.stages && !Array.isArray(rawObj.stages) && typeof rawObj.stages === "object"
      ? new Map(Object.entries(rawObj.stages as Record<string, unknown>))
      : new Map<string, unknown>();
  const existingStages: Array<{ label?: string; value?: number }> = Array.isArray(rawObj?.stages)
    ? (rawObj!.stages as Array<{ label?: string; value?: number }>)
    : [];
  const stages = PIPELINE_STAGE_ORDER.map(({ key, label }) => {
    const existing = existingStages.find((item) => item?.label === label);
    return {
      key,
      label,
      value: Number(existing?.value ?? rawStages.get(key) ?? 0),
    };
  });

  const conversionRates = Array.isArray(rawObj?.conversionRates)
    ? (rawObj!.conversionRates as Array<{ from?: string; to?: string; rate?: number }>).map(
        (item) => ({
          from: String(item?.from ?? ""),
          to: String(item?.to ?? ""),
          rate: Number(item?.rate ?? 0),
        })
      )
    : stages.slice(0, -1).map((fromStage, index) => {
        // We iterate stages.slice(0, -1), so index + 1 is always within bounds.
        const toStage = stages[index + 1]!;
        return {
          from: fromStage.label,
          to: toStage.label,
          rate: fromStage.value > 0 ? round1((toStage.value / fromStage.value) * 100) : 0,
        };
      });

  type UtmRow = {
    source?: string;
    signups?: number;
    started?: number;
    total?: number;
    completed?: number;
    conversionRate?: number;
    conversion_rate?: number;
    count?: number;
  };
  const utmSources = Array.isArray(rawObj?.utmSources)
    ? (rawObj!.utmSources as UtmRow[]).map((item) => ({
        source: String(item?.source ?? "Direct"),
        signups: Number(item?.signups ?? item?.total ?? item?.count ?? 0),
        started: Number(item?.started ?? item?.total ?? item?.count ?? 0),
        total: Number(item?.total ?? item?.count ?? 0),
        completed: Number(item?.completed ?? 0),
        conversionRate: Number(item?.conversionRate ?? 0),
      }))
    : Array.isArray(rawObj?.by_utm)
      ? (rawObj!.by_utm as UtmRow[]).map((item) => ({
          source: String(item?.source ?? "Direct"),
          signups: Number(item?.signups ?? item?.total ?? 0),
          started: Number(item?.started ?? item?.total ?? 0),
          total: Number(item?.total ?? 0),
          completed: Number(item?.completed ?? 0),
          conversionRate: Number(item?.conversion_rate ?? 0),
        }))
      : [];

  return { stages, conversionRates, utmSources };
}

// ────────────────────────────────────────────────────────────────────────────
// Goal-driver builder — translates a goal's metric_key into the supporting
// "driver" context bullets shown on the strategy dashboard. Pure function,
// no external state.
// ────────────────────────────────────────────────────────────────────────────

type GoalDriver = { label: string; value: string; href: string };

export function goalDrivers(
  metricKey: string,
  days: number,
  pipeline: StrategyPipelineSnapshot,
  topChannel: { source?: string; conversionRate?: number } | null | undefined,
  topLeakage:
    | { from: string; to: string; lossCount: number; lossRate: number; href: string }
    | null
    | undefined,
  highPriorityCases: number,
  scoringAgreement: number | null,
  currentValue: number | null
): GoalDriver[] {
  if (metricKey === "total_submissions") {
    return [
      {
        label: "Waitlist -> start",
        value: `${stageValue(pipeline, "Survey Started")} starts from ${stageValue(pipeline, "Waitlist Signups")} signups`,
        href: buildFunnelsHref({ days, tab: "Conversion Funnel" }),
      },
      {
        label: "Best source",
        value: topChannel
          ? `${topChannel.source} at ${topChannel.conversionRate}% conversion`
          : "No strong source split yet",
        href: buildFunnelsHref({ days, tab: "Cohort Analysis", groupBy: "utm" }),
      },
      {
        label: "Queue pressure",
        value: `${highPriorityCases} high-priority cases open`,
        href: buildGoalsHref({ status: "active", metricKey: "open_high_priority_cases" }),
      },
    ];
  }

  if (metricKey === "completion_rate") {
    return [
      {
        label: "Biggest leak",
        value: topLeakage
          ? `${topLeakage.from} -> ${topLeakage.to} loses ${topLeakage.lossCount} users`
          : "No major leak yet",
        href: topLeakage?.href ?? buildProductKpiHref({ days, tab: "Survey Questions" }),
      },
      {
        label: "Scoring agreement",
        value:
          scoringAgreement == null
            ? "Not enough scored submissions"
            : `${scoringAgreement}% agreement`,
        href: buildScorecardHref({ days, tab: "Scorecard" }),
      },
      {
        label: "Case pressure",
        value: `${highPriorityCases} high-priority cases can depress trust`,
        href: buildGoalsHref({ status: "active", metricKey: "open_high_priority_cases" }),
      },
    ];
  }

  if (metricKey === "scored_count") {
    return [
      {
        label: "Completed submissions",
        value: `${stageValue(pipeline, "Survey Completed")} completions ready for scoring`,
        href: buildFunnelsHref({ days, tab: "Conversion Funnel" }),
      },
      {
        label: "Scoring agreement",
        value:
          scoringAgreement == null
            ? "Engine comparison unavailable"
            : `${scoringAgreement}% agreement`,
        href: buildScorecardHref({ days, tab: "Scorecard" }),
      },
      {
        label: "Current output",
        value: currentValue == null ? "No score data yet" : `${currentValue} all-time scored rows`,
        href: buildScorecardHref({ days, tab: "Scorecard" }),
      },
    ];
  }

  return [
    {
      label: "Queue pressure",
      value: `${highPriorityCases} high-priority cases open`,
      href: buildGoalsHref({ status: "active", metricKey: "open_high_priority_cases" }),
    },
    {
      label: "Biggest leak",
      value: topLeakage
        ? `${topLeakage.lossRate}% lost at ${topLeakage.from} -> ${topLeakage.to}`
        : "No leak signal yet",
      href: topLeakage?.href ?? buildFunnelsHref({ days, tab: "Conversion Funnel" }),
    },
    {
      label: "Best source",
      value: topChannel
        ? `${topChannel.source} converts at ${topChannel.conversionRate}%`
        : "No source winner yet",
      href: buildFunnelsHref({ days, tab: "Cohort Analysis", groupBy: "utm" }),
    },
  ];
}
