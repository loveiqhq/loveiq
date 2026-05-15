import { buildMetricRegistrySnapshot } from "@features/admin/server/metric-registry";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

type DependencyStrength = "weak" | "medium" | "strong";

interface MetricDependencyRow {
  id: number;
  parent_metric_key: string;
  child_metric_key: string;
  relationship_strength: DependencyStrength;
  hypothesis_note: string | null;
  evidence_note: string | null;
  updated_at: string;
}

export interface DashboardTrustGroup {
  href: string;
  label: string;
  score: number;
  metrics: number;
  overdueMetrics: number;
  unownedMetrics: number;
  watchMetrics: number;
  weakestMetricLabels: string[];
}

export interface MetricLineageNode {
  id: number;
  metricKey: string;
  label: string;
  ownerEmail: string | null;
  stewardshipRole: string | null;
  linkedHref: string;
  currentValueLabel: string;
  trustMode: string;
  reviewStatus: "fresh" | "due" | "overdue" | "never";
  status: string;
  sourceOfTruth: string | null;
  formula: string | null;
  trustNote: string | null;
  caveats: string | null;
  trustScore: number;
  upstream: Array<{
    metricKey: string;
    label: string;
    strength: DependencyStrength;
    note: string | null;
  }>;
  downstream: Array<{
    metricKey: string;
    label: string;
    strength: DependencyStrength;
    note: string | null;
  }>;
}

export interface MetricLineageSnapshot {
  generatedAt: string;
  summary: {
    dashboards: number;
    averageTrustScore: number;
    overdueMetrics: number;
    unownedMetrics: number;
    orphanMetrics: number;
    dependencyLinks: number;
  };
  dashboardTrust: DashboardTrustGroup[];
  metrics: MetricLineageNode[];
}

