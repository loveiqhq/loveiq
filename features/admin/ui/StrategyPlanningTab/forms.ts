// Empty-form factory functions for StrategyPlanningTab. Each builds the
// initial state object for a composer modal. Extracted so the schemas are easy
// to compare against the corresponding API route's Zod schemas.

import type {
  BetConfidence,
  BetStatus,
  CompetitiveMoveType,
  DependencyStrength,
  ImpactLevel,
  InitiativePriority,
  InitiativeStatus,
} from "@features/admin/server/strategy-planning";

export function emptyInitiativeForm() {
  return {
    title: "",
    description: "",
    status: "planned" as InitiativeStatus,
    priority: "medium" as InitiativePriority,
    owner_email: "",
    goal_id: "",
    primary_metric_key: "",
    secondary_metric_keys: [] as string[],
    expected_impact: "",
    review_date: "",
    linked_href: "",
  };
}

export function emptyBetForm() {
  return {
    title: "",
    hypothesis: "",
    status: "proposed" as BetStatus,
    confidence: "medium" as BetConfidence,
    upside_note: "",
    downside_note: "",
    primary_metric_key: "",
    review_date: "",
    owner_email: "",
    decision_note: "",
  };
}

export function emptyCompetitiveWatchForm() {
  return {
    competitor_name: "",
    move_type: "feature" as CompetitiveMoveType,
    title: "",
    detail: "",
    impact_level: "medium" as ImpactLevel,
    primary_metric_key: "",
    recommended_response: "",
    source_href: "",
    observed_at: "",
  };
}

export function emptyDependencyForm() {
  return {
    parent_metric_key: "",
    child_metric_key: "",
    relationship_strength: "medium" as DependencyStrength,
    hypothesis_note: "",
    evidence_note: "",
  };
}
