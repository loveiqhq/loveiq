// Pipeline snapshot types shared between strategy.ts and its helpers.
// Extracted so future refactors (splitting the main snapshot builder into
// stages) don't have to cross-import out of the active source file.

// ─── Supabase row shapes ────────────────────────────────────────────────────
// One interface per Supabase SELECT used by buildStrategySnapshot. Typing
// these once at the parse boundary lets the rest of the function be fully
// typed without per-callsite `as any` casts.

export interface StrategyGoalRow {
  id: number;
  label: string;
  metric_key: string;
  target_value: number;
  deadline: string | null;
}

export interface StrategySubmissionRow {
  id: number;
  status: string;
  created_date_time: string;
  duration_ms: number | null;
  utm_tracker: string | null;
}

export interface StrategyWaitlistRow {
  id: number;
  created_date_time: string;
  utm_tracker: string | null;
}

export interface StrategyFlaggedSubmissionRow {
  id: number;
  status: string;
  created_date_time: string;
}

export interface StrategyScoringRowRaw {
  survey_submission_id: number;
  primary_archetype: string;
  v5_primary_archetype: string | null;
  percentages: Record<string, number> | null;
  v5_percentages: Record<string, number> | null;
  survey_submission:
    | { id: number; created_date_time: string; status: string; utm_tracker: string | null }
    | Array<{ id: number; created_date_time: string; status: string; utm_tracker: string | null }>
    | null;
}

export interface StrategyScoringRow extends Omit<StrategyScoringRowRaw, "survey_submission"> {
  survey_submission: {
    id: number;
    created_date_time: string;
    status: string;
    utm_tracker: string | null;
  } | null;
}

export interface StrategyInvestigationRow {
  id: number;
  title: string;
  status: string;
  priority: "high" | "medium" | "low";
  primary_metric_key: string | null;
  owner_email: string | null;
  updated_at: string;
  created_at: string;
  root_cause: string | null;
  submission_id: number | null;
  due_date: string | null;
}

export interface StrategyChangelogRow {
  id: number;
  title: string;
  description: string;
  category: string;
  event_date: string;
}

export interface StrategyAnnotationRow {
  id: number;
  chart_key: string;
  annotation_date: string;
  note: string;
}

export interface StrategyTagRow {
  id: number;
  name: string;
  color: string | null;
}

export interface StrategyTagAssignmentRow {
  id: number;
  submission_id: number;
  tag_id: number;
  assigned_by: string | null;
  assigned_at: string;
}

export interface StrategyAdminNoteRow {
  id: number;
  submission_id: number;
  admin_email: string;
  content: string;
  created_at: string;
}

export interface StrategyExperimentRow {
  id: number;
  name: string;
  status: string;
  primary_metric_key: string;
  decision_date: string | null;
  segment_id: number | null;
  owner_email: string | null;
  updated_at: string;
}

export interface StrategyDecisionEntryRow {
  id: number;
  title: string;
  entry_type: string;
  status: string;
  primary_metric_key: string | null;
  owner_email: string | null;
  expected_impact: string | null;
  observed_effect: string | null;
  review_window_days: number | null;
  created_at: string;
  updated_at: string;
}

export interface StrategyDecisionReviewRow {
  id: number;
  resource_id: number;
  resource_type: string;
  status: string;
}

// Predictive-insight rows come from the get_predictive_insights RPC. Shape is
// loose because the RPC returns a discriminated union by `type`.
export interface StrategyPredictiveInsightRow {
  type: string;
  title: string;
  detail?: string;
  description?: string;
  confidence: "high" | "medium" | "low";
  priority: number;
  trend?: "up" | "down" | "flat";
  metric?: string;
  // Other fields vary by `type`; keep typed-but-extensible via index signature.
  [key: string]: unknown;
}

export interface StrategyPipelineStage {
  key: string;
  label: string;
  value: number;
}

export interface StrategyPipelineConversionRate {
  from: string;
  to: string;
  rate: number;
}

export interface StrategyPipelineUtmSource {
  source: string;
  signups: number;
  started: number;
  total: number;
  completed: number;
  conversionRate: number;
}

export interface StrategyPipelineSnapshot {
  stages: StrategyPipelineStage[];
  conversionRates: StrategyPipelineConversionRate[];
  utmSources: StrategyPipelineUtmSource[];
}
