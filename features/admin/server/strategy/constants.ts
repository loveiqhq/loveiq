// Static labels + lookup maps used by strategy.ts. Extracted from the
// monolithic strategy module so the active code is easier to read and so
// label changes don't churn the diff of the main algorithm.

export const METRIC_LABELS = new Map<string, string>(
  Object.entries({
    total_submissions: "Total Submissions",
    completion_rate: "Completion Rate",
    waitlist_signups: "Waitlist Signups",
    scored_count: "Scored Submissions",
    workflow_needs_review: "Needs Review Queue",
    workflow_root_cause_found: "Root Cause Found",
    workflow_question_change_candidate: "Question Change Candidates",
    workflow_monitoring: "Monitoring Queue",
  })
);

export const PREDICTION_LABELS = new Map<string, string>(
  Object.entries({
    volume_projection: "Volume Projection",
    abandonment_predictor: "Abandonment Predictor",
    utm_conversion: "UTM Conversion",
    archetype_trend: "Archetype Trend",
    friction_zone: "Friction Zone",
    completion_time: "Completion Time",
    revenue_forecast: "Revenue Forecast",
  })
);

export const ROOT_CAUSE_LABELS = new Map<string, string>(
  Object.entries({
    "question-friction": "Question friction",
    "traffic-quality": "Traffic quality",
    "scoring-mismatch": "Scoring mismatch",
    "release-regression": "Release regression",
    "report-engagement": "Report engagement",
    "data-quality": "Data quality",
    unknown: "Unknown",
  })
);

export const LEAKAGE_HINTS = new Map<string, { cause: string }>(
  Object.entries({
    "Waitlist Signups->Survey Started": {
      cause: "Activation friction or traffic quality",
    },
    "Survey Started->Survey Completed": {
      cause: "Survey friction and abandonment pressure",
    },
    "Survey Completed->Scored": {
      cause: "Scoring lag or failed scoring runs",
    },
    "Scored->Report Generated": {
      cause: "Report generation or delivery gap",
    },
    "Report Generated->Report Viewed": {
      cause: "Engagement or distribution gap",
    },
    "Report Viewed->Payment Completed": {
      cause: "Pricing or value communication gap",
    },
  })
);

export const PIPELINE_STAGE_ORDER = [
  { key: "waitlist_signups", label: "Waitlist Signups" },
  { key: "survey_started", label: "Survey Started" },
  { key: "survey_completed", label: "Survey Completed" },
  { key: "scored", label: "Scored" },
  { key: "report_generated", label: "Report Generated" },
  { key: "report_viewed", label: "Report Viewed" },
  { key: "payment_completed", label: "Payment Completed" },
] as const;
