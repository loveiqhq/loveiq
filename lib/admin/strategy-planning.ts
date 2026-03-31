import { ADMIN_METRIC_OPTIONS } from "@/lib/admin/metric-library";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

export type InitiativeStatus = "planned" | "active" | "watch" | "blocked" | "completed";
export type InitiativePriority = "low" | "medium" | "high";
export type BetStatus = "proposed" | "active" | "validated" | "invalidated" | "parked";
export type BetConfidence = "low" | "medium" | "high";
export type CompetitiveMoveType =
  | "feature"
  | "pricing"
  | "positioning"
  | "distribution"
  | "partnership"
  | "brand"
  | "other";
export type ImpactLevel = "low" | "medium" | "high" | "critical";
export type DependencyStrength = "weak" | "medium" | "strong";

export interface StrategyPlanningMetricOption {
  key: string;
  label: string;
  description: string;
  href: string;
}

export interface StrategyPlanningGoalOption {
  id: number;
  label: string;
  metricKey: string;
  status: string;
  deadline: string | null;
}

export interface StrategyPlanningInitiative {
  id: number;
  title: string;
  description: string | null;
  status: InitiativeStatus;
  priority: InitiativePriority;
  ownerEmail: string | null;
  goalId: number | null;
  goalLabel: string | null;
  goalMetricKey: string | null;
  primaryMetricKey: string | null;
  primaryMetricLabel: string | null;
  secondaryMetricKeys: string[];
  expectedImpact: string | null;
  reviewDate: string | null;
  linkedHref: string | null;
  updatedAt: string;
}

export interface StrategyPlanningBet {
  id: number;
  title: string;
  hypothesis: string;
  status: BetStatus;
  confidence: BetConfidence;
  upsideNote: string | null;
  downsideNote: string | null;
  primaryMetricKey: string | null;
  primaryMetricLabel: string | null;
  reviewDate: string | null;
  ownerEmail: string | null;
  decisionNote: string | null;
  updatedAt: string;
}

export interface StrategyPlanningCompetitiveWatch {
  id: number;
  competitorName: string;
  moveType: CompetitiveMoveType;
  title: string;
  detail: string;
  impactLevel: ImpactLevel;
  primaryMetricKey: string | null;
  primaryMetricLabel: string | null;
  recommendedResponse: string | null;
  sourceHref: string | null;
  observedAt: string;
  updatedAt: string;
}

export interface StrategyPlanningDependency {
  id: number;
  parentMetricKey: string;
  parentMetricLabel: string;
  childMetricKey: string;
  childMetricLabel: string;
  relationshipStrength: DependencyStrength;
  hypothesisNote: string | null;
  evidenceNote: string | null;
  updatedAt: string;
}

export interface StrategyPlanningSnapshot {
  generatedAt: string;
  summary: {
    initiatives: number;
    activeInitiatives: number;
    reviewDue: number;
    activeBets: number;
    highImpactMoves: number;
    dependencyLinks: number;
  };
  initiatives: StrategyPlanningInitiative[];
  bets: StrategyPlanningBet[];
  competitiveWatch: StrategyPlanningCompetitiveWatch[];
  dependencies: StrategyPlanningDependency[];
  goals: StrategyPlanningGoalOption[];
  metrics: StrategyPlanningMetricOption[];
}

interface GoalRow {
  id: number;
  label: string;
  metric_key: string;
  status: string;
  deadline: string | null;
}

interface MetricRegistryRow {
  metric_key: string;
  label: string;
  linked_href: string | null;
}

interface InitiativeRow {
  id: number;
  title: string;
  description: string | null;
  status: InitiativeStatus;
  priority: InitiativePriority;
  owner_email: string | null;
  goal_id: number | null;
  primary_metric_key: string | null;
  secondary_metric_keys: string[] | null;
  expected_impact: string | null;
  review_date: string | null;
  linked_href: string | null;
  updated_at: string;
}

interface BetRow {
  id: number;
  title: string;
  hypothesis: string;
  status: BetStatus;
  confidence: BetConfidence;
  upside_note: string | null;
  downside_note: string | null;
  primary_metric_key: string | null;
  review_date: string | null;
  owner_email: string | null;
  decision_note: string | null;
  updated_at: string;
}

