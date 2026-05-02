import { ADMIN_METRIC_OPTIONS } from "@/lib/admin/metric-library";
import { clampDays, round1 } from "@/lib/admin/next-level";
import {
  countDeltaSignal,
  formatSignalSummary,
  twoProportionSignal,
  type StatisticalSignificance,
} from "@/lib/admin/statistics";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

interface ReleaseRow {
  id: number;
  title: string;
  description: string | null;
  category: string;
  primary_metric_key: string | null;
  expected_impact: string | null;
  measured_outcome: string | null;
  review_date: string | null;
  event_date: string;
  updated_at: string;
}

interface AnnotationRow {
  id: number;
  chart_key: string;
  annotation_date: string;
  note: string;
  created_at: string;
}

interface DecisionRow {
  id: number;
  title: string;
  entry_type: "decision" | "scoring-change" | "memo";
  status: string;
  primary_metric_key: string | null;
  expected_impact: string | null;
  observed_effect: string | null;
  linked_release_id: number | null;
  linked_experiment_id: number | null;
  updated_at: string;
}

interface ExperimentRow {
  id: number;
  name: string;
  status: string;
  primary_metric_key: string | null;
  decision_date: string | null;
  updated_at: string;
}

interface SubmissionRow {
  id: number;
  status: string;
  created_date_time: string;
}

interface WaitlistRow {
  id: number;
  created_date_time: string;
}

type ReleaseAttention = "lift" | "watch" | "regression";

export interface StatisticalDeltaSummary {
  significance: StatisticalSignificance;
  summary: string;
  pValue: number | null;
  ciLabel: string | null;
}

export interface ReleaseImpactEntry {
  id: number;
  title: string;
  category: string;
  primaryMetricKey: string | null;
  primaryMetricLabel: string | null;
  expectedImpact: string | null;
  measuredOutcome: string | null;
  reviewDate: string | null;
  eventDate: string;
  deltaSubmissions: number;
  deltaCompletionRate: number;
  deltaWaitlist: number;
  linkedAnnotationCount: number;
  linkedDecisionCount: number;
  linkedExperimentCount: number;
  attention: ReleaseAttention;
  submissionsSignal: StatisticalDeltaSummary;
  completionSignal: StatisticalDeltaSummary;
  waitlistSignal: StatisticalDeltaSummary;
  notes: string[];
  href: string;
}

export interface WhatChangedItem {
  id: string;
  kind: "release" | "decision" | "experiment" | "annotation";
  title: string;
  detail: string;
  metricKey: string | null;
  category: string;
  date: string;
  href: string;
}

export interface ReleaseImpactSnapshot {
  generatedAt: string;
  days: number;
  summary: {
    totalReleases: number;
    regressions: number;
    lifts: number;
    withMetricLink: number;
    withDecisionLink: number;
    annotated: number;
  };
  releases: ReleaseImpactEntry[];
}

export interface WhatChangedSnapshot {
  generatedAt: string;
  days: number;
  summary: {
    total: number;
    releases: number;
    decisions: number;
    experiments: number;
    annotations: number;
  };
  items: WhatChangedItem[];
}

function inRange(value: string, start: string, end: string) {
  return value >= start && value < end;
}

function countInRange(rows: Array<{ created_date_time: string }>, start: string, end: string) {
  return rows.filter((row) => inRange(row.created_date_time, start, end)).length;
}

function completionRate(rows: Array<{ status: string }>) {
  if (rows.length === 0) return 0;
  return round1((rows.filter((row) => row.status === "completed").length / rows.length) * 100);
}

function completedCountInRange(
  rows: Array<{ created_date_time: string; status: string }>,
  start: string,
  end: string
) {
  return rows.filter(
    (row) => inRange(row.created_date_time, start, end) && row.status === "completed"
  ).length;
}

function completionInRange(
  rows: Array<{ created_date_time: string; status: string }>,
  start: string,
  end: string
) {
  return completionRate(rows.filter((row) => inRange(row.created_date_time, start, end)));
}

function shiftDays(baseIso: string, days: number) {
  const base = new Date(baseIso);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString();
}

function metricMeta(metricKey: string | null) {
  const metric = ADMIN_METRIC_OPTIONS.find((item) => item.key === metricKey);
  return {
    label: metric?.label ?? null,
    href: metric?.href ?? "/admin/changelog",
  };
}

