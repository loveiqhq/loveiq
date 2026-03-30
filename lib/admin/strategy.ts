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

const METRIC_LABELS: Record<string, string> = {
  total_submissions: "Total Submissions",
  completion_rate: "Completion Rate",
  waitlist_signups: "Waitlist Signups",
  scored_count: "Scored Submissions",
  workflow_needs_review: "Needs Review Queue",
  workflow_root_cause_found: "Root Cause Found",
  workflow_question_change_candidate: "Question Change Candidates",
  workflow_monitoring: "Monitoring Queue",
};

const PREDICTION_LABELS: Record<string, string> = {
  volume_projection: "Volume Projection",
  abandonment_predictor: "Abandonment Predictor",
  utm_conversion: "UTM Conversion",
  archetype_trend: "Archetype Trend",
  friction_zone: "Friction Zone",
  completion_time: "Completion Time",
  revenue_forecast: "Revenue Forecast",
};

const ROOT_CAUSE_LABELS: Record<string, string> = {
  "question-friction": "Question friction",
  "traffic-quality": "Traffic quality",
  "scoring-mismatch": "Scoring mismatch",
  "release-regression": "Release regression",
  "report-engagement": "Report engagement",
  "data-quality": "Data quality",
  unknown: "Unknown",
};

const LEAKAGE_HINTS: Record<string, { cause: string }> = {
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
};

const round1 = (value: number) => Math.round(value * 10) / 10;
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
const stageValue = (pipeline: any, label: string) =>
  pipeline.stages.find((stage: any) => stage.label === label)?.value ?? 0;
const metricLabel = (key: string) => METRIC_LABELS[key] ?? key;
const topGap = (values: Record<string, number> | null | undefined) => {
  if (!values) return null;
  const sorted = Object.values(values)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a);
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return Math.round(sorted[0] * 10) / 10;
  return Math.round((sorted[0] - sorted[1]) * 10) / 10;
};

function goalDrivers(
  metricKey: string,
  days: number,
  pipeline: any,
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
  const topChannel = [...(pipeline as any).utmSources].sort(
    (a: any, b: any) => b.conversionRate - a.conversionRate
  )[0];
  const highPriorityCases = (investigations as any[]).filter(
    (item) => item.status !== "closed" && item.priority === "high"
  ).length;

  const leakage = (pipeline as any).conversionRates
    .map((item: any) => {
      const from = stageValue(pipeline, item.from);
      const to = stageValue(pipeline, item.to);
      const pairKey = `${item.from}->${item.to}`;
      const hint = LEAKAGE_HINTS[pairKey];
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
        pipeline,
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
        detail: `${ROOT_CAUSE_LABELS[item.root_cause ?? "unknown"] ?? "Unknown"} · ${
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

  const archetypeCurrent: Record<string, number> = {};
  const archetypePrevious: Record<string, number> = {};
  for (const row of scoringCurrent as any[]) {
    archetypeCurrent[row.primary_archetype] = (archetypeCurrent[row.primary_archetype] || 0) + 1;
  }
  for (const row of scoringPrevious as any[]) {
    archetypePrevious[row.primary_archetype] = (archetypePrevious[row.primary_archetype] || 0) + 1;
  }
  const archetypeMomentum = Object.entries(archetypeCurrent)
    .map(([archetype, currentCount]) => ({
      archetype,
      currentCount,
      previousCount: archetypePrevious[archetype] || 0,
      delta: currentCount - (archetypePrevious[archetype] || 0),
      trend:
        Math.abs(currentCount - (archetypePrevious[archetype] || 0)) < 1
          ? "stable"
          : currentCount > (archetypePrevious[archetype] || 0)
            ? "up"
            : "down",
      href: "/admin/archetypes",
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 8);

  const opportunityBacklog = [
    ...(predictiveInsights as any[]).map((insight) => {
      const confidenceBonus =
        insight.confidence === "high" ? 16 : insight.confidence === "medium" ? 8 : 0;
      const trendBonus =
        insight.trend === "down" &&
        (insight.type === "abandonment_predictor" ||
          insight.type === "friction_zone" ||
          insight.type === "completion_time")
          ? 10
          : 0;
      const score = Math.min(
        99,
        42 + Math.max(0, 5 - insight.priority) * 10 + confidenceBonus + trendBonus
      );
      return {
        title: insight.title,
        source: PREDICTION_LABELS[insight.type] ?? insight.type,
        confidence: insight.confidence,
        score,
        impact: score >= 80 ? "high" : score >= 60 ? "medium" : "low",
        detail: insight.description,
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
      .map((entry) => ({
        title: `Review impact of "${entry.title}"`,
        source: "Release Impact",
        confidence: "medium",
        score: Math.min(
          95,
          58 + Math.abs(entry.deltaCompletionRate) * 4 + Math.max(0, -entry.deltaSubmissions)
        ),
        impact:
          Math.abs(entry.deltaCompletionRate) >= 5 || entry.deltaSubmissions <= -5
            ? "high"
            : "medium",
        detail: `Post-release window shows ${entry.deltaCompletionRate}pp completion change and ${entry.deltaSubmissions} submission change.`,
        href: entry.href,
      })),
  ]
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 10);

  const benchmarks = benchmarkDefinitions.map((benchmark: any) => {
    const currentValue =
      benchmark.key === "completion_rate"
        ? completionRate(submissionsCurrent as any[])
        : benchmark.key === "waitlist_to_start_rate"
          ? stageValue(pipeline, "Waitlist Signups") > 0
            ? round1(
                (stageValue(pipeline, "Survey Started") /
                  stageValue(pipeline, "Waitlist Signups")) *
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
        channels: [...(pipeline as any).utmSources]
          .sort((a: any, b: any) => b.conversionRate - a.conversionRate)
          .slice(0, 8),
        archetypes: Object.entries(archetypeCurrent)
          .map(([archetype, count]) => ({
            archetype,
            count,
            delta: count - (archetypePrevious[archetype] || 0),
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
    narrative,
  };
}