interface CompetitiveWatchRow {
  id: number;
  competitor_name: string;
  move_type: CompetitiveMoveType;
  title: string;
  detail: string;
  impact_level: ImpactLevel;
  primary_metric_key: string | null;
  recommended_response: string | null;
  source_href: string | null;
  observed_at: string;
  updated_at: string;
}

interface MetricDependencyRow {
  id: number;
  parent_metric_key: string;
  child_metric_key: string;
  relationship_strength: DependencyStrength;
  hypothesis_note: string | null;
  evidence_note: string | null;
  updated_at: string;
}

async function loadRows<T>(path: string, label: string): Promise<T[]> {
  try {
    const response = await supabaseFetch(path, { headers: { Range: "0-999" } });
    if (!response.ok) {
      logger.warn({ label, status: response.status }, "Strategy planning query failed");
      return [];
    }
    return (await response.json()) as T[];
  } catch (err) {
    logger.warn({ err, label }, "Strategy planning query unavailable");
    return [];
  }
}

function safeDate(value: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function metricLabelFor(
  key: string | null,
  metricOptions: StrategyPlanningMetricOption[]
): string | null {
  if (!key) return null;
  return metricOptions.find((metric) => metric.key === key)?.label ?? key;
}

export async function buildStrategyPlanningSnapshot(): Promise<StrategyPlanningSnapshot> {
  const [goals, registryMetrics, initiatives, bets, competitiveWatch, dependencies] =
    await Promise.all([
      loadRows<GoalRow>(
        "/rest/v1/admin_goals?select=id,label,metric_key,status,deadline&order=created_at.desc",
        "strategy-planning-goals"
      ),
      loadRows<MetricRegistryRow>(
        "/rest/v1/admin_metric_registry?select=metric_key,label,linked_href&order=updated_at.desc",
        "strategy-planning-metrics"
      ),
      loadRows<InitiativeRow>(
        "/rest/v1/admin_strategy_initiative?select=id,title,description,status,priority,owner_email,goal_id,primary_metric_key,secondary_metric_keys,expected_impact,review_date,linked_href,updated_at&order=updated_at.desc",
        "strategy-planning-initiatives"
      ),
      loadRows<BetRow>(
        "/rest/v1/admin_strategy_bet?select=id,title,hypothesis,status,confidence,upside_note,downside_note,primary_metric_key,review_date,owner_email,decision_note,updated_at&order=updated_at.desc",
        "strategy-planning-bets"
      ),
      loadRows<CompetitiveWatchRow>(
        "/rest/v1/admin_competitive_watch?select=id,competitor_name,move_type,title,detail,impact_level,primary_metric_key,recommended_response,source_href,observed_at,updated_at&order=observed_at.desc,updated_at.desc",
        "strategy-planning-competitive-watch"
      ),
      loadRows<MetricDependencyRow>(
        "/rest/v1/admin_metric_dependency?select=id,parent_metric_key,child_metric_key,relationship_strength,hypothesis_note,evidence_note,updated_at&order=updated_at.desc",
        "strategy-planning-metric-dependencies"
      ),
    ]);

  const metricOptionsMap = new Map<string, StrategyPlanningMetricOption>();
  for (const metric of ADMIN_METRIC_OPTIONS) {
    metricOptionsMap.set(metric.key, metric);
  }
  for (const metric of registryMetrics) {
    const existing = metricOptionsMap.get(metric.metric_key);
    metricOptionsMap.set(metric.metric_key, {
      key: metric.metric_key,
      label: metric.label,
      description: existing?.description ?? "",
      href: metric.linked_href ?? existing?.href ?? "/admin/benchmarks",
    });
  }

  const metricOptions = [...metricOptionsMap.values()].sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  const goalMap = new Map(goals.map((goal) => [goal.id, goal]));
  const today = new Date().toISOString().slice(0, 10);

  const mappedInitiatives = initiatives.map((initiative) => {
    const goal = initiative.goal_id != null ? (goalMap.get(initiative.goal_id) ?? null) : null;
    return {
      id: initiative.id,
      title: initiative.title,
      description: initiative.description,
      status: initiative.status,
      priority: initiative.priority,
      ownerEmail: initiative.owner_email,
      goalId: initiative.goal_id,
      goalLabel: goal?.label ?? null,
      goalMetricKey: goal?.metric_key ?? null,
      primaryMetricKey: initiative.primary_metric_key,
      primaryMetricLabel: metricLabelFor(initiative.primary_metric_key, metricOptions),
      secondaryMetricKeys: initiative.secondary_metric_keys ?? [],
      expectedImpact: initiative.expected_impact,
      reviewDate: initiative.review_date,
      linkedHref: initiative.linked_href,
      updatedAt: initiative.updated_at,
    };
  });

  const mappedBets = bets.map((bet) => ({
    id: bet.id,
    title: bet.title,
    hypothesis: bet.hypothesis,
    status: bet.status,
    confidence: bet.confidence,
    upsideNote: bet.upside_note,
    downsideNote: bet.downside_note,
    primaryMetricKey: bet.primary_metric_key,
    primaryMetricLabel: metricLabelFor(bet.primary_metric_key, metricOptions),
    reviewDate: bet.review_date,
    ownerEmail: bet.owner_email,
    decisionNote: bet.decision_note,
    updatedAt: bet.updated_at,
  }));

  const mappedCompetitiveWatch = competitiveWatch.map((entry) => ({
    id: entry.id,
    competitorName: entry.competitor_name,
    moveType: entry.move_type,
    title: entry.title,
    detail: entry.detail,
    impactLevel: entry.impact_level,
    primaryMetricKey: entry.primary_metric_key,
    primaryMetricLabel: metricLabelFor(entry.primary_metric_key, metricOptions),
    recommendedResponse: entry.recommended_response,
    sourceHref: entry.source_href,
    observedAt: entry.observed_at,
    updatedAt: entry.updated_at,
  }));

  const mappedDependencies = dependencies.map((entry) => ({
    id: entry.id,
    parentMetricKey: entry.parent_metric_key,
    parentMetricLabel:
      metricLabelFor(entry.parent_metric_key, metricOptions) ?? entry.parent_metric_key,
    childMetricKey: entry.child_metric_key,
    childMetricLabel:
      metricLabelFor(entry.child_metric_key, metricOptions) ?? entry.child_metric_key,
    relationshipStrength: entry.relationship_strength,
    hypothesisNote: entry.hypothesis_note,
    evidenceNote: entry.evidence_note,
    updatedAt: entry.updated_at,
  }));

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      initiatives: mappedInitiatives.length,
      activeInitiatives: mappedInitiatives.filter(
        (item) => item.status === "active" || item.status === "watch" || item.status === "blocked"
      ).length,
      reviewDue:
        mappedInitiatives.filter(
          (item) =>
            item.reviewDate != null && item.reviewDate <= today && item.status !== "completed"
        ).length +
        mappedBets.filter(
          (item) =>
            item.reviewDate != null &&
            item.reviewDate <= today &&
            item.status !== "validated" &&
            item.status !== "invalidated"
        ).length,
      activeBets: mappedBets.filter((item) => item.status === "active").length,
      highImpactMoves: mappedCompetitiveWatch.filter(
        (item) => item.impactLevel === "high" || item.impactLevel === "critical"
      ).length,
      dependencyLinks: mappedDependencies.length,
    },
    initiatives: mappedInitiatives.sort((a, b) => safeDate(b.updatedAt) - safeDate(a.updatedAt)),
    bets: mappedBets.sort((a, b) => safeDate(b.updatedAt) - safeDate(a.updatedAt)),
    competitiveWatch: mappedCompetitiveWatch.sort(
      (a, b) =>
        safeDate(b.observedAt) - safeDate(a.observedAt) ||
        safeDate(b.updatedAt) - safeDate(a.updatedAt)
    ),
    dependencies: mappedDependencies.sort((a, b) => safeDate(b.updatedAt) - safeDate(a.updatedAt)),
    goals: goals.map((goal) => ({
      id: goal.id,
      label: goal.label,
      metricKey: goal.metric_key,
      status: goal.status,
      deadline: goal.deadline,
    })),
    metrics: metricOptions,
  };
}
