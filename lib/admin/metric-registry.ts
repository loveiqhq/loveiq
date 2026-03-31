import {
  ADMIN_METRIC_OPTIONS,
  type AdminMetricOption,
  fetchMetricValue,
} from "@/lib/admin/metric-library";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

export type MetricStewardshipRole = "strategy" | "product" | "growth" | "tech" | "ops";
export type MetricRegistryStatus = "draft" | "active" | "watch" | "deprecated";
export type MetricTrustMode = "live" | "derived" | "sampled" | "materialized";
export type MetricUnit = "percent" | "minutes" | "count" | "currency" | "score";

export interface AdminMetricRegistryEntry {
  id: number;
  admin_email: string;
  metric_key: string;
  label: string;
  description: string | null;
  owner_email: string | null;
  stewardship_role: MetricStewardshipRole | null;
  formula: string | null;
  source_of_truth: string | null;
  review_cadence_days: number;
  last_reviewed_at: string | null;
  unit: MetricUnit;
  linked_href: string | null;
  trust_mode: MetricTrustMode;
  trust_note: string | null;
  caveats: string | null;
  status: MetricRegistryStatus;
  created_at: string;
  updated_at: string;
}

export interface AdminMetricRegistrySnapshotEntry {
  id: number;
  metric_key: string;
  label: string;
  description: string | null;
  owner_email: string | null;
  stewardship_role: MetricStewardshipRole | null;
  formula: string | null;
  source_of_truth: string | null;
  review_cadence_days: number;
  last_reviewed_at: string | null;
  review_due_at: string | null;
  review_status: "fresh" | "due" | "overdue" | "never";
  unit: MetricUnit;
  linked_href: string;
  trust_mode: MetricTrustMode;
  trust_note: string | null;
  caveats: string | null;
  status: MetricRegistryStatus;
  current_value: number | null;
  current_value_label: string;
  metric_description: string;
  created_at: string;
  updated_at: string;
}

function reviewDueAt(lastReviewedAt: string | null, cadenceDays: number): string | null {
  if (!lastReviewedAt) return null;
  return new Date(new Date(lastReviewedAt).getTime() + cadenceDays * 86_400_000).toISOString();
}

function reviewStatus(
  lastReviewedAt: string | null,
  cadenceDays: number
): "fresh" | "due" | "overdue" | "never" {
  if (!lastReviewedAt) return "never";
  const dueAt = new Date(new Date(lastReviewedAt).getTime() + cadenceDays * 86_400_000).getTime();
  const now = Date.now();
  if (dueAt < now) return "overdue";
  if (dueAt - now <= 7 * 86_400_000) return "due";
  return "fresh";
}

export function formatMetricValue(value: number | null, unit: MetricUnit): string {
  if (value == null) return "—";
  if (unit === "percent") return `${Math.round(value * 10) / 10}%`;
  if (unit === "minutes") return `${Math.round(value * 10) / 10}m`;
  if (unit === "currency") return `$${Math.round(value * 100) / 100}`;
  if (unit === "score") return String(Math.round(value * 10) / 10);
  return value.toLocaleString();
}

export async function fetchMetricRegistryEntries(): Promise<AdminMetricRegistryEntry[]> {
  try {
    const res = await supabaseFetch(
      "/rest/v1/admin_metric_registry?select=*&order=updated_at.desc",
      {
        headers: { Range: "0-199" },
      }
    );
    if (!res.ok) return [];
    return (await res.json()) as AdminMetricRegistryEntry[];
  } catch (err) {
    logger.warn({ err }, "Metric registry unavailable");
    return [];
  }
}

export async function buildMetricRegistrySnapshot(): Promise<{
  entries: AdminMetricRegistrySnapshotEntry[];
  availableMetrics: AdminMetricOption[];
  coverage: {
    totalMetrics: number;
    coveredMetrics: number;
    unownedMetrics: number;
    overdueReviews: number;
    activeMetrics: number;
  };
}> {
  const entries = await fetchMetricRegistryEntries();
  const byMetricKey = new Map(entries.map((entry) => [entry.metric_key, entry]));
  const metricValues: Record<string, number | null> = {};

  await Promise.all(
    entries.map(async (entry) => {
      metricValues[entry.metric_key] = await fetchMetricValue(entry.metric_key);
    })
  );

  const snapshotEntries = entries.map((entry) => {
    const option = ADMIN_METRIC_OPTIONS.find((item) => item.key === entry.metric_key);
    const reviewDue = reviewDueAt(entry.last_reviewed_at, entry.review_cadence_days);
    return {
      id: entry.id,
      metric_key: entry.metric_key,
      label: entry.label,
      description: entry.description,
      owner_email: entry.owner_email,
      stewardship_role: entry.stewardship_role,
      formula: entry.formula,
      source_of_truth: entry.source_of_truth,
      review_cadence_days: entry.review_cadence_days,
      last_reviewed_at: entry.last_reviewed_at,
      review_due_at: reviewDue,
      review_status: reviewStatus(entry.last_reviewed_at, entry.review_cadence_days),
      unit: entry.unit,
      linked_href: entry.linked_href || option?.href || "/admin/benchmarks",
      trust_mode: entry.trust_mode,
      trust_note: entry.trust_note,
      caveats: entry.caveats,
      status: entry.status,
      current_value: metricValues[entry.metric_key] ?? null,
      current_value_label: formatMetricValue(metricValues[entry.metric_key] ?? null, entry.unit),
      metric_description: option?.description || entry.description || "No metric description.",
      created_at: entry.created_at,
      updated_at: entry.updated_at,
    };
  });

  return {
    entries: snapshotEntries,
    availableMetrics: ADMIN_METRIC_OPTIONS.filter((item) => !byMetricKey.has(item.key)),
    coverage: {
      totalMetrics: ADMIN_METRIC_OPTIONS.length,
      coveredMetrics: snapshotEntries.length,
      unownedMetrics: snapshotEntries.filter((item) => !item.owner_email).length,
      overdueReviews: snapshotEntries.filter((item) => item.review_status === "overdue").length,
      activeMetrics: snapshotEntries.filter((item) => item.status === "active").length,
    },
  };
}
