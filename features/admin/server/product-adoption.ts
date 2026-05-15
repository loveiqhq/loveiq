import type { AdminBenchmarkDefinition } from "@/data/admin-benchmarks";
import {
  ADMIN_METRIC_OPTIONS,
  fetchMetricValue,
  loadBenchmarkDefinitions,
} from "@features/admin/server/metric-library";
import {
  fetchMetricRegistryEntries,
  formatMetricValue,
  type AdminMetricRegistryEntry,
  type MetricUnit,
} from "@features/admin/server/metric-registry";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@/lib/logger";

type LaunchCategory = "survey-change" | "site-update" | "feature";
type ReviewStatus = "fresh" | "due" | "overdue" | "never" | "unknown";
type MetricStatus = "good" | "watch" | "risk" | "unknown";

interface ReleaseRow {
  id: number;
  title: string;
  description: string | null;
  category: LaunchCategory;
  owner_email: string | null;
  primary_metric_key: string | null;
  expected_impact: string | null;
  review_date: string | null;
  measured_outcome: string | null;
  event_date: string;
  updated_at: string;
}

interface ReviewRow {
  id: number;
  resource_id: number | null;
  status: string;
  due_date: string | null;
}

interface DecisionRow {
  id: number;
  linked_release_id: number | null;
  status: "draft" | "approved" | "monitoring" | "validated" | "rolled-back";
  updated_at: string;
}

interface ActionRow {
  id: number;
  source_id: number | null;
  status: "open" | "in-progress" | "blocked" | "done";
  priority: "high" | "medium" | "low";
}

interface MetricSignal {
  key: string | null;
  label: string;
  href: string;
  status: MetricStatus;
  currentValue: number | null;
  currentLabel: string;
  targetLabel: string | null;
  warningLabel: string | null;
  trustMode: string | null;
  trustNote: string | null;
  reviewStatus: ReviewStatus;
}

export interface ProductLaunchSnapshot {
  id: number;
  title: string;
  description: string | null;
  category: LaunchCategory;
  ownerEmail: string | null;
  eventDate: string;
  updatedAt: string;
  reviewDate: string | null;
  expectedImpact: string | null;
  measuredOutcome: string | null;
  metric: MetricSignal;
  blindspotCount: number;
  confidence: "high" | "medium" | "low";
  confidenceScore: number;
  adoptionState: "validated" | "monitoring" | "attention" | "blindspot";
  adoptionTone: "good" | "watch" | "risk" | "neutral";
  adoptionDetail: string;
  daysSinceLaunch: number | null;
  daysToReview: number | null;
  openReviewCount: number;
  overdueReviewCount: number;
  linkedDecisionCount: number;
  validatedDecisionCount: number;
  openActionCount: number;
  blockedActionCount: number;
}

export interface ProductAdoptionSnapshot {
  summary: {
    total: number;
    validated: number;
    monitoring: number;
    attention: number;
    blindspots: number;
    openReviews: number;
  };
  launches: ProductLaunchSnapshot[];
  metricOptions: typeof ADMIN_METRIC_OPTIONS;
  generatedAt: string;
}

function reviewStatus(entry: AdminMetricRegistryEntry | undefined): ReviewStatus {
  if (!entry) return "unknown";
  if (!entry.last_reviewed_at) return "never";
  const dueAt = new Date(entry.last_reviewed_at).getTime() + entry.review_cadence_days * 86_400_000;
  if (dueAt < Date.now()) return "overdue";
  if (dueAt - Date.now() <= 7 * 86_400_000) return "due";
  return "fresh";
}

function inferUnit(
  metricKey: string,
  benchmark: AdminBenchmarkDefinition | undefined,
  registryEntry: AdminMetricRegistryEntry | undefined
): MetricUnit {
  if (registryEntry?.unit) return registryEntry.unit;
  if (benchmark?.unit) return benchmark.unit as MetricUnit;
  if (metricKey.includes("rate") || metricKey.includes("agreement")) return "percent";
  if (metricKey.includes("duration") || metricKey.includes("minutes")) return "minutes";
  if (metricKey.includes("revenue")) return "currency";
  return "count";
}