function releaseAttention(entry: {
  deltaSubmissions: number;
  deltaCompletionRate: number;
  deltaWaitlist: number;
}): ReleaseAttention {
  if (entry.deltaCompletionRate <= -4 || entry.deltaSubmissions <= -5) return "regression";
  if (entry.deltaCompletionRate >= 4 || entry.deltaSubmissions >= 5 || entry.deltaWaitlist >= 5) {
    return "lift";
  }
  return "watch";
}

async function fetchReleaseImpactInputs(days: number) {
  const sinceDate = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const [releasesRes, annotationsRes, decisionsRes, experimentsRes] = await Promise.all([
    supabaseFetch(
      `/rest/v1/product_changelog?select=id,title,description,category,primary_metric_key,expected_impact,measured_outcome,review_date,event_date,updated_at&event_date=gte.${sinceDate}&order=event_date.desc`,
      { headers: { Range: "0-199" } }
    ),
    supabaseFetch(
      `/rest/v1/admin_chart_annotation?select=id,chart_key,annotation_date,note,created_at&annotation_date=gte.${sinceDate}&order=annotation_date.desc`,
      { headers: { Range: "0-199" } }
    ),
    supabaseFetch(
      `/rest/v1/admin_decision_entry?select=id,title,entry_type,status,primary_metric_key,expected_impact,observed_effect,linked_release_id,linked_experiment_id,updated_at&updated_at=gte.${sinceDate}T00:00:00.000Z&order=updated_at.desc`,
      { headers: { Range: "0-199" } }
    ),
    supabaseFetch(
      `/rest/v1/admin_experiment?select=id,name,status,primary_metric_key,decision_date,updated_at&updated_at=gte.${sinceDate}T00:00:00.000Z&order=updated_at.desc`,
      { headers: { Range: "0-199" } }
    ),
  ]);

  if (!releasesRes.ok || !annotationsRes.ok || !decisionsRes.ok || !experimentsRes.ok) {
    throw new Error("Unable to load release-impact inputs.");
  }

  const releases = (await releasesRes.json()) as ReleaseRow[];
  const annotations = (await annotationsRes.json()) as AnnotationRow[];
  const decisions = (await decisionsRes.json()) as DecisionRow[];
  const experiments = (await experimentsRes.json()) as ExperimentRow[];

  const earliestEventDate = releases[releases.length - 1]?.event_date ?? sinceDate;
  const metricsSinceIso = shiftDays(`${earliestEventDate}T00:00:00.000Z`, -7);

  const [submissionsRes, waitlistRes] = await Promise.all([
    supabaseFetch(
      `/rest/v1/survey_submission?select=id,status,created_date_time&created_date_time=gte.${metricsSinceIso}&order=created_date_time.desc`,
      { headers: { Range: "0-49999" } }
    ),
    supabaseFetch(
      `/rest/v1/waitlist_user?select=id,created_date_time&created_date_time=gte.${metricsSinceIso}&order=created_date_time.desc`,
      { headers: { Range: "0-49999" } }
    ),
  ]);

  if (!submissionsRes.ok || !waitlistRes.ok) {
    throw new Error("Unable to load release-impact comparison windows.");
  }

  return {
    releases,
    annotations,
    decisions,
    experiments,
    submissions: (await submissionsRes.json()) as SubmissionRow[],
    waitlist: (await waitlistRes.json()) as WaitlistRow[],
  };
}