function labelFromHref(href: string): string {
  const segment = href.split("?")[0]?.split("/").filter(Boolean).pop() ?? "admin";
  return segment
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function reviewScore(reviewStatus: MetricLineageNode["reviewStatus"]): number {
  if (reviewStatus === "fresh") return 100;
  if (reviewStatus === "due") return 80;
  if (reviewStatus === "overdue") return 45;
  return 30;
}

function trustModeScore(mode: string): number {
  if (mode === "live") return 100;
  if (mode === "materialized") return 90;
  if (mode === "derived") return 75;
  if (mode === "sampled") return 60;
  return 70;
}

function registryStatusScore(status: string): number {
  if (status === "active") return 100;
  if (status === "watch") return 80;
  if (status === "draft") return 60;
  if (status === "deprecated") return 30;
  return 60;
}

function metricTrustScore(input: {
  reviewStatus: MetricLineageNode["reviewStatus"];
  trustMode: string;
  status: string;
  ownerEmail: string | null;
  caveats: string | null;
  trustNote: string | null;
}): number {
  const base =
    (reviewScore(input.reviewStatus) +
      trustModeScore(input.trustMode) +
      registryStatusScore(input.status) +
      (input.ownerEmail ? 100 : 40)) /
    4;
  const caveatPenalty = input.caveats ? 10 : 0;
  const uncertaintyPenalty = input.trustNote ? 5 : 0;
  return Math.max(0, Math.min(100, round(base - caveatPenalty - uncertaintyPenalty)));
}

async function fetchDependencies(): Promise<MetricDependencyRow[]> {
  try {
    const res = await supabaseFetch(
      "/rest/v1/admin_metric_dependency?select=id,parent_metric_key,child_metric_key,relationship_strength,hypothesis_note,evidence_note,updated_at&order=updated_at.desc",
      { headers: { Range: "0-499" } }
    );
    if (!res.ok) return [];
    return (await res.json()) as MetricDependencyRow[];
  } catch (err) {
    logger.warn({ err }, "Metric lineage dependencies unavailable");
    return [];
  }
}

export async function buildMetricLineageSnapshot(): Promise<MetricLineageSnapshot> {
  const [registry, dependencies] = await Promise.all([
    buildMetricRegistrySnapshot(),
    fetchDependencies(),
  ]);

  const metricByKey = new Map(registry.entries.map((entry) => [entry.metric_key, entry]));

  const metrics = registry.entries
    .map((entry) => {
      const upstream = dependencies
        .filter((dependency) => dependency.child_metric_key === entry.metric_key)
        .map((dependency) => {
          const parent = metricByKey.get(dependency.parent_metric_key);
          return {
            metricKey: dependency.parent_metric_key,
            label: parent?.label ?? dependency.parent_metric_key,
            strength: dependency.relationship_strength,
            note: dependency.evidence_note ?? dependency.hypothesis_note,
          };
        });

      const downstream = dependencies
        .filter((dependency) => dependency.parent_metric_key === entry.metric_key)
        .map((dependency) => {
          const child = metricByKey.get(dependency.child_metric_key);
          return {
            metricKey: dependency.child_metric_key,
            label: child?.label ?? dependency.child_metric_key,
            strength: dependency.relationship_strength,
            note: dependency.evidence_note ?? dependency.hypothesis_note,
          };
        });

      const trustScore = metricTrustScore({
        reviewStatus: entry.review_status,
        trustMode: entry.trust_mode,
        status: entry.status,
        ownerEmail: entry.owner_email,
        caveats: entry.caveats,
        trustNote: entry.trust_note,
      });

      return {
        id: entry.id,
        metricKey: entry.metric_key,
        label: entry.label,
        ownerEmail: entry.owner_email,
        stewardshipRole: entry.stewardship_role,
        linkedHref: entry.linked_href,
        currentValueLabel: entry.current_value_label,
        trustMode: entry.trust_mode,
        reviewStatus: entry.review_status,
        status: entry.status,
        sourceOfTruth: entry.source_of_truth,
        formula: entry.formula,
        trustNote: entry.trust_note,
        caveats: entry.caveats,
        trustScore,
        upstream,
        downstream,
      } satisfies MetricLineageNode;
    })
    .sort((a, b) => a.trustScore - b.trustScore || a.label.localeCompare(b.label));

  const dashboardMap = new Map<string, MetricLineageNode[]>();
  for (const metric of metrics) {
    const href = metric.linkedHref || "/admin/benchmarks";
    const existing = dashboardMap.get(href) ?? [];
    existing.push(metric);
    dashboardMap.set(href, existing);
  }

  const dashboardTrust = [...dashboardMap.entries()]
    .map(([href, entries]) => ({
      href,
      label: labelFromHref(href),
      score: round(entries.reduce((sum, entry) => sum + entry.trustScore, 0) / entries.length),
      metrics: entries.length,
      overdueMetrics: entries.filter(
        (entry) => entry.reviewStatus === "overdue" || entry.reviewStatus === "never"
      ).length,
      unownedMetrics: entries.filter((entry) => !entry.ownerEmail).length,
      watchMetrics: entries.filter((entry) => entry.status === "watch" || entry.status === "draft")
        .length,
      weakestMetricLabels: [...entries]
        .sort((a, b) => a.trustScore - b.trustScore)
        .slice(0, 3)
        .map((entry) => entry.label),
    }))
    .sort((a, b) => a.score - b.score || b.metrics - a.metrics);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      dashboards: dashboardTrust.length,
      averageTrustScore:
        metrics.length > 0
          ? round(metrics.reduce((sum, entry) => sum + entry.trustScore, 0) / metrics.length)
          : 0,
      overdueMetrics: metrics.filter(
        (entry) => entry.reviewStatus === "overdue" || entry.reviewStatus === "never"
      ).length,
      unownedMetrics: metrics.filter((entry) => !entry.ownerEmail).length,
      orphanMetrics: metrics.filter(
        (entry) => entry.upstream.length === 0 && entry.downstream.length === 0
      ).length,
      dependencyLinks: dependencies.length,
    },
    dashboardTrust,
    metrics,
  };
}