function metricStatus(
  value: number | null,
  benchmark: AdminBenchmarkDefinition | undefined
): MetricStatus {
  if (value == null || !benchmark) return "unknown";
  if (benchmark.direction === "higher") {
    if (value >= benchmark.targetValue) return "good";
    if (value >= benchmark.warningValue) return "watch";
    return "risk";
  }
  if (value <= benchmark.targetValue) return "good";
  if (value <= benchmark.warningValue) return "watch";
  return "risk";
}

function daysSince(dateValue: string | null): number | null {
  if (!dateValue) return null;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86_400_000));
}

function daysUntil(dateValue: string | null): number | null {
  if (!dateValue) return null;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.ceil((parsed.getTime() - Date.now()) / 86_400_000);
}

function confidenceBand(score: number): ProductLaunchSnapshot["confidence"] {
  if (score >= 78) return "high";
  if (score >= 56) return "medium";
  return "low";
}

function adoptionSignal(input: {
  hasMetric: boolean;
  blindspotCount: number;
  benchmarkStatus: MetricStatus;
  measuredOutcome: string | null;
  reviewDate: string | null;
  validatedDecisionCount: number;
  openReviewCount: number;
  daysToReview: number | null;
}) {
  if (!input.hasMetric || input.blindspotCount >= 2) {
    return {
      state: "blindspot" as const,
      tone: "neutral" as const,
      detail: "Launch is missing enough metric coverage or governance to judge adoption cleanly.",
    };
  }

  if (input.measuredOutcome || input.validatedDecisionCount > 0) {
    return {
      state: "validated" as const,
      tone: "good" as const,
      detail: "Launch already has a measured outcome or a validated follow-up decision attached.",
    };
  }

  if (
    input.benchmarkStatus === "risk" ||
    (input.daysToReview != null && input.daysToReview < 0) ||
    input.openReviewCount > 0
  ) {
    return {
      state: "attention" as const,
      tone: "risk" as const,
      detail:
        "Launch needs intervention because reviews are open, review timing slipped, or the linked metric is off guardrail.",
    };
  }

  return {
    state: "monitoring" as const,
    tone: "watch" as const,
    detail:
      input.reviewDate != null
        ? "Launch is still in its monitoring window and has linked metric coverage."
        : "Launch has signal, but a formal review date is still missing.",
  };
}

function buildMetricSignal(
  metricKey: string | null,
  metricValues: Map<string, number | null>,
  benchmarkMap: Map<string, AdminBenchmarkDefinition>,
  registryMap: Map<string, AdminMetricRegistryEntry>
): MetricSignal {
  if (!metricKey) {
    return {
      key: null,
      label: "No linked metric",
      href: "/admin/benchmarks",
      status: "unknown",
      currentValue: null,
      currentLabel: "Not linked",
      targetLabel: null,
      warningLabel: null,
      trustMode: null,
      trustNote: null,
      reviewStatus: "unknown",
    };
  }

  const option = ADMIN_METRIC_OPTIONS.find((item) => item.key === metricKey);
  const benchmark = benchmarkMap.get(metricKey);
  const registryEntry = registryMap.get(metricKey);
  const unit = inferUnit(metricKey, benchmark, registryEntry);
  const currentValue = metricValues.get(metricKey) ?? null;

  return {
    key: metricKey,
    label: registryEntry?.label ?? benchmark?.label ?? option?.label ?? metricKey,
    href: registryEntry?.linked_href ?? option?.href ?? "/admin/benchmarks",
    status: metricStatus(currentValue, benchmark),
    currentValue,
    currentLabel: formatMetricValue(currentValue, unit),
    targetLabel: benchmark ? formatMetricValue(benchmark.targetValue, unit) : null,
    warningLabel: benchmark ? formatMetricValue(benchmark.warningValue, unit) : null,
    trustMode: registryEntry?.trust_mode ?? null,
    trustNote: registryEntry?.trust_note ?? null,
    reviewStatus: reviewStatus(registryEntry),
  };
}