export async function buildReleaseImpactSnapshot(
  inputDays: number
): Promise<ReleaseImpactSnapshot> {
  const days = clampDays(inputDays || 30, 7, 90);

  try {
    const { releases, annotations, decisions, experiments, submissions, waitlist } =
      await fetchReleaseImpactInputs(days);

    const releaseEntries = releases.map((release) => {
      const eventIso = `${release.event_date}T00:00:00.000Z`;
      const preStart = shiftDays(eventIso, -7);
      const postEnd = shiftDays(eventIso, 7);
      const preSubmissions = countInRange(submissions, preStart, eventIso);
      const postSubmissions = countInRange(submissions, eventIso, postEnd);
      const preCompleted = completedCountInRange(submissions, preStart, eventIso);
      const postCompleted = completedCountInRange(submissions, eventIso, postEnd);
      const preCompletion = completionInRange(submissions, preStart, eventIso);
      const postCompletion = completionInRange(submissions, eventIso, postEnd);
      const preWaitlist = countInRange(waitlist, preStart, eventIso);
      const postWaitlist = countInRange(waitlist, eventIso, postEnd);
      const linkedAnnotations = annotations.filter(
        (annotation) => annotation.annotation_date === release.event_date
      );
      const linkedDecisions = decisions.filter(
        (decision) => decision.linked_release_id === release.id
      );
      const linkedExperiments = experiments.filter((experiment) =>
        linkedDecisions.some((decision) => decision.linked_experiment_id === experiment.id)
      );
      const attention = releaseAttention({
        deltaSubmissions: postSubmissions - preSubmissions,
        deltaCompletionRate: round1(postCompletion - preCompletion),
        deltaWaitlist: postWaitlist - preWaitlist,
      });
      const submissionsSignal = countDeltaSignal(preSubmissions, postSubmissions);
      const completionSignal = twoProportionSignal(
        preSubmissions,
        preCompleted,
        postSubmissions,
        postCompleted
      );
      const waitlistSignal = countDeltaSignal(preWaitlist, postWaitlist);
      const notes = [
        `${postSubmissions - preSubmissions >= 0 ? "+" : ""}${postSubmissions - preSubmissions} starts in the first post-release week.`,
        `${round1(postCompletion - preCompletion) >= 0 ? "+" : ""}${round1(postCompletion - preCompletion)}pp completion in the first post-release week.`,
        linkedAnnotations.length > 0
          ? `${linkedAnnotations.length} annotation(s) landed on the release day.`
          : null,
        linkedDecisions.length > 0
          ? `${linkedDecisions.length} linked governance decision(s) reference this release.`
          : null,
      ].filter(Boolean) as string[];
      const metric = metricMeta(release.primary_metric_key);

      return {
        id: release.id,
        title: release.title,
        category: release.category,
        primaryMetricKey: release.primary_metric_key,
        primaryMetricLabel: metric.label,
        expectedImpact: release.expected_impact,
        measuredOutcome: release.measured_outcome,
        reviewDate: release.review_date,
        eventDate: release.event_date,
        deltaSubmissions: postSubmissions - preSubmissions,
        deltaCompletionRate: round1(postCompletion - preCompletion),
        deltaWaitlist: postWaitlist - preWaitlist,
        linkedAnnotationCount: linkedAnnotations.length,
        linkedDecisionCount: linkedDecisions.length,
        linkedExperimentCount: linkedExperiments.length,
        attention,
        submissionsSignal: {
          significance: submissionsSignal.significance,
          summary: formatSignalSummary(submissionsSignal, "%"),
          pValue: submissionsSignal.pValue,
          ciLabel:
            submissionsSignal.ciLow != null && submissionsSignal.ciHigh != null
              ? `${submissionsSignal.ciLow >= 0 ? "+" : ""}${submissionsSignal.ciLow}% to ${
                  submissionsSignal.ciHigh >= 0 ? "+" : ""
                }${submissionsSignal.ciHigh}%`
              : null,
        },
        completionSignal: {
          significance: completionSignal.significance,
          summary: formatSignalSummary(completionSignal),
          pValue: completionSignal.pValue,
          ciLabel:
            completionSignal.ciLow != null && completionSignal.ciHigh != null
              ? `${completionSignal.ciLow >= 0 ? "+" : ""}${completionSignal.ciLow}pp to ${
                  completionSignal.ciHigh >= 0 ? "+" : ""
                }${completionSignal.ciHigh}pp`
              : null,
        },
        waitlistSignal: {
          significance: waitlistSignal.significance,
          summary: formatSignalSummary(waitlistSignal, "%"),
          pValue: waitlistSignal.pValue,
          ciLabel:
            waitlistSignal.ciLow != null && waitlistSignal.ciHigh != null
              ? `${waitlistSignal.ciLow >= 0 ? "+" : ""}${waitlistSignal.ciLow}% to ${
                  waitlistSignal.ciHigh >= 0 ? "+" : ""
                }${waitlistSignal.ciHigh}%`
              : null,
        },
        notes:
          notes.length > 0
            ? notes
            : ["No material change signal was detected in the immediate comparison window."],
        href: metric.href,
      } satisfies ReleaseImpactEntry;
    });

    return {
      generatedAt: new Date().toISOString(),
      days,
      summary: {
        totalReleases: releaseEntries.length,
        regressions: releaseEntries.filter((entry) => entry.attention === "regression").length,
        lifts: releaseEntries.filter((entry) => entry.attention === "lift").length,
        withMetricLink: releaseEntries.filter((entry) => entry.primaryMetricKey).length,
        withDecisionLink: releaseEntries.filter((entry) => entry.linkedDecisionCount > 0).length,
        annotated: releaseEntries.filter((entry) => entry.linkedAnnotationCount > 0).length,
      },
      releases: releaseEntries.sort((a, b) => {
        const attentionWeight = (value: ReleaseAttention) =>
          value === "regression" ? 0 : value === "watch" ? 1 : 2;
        return (
          attentionWeight(a.attention) - attentionWeight(b.attention) ||
          b.eventDate.localeCompare(a.eventDate)
        );
      }),
    };
  } catch (err) {
    logger.error({ err }, "Release impact snapshot error");
    throw err;
  }
}

