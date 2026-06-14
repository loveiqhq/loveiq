export const PRODUCT_KPI_TABS = [
  "Report Sections",
  "Experience Health",
  "Issue Radar",
  "Question Portfolio",
  "Survey Questions",
  "Survey Chapters",
  "Discrimination",
  "Feature Adoption",
] as const;

export const SCORECARD_TABS = ["Scorecard", "Trends"] as const;

export const FUNNEL_TABS = [
  "Conversion Funnel",
  "Cohort Analysis",
  "Impact Comparison",
  "Landing A/B",
] as const;

export const COHORT_GROUP_BY_OPTIONS = ["week", "utm", "archetype"] as const;
export const COHORT_COMPARISON_OPTIONS = ["release", "version", "experiment"] as const;

export type ProductKpiTab = (typeof PRODUCT_KPI_TABS)[number];
export type ScorecardTab = (typeof SCORECARD_TABS)[number];
export type FunnelTab = (typeof FUNNEL_TABS)[number];
export type CohortGroupBy = (typeof COHORT_GROUP_BY_OPTIONS)[number];
export type CohortComparisonMode = (typeof COHORT_COMPARISON_OPTIONS)[number];

type QueryValue = string | number | null | undefined;

const DEFAULT_PRODUCT_KPI_TAB: ProductKpiTab = "Report Sections";
const DEFAULT_SCORECARD_TAB: ScorecardTab = "Scorecard";
const DEFAULT_FUNNEL_TAB: FunnelTab = "Conversion Funnel";
const DEFAULT_GROUP_BY: CohortGroupBy = "week";
const DEFAULT_COMPARISON: CohortComparisonMode = "release";
const WORKFLOW_QUESTION_CHANGE_CANDIDATE_KEY = ["workflow", "question", "change", "candidate"].join(
  "_"
);

function buildHref(pathname: string, params: Record<string, QueryValue>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    searchParams.set(key, String(value));
  }
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function parseAllowedValue<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T
): T {
  return value && allowed.includes(value as T) ? (value as T) : fallback;
}

export function parseAdminDays(value: string | null, fallback = 0) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function parseProductKpiTab(value: string | null) {
  return parseAllowedValue(value, PRODUCT_KPI_TABS, DEFAULT_PRODUCT_KPI_TAB);
}

export function parseScorecardTab(value: string | null) {
  return parseAllowedValue(value, SCORECARD_TABS, DEFAULT_SCORECARD_TAB);
}

export function parseFunnelTab(value: string | null) {
  return parseAllowedValue(value, FUNNEL_TABS, DEFAULT_FUNNEL_TAB);
}

export function parseCohortGroupBy(value: string | null) {
  return parseAllowedValue(value, COHORT_GROUP_BY_OPTIONS, DEFAULT_GROUP_BY);
}

export function parseCohortComparisonMode(value: string | null) {
  return parseAllowedValue(value, COHORT_COMPARISON_OPTIONS, DEFAULT_COMPARISON);
}

export function buildGoalsHref(options?: {
  goalId?: number | null;
  metricKey?: string | null;
  status?: "all" | "active" | "achieved" | "cancelled";
}) {
  return buildHref("/admin/goals", {
    goal: options?.goalId ?? null,
    metric: options?.metricKey ?? null,
    status: options?.status ?? null,
  });
}

export function buildProductKpiHref(options?: {
  days?: number;
  tab?: ProductKpiTab;
  chapter?: string | null;
}) {
  return buildHref("/admin/product-kpis", {
    days: options?.days ?? null,
    tab: options?.tab ?? null,
    chapter: options?.chapter && options.chapter !== "all" ? options.chapter : null,
  });
}

export function buildScorecardHref(options?: {
  days?: number;
  tab?: ScorecardTab;
  question?: string | null;
}) {
  return buildHref("/admin/scorecard", {
    days: options?.days ?? null,
    tab: options?.tab ?? null,
    question: options?.question ?? null,
  });
}

export function buildFunnelsHref(options?: {
  days?: number;
  tab?: FunnelTab;
  utm?: string | null;
  groupBy?: CohortGroupBy;
  comparison?: CohortComparisonMode;
}) {
  return buildHref("/admin/funnels", {
    days: options?.days ?? null,
    tab: options?.tab ?? null,
    utm: options?.utm ?? null,
    groupBy: options?.groupBy ?? null,
    comparison: options?.comparison ?? null,
  });
}

export function buildMetricDrilldownHref(
  metricKey: string,
  options?: {
    days?: number;
    question?: string | null;
    chapter?: string | null;
    utm?: string | null;
  }
) {
  switch (metricKey) {
    case "waitlist_signups":
    case "waitlist_to_start_rate":
    case "total_submissions":
      return buildFunnelsHref({ days: options?.days, tab: "Conversion Funnel", utm: options?.utm });
    case "completion_rate":
      return buildProductKpiHref({
        days: options?.days,
        tab: options?.chapter ? "Survey Questions" : "Survey Chapters",
        chapter: options?.chapter ?? null,
      });
    case "scored_count":
    case "scoring_agreement":
      return buildScorecardHref({
        days: options?.days,
        tab: "Scorecard",
        question: options?.question ?? null,
      });
    case "workflow_needs_review":
    case "workflow_root_cause_found":
    case WORKFLOW_QUESTION_CHANGE_CANDIDATE_KEY:
    case "workflow_monitoring":
    case "open_high_priority_cases":
      return buildGoalsHref({ status: "active", metricKey });
    default:
      return "/admin/strategy";
  }
}