export async function buildProductAdoptionSnapshot(days: number): Promise<ProductAdoptionSnapshot> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const [releasesRes, reviewsRes, decisionsRes, actionsRes, benchmarks, registryEntries] =
    await Promise.all([
      supabaseFetch(
        [
          "/rest/v1/product_changelog?select=",
          [
            "id",
            "title",
            "description",
            "category",
            "owner_email",
            "primary_metric_key",
            "expected_impact",
            "review_date",
            "measured_outcome",
            "event_date",
            "updated_at",
          ].join(","),
          "&or=(category.eq.feature,category.eq.survey-change,category.eq.site-update)",
          `&event_date=gte.${encodeURIComponent(since)}`,
          "&order=event_date.desc",
        ].join(""),
        { headers: { Range: "0-199" } }
      ),
      supabaseFetch(
        "/rest/v1/admin_review_request?select=id,status,resource_id,due_date&resource_type=eq.release-entry",
        { headers: { Range: "0-199" } }
      ),
      supabaseFetch(
        "/rest/v1/admin_decision_entry?select=id,linked_release_id,status,updated_at&linked_release_id=not.is.null",
        { headers: { Range: "0-199" } }
      ),
      supabaseFetch(
        "/rest/v1/admin_action_item?select=id,source_id,status,priority&source_type=eq.release&source_id=not.is.null",
        { headers: { Range: "0-199" } }
      ),
      loadBenchmarkDefinitions(),
      fetchMetricRegistryEntries(),
    ]);

  if (!releasesRes.ok || !reviewsRes.ok || !decisionsRes.ok || !actionsRes.ok) {
    logger.error(
      {
        statuses: [releasesRes.status, reviewsRes.status, decisionsRes.status, actionsRes.status],
      },
      "Product adoption snapshot query failed"
    );
    throw new Error("product_adoption_query_failed");
  }

  const releases = (await releasesRes.json()) as ReleaseRow[];
  const reviews = (await reviewsRes.json()) as ReviewRow[];
  const decisions = (await decisionsRes.json()) as DecisionRow[];
  const actions = (await actionsRes.json()) as ActionRow[];

  const benchmarkMap = new Map(benchmarks.map((item) => [item.key, item]));
  const registryMap = new Map(registryEntries.map((item) => [item.metric_key, item]));
  const reviewMap = new Map<number, ReviewRow[]>();
  const decisionMap = new Map<number, DecisionRow[]>();
  const actionMap = new Map<number, ActionRow[]>();

  for (const review of reviews) {
    if (review.resource_id == null) continue;
    const current = reviewMap.get(review.resource_id) ?? [];
    current.push(review);
    reviewMap.set(review.resource_id, current);
  }

  for (const decision of decisions) {
    if (decision.linked_release_id == null) continue;
    const current = decisionMap.get(decision.linked_release_id) ?? [];
    current.push(decision);
    decisionMap.set(decision.linked_release_id, current);
  }

  for (const action of actions) {
    if (action.source_id == null) continue;
    const current = actionMap.get(action.source_id) ?? [];
    current.push(action);
    actionMap.set(action.source_id, current);
  }

  const metricKeys = [
    ...new Set(releases.map((item) => item.primary_metric_key).filter(Boolean)),
  ] as string[];
  const metricValues = new Map<string, number | null>();
  await Promise.all(
    metricKeys.map(async (metricKey) => {
      metricValues.set(metricKey, await fetchMetricValue(metricKey));
    })
  );

  const launches = releases.map((release) => {
    const metric = buildMetricSignal(
      release.primary_metric_key,
      metricValues,
      benchmarkMap,
      registryMap
    );
    const releaseReviews = reviewMap.get(release.id) ?? [];
    const linkedDecisions = decisionMap.get(release.id) ?? [];
    const linkedActions = actionMap.get(release.id) ?? [];
    const blindspotCount =
      (metric.key ? 0 : 1) +
      (metric.currentValue == null ? 1 : 0) +
      (metric.status === "unknown" ? 1 : 0) +
      (metric.reviewStatus === "overdue" || metric.reviewStatus === "never" ? 1 : 0);

    let confidenceScore = 24;
    if (metric.key) confidenceScore += 14;
    if (metric.currentValue != null) confidenceScore += 12;
    if (metric.targetLabel) confidenceScore += 8;
    if (release.owner_email) confidenceScore += 8;
    if (release.review_date) confidenceScore += 8;
    if (release.expected_impact) confidenceScore += 8;
    if (release.measured_outcome) confidenceScore += 12;
    if (linkedDecisions.length > 0) confidenceScore += 6;
    if (linkedActions.length > 0) confidenceScore += 4;
    if (metric.reviewStatus === "fresh" || metric.reviewStatus === "due") confidenceScore += 5;
    if (metric.status === "risk") confidenceScore -= 12;
    if (metric.status === "unknown") confidenceScore -= 8;
    confidenceScore -= blindspotCount * 8;

    const daysToReview = daysUntil(release.review_date);
    const signal = adoptionSignal({
      hasMetric: Boolean(metric.key),
      blindspotCount,
      benchmarkStatus: metric.status,
      measuredOutcome: release.measured_outcome,
      reviewDate: release.review_date,
      validatedDecisionCount: linkedDecisions.filter((item) => item.status === "validated").length,
      openReviewCount: releaseReviews.filter((item) =>
        ["requested", "in-review", "changes-requested"].includes(item.status)
      ).length,
      daysToReview,
    });

    return {
      id: release.id,
      title: release.title,
      description: release.description,
      category: release.category,
      ownerEmail: release.owner_email,
      eventDate: release.event_date,
      updatedAt: release.updated_at,
      reviewDate: release.review_date,
      expectedImpact: release.expected_impact,
      measuredOutcome: release.measured_outcome,
      metric,
      blindspotCount,
      confidence: confidenceBand(confidenceScore),
      confidenceScore: Math.max(0, Math.min(100, Math.round(confidenceScore))),
      adoptionState: signal.state,
      adoptionTone: signal.tone,
      adoptionDetail: signal.detail,
      daysSinceLaunch: daysSince(release.event_date),
      daysToReview,
      openReviewCount: releaseReviews.filter((item) =>
        ["requested", "in-review", "changes-requested"].includes(item.status)
      ).length,
      overdueReviewCount: releaseReviews.filter(
        (item) =>
          item.due_date != null &&
          item.due_date < new Date().toISOString().slice(0, 10) &&
          !["approved", "rejected"].includes(item.status)
      ).length,
      linkedDecisionCount: linkedDecisions.length,
      validatedDecisionCount: linkedDecisions.filter((item) => item.status === "validated").length,
      openActionCount: linkedActions.filter((item) => item.status !== "done").length,
      blockedActionCount: linkedActions.filter((item) => item.status === "blocked").length,
    } satisfies ProductLaunchSnapshot;
  });

  launches.sort((left, right) => {
    const stateOrder = {
      attention: 0,
      blindspot: 1,
      monitoring: 2,
      validated: 3,
    } satisfies Record<ProductLaunchSnapshot["adoptionState"], number>;
    return (
      stateOrder[left.adoptionState] - stateOrder[right.adoptionState] ||
      right.confidenceScore - left.confidenceScore ||
      right.eventDate.localeCompare(left.eventDate)
    );
  });

  return {
    summary: {
      total: launches.length,
      validated: launches.filter((item) => item.adoptionState === "validated").length,
      monitoring: launches.filter((item) => item.adoptionState === "monitoring").length,
      attention: launches.filter((item) => item.adoptionState === "attention").length,
      blindspots: launches.filter((item) => item.adoptionState === "blindspot").length,
      openReviews: launches.reduce((sum, item) => sum + item.openReviewCount, 0),
    },
    launches,
    metricOptions: ADMIN_METRIC_OPTIONS,
    generatedAt: new Date().toISOString(),
  };
}
