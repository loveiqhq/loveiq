import {
  DASHBOARD_SUBSCRIPTION_OPTIONS,
  fetchDashboardSubscriptions,
} from "@features/admin/server/dashboard-subscriptions";
import { fetchMetricRegistryEntries } from "@features/admin/server/metric-registry";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@/lib/logger";

type MaturityBand = "foundational" | "developing" | "advanced" | "elite";
type DimensionTone = "weak" | "medium" | "strong";

interface DimensionMetric {
  label: string;
  value: string;
}

export interface WorkspaceMaturityDimension {
  key: string;
  label: string;
  score: number;
  tone: DimensionTone;
  detail: string;
  metrics: DimensionMetric[];
  gaps: string[];
  nextStep: string;
}

export interface WorkspaceMaturitySnapshot {
  generatedAt: string;
  overallScore: number;
  band: MaturityBand;
  strengths: string[];
  gaps: string[];
  dimensions: WorkspaceMaturityDimension[];
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function toneFromScore(score: number): DimensionTone {
  if (score >= 75) return "strong";
  if (score >= 50) return "medium";
  return "weak";
}

function bandFromScore(score: number): MaturityBand {
  if (score >= 80) return "elite";
  if (score >= 65) return "advanced";
  if (score >= 45) return "developing";
  return "foundational";
}

async function fetchRows<T>(path: string, range = "0-199"): Promise<T[]> {
  try {
    const res = await supabaseFetch(path, { headers: { Range: range } });
    if (!res.ok) return [];
    return (await res.json()) as T[];
  } catch (err) {
    logger.warn({ err, path }, "Workspace maturity query failed");
    return [];
  }
}

export async function buildWorkspaceMaturitySnapshot(): Promise<WorkspaceMaturitySnapshot> {
  const [
    metricEntries,
    subscriptions,
    alerts,
    actions,
    reviews,
    comments,
    initiatives,
    bets,
    competitiveMoves,
    dependencies,
  ] = await Promise.all([
    fetchMetricRegistryEntries(),
    fetchDashboardSubscriptions(),
    fetchRows<Array<{ id: number; is_active: boolean }>[number]>(
      "/rest/v1/admin_alert_rule?select=id,is_active"
    ),
    fetchRows<
      Array<{
        id: number;
        status: string;
        owner_email: string | null;
        metric_key: string | null;
      }>[number]
    >("/rest/v1/admin_action_item?select=id,status,owner_email,metric_key"),
    fetchRows<Array<{ id: number; status: string; due_date: string | null }>[number]>(
      "/rest/v1/admin_review_request?select=id,status,due_date"
    ),
    fetchRows<Array<{ id: number }>[number]>("/rest/v1/admin_resource_comment?select=id", "0-499"),
    fetchRows<Array<{ id: number; status: string; primary_metric_key: string | null }>[number]>(
      "/rest/v1/admin_strategy_initiative?select=id,status,primary_metric_key"
    ),
    fetchRows<Array<{ id: number; status: string; primary_metric_key: string | null }>[number]>(
      "/rest/v1/admin_strategy_bet?select=id,status,primary_metric_key"
    ),
    fetchRows<Array<{ id: number; primary_metric_key: string | null }>[number]>(
      "/rest/v1/admin_competitive_watch?select=id,primary_metric_key"
    ),
    fetchRows<Array<{ id: number }>[number]>("/rest/v1/admin_metric_dependency?select=id", "0-499"),
  ]);

  const coveredMetrics = metricEntries.length;
  const ownedMetrics = metricEntries.filter((entry) => entry.owner_email).length;
  const trustedMetrics = metricEntries.filter(
    (entry) => entry.source_of_truth && entry.formula && entry.trust_note
  ).length;
  const overdueReviews = metricEntries.filter((entry) => {
    if (!entry.last_reviewed_at) return true;
    const dueAt =
      new Date(entry.last_reviewed_at).getTime() + entry.review_cadence_days * 86_400_000;
    return dueAt < Date.now();
  }).length;

  const metricsScore = clampScore(
    ratio(coveredMetrics, 20) * 35 +
      ratio(ownedMetrics, coveredMetrics || 1) * 25 +
      (1 - ratio(overdueReviews, coveredMetrics || 1)) * 20 +
      ratio(trustedMetrics, coveredMetrics || 1) * 20
  );

  const strategyMetricLinked =
    initiatives.filter((entry) => entry.primary_metric_key).length +
    bets.filter((entry) => entry.primary_metric_key).length +
    competitiveMoves.filter((entry) => entry.primary_metric_key).length;
  const strategyEntityCount = initiatives.length + bets.length + competitiveMoves.length;

  const strategyScore = clampScore(
    ratio(initiatives.length, 4) * 30 +
      ratio(bets.length, 3) * 20 +
      ratio(competitiveMoves.length, 3) * 20 +
      ratio(dependencies.length, 6) * 20 +
      ratio(strategyMetricLinked, strategyEntityCount || 1) * 10
  );

  const activeAlerts = alerts.filter((entry) => entry.is_active).length;
  const openReviews = reviews.filter((entry) =>
    ["requested", "in-review", "changes-requested"].includes(entry.status)
  ).length;
  const overdueQueueItems = reviews.filter(
    (entry) =>
      entry.due_date != null &&
      entry.due_date < new Date().toISOString().slice(0, 10) &&
      !["approved", "rejected"].includes(entry.status)
  ).length;

  const governanceScore = clampScore(
    ratio(activeAlerts, 5) * 25 +
      ratio(reviews.length, 12) * 20 +
      ratio(comments.length, 30) * 20 +
      (1 - ratio(overdueQueueItems, reviews.length || 1)) * 20 +
      ratio(openReviews, reviews.length || 1) * 15
  );

  const ownedActions = actions.filter((entry) => entry.owner_email).length;
  const metricLinkedActions = actions.filter((entry) => entry.metric_key).length;
  const doneActions = actions.filter((entry) => entry.status === "done").length;

  const executionScore = clampScore(
    ratio(actions.length, 12) * 25 +
      ratio(ownedActions, actions.length || 1) * 25 +
      ratio(metricLinkedActions, actions.length || 1) * 30 +
      ratio(doneActions, actions.length || 1) * 20
  );

  const activeSubscriptions = subscriptions.filter((entry) => entry.is_active);
  const dashboardCoverage = new Set(activeSubscriptions.map((entry) => entry.dashboard_key)).size;
  const cadences = new Set(activeSubscriptions.map((entry) => entry.cadence)).size;

  const distributionScore = clampScore(
    ratio(activeSubscriptions.length, 6) * 35 +
      ratio(dashboardCoverage, DASHBOARD_SUBSCRIPTION_OPTIONS.length) * 45 +
      ratio(cadences, 3) * 20
  );

  const dimensions: WorkspaceMaturityDimension[] = [
    {
      key: "metrics",
      label: "Metrics Governance",
      score: metricsScore,
      tone: toneFromScore(metricsScore),
      detail: "Registry coverage, ownership, review freshness, and trust metadata.",
      metrics: [
        { label: "Covered metrics", value: `${coveredMetrics}` },
        { label: "Owned metrics", value: `${ownedMetrics}` },
        { label: "Overdue reviews", value: `${overdueReviews}` },
        { label: "Trusted definitions", value: `${trustedMetrics}` },
      ],
      gaps: [
        ...(coveredMetrics < 10
          ? ["Registry still covers too little of the operating surface."]
          : []),
        ...(ownedMetrics < coveredMetrics
          ? ["Some canonical metrics still have no explicit owner."]
          : []),
        ...(overdueReviews > 0
          ? ["Metric review cadence is slipping on at least one definition."]
          : []),
        ...(trustedMetrics < coveredMetrics
          ? ["Some metrics still lack full formula/source/trust notes."]
          : []),
      ],
      nextStep:
        "Close the remaining owner and trust-definition gaps so every important metric is reviewable and defensible.",
    },
    {
      key: "strategy",
      label: "Strategy Planning",
      score: strategyScore,
      tone: toneFromScore(strategyScore),
      detail: "Initiatives, bets, competitive watch, and metric dependencies.",
      metrics: [
        { label: "Initiatives", value: `${initiatives.length}` },
        { label: "Strategic bets", value: `${bets.length}` },
        { label: "Competitive signals", value: `${competitiveMoves.length}` },
        { label: "Metric dependencies", value: `${dependencies.length}` },
      ],
      gaps: [
        ...(initiatives.length < 3 ? ["Strategy planning needs more initiative coverage."] : []),
        ...(bets.length < 2 ? ["Strategic bet tracking is still shallow."] : []),
        ...(competitiveMoves.length < 2 ? ["Competitive watch needs more live entries."] : []),
        ...(dependencies.length < 3 ? ["Metric dependency mapping is still thin."] : []),
      ],
      nextStep:
        "Link more initiatives and bets to canonical metrics so strategy tradeoffs show up clearly in the operating layer.",
    },
    {
      key: "governance",
      label: "Governance & Review",
      score: governanceScore,
      tone: toneFromScore(governanceScore),
      detail: "Alerts, review activity, collaboration, and queue discipline.",
      metrics: [
        { label: "Active alerts", value: `${activeAlerts}` },
        { label: "Review requests", value: `${reviews.length}` },
        { label: "Open reviews", value: `${openReviews}` },
        { label: "Comments", value: `${comments.length}` },
      ],
      gaps: [
        ...(activeAlerts < 3 ? ["Operational alert coverage is still too narrow."] : []),
        ...(reviews.length < 6
          ? ["Review workflow is not yet broad enough across risky admin changes."]
          : []),
        ...(comments.length < 10 ? ["Collaboration threads are still lightly used."] : []),
        ...(overdueQueueItems > 0 ? ["Some review items are overdue and need closure."] : []),
      ],
      nextStep:
        "Raise alert and review coverage on the most sensitive admin surfaces so governance becomes habitual, not optional.",
    },
    {
      key: "execution",
      label: "Execution Loop",
      score: executionScore,
      tone: toneFromScore(executionScore),
      detail: "Tracked actions, ownership, metric linkage, and closure discipline.",
      metrics: [
        { label: "Action items", value: `${actions.length}` },
        { label: "Owned actions", value: `${ownedActions}` },
        { label: "Metric-linked actions", value: `${metricLinkedActions}` },
        { label: "Done actions", value: `${doneActions}` },
      ],
      gaps: [
        ...(actions.length < 6 ? ["Insight-to-action coverage is still too light."] : []),
        ...(ownedActions < actions.length ? ["Some actions still have no accountable owner."] : []),
        ...(metricLinkedActions < actions.length
          ? ["Not every action is tied back to a canonical metric."]
          : []),
      ],
      nextStep:
        "Use the action tracker more aggressively so every important signal has an owner, review date, and metric connection.",
    },
    {
      key: "distribution",
      label: "Distribution",
      score: distributionScore,
      tone: toneFromScore(distributionScore),
      detail: "Internal dashboard subscriptions and coverage across core operating views.",
      metrics: [
        { label: "Active subscriptions", value: `${activeSubscriptions.length}` },
        { label: "Dashboards covered", value: `${dashboardCoverage}` },
        { label: "Cadences in use", value: `${cadences}` },
        { label: "Available dashboards", value: `${DASHBOARD_SUBSCRIPTION_OPTIONS.length}` },
      ],
      gaps: [
        ...(activeSubscriptions.length < 3
          ? ["Internal dashboard subscription coverage is still minimal."]
          : []),
        ...(dashboardCoverage < 4
          ? ["Too few core dashboards are wired into recurring internal distribution."]
          : []),
        ...(cadences < 2 ? ["Distribution cadence is not varied enough yet."] : []),
      ],
      nextStep:
        "Expand subscriptions across command-center and role dashboards so the right people stay attached to the right operating views.",
    },
  ];

  const overallScore = clampScore(
    dimensions.reduce((sum, dimension) => sum + dimension.score, 0) / dimensions.length
  );
  const band = bandFromScore(overallScore);
  const strengths = dimensions
    .filter((dimension) => dimension.score >= 70)
    .map((dimension) => `${dimension.label} is operating at ${dimension.score}/100.`);
  const gaps = dimensions.flatMap((dimension) => dimension.gaps).slice(0, 8);

  return {
    generatedAt: new Date().toISOString(),
    overallScore,
    band,
    strengths,
    gaps,
    dimensions,
  };
}