export async function buildWhatChangedSnapshot(
  inputDays: number,
  metricKey?: string | null
): Promise<WhatChangedSnapshot> {
  const days = clampDays(inputDays || 30, 7, 90);

  try {
    const { releases, annotations, decisions, experiments } = await fetchReleaseImpactInputs(days);
    const filteredReleases = releases.filter(
      (release) => !metricKey || release.primary_metric_key === metricKey
    );
    const filteredDecisions = decisions.filter(
      (decision) => !metricKey || decision.primary_metric_key === metricKey
    );
    const filteredExperiments = experiments.filter(
      (experiment) => !metricKey || experiment.primary_metric_key === metricKey
    );
    const filteredAnnotations = metricKey ? [] : annotations;

    const items: WhatChangedItem[] = [
      ...filteredReleases.map((release) => ({
        id: `release-${release.id}`,
        kind: "release" as const,
        title: release.title,
        detail: [
          release.category,
          release.primary_metric_key ? `metric ${release.primary_metric_key}` : null,
          release.expected_impact ? `expected ${release.expected_impact}` : null,
          release.measured_outcome ? `observed ${release.measured_outcome}` : null,
        ]
          .filter(Boolean)
          .join(" | "),
        metricKey: release.primary_metric_key,
        category: release.category,
        date: release.event_date,
        href: metricMeta(release.primary_metric_key).href,
      })),
      ...filteredDecisions.map((decision) => ({
        id: `decision-${decision.id}`,
        kind: "decision" as const,
        title: decision.title,
        detail: [
          decision.entry_type,
          decision.status,
          decision.expected_impact ? `expected ${decision.expected_impact}` : null,
          decision.observed_effect ? `observed ${decision.observed_effect}` : null,
        ]
          .filter(Boolean)
          .join(" | "),
        metricKey: decision.primary_metric_key,
        category: decision.entry_type,
        date: decision.updated_at.slice(0, 10),
        href: "/admin/changelog",
      })),
      ...filteredExperiments.map((experiment) => ({
        id: `experiment-${experiment.id}`,
        kind: "experiment" as const,
        title: experiment.name,
        detail: [
          experiment.status,
          experiment.primary_metric_key ? `metric ${experiment.primary_metric_key}` : null,
          experiment.decision_date ? `decision ${experiment.decision_date}` : null,
        ]
          .filter(Boolean)
          .join(" | "),
        metricKey: experiment.primary_metric_key,
        category: "experiment",
        date: (experiment.decision_date ?? experiment.updated_at).slice(0, 10),
        href: "/admin/experiments",
      })),
      ...filteredAnnotations.map((annotation) => ({
        id: `annotation-${annotation.id}`,
        kind: "annotation" as const,
        title: annotation.note,
        detail: annotation.chart_key,
        metricKey: null,
        category: "annotation",
        date: annotation.annotation_date,
        href: "/admin/changelog",
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));

    return {
      generatedAt: new Date().toISOString(),
      days,
      summary: {
        total: items.length,
        releases: filteredReleases.length,
        decisions: filteredDecisions.length,
        experiments: filteredExperiments.length,
        annotations: filteredAnnotations.length,
      },
      items,
    };
  } catch (err) {
    logger.error({ err }, "What changed snapshot error");
    throw err;
  }
}
