import { buildForecastSnapshot } from "@/lib/admin/forecasting";
import {
  buildFunnelsHref,
  buildGoalsHref,
  buildProductKpiHref,
  buildScorecardHref,
} from "@/lib/admin/drilldowns";
import { fetchMetricValue, loadBenchmarkDefinitions } from "@/lib/admin/metric-library";
import { supabaseFetch } from "@/lib/admin/supabase";
import { WORKFLOW_TAGS, isWorkflowTagName } from "@/lib/admin/workflow-tags";
import logger from "@/lib/logger";

const METRIC_LABELS = new Map<string, string>(
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

const PREDICTION_LABELS = new Map<string, string>(
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

const ROOT_CAUSE_LABELS = new Map<string, string>(
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

const LEAKAGE_HINTS = new Map<string, { cause: string }>(
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

const PIPELINE_STAGE_ORDER = [
  { key: "waitlist_signups", label: "Waitlist Signups" },
  { key: "survey_started", label: "Survey Started" },
  { key: "survey_completed", label: "Survey Completed" },
  { key: "scored", label: "Scored" },
  { key: "report_generated", label: "Report Generated" },
  { key: "report_viewed", label: "Report Viewed" },
  { key: "payment_completed", label: "Payment Completed" },
] as const;

const round1 = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const clampDays = (days: number) => (Number.isNaN(days) ? 30 : Math.min(Math.max(days, 7), 90));
const shiftDays = (base: Date, days: number) => {
  const copy = new Date(base);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
};
const completionRate = (rows: Array<{ status: string }>) =>
  rows.length === 0
    ? 0
    : round1((rows.filter((row) => row.status === "completed").length / rows.length) * 100);
const durationMinutes = (rows: Array<{ duration_ms: number | null }>) => {
  const durations = rows
    .map((row) => row.duration_ms)
    .filter((value): value is number => value != null && value > 0);
  return durations.length === 0
    ? null
    : round1(durations.reduce((sum, value) => sum + value, 0) / durations.length / 60_000);
};

interface StrategyPipelineStage {
  key: string;
  label: string;
  value: number;
}

interface StrategyPipelineConversionRate {
  from: string;
  to: string;
  rate: number;
}

interface StrategyPipelineUtmSource {
  source: string;
  signups: number;
  started: number;
  total: number;
  completed: number;
  conversionRate: number;
}

interface StrategyPipelineSnapshot {
  stages: StrategyPipelineStage[];
  conversionRates: StrategyPipelineConversionRate[];
  utmSources: StrategyPipelineUtmSource[];
}
const formatMetric = (value: number | null, unit: "percent" | "minutes" | "count") =>
  value == null
    ? "—"
    : unit === "percent"
      ? `${round1(value)}%`
      : unit === "minutes"
        ? `${round1(value)}m`
        : value.toLocaleString();
const delta = (current: number, previous: number) =>
  previous === 0 ? (current === 0 ? 0 : 100) : round1(((current - previous) / previous) * 100);
const benchmarkStatus = (
  value: number | null,
  direction: "higher" | "lower",
  target: number,
  warning: number
) => {
  if (value == null) return "watch";
  if (direction === "higher") return value >= target ? "good" : value >= warning ? "watch" : "risk";
  return value <= target ? "good" : value <= warning ? "watch" : "risk";
};
const normalizeSubmission = (value: any) => (Array.isArray(value) ? (value[0] ?? null) : value);
const priorityWeight = (value: string) => (value === "high" ? 0 : value === "medium" ? 1 : 2);
const inRange = (value: string, start: string, end: string) => value >= start && value < end;
const countInRange = (rows: Array<{ created_date_time: string }>, start: string, end: string) =>
  rows.filter((row) => inRange(row.created_date_time, start, end)).length;
const completionInRange = (rows: any[], start: string, end: string) =>
  completionRate(rows.filter((row) => inRange(row.created_date_time, start, end)));
function normalizeConversionPipeline(raw: any): StrategyPipelineSnapshot {
  const rawStages =
    raw?.stages && !Array.isArray(raw.stages) && typeof raw.stages === "object"
      ? new Map(Object.entries(raw.stages as Record<string, unknown>))
      : new Map<string, unknown>();
  const existingStages = Array.isArray(raw?.stages) ? raw.stages : [];
  const stages = PIPELINE_STAGE_ORDER.map(({ key, label }) => {
    const existing = existingStages.find((item: any) => item?.label === label);
    return {
      key,
      label,
      value: Number(existing?.value ?? rawStages.get(key) ?? 0),
    };
  });

  const conversionRates = Array.isArray(raw?.conversionRates)
    ? raw.conversionRates.map((item: any) => ({
        from: String(item?.from ?? ""),
        to: String(item?.to ?? ""),
        rate: Number(item?.rate ?? 0),
      }))
    : stages.slice(0, -1).map((fromStage, index) => {
        const toStage = stages[index + 1];
        return {
          from: fromStage.label,
          to: toStage.label,
          rate: fromStage.value > 0 ? round1((toStage.value / fromStage.value) * 100) : 0,
        };
      });

  const utmSources = Array.isArray(raw?.utmSources)
    ? raw.utmSources.map((item: any) => ({
        source: String(item?.source ?? "Direct"),
        signups: Number(item?.signups ?? item?.total ?? item?.count ?? 0),
        started: Number(item?.started ?? item?.total ?? item?.count ?? 0),
        total: Number(item?.total ?? item?.count ?? 0),
        completed: Number(item?.completed ?? 0),
        conversionRate: Number(item?.conversionRate ?? 0),
      }))
    : Array.isArray(raw?.by_utm)
      ? raw.by_utm.map((item: any) => ({
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

const stageValue = (pipeline: StrategyPipelineSnapshot, label: string) =>
  pipeline.stages.find((stage: any) => stage.label === label)?.value ?? 0;
const metricLabel = (key: string) => METRIC_LABELS.get(key) ?? key;
const topGap = (values: Record<string, number> | null | undefined) => {
  if (!values) return null;
  const sorted = Object.values(values)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a);
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return Math.round(sorted[0] * 10) / 10;
  return Math.round((sorted[0] - sorted[1]) * 10) / 10;
};
const confidenceToScore = (value: "high" | "medium" | "low") =>
  value === "high" ? 90 : value === "medium" ? 65 : 40;
const effortToScore = (value: "low" | "medium" | "high") =>
  value === "low" ? 85 : value === "medium" ? 60 : 35;
const timeToSignalScore = (value: "fast" | "medium" | "slow") =>
  value === "fast" ? 85 : value === "medium" ? 60 : 35;
const daysUntilDate = (value: string | null) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`).getTime();
  if (Number.isNaN(parsed)) return null;
  return Math.ceil((parsed - Date.now()) / 86_400_000);
};
const daysSinceIso = (value: string) => {
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.floor((Date.now() - parsed) / 86_400_000));
};

function goalDrivers(
  metricKey: string,
  days: number,
  pipeline: StrategyPipelineSnapshot,
  topChannel: any,
  topLeakage: any,
  highPriorityCases: number,
  scoringAgreement: number | null,
  currentValue: number | null
) {
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

export async function buildStrategySnapshot(inputDays: number) {
  const days = clampDays(inputDays);
  const now = new Date();
  const currentSince = shiftDays(now, -days).toISOString();
  const previousSince = shiftDays(now, -(days * 2)).toISOString();
  const impactSince = shiftDays(now, -(days * 2))
    .toISOString()
    .slice(0, 10);

  const responses = await Promise.all([
    supabaseFetch(
      `/rest/v1/admin_goals?select=id,label,metric_key,target_value,deadline&status=eq.active&order=created_at.desc`,
      { headers: { Range: "0-199" } }
    ),
    supabaseFetch(
      `/rest/v1/survey_submission?select=id,status,created_date_time,duration_ms,utm_tracker&created_date_time=gte.${currentSince}&order=created_date_time.desc`,
      { headers: { Range: "0-49999" } }
    ),
    supabaseFetch(
      `/rest/v1/survey_submission?select=id,status,created_date_time,duration_ms,utm_tracker&created_date_time=gte.${previousSince}&created_date_time=lt.${currentSince}&order=created_date_time.desc`,
      { headers: { Range: "0-49999" } }
    ),
    supabaseFetch(
      `/rest/v1/waitlist_user?select=id,created_date_time,utm_tracker&created_date_time=gte.${currentSince}&order=created_date_time.desc`,
      { headers: { Range: "0-49999" } }
    ),
    supabaseFetch(
      `/rest/v1/waitlist_user?select=id,created_date_time,utm_tracker&created_date_time=gte.${previousSince}&created_date_time=lt.${currentSince}&order=created_date_time.desc`,
      { headers: { Range: "0-49999" } }
    ),
    supabaseFetch(
      `/rest/v1/survey_submission?select=id,status,created_date_time&status=eq.flagged&order=created_date_time.desc`,
      { headers: { Range: "0-24" } }
    ),
    supabaseFetch(
      `/rest/v1/scoring_result?select=survey_submission_id,primary_archetype,v5_primary_archetype,percentages,v5_percentages,survey_submission!inner(id,created_date_time,status,utm_tracker)&survey_submission.created_date_time=gte.${currentSince}`,
      { headers: { Range: "0-49999" } }
    ),
    supabaseFetch(
      `/rest/v1/scoring_result?select=survey_submission_id,primary_archetype,v5_primary_archetype,percentages,v5_percentages,survey_submission!inner(id,created_date_time,status,utm_tracker)&survey_submission.created_date_time=gte.${previousSince}&survey_submission.created_date_time=lt.${currentSince}`,
      { headers: { Range: "0-49999" } }
    ),
    supabaseFetch(`/rest/v1/admin_investigation_case?select=*&order=updated_at.desc`, {
      headers: { Range: "0-999" },
    }),
    supabaseFetch(
      `/rest/v1/product_changelog?select=id,title,description,category,event_date&event_date=gte.${impactSince}&order=event_date.desc`,
      { headers: { Range: "0-49" } }
    ),
    supabaseFetch(
      `/rest/v1/admin_chart_annotation?select=id,chart_key,annotation_date,note&annotation_date=gte.${impactSince}&order=annotation_date.desc`,
      { headers: { Range: "0-199" } }
    ),
    supabaseFetch(`/rest/v1/submission_tag?select=id,name,color&order=name.asc`, {
      headers: { Range: "0-999" },
    }),
    supabaseFetch(
      `/rest/v1/submission_tag_assignment?select=id,submission_id,tag_id,assigned_by,assigned_at&order=assigned_at.desc`,
      { headers: { Range: "0-9999" } }
    ),
    supabaseFetch(
      `/rest/v1/admin_note?select=id,submission_id,admin_email,content,created_at&order=created_at.desc`,
      { headers: { Range: "0-49" } }
    ),
    supabaseFetch(
      `/rest/v1/admin_experiment?select=id,name,status,primary_metric_key,decision_date,segment_id,owner_email,updated_at&order=updated_at.desc`,
      { headers: { Range: "0-49" } }
    ),
    supabaseFetch(
      [
        "/rest/v1/admin_decision_entry?select=",
        [
          "id",
          "title",
          "entry_type",
          "status",
          "primary_metric_key",
          "owner_email",
          "expected_impact",
          "observed_effect",
          "review_window_days",
          "created_at",
          "updated_at",
        ].join(","),
        "&order=updated_at.desc",
      ].join(""),
      { headers: { Range: "0-199" } }
    ),
    supabaseFetch(
      "/rest/v1/admin_review_request?select=id,resource_id,resource_type,status&resource_type=eq.decision-entry&order=updated_at.desc",
      { headers: { Range: "0-999" } }
    ),
    supabaseFetch("/rest/v1/rpc/get_predictive_insights", {
      method: "POST",
      body: JSON.stringify({ p_days: days }),
    }),
    supabaseFetch("/rest/v1/rpc/get_conversion_pipeline", {
      method: "POST",
      body: JSON.stringify({ since_ts: currentSince }),
    }),
  ]);

  if (responses.some((response) => !response.ok)) {
    logger.error(
      { statuses: responses.map((response) => response.status) },
      "Strategy snapshot query failed"
    );
    throw new Error("strategy_snapshot_failed");
  }

  const [
    goals,
    submissionsCurrent,
    submissionsPrevious,
    waitlistCurrent,
    waitlistPrevious,
    flaggedSubmissions,
    scoringCurrentRaw,
    scoringPreviousRaw,
    investigations,
    changelog,
    annotations,
    tags,
    assignments,
    adminNotes,
    experiments,
    decisionEntries,
    decisionReviews,
    predictiveInsights,
    pipeline,
    forecastSnapshot,
    benchmarkDefinitions,
  ] = await Promise.all([
    ...responses.map((response) => response.json()),
    buildForecastSnapshot(days),
    loadBenchmarkDefinitions(),
  ]);

  const scoringCurrent = (scoringCurrentRaw as any[]).map((row) => ({
    ...row,
    survey_submission: normalizeSubmission(row.survey_submission),
  }));
  const scoringPrevious = (scoringPreviousRaw as any[]).map((row) => ({
    ...row,
    survey_submission: normalizeSubmission(row.survey_submission),
  }));

  const scoringComparableCurrent = scoringCurrent.filter((row) => row.v5_primary_archetype);
  const scoringComparablePrevious = scoringPrevious.filter((row) => row.v5_primary_archetype);
  const scoringAgreementCurrent =
    scoringComparableCurrent.length === 0
      ? null
      : round1(
          (scoringComparableCurrent.filter(
            (row) => row.primary_archetype === row.v5_primary_archetype
          ).length /
            scoringComparableCurrent.length) *
            100
        );
  const scoringAgreementPrevious =
    scoringComparablePrevious.length === 0
      ? null
      : round1(
          (scoringComparablePrevious.filter(
            (row) => row.primary_archetype === row.v5_primary_archetype
          ).length /
            scoringComparablePrevious.length) *
            100
        );
  const ambiguousCases = scoringCurrent.filter((row) => {
    const v4Gap = topGap(row.percentages);
    const v5Gap = topGap(row.v5_percentages);
    return (v4Gap != null && v4Gap < 15) || (v5Gap != null && v5Gap < 15);
  });
  const normalizedPipeline = normalizeConversionPipeline(pipeline);
  const topChannel = [...normalizedPipeline.utmSources].sort(
    (a: any, b: any) => b.conversionRate - a.conversionRate
  )[0];
  const highPriorityCases = (investigations as any[]).filter(
    (item) => item.status !== "closed" && item.priority === "high"
  ).length;

  const leakage = normalizedPipeline.conversionRates
    .map((item: any) => {
      const from = stageValue(normalizedPipeline, item.from);
      const to = stageValue(normalizedPipeline, item.to);
      const pairKey = `${item.from}->${item.to}`;
      const hint = LEAKAGE_HINTS.get(pairKey);
      const lossCount = Math.max(from - to, 0);
      return {
        from: item.from,
        to: item.to,
        lossCount,
        lossRate: from > 0 ? round1((lossCount / from) * 100) : 0,
        likelyCause: hint?.cause ?? "Review this handoff for friction",
        href:
          pairKey === "Waitlist Signups->Survey Started"
            ? buildFunnelsHref({ days, tab: "Conversion Funnel" })
            : pairKey === "Survey Started->Survey Completed"
              ? buildProductKpiHref({ days, tab: "Survey Questions" })
              : pairKey === "Survey Completed->Scored"
                ? buildScorecardHref({ days, tab: "Scorecard" })
                : "/admin/pipeline",
      };
    })
    .filter((item: any) => item.lossCount > 0)
    .sort((a: any, b: any) => b.lossCount - a.lossCount);
  const topLeakage = leakage[0];

  const goalValues = await Promise.all(
    (goals as any[]).map(async (goal) => ({
      ...goal,
      currentValue: await fetchMetricValue(goal.metric_key),
    }))
  );

  const goalExplainers = goalValues.map((goal) => {
    const progressPct =
      goal.currentValue == null || goal.target_value <= 0
        ? 0
        : Math.min(100, round1((goal.currentValue / goal.target_value) * 100));
    return {
      id: goal.id,
      label: goal.label,
      metricKey: goal.metric_key,
      metricLabel: metricLabel(goal.metric_key),
      currentValue: goal.currentValue,
      targetValue: goal.target_value,
      progressPct,
      deadline: goal.deadline,
      status: progressPct >= 100 ? "on-track" : progressPct >= 70 ? "watch" : "off-track",
      href: buildGoalsHref({ goalId: goal.id, metricKey: goal.metric_key, status: "active" }),
      drivers: goalDrivers(
        goal.metric_key,
        days,
        normalizedPipeline,
        topChannel,
        topLeakage,
        highPriorityCases,
        scoringAgreementCurrent,
        goal.currentValue
      ),
    };
  });

  const tagById = new Map((tags as any[]).map((tag) => [tag.id, tag]));
  const workflowStages = new Map(
    WORKFLOW_TAGS.map((tag) => [tag.name, { ...tag, submissionIds: new Set<number>() }])
  );
  const workflowQueue: any[] = [];

  for (const assignment of assignments as any[]) {
    const tag = tagById.get(assignment.tag_id);
    if (!tag || !isWorkflowTagName(tag.name)) continue;
    const stage = workflowStages.get(tag.name)!;
    stage.submissionIds.add(assignment.submission_id);
    if (workflowQueue.length < 10) {
      workflowQueue.push({
        title: `Submission #${assignment.submission_id} moved to ${stage.label}`,
        detail: `${assignment.assigned_by} tagged this submission for ${stage.description.toLowerCase()}.`,
        priority:
          tag.name === "needs-review"
            ? "high"
            : tag.name === "question-change-candidate"
              ? "medium"
              : "low",
        type: "workflow",
        href: `/admin/submissions/${assignment.submission_id}`,
        updatedAt: assignment.assigned_at,
      });
    }
  }

  const workQueueItems = [
    ...(investigations as any[])
      .filter((item) => item.status !== "closed")
      .map((item) => ({
        title: item.title,
        detail: `${ROOT_CAUSE_LABELS.get(item.root_cause ?? "unknown") ?? "Unknown"} | ${
          item.owner_email ? `Owner ${item.owner_email}` : "Unassigned"
        }`,
        priority: item.priority,
        type: "investigation",
        href: item.submission_id ? `/admin/submissions/${item.submission_id}` : "/admin/tags",
        updatedAt: item.updated_at,
      })),
    ...(flaggedSubmissions as any[]).slice(0, 8).map((item) => ({
      title: `Submission #${item.id} is flagged`,
      detail: "Manual review required in the submissions browser.",
      priority: "high",
      type: "submission",
      href: `/admin/submissions/${item.id}`,
      updatedAt: item.created_date_time,
    })),
    ...scoringCurrent
      .filter(
        (item: any) =>
          item.v5_primary_archetype && item.primary_archetype !== item.v5_primary_archetype
      )
      .slice(0, 8)
      .map((item: any) => ({
        title: `Submission #${item.survey_submission_id} scoring disagreement`,
        detail: `${item.primary_archetype} vs ${item.v5_primary_archetype}`,
        priority: "medium",
        type: "scoring",
        href: `/admin/submissions/${item.survey_submission_id}`,
        updatedAt: item.survey_submission?.created_date_time ?? currentSince,
      })),
    ...ambiguousCases.slice(0, 6).map((item: any) => ({
      title: `Submission #${item.survey_submission_id} is ambiguous`,
      detail: "Tight scoring gap between top candidates requires review.",
      priority: "medium",
      type: "ambiguity",
      href: "/admin/scoring",
      updatedAt: item.survey_submission?.created_date_time ?? currentSince,
    })),
    ...(adminNotes as any[]).slice(0, 6).map((item) => ({
      title: `Recent note on submission #${item.submission_id}`,
      detail: `${item.admin_email}: ${String(item.content).slice(0, 90)}`,
      priority: "low",
      type: "note",
      href: `/admin/submissions/${item.submission_id}`,
      updatedAt: item.created_at,
    })),
    ...workflowQueue,
  ]
    .sort(
      (a: any, b: any) =>
        priorityWeight(a.priority) - priorityWeight(b.priority) ||
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    .slice(0, 20);

  const submissionsForImpact = [
    ...(submissionsPrevious as any[]),
    ...(submissionsCurrent as any[]),
  ];
  const waitlistForImpact = [...(waitlistPrevious as any[]), ...(waitlistCurrent as any[])];
  const releaseImpactEntries = (changelog as any[]).slice(0, 8).map((entry) => {
    const eventStart = new Date(`${entry.event_date}T00:00:00.000Z`);
    const preStart = shiftDays(eventStart, -7).toISOString();
    const postEnd = shiftDays(eventStart, 7).toISOString();
    const eventIso = eventStart.toISOString();
    const preSubmissions = countInRange(submissionsForImpact, preStart, eventIso);
    const postSubmissions = countInRange(submissionsForImpact, eventIso, postEnd);
    const preCompletion = completionInRange(submissionsForImpact as any[], preStart, eventIso);
    const postCompletion = completionInRange(submissionsForImpact as any[], eventIso, postEnd);
    const preWaitlist = countInRange(waitlistForImpact, preStart, eventIso);
    const postWaitlist = countInRange(waitlistForImpact, eventIso, postEnd);
    const linkedChartCount = (annotations as any[]).filter(
      (annotation) => annotation.annotation_date === entry.event_date
    ).length;
    const notes: string[] = [];
    if (postCompletion - preCompletion <= -4) {
      notes.push(`Completion moved ${round1(postCompletion - preCompletion)}pp in the first week.`);
    }
    if (postSubmissions < preSubmissions) {
      notes.push(
        `Submission volume softened by ${preSubmissions - postSubmissions} starts in the first week.`
      );
    }
    if (linkedChartCount > 0)
      notes.push(`${linkedChartCount} chart annotation(s) were logged on the same day.`);
    if (notes.length === 0)
      notes.push("No major break signal was detected in the immediate seven-day window.");
    return {
      id: entry.id,
      title: entry.title,
      category: entry.category,
      eventDate: entry.event_date,
      deltaSubmissions: postSubmissions - preSubmissions,
      deltaCompletionRate: round1(postCompletion - preCompletion),
      deltaWaitlist: postWaitlist - preWaitlist,
      linkedChartCount,
      notes,
      href: "/admin/changelog",
    };
  });

  const archetypeCurrent = new Map<string, number>();
  const archetypePrevious = new Map<string, number>();
  for (const row of scoringCurrent as any[]) {
    const archetype = row.primary_archetype;
    if (!archetype) continue;
    archetypeCurrent.set(archetype, (archetypeCurrent.get(archetype) ?? 0) + 1);
  }
  for (const row of scoringPrevious as any[]) {
    const archetype = row.primary_archetype;
    if (!archetype) continue;
    archetypePrevious.set(archetype, (archetypePrevious.get(archetype) ?? 0) + 1);
  }
  const archetypeMomentum = [...archetypeCurrent.entries()]
    .map(([archetype, currentCount]) => {
      const previousCount = archetypePrevious.get(archetype) ?? 0;
      const deltaValue = currentCount - previousCount;
      return {
        archetype,
        currentCount,
        previousCount,
        delta: deltaValue,
        trend: Math.abs(deltaValue) < 1 ? "stable" : deltaValue > 0 ? "up" : "down",
        href: "/admin/archetypes",
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 8);

  const opportunityFormula = "45% impact + 25% confidence + 15% effort + 15% time-to-signal";
  const opportunityBacklog = [
    ...(predictiveInsights as any[]).map((insight) => {
      const confidence = insight.confidence as "high" | "medium" | "low";
      const effort =
        insight.type === "utm_conversion" ||
        insight.type === "abandonment_predictor" ||
        insight.type === "friction_zone" ||
        insight.type === "completion_time"
          ? "low"
          : insight.type === "archetype_trend"
            ? "medium"
            : "high";
      const timeToSignal =
        insight.type === "revenue_forecast"
          ? "slow"
          : insight.type === "archetype_trend"
            ? "medium"
            : "fast";
      const impactBase = 42 + Math.max(0, 5 - insight.priority) * 9;
      const trendBonus =
        insight.trend === "down" &&
        (insight.type === "abandonment_predictor" ||
          insight.type === "friction_zone" ||
          insight.type === "completion_time")
          ? 12
          : insight.trend === "up" && insight.type === "utm_conversion"
            ? 8
            : 0;
      const impactScore = clamp(impactBase + trendBonus, 35, 95);
      const confidenceScore = confidenceToScore(confidence);
      const effortScore = effortToScore(effort);
      const timeScore = timeToSignalScore(timeToSignal);
      const score = round1(
        impactScore * 0.45 + confidenceScore * 0.25 + effortScore * 0.15 + timeScore * 0.15
      );
      return {
        title: insight.title,
        source: PREDICTION_LABELS.get(insight.type) ?? insight.type,
        confidence,
        effort,
        timeToSignal,
        score,
        impact: score >= 75 ? "high" : score >= 55 ? "medium" : "low",
        detail: insight.description,
        scoreInputs: {
          impact: impactScore,
          confidence: confidenceScore,
          effort: effortScore,
          timeToSignal: timeScore,
          formula: opportunityFormula,
        },
        href:
          insight.type === "utm_conversion"
            ? "/admin/pipeline"
            : insight.type === "revenue_forecast"
              ? "/admin/revenue"
              : insight.type === "archetype_trend"
                ? "/admin/archetypes"
                : "/admin/predictions",
      };
    }),
    ...releaseImpactEntries
      .filter((entry) => entry.deltaCompletionRate < 0 || entry.deltaSubmissions < 0)
      .map((entry) => {
        const confidence = "medium" as const;
        const effort =
          Math.abs(entry.deltaCompletionRate) >= 5 || entry.deltaSubmissions <= -8
            ? "low"
            : "medium";
        const timeToSignal = "fast" as const;
        const impactScore = clamp(
          48 + Math.abs(entry.deltaCompletionRate) * 7 + Math.max(0, -entry.deltaSubmissions) * 2,
          35,
          95
        );
        const confidenceScore = confidenceToScore(confidence);
        const effortScore = effortToScore(effort);
        const timeScore = timeToSignalScore(timeToSignal);
        const score = round1(
          impactScore * 0.45 + confidenceScore * 0.25 + effortScore * 0.15 + timeScore * 0.15
        );
        return {
          title: `Review impact of "${entry.title}"`,
          source: "Release Impact",
          confidence,
          effort,
          timeToSignal,
          score,
          impact: score >= 75 ? "high" : "medium",
          detail: `Post-release window shows ${entry.deltaCompletionRate}pp completion change and ${entry.deltaSubmissions} submission change.`,
          scoreInputs: {
            impact: impactScore,
            confidence: confidenceScore,
            effort: effortScore,
            timeToSignal: timeScore,
            formula: opportunityFormula,
          },
          href: entry.href,
        };
      }),
  ]
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 10);

  const benchmarks = benchmarkDefinitions.map((benchmark: any) => {
    const currentValue =
      benchmark.key === "completion_rate"
        ? completionRate(submissionsCurrent as any[])
        : benchmark.key === "waitlist_to_start_rate"
          ? stageValue(normalizedPipeline, "Waitlist Signups") > 0
            ? round1(
                (stageValue(normalizedPipeline, "Survey Started") /
                  stageValue(normalizedPipeline, "Waitlist Signups")) *
                  100
              )
            : null
          : benchmark.key === "scoring_agreement"
            ? scoringAgreementCurrent
            : benchmark.key === "avg_duration_minutes"
              ? durationMinutes(submissionsCurrent as any[])
              : highPriorityCases;

    return {
      ...benchmark,
      currentValue,
      currentLabel: formatMetric(currentValue, benchmark.unit),
      targetLabel: formatMetric(benchmark.targetValue, benchmark.unit),
      status: benchmarkStatus(
        currentValue,
        benchmark.direction,
        benchmark.targetValue,
        benchmark.warningValue
      ),
    };
  });

  const northStar = [
    {
      key: "waitlist_signups",
      label: "Demand",
      delta: delta((waitlistCurrent as any[]).length, (waitlistPrevious as any[]).length),
      description: "Top-of-funnel demand entering the system",
      href: buildFunnelsHref({ days, tab: "Conversion Funnel" }),
      displayValue: String((waitlistCurrent as any[]).length),
    },
    {
      key: "total_submissions",
      label: "Starts",
      delta: delta((submissionsCurrent as any[]).length, (submissionsPrevious as any[]).length),
      description: "Users who actually started the survey",
      href: buildFunnelsHref({ days, tab: "Conversion Funnel" }),
      displayValue: String((submissionsCurrent as any[]).length),
    },
    {
      key: "completion_rate",
      label: "Completion",
      delta: round1(
        completionRate(submissionsCurrent as any[]) - completionRate(submissionsPrevious as any[])
      ),
      description: "Share of starts that finish",
      href: buildProductKpiHref({ days, tab: "Survey Chapters" }),
      displayValue: `${completionRate(submissionsCurrent as any[])}%`,
    },
    {
      key: "scored_count",
      label: "Scored",
      delta: delta((scoringCurrent as any[]).length, (scoringPrevious as any[]).length),
      description: "Outputs entering the scoring layer",
      href: buildScorecardHref({ days, tab: "Scorecard" }),
      displayValue: String((scoringCurrent as any[]).length),
    },
    {
      key: "scoring_agreement",
      label: "Engine Trust",
      delta:
        scoringAgreementCurrent != null && scoringAgreementPrevious != null
          ? round1(scoringAgreementCurrent - scoringAgreementPrevious)
          : 0,
      description: "Agreement between the current scoring engines",
      href: buildScorecardHref({ days, tab: "Scorecard" }),
      displayValue: scoringAgreementCurrent == null ? "—" : `${scoringAgreementCurrent}%`,
    },
  ].map((metric) => ({
    ...metric,
    drilldowns:
      metric.key === "waitlist_signups"
        ? [
            {
              label: "Best source",
              value: topChannel
                ? `${topChannel.source} ${topChannel.conversionRate}%`
                : "No source split",
              href: buildFunnelsHref({ days, tab: "Cohort Analysis", groupBy: "utm" }),
            },
            {
              label: "Leak handoff",
              value: topLeakage ? `${topLeakage.from} -> ${topLeakage.to}` : "No active leak",
              href: topLeakage?.href ?? buildFunnelsHref({ days, tab: "Conversion Funnel" }),
            },
          ]
        : metric.key === "completion_rate"
          ? [
              {
                label: "Biggest leak",
                value: topLeakage ? `${topLeakage.lossCount} users lost` : "No leak signal",
                href: topLeakage?.href ?? buildProductKpiHref({ days, tab: "Survey Questions" }),
              },
              {
                label: "Forecast",
                value: `${forecastSnapshot.modules.find((item: any) => item.key === "completion_rate")?.forecastValue ?? 0}% next`,
                href: buildProductKpiHref({ days, tab: "Survey Chapters" }),
              },
            ]
          : [
              {
                label: "Queue pressure",
                value: `${highPriorityCases} high-priority cases`,
                href: buildGoalsHref({ status: "active", metricKey: "open_high_priority_cases" }),
              },
              {
                label: "Forecast",
                value: String(
                  forecastSnapshot.modules.find((item: any) => item.key === "submissions")
                    ?.forecastValue ?? 0
                ),
                href: buildFunnelsHref({ days, tab: "Conversion Funnel" }),
              },
            ],
  }));

  const northStarTree = [
    {
      label: "Demand",
      href: buildFunnelsHref({ days, tab: "Conversion Funnel" }),
      drivers: [
        {
          label: "Waitlist signups",
          value: `${(waitlistCurrent as any[]).length}`,
          href: buildFunnelsHref({ days, tab: "Conversion Funnel" }),
        },
        {
          label: "Top source",
          value: topChannel ? `${topChannel.source}` : "n/a",
          href: buildFunnelsHref({ days, tab: "Cohort Analysis", groupBy: "utm" }),
        },
      ],
    },
    {
      label: "Activation",
      href: buildProductKpiHref({ days, tab: "Survey Chapters" }),
      drivers: [
        {
          label: "Starts",
          value: `${(submissionsCurrent as any[]).length}`,
          href: buildFunnelsHref({ days, tab: "Conversion Funnel" }),
        },
        {
          label: "Largest leak",
          value: topLeakage ? `${topLeakage.from} -> ${topLeakage.to}` : "n/a",
          href: topLeakage?.href ?? buildProductKpiHref({ days, tab: "Survey Questions" }),
        },
      ],
    },
    {
      label: "Output Trust",
      href: buildScorecardHref({ days, tab: "Scorecard" }),
      drivers: [
        {
          label: "Scored",
          value: `${(scoringCurrent as any[]).length}`,
          href: buildScorecardHref({ days, tab: "Scorecard" }),
        },
        {
          label: "Ambiguous",
          value: `${ambiguousCases.length}`,
          href: buildScorecardHref({ days, tab: "Trends" }),
        },
      ],
    },
    {
      label: "Commercial Value",
      href: "/admin/revenue",
      drivers: forecastSnapshot.modules
        .filter((item: any) => item.key === "report_views" || item.key === "revenue")
        .map((item: any) => ({
          label: item.label,
          value: `${item.forecastValue}`,
          href: item.href,
        })),
    },
  ];

  const narrative: string[] = [];
  const atRiskGoal = goalExplainers.find((goal) => goal.status === "off-track");
  if (atRiskGoal) {
    narrative.push(
      `${atRiskGoal.label} is off track at ${atRiskGoal.progressPct}% of target, with ${atRiskGoal.metricLabel.toLowerCase()} currently at ${atRiskGoal.currentValue ?? 0}.`
    );
  }
  if (leakage[0]) {
    narrative.push(
      `The largest current leak is ${leakage[0].from} -> ${leakage[0].to}, where ${leakage[0].lossCount} users drop out (${leakage[0].lossRate}%).`
    );
  }
  if (opportunityBacklog[0]) {
    narrative.push(
      `Highest-ranked opportunity: ${opportunityBacklog[0].title} (${opportunityBacklog[0].source}, score ${opportunityBacklog[0].score}).`
    );
  }
  if (releaseImpactEntries[0]) {
    narrative.push(
      `Most recent tracked change is "${releaseImpactEntries[0].title}", with ${releaseImpactEntries[0].deltaCompletionRate}pp completion movement in the first post-release week.`
    );
  }
  if (archetypeMomentum[0]) {
    narrative.push(
      `${archetypeMomentum[0].archetype} shows the strongest current archetype movement (${archetypeMomentum[0].delta >= 0 ? "+" : ""}${archetypeMomentum[0].delta} vs previous window).`
    );
  }
  if ((experiments as any[]).some((item) => item.status === "active")) {
    narrative.push(
      `${(experiments as any[]).filter((item) => item.status === "active").length} experiment(s) are currently active in the registry.`
    );
  }

  const guardrails = [
    {
      label: "Completion",
      current: completionRate(submissionsCurrent as any[]),
      target: 65,
      status:
        completionRate(submissionsCurrent as any[]) >= 65
          ? "good"
          : completionRate(submissionsCurrent as any[]) >= 50
            ? "watch"
            : "risk",
      detail: `${(submissionsCurrent as any[]).filter((row) => row.status === "completed").length}/${(submissionsCurrent as any[]).length} starts completed`,
      href: buildProductKpiHref({ days, tab: "Survey Chapters" }),
    },
    {
      label: "Scoring Agreement",
      current: scoringAgreementCurrent ?? 0,
      target: 95,
      status:
        scoringAgreementCurrent == null
          ? "watch"
          : scoringAgreementCurrent >= 95
            ? "good"
            : scoringAgreementCurrent >= 85
              ? "watch"
              : "risk",
      detail:
        scoringAgreementCurrent == null
          ? "No comparable scored submissions yet"
          : `${scoringAgreementCurrent}% agreement across engines`,
      href: buildScorecardHref({ days, tab: "Scorecard" }),
    },
    {
      label: "High-Priority Queue",
      current: highPriorityCases,
      target: 3,
      status: highPriorityCases <= 3 ? "good" : highPriorityCases <= 6 ? "watch" : "risk",
      detail: `${highPriorityCases} high-priority investigations open`,
      href: buildGoalsHref({ status: "active", metricKey: "open_high_priority_cases" }),
    },
    {
      label: "Ambiguous Scoring",
      current: ambiguousCases.length,
      target: 5,
      status: ambiguousCases.length <= 5 ? "good" : ambiguousCases.length <= 10 ? "watch" : "risk",
      detail: `${ambiguousCases.length} submissions need manual scoring review`,
      href: buildScorecardHref({ days, tab: "Trends" }),
    },
  ];

  const triage = [
    topLeakage
      ? {
          title: `${topLeakage.from} -> ${topLeakage.to} needs investigation`,
          cause: topLeakage.likelyCause,
          confidence: "high" as const,
          evidence: `${topLeakage.lossCount} users lost (${topLeakage.lossRate}%) in the current window.`,
          href: topLeakage.href,
        }
      : null,
    releaseImpactEntries.find(
      (entry) => entry.deltaCompletionRate < 0 || entry.deltaSubmissions < 0
    )
      ? {
          title: "Recent release shows regression signal",
          cause: "release-regression",
          confidence: "medium" as const,
          evidence: `${releaseImpactEntries.find((entry) => entry.deltaCompletionRate < 0 || entry.deltaSubmissions < 0)?.title} moved completion or starts negatively.`,
          href: "/admin/changelog",
        }
      : null,
    scoringCurrent.some(
      (item: any) =>
        item.v5_primary_archetype && item.primary_archetype !== item.v5_primary_archetype
    )
      ? {
          title: "Scoring disagreement pressure is rising",
          cause: "scoring-mismatch",
          confidence: "medium" as const,
          evidence: `${(scoringCurrent as any[]).filter((item) => item.v5_primary_archetype && item.primary_archetype !== item.v5_primary_archetype).length} disagreements in the current window.`,
          href: "/admin/scoring",
        }
      : null,
  ].filter(Boolean);

  const analystBriefs = [
    {
      role: "Product",
      summary: topLeakage
        ? `The most urgent UX issue is ${topLeakage.from} -> ${topLeakage.to}; inspect question friction before shipping more funnel changes.`
        : "No dominant product leak is visible in the current window.",
    },
    {
      role: "Strategy",
      summary: atRiskGoal
        ? `${atRiskGoal.label} is off track, so planning should bias toward completion and trust improvements rather than new surface area.`
        : "Current goals are not materially off track in this window.",
    },
    {
      role: "Tech",
      summary:
        scoringAgreementCurrent != null && scoringAgreementCurrent < 95
          ? `Engine trust is below guardrail at ${scoringAgreementCurrent}%; scoring governance and validation should stay active.`
          : "No acute scoring-governance risk is visible in the current window.",
    },
    {
      role: "Growth",
      summary: topChannel
        ? `${topChannel.source} is the strongest current source; compare it against low-quality channels before scaling spend.`
        : "Source quality needs more tracked volume before growth decisions should rely on it.",
    },
  ];

  const openDecisionReviews = new Map<number, number>();
  for (const review of decisionReviews as Array<{
    resource_id: number | null;
    status: string;
  }>) {
    if (
      review.resource_id == null ||
      review.status === "approved" ||
      review.status === "rejected"
    ) {
      continue;
    }
    openDecisionReviews.set(
      review.resource_id,
      (openDecisionReviews.get(review.resource_id) ?? 0) + 1
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const allDecisionReviewItems = (
    decisionEntries as Array<{
      id: number;
      title: string;
      entry_type: "decision" | "scoring-change" | "memo";
      status: "draft" | "approved" | "monitoring" | "validated" | "rolled-back";
      primary_metric_key: string | null;
      owner_email: string | null;
      expected_impact: string | null;
      observed_effect: string | null;
      review_window_days: number | null;
      created_at: string;
      updated_at: string;
    }>
  )
    .map((entry) => {
      const reviewDate =
        entry.review_window_days != null
          ? shiftDays(new Date(entry.updated_at), entry.review_window_days)
              .toISOString()
              .slice(0, 10)
          : null;
      const daysUntilReview = daysUntilDate(reviewDate);
      const daysSinceUpdate = daysSinceIso(entry.updated_at);
      const openReviewCount = openDecisionReviews.get(entry.id) ?? 0;
      const awaitingOutcome = !!entry.expected_impact && !entry.observed_effect;
      const stale =
        awaitingOutcome &&
        entry.status !== "validated" &&
        entry.status !== "rolled-back" &&
        daysSinceUpdate >= 21;
      const reviewState =
        entry.status === "validated"
          ? "validated"
          : stale
            ? "stale"
            : awaitingOutcome && reviewDate != null && reviewDate <= todayIso
              ? "due"
              : awaitingOutcome
                ? "missing-outcome"
                : "upcoming";
      const comparisonLabel =
        entry.expected_impact && entry.observed_effect
          ? `Expected: ${entry.expected_impact} | Observed: ${entry.observed_effect}`
          : entry.expected_impact
            ? `Expected: ${entry.expected_impact} | Observed outcome missing`
            : entry.observed_effect
              ? `Observed: ${entry.observed_effect}`
              : "No expected or measured outcome captured yet.";
      return {
        id: entry.id,
        title: entry.title,
        entryType: entry.entry_type,
        status: entry.status,
        primaryMetricKey: entry.primary_metric_key,
        ownerEmail: entry.owner_email,
        reviewDate,
        daysUntilReview,
        daysSinceUpdate,
        openReviewCount,
        expectedImpact: entry.expected_impact,
        measuredOutcome: entry.observed_effect,
        comparisonLabel,
        detail: [
          `${entry.entry_type} is ${entry.status}`,
          entry.owner_email ? `owner ${entry.owner_email}` : "unassigned",
          reviewDate ? `review ${reviewDate}` : "no review date",
          openReviewCount > 0
            ? `${openReviewCount} open review${openReviewCount === 1 ? "" : "s"}`
            : null,
        ]
          .filter(Boolean)
          .join(" | "),
        reviewState,
        href: "/admin/changelog",
      };
    })
    .sort((a, b) => {
      const rankA =
        a.reviewState === "stale"
          ? 0
          : a.reviewState === "due"
            ? 1
            : a.reviewState === "missing-outcome"
              ? 2
              : a.reviewState === "upcoming"
                ? 3
                : 4;
      const rankB =
        b.reviewState === "stale"
          ? 0
          : b.reviewState === "due"
            ? 1
            : b.reviewState === "missing-outcome"
              ? 2
              : b.reviewState === "upcoming"
                ? 3
                : 4;
      return (
        rankA - rankB ||
        (a.daysUntilReview ?? 999) - (b.daysUntilReview ?? 999) ||
        b.daysSinceUpdate - a.daysSinceUpdate
      );
    });
  const decisionReviewItems = allDecisionReviewItems.slice(0, 12);

  const decisionReviewSummary = {
    total: allDecisionReviewItems.length,
    due: allDecisionReviewItems.filter((item) => item.reviewState === "due").length,
    stale: allDecisionReviewItems.filter((item) => item.reviewState === "stale").length,
    awaitingOutcome: allDecisionReviewItems.filter(
      (item) =>
        item.reviewState === "due" ||
        item.reviewState === "missing-outcome" ||
        item.reviewState === "stale"
    ).length,
    openReviews: allDecisionReviewItems.reduce((sum, item) => sum + item.openReviewCount, 0),
  };

  const topDecisionGap = decisionReviewItems.find(
    (item) => item.reviewState === "stale" || item.reviewState === "due"
  );
  const topOpportunity = opportunityBacklog[0];
  const topReleaseRisk = releaseImpactEntries.find(
    (entry) => entry.deltaCompletionRate < 0 || entry.deltaSubmissions < 0
  );
  const strategyBriefPacks = [
    {
      audience: "Executive" as const,
      tone: atRiskGoal || topDecisionGap ? ("risk" as const) : ("watch" as const),
      headline:
        narrative[0] ??
        "Core business state is stable enough to shift leadership time toward follow-through.",
      summary: [
        topOpportunity
          ? `Top opportunity is ${topOpportunity.title} (score ${topOpportunity.score}).`
          : null,
        topDecisionGap ? `${topDecisionGap.title} needs review follow-through.` : null,
        topReleaseRisk ? `"${topReleaseRisk.title}" still shows measurable downside.` : null,
      ]
        .filter(Boolean)
        .join(" "),
      bullets: [
        atRiskGoal
          ? `${atRiskGoal.label} is off track at ${atRiskGoal.progressPct}% of target.`
          : "No active goal is materially off track in the selected window.",
        topOpportunity
          ? `${topOpportunity.source} opportunity score is ${topOpportunity.score} using the shared scoring formula.`
          : "No opportunity backlog items are ranked yet.",
        `${decisionReviewSummary.awaitingOutcome} decision entries still need measured-outcome follow-through.`,
      ],
      actions: [
        topDecisionGap
          ? `Review ${topDecisionGap.title} and capture measured outcome.`
          : "Keep decision follow-through current.",
        topOpportunity
          ? `Sponsor the next move on ${topOpportunity.title}.`
          : "Keep the opportunity backlog ranked.",
      ],
      href: "/admin/operating-review",
    },
    {
      audience: "Strategy" as const,
      tone: atRiskGoal ? ("risk" as const) : ("watch" as const),
      headline: atRiskGoal
        ? `${atRiskGoal.label} is the strategic gap to close first.`
        : "Strategy can bias toward leverage, not emergency stabilization.",
      summary: topOpportunity
        ? `The backlog is led by ${topOpportunity.title}, scored with explicit impact, confidence, effort, and time-to-signal inputs.`
        : "Keep the strategy backlog ranked so planning does not drift into ad hoc prioritization.",
      bullets: [
        `${decisionReviewSummary.stale} stale decisions and ${decisionReviewSummary.due} due reviews are on the board.`,
        topOpportunity
          ? `${topOpportunity.scoreInputs.formula}.`
          : "Opportunity scoring formula is available once backlog items are present.",
        atRiskGoal
          ? `${atRiskGoal.metricLabel} is below target and should anchor planning.`
          : "No goal currently requires emergency reprioritization.",
      ],
      actions: [
        "Push stale decisions to validated, rolled-back, or explicitly monitored states.",
        "Use the scored opportunity backlog to choose the next strategic bet.",
      ],
      href: "/admin/strategy",
    },
    {
      audience: "Product" as const,
      tone: topLeakage ? ("watch" as const) : ("good" as const),
      headline: topLeakage
        ? `${topLeakage.from} -> ${topLeakage.to} remains the clearest product drag.`
        : "No single product leak dominates this window.",
      summary: topReleaseRisk
        ? `"${topReleaseRisk.title}" still needs product attribution review.`
        : "Recent releases are not showing a clear product regression signal.",
      bullets: [
        topLeakage
          ? `${topLeakage.lossCount} users are currently lost in the top leak path.`
          : "Leakage is not concentrated in one dominant handoff.",
        `${(experiments as any[]).filter((item) => item.status === "active").length} experiments are active in the registry.`,
        `${decisionReviewSummary.awaitingOutcome} logged decisions still need measured product outcomes.`,
      ],
      actions: [
        topLeakage
          ? `Investigate ${topLeakage.from} -> ${topLeakage.to} before shipping adjacent changes.`
          : "Keep monitoring release and funnel movement together.",
        "Close decision loops by pairing expected impact with measured outcome.",
      ],
      href: "/admin/product-kpis",
    },
    {
      audience: "Growth" as const,
      tone: topChannel ? ("good" as const) : ("watch" as const),
      headline: topChannel
        ? `${topChannel.source} is the strongest current growth source.`
        : "Growth source quality still needs more reliable signal.",
      summary: topOpportunity
        ? `${topOpportunity.title} is currently the highest-leverage scored growth move on the backlog.`
        : "No scored growth move is leading the backlog yet.",
      bullets: [
        `${(waitlistCurrent as any[]).length} demand events landed in the current window.`,
        topOpportunity
          ? `Time-to-signal is ${topOpportunity.timeToSignal}, effort is ${topOpportunity.effort}.`
          : "Opportunity scoring inputs will show effort and time-to-signal once backlog items exist.",
        topLeakage
          ? `Top funnel leak is ${topLeakage.lossRate}% on ${topLeakage.from} -> ${topLeakage.to}.`
          : "No dominant leak path is visible.",
      ],
      actions: [
        topChannel
          ? `Benchmark weaker channels against ${topChannel.source} before scaling.`
          : "Improve channel-quality instrumentation before budget moves.",
        "Use the opportunity scoring framework to prioritize the next test or channel fix.",
      ],
      href: "/admin/growth",
    },
    {
      audience: "Tech" as const,
      tone:
        scoringAgreementCurrent != null && scoringAgreementCurrent < 95
          ? ("risk" as const)
          : ("watch" as const),
      headline:
        scoringAgreementCurrent != null && scoringAgreementCurrent < 95
          ? `Scoring trust is below guardrail at ${scoringAgreementCurrent}%.`
          : "Technical risk is concentrated in follow-through, not acute breakage.",
      summary: `${guardrails.filter((item) => item.status === "risk").length} strategy guardrails are currently breached.`,
      bullets: [
        `${highPriorityCases} high-priority investigations are still open.`,
        `${decisionReviewSummary.openReviews} open review requests are attached to decision entries.`,
        `${ambiguousCases.length} ambiguous scoring cases remain in the current window.`,
      ],
      actions: [
        "Keep scoring validation and investigation closure tied to decision follow-through.",
        "Use the decision board to prove whether technical changes delivered their expected effect.",
      ],
      href: "/admin/health",
    },
  ].map((pack) => ({
    ...pack,
    copyText: [
      `${pack.audience} Brief`,
      `Headline: ${pack.headline}`,
      `Summary: ${pack.summary}`,
      "",
      "Signals:",
      ...pack.bullets.map((line) => `- ${line}`),
      "",
      "Actions:",
      ...pack.actions.map((line) => `- ${line}`),
    ].join("\n"),
  }));

  return {
    days,
    generatedAt: new Date().toISOString(),
    northStar,
    northStarTree,
    goals: goalExplainers,
    benchmarks,
    workQueue: {
      summary: {
        openCases: (investigations as any[]).filter((item) => item.status !== "closed").length,
        overdueCases: (investigations as any[]).filter(
          (item) =>
            item.status !== "closed" &&
            item.due_date != null &&
            item.due_date < new Date().toISOString().slice(0, 10)
        ).length,
        highPriorityCases,
        flaggedSubmissions: (flaggedSubmissions as any[]).length,
        scoringDisagreements: (scoringCurrent as any[]).filter(
          (item) =>
            item.v5_primary_archetype && item.primary_archetype !== item.v5_primary_archetype
        ).length,
        ambiguousCases: ambiguousCases.length,
        recentNotes: (adminNotes as any[]).length,
        workflowCoverage: new Set(
          [...workflowStages.values()].flatMap((stage) => [...stage.submissionIds])
        ).size,
      },
      items: workQueueItems,
    },
    releaseImpact: {
      entries: releaseImpactEntries,
      annotations: (annotations as any[]).slice(0, 12).map((annotation) => ({
        id: annotation.id,
        chartKey: annotation.chart_key,
        annotationDate: annotation.annotation_date,
        note: annotation.note,
      })),
    },
    opportunities: {
      backlog: opportunityBacklog,
      funnelLeakage: leakage,
      archetypeMomentum,
      leaderboards: {
        channels: [...normalizedPipeline.utmSources]
          .sort((a: any, b: any) => b.conversionRate - a.conversionRate)
          .slice(0, 8),
        archetypes: [...archetypeCurrent.entries()]
          .map(([archetype, count]) => ({
            archetype,
            count,
            delta: count - (archetypePrevious.get(archetype) ?? 0),
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8),
        workflow: [...workflowStages.values()]
          .map((stage) => ({
            stage: stage.label,
            submissions: stage.submissionIds.size,
            color: stage.color,
          }))
          .sort((a, b) => b.submissions - a.submissions),
      },
    },
    forecasts: {
      modules: forecastSnapshot.modules.slice(0, 4),
      generatedAt: forecastSnapshot.generatedAt,
    },
    experiments: {
      summary: {
        total: (experiments as any[]).length,
        active: (experiments as any[]).filter((item) => item.status === "active").length,
        pendingDecision: (experiments as any[]).filter(
          (item) =>
            item.decision_date != null &&
            item.decision_date <= new Date().toISOString().slice(0, 10) &&
            item.status !== "archived"
        ).length,
      },
      items: (experiments as any[]).slice(0, 8).map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        primaryMetricKey: item.primary_metric_key,
        ownerEmail: item.owner_email,
        decisionDate: item.decision_date,
        href: "/admin/experiments",
      })),
    },
    decisionReview: {
      summary: decisionReviewSummary,
      items: decisionReviewItems,
    },
    briefGenerator: {
      generatedAt: new Date().toISOString(),
      packs: strategyBriefPacks,
    },
    narrative,
    analyst: {
      briefs: analystBriefs,
    },
    guardrails: {
      healthy: guardrails.filter((item) => item.status === "good").length,
      breached: guardrails.filter((item) => item.status === "risk").length,
      items: guardrails,
    },
    triage,
  };
}
