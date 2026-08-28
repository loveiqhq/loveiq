import { buildFunnelsHref } from "@features/admin/server/drilldowns";
import {
  buildTrustDescriptor,
  clampDays,
  parseUtmCampaign,
  parseUtmMedium,
  round1,
  sourceLabel,
} from "@features/admin/server/next-level";
import {
  evaluateSegmentRules,
  type SegmentComparableRow,
  type SegmentRules,
} from "@features/admin/server/segment-evaluator";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

interface SubmissionRow {
  id: number;
  user_id: number | null;
  status: string;
  duration_ms: number | null;
  created_date_time: string;
  utm_tracker: string | null;
  session_id: string | null;
}

interface ScoringRow {
  survey_submission_id: number;
  primary_archetype: string | null;
  v5_primary_archetype: string | null;
}

interface ProfileRow {
  id: number;
  gender: string | null;
  sexual_orientation: string | null;
  relationship_status: string | null;
  location_primary: string | null;
}

interface ReportRow {
  id: number;
  survey_submission_id: number;
}

interface ReportSessionRow {
  personal_report_id: number;
}

interface PaymentRow {
  personal_report_id: number;
  status: string;
}

interface PartialRow {
  session_id: string;
}

interface AnalyticsRow {
  session_id: string | null;
  metadata: Record<string, unknown> | null;
}

interface SegmentRow {
  id: number;
  name: string;
  rules: SegmentRules;
  match_count: number | null;
}

type LeakDimension = "source" | "campaign" | "segment" | "geo" | "device";
type LeakStage = "start_to_complete" | "complete_to_scored" | "scored_to_report" | "report_to_paid";
type LeakConfidence = "high" | "medium" | "low";
type LeakTone = "critical" | "watch" | "stable" | "blindspot";

interface SubmissionContext {
  id: number;
  userId: number | null;
  status: string;
  durationMs: number | null;
  createdAt: string;
  sessionId: string | null;
  source: string;
  medium: string;
  campaign: string;
  device: string;
  geography: string;
  archetype: string | null;
  v5Archetype: string | null;
  gender: string | null;
  sexualOrientation: string | null;
  relationshipStatus: string | null;
  scored: boolean;
  hasReport: boolean;
  viewedReport: boolean;
  paid: boolean;
  wasResumed: boolean;
}

interface LeakAggregate {
  starts: number;
  completed: number;
  scored: number;
  reported: number;
  paid: number;
  resumed: number;
}

export interface LeakDebuggerRow {
  key: string;
  label: string;
  starts: number;
  completionRate: number;
  scoringRate: number | null;
  reportRate: number | null;
  paidRate: number | null;
  resumedShare: number;
  leakStage: LeakStage;
  leakStageLabel: string;
  leakCount: number;
  leakRate: number;
  confidence: LeakConfidence;
  tone: LeakTone;
  explanation: string;
  href: string;
}

export interface LeakPriorityItem {
  dimension: LeakDimension;
  label: string;
  leakStageLabel: string;
  leakCount: number;
  leakRate: number;
  confidence: LeakConfidence;
  explanation: string;
  href: string;
}

export interface LeakDimensionSnapshot {
  key: LeakDimension;
  label: string;
  description: string;
  trustNote: string | null;
  strongestLeak: string | null;
  rows: LeakDebuggerRow[];
}

export interface ConversionLeakDebuggerSnapshot {
  generatedAt: string;
  days: number;
  summary: {
    totalStarts: number;
    dimensionsCovered: number;
    criticalLeaks: number;
    blindspots: number;
    strongestLeak: string | null;
  };
  priorities: LeakPriorityItem[];
  dimensions: Record<LeakDimension, LeakDimensionSnapshot>;
  trust: {
    warning: string | null;
    notes: string[];
    windowDays: number;
    sampleSize: number;
  };
}

const BATCH_SIZE = 500;

const DIMENSION_META: Record<LeakDimension, { label: string; description: string }> = {
  source: {
    label: "Source",
    description: "Top-of-funnel acquisition sources from UTM tracking.",
  },
  campaign: {
    label: "Campaign",
    description: "Campaign-level loss grouped from UTM campaign values.",
  },
  segment: {
    label: "Segment",
    description: "Saved admin segments where possible, with scored archetype fallback otherwise.",
  },
  geo: {
    label: "Geography",
    description: "Region-level leakage from profile location coverage.",
  },
  device: {
    label: "Device",
    description: "Device leakage patterns from analytics metadata when captured.",
  },
};

const LEAK_STAGE_LABELS: Record<LeakStage, string> = {
  start_to_complete: "Start -> Complete",
  complete_to_scored: "Complete -> Scored",
  scored_to_report: "Scored -> Report",
  report_to_paid: "Report -> Paid",
};

function chunk<T>(values: T[], size = BATCH_SIZE): T[][] {
  if (values.length === 0) return [];

  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function uniqueNumbers(values: Array<number | null | undefined>): number[] {
  return [...new Set(values.filter((value): value is number => Number.isFinite(value)))];
}

function emptyAggregate(): LeakAggregate {
  return {
    starts: 0,
    completed: 0,
    scored: 0,
    reported: 0,
    paid: 0,
    resumed: 0,
  };
}

function aggregateFromContexts(contexts: SubmissionContext[]): LeakAggregate {
  const aggregate = emptyAggregate();
  for (const context of contexts) {
    aggregate.starts += 1;
    if (context.status === "completed") aggregate.completed += 1;
    if (context.scored) aggregate.scored += 1;
    if (context.viewedReport) aggregate.reported += 1;
    if (context.paid) aggregate.paid += 1;
    if (context.wasResumed) aggregate.resumed += 1;
  }
  return aggregate;
}

async function fetchBatches<T>(ids: number[], builder: (batch: number[]) => string): Promise<T[]> {
  const responses = await Promise.all(
    chunk(ids).map((batch) =>
      supabaseFetch(builder(batch), {
        headers: { Range: "0-49999" },
      })
    )
  );

  if (responses.some((response) => !response.ok)) {
    throw new Error("Batched query failed.");
  }

  const rows = await Promise.all(responses.map((response) => response.json() as Promise<T[]>));
  return rows.flat();
}

function buildScoringResultQuery(batch: number[]) {
  const select = ["survey_submission_id", "primary_archetype", "v5_primary_archetype"].join(",");
  return `/rest/v1/scoring_result?select=${select}&survey_submission_id=in.(${batch.join(",")})`;
}

function confidenceFromStarts(starts: number): LeakConfidence {
  if (starts >= 40) return "high";
  if (starts >= 12) return "medium";
  return "low";
}

function toneWeight(tone: LeakTone) {
  if (tone === "critical") return 0;
  if (tone === "watch") return 1;
  if (tone === "blindspot") return 2;
  return 3;
}

function leakTone(input: {
  starts: number;
  leakRate: number;
  leakCount: number;
  isBlindspot: boolean;
}): LeakTone {
  if (input.isBlindspot) return "blindspot";
  if (input.starts < 5 || input.leakCount <= 1) return "stable";
  if (input.leakRate >= 40 || (input.starts >= 20 && input.leakRate >= 30)) return "critical";
  if (input.leakRate >= 18) return "watch";
  return "stable";
}

function leakHref(dimension: LeakDimension, stage: LeakStage, days: number) {
  if (stage === "start_to_complete") {
    if (dimension === "source" || dimension === "campaign") {
      return buildFunnelsHref({ days, tab: "Cohort Analysis", groupBy: "utm" });
    }
    return buildFunnelsHref({ days, tab: "Conversion Funnel" });
  }
  if (stage === "complete_to_scored") return "/admin/scorecard";
  if (stage === "scored_to_report") return "/admin/reports";
  return "/admin/revenue";
}

function deviceFromMetadata(metadata: Record<string, unknown> | null) {
  const raw =
    (typeof metadata?.device_type === "string" && metadata.device_type) ||
    (typeof metadata?.deviceType === "string" && metadata.deviceType) ||
    (typeof metadata?.device === "string" && metadata.device) ||
    null;

  if (!raw) return null;

  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("desktop")) return "Desktop";
  if (normalized.includes("tablet")) return "Tablet";
  if (normalized.includes("mobile") || normalized.includes("phone")) return "Mobile";
  // normalized is verified non-empty above (`!normalized` early return).
  return normalized[0]!.toUpperCase() + normalized.slice(1);
}

function compareLeakStages(aggregate: LeakAggregate) {
  const candidates: Array<{ stage: LeakStage; from: number; to: number }> = [
    { stage: "start_to_complete", from: aggregate.starts, to: aggregate.completed },
    { stage: "complete_to_scored", from: aggregate.completed, to: aggregate.scored },
    { stage: "scored_to_report", from: aggregate.scored, to: aggregate.reported },
    { stage: "report_to_paid", from: aggregate.reported, to: aggregate.paid },
  ];

  // `candidates` has 4 static entries, so the sorted [0] is always defined.
  return candidates
    .map((candidate) => {
      const leakCount = Math.max(candidate.from - candidate.to, 0);
      const leakRate = candidate.from > 0 ? round1((leakCount / candidate.from) * 100) : 0;
      return { ...candidate, leakCount, leakRate };
    })
    .sort((a, b) => b.leakCount - a.leakCount || b.leakRate - a.leakRate)[0]!;
}

function explanationForLeak(input: {
  dimension: LeakDimension;
  label: string;
  stage: LeakStage;
  resumedShare: number;
  hasDeviceCoverage: boolean;
}) {
  if (input.dimension === "device" && !input.hasDeviceCoverage) {
    return "Device-specific leakage is directional only because analytics device metadata is missing in the current window.";
  }

  if (input.stage === "start_to_complete") {
    if (input.dimension === "source" || input.dimension === "campaign") {
      return `${input.label} is leaking before completion; inspect traffic promise, landing continuity, and early survey friction.`;
    }
    if (input.dimension === "geo") {
      return `${input.label} drops before completion; inspect region fit, localized copy, and location-specific friction.`;
    }
    if (input.dimension === "segment") {
      return `${input.label} is not finishing the survey cleanly; inspect question friction and product-fit gaps for this cohort.`;
    }
    return `${input.label} loses users before completion; inspect device-specific UX, form controls, and speed.`;
  }

  if (input.stage === "complete_to_scored") {
    return `${input.label} completes but does not reach scoring reliably; inspect scoring throughput, post-submit handling, and data integrity.`;
  }

  if (input.stage === "scored_to_report") {
    return `${input.label} reaches scoring but not report consumption; inspect report generation, delivery, and post-score engagement.`;
  }

  if (input.resumedShare >= 25) {
    return `${input.label} reaches report view but stalls before payment; high resumed share suggests stronger recovery and value reinforcement are needed.`;
  }

  return `${input.label} sees the report but leaks before payment; inspect pricing clarity, urgency, and downstream conversion messaging.`;
}

function toSegmentComparableRow(context: SubmissionContext): SegmentComparableRow {
  return {
    id: context.id,
    status: context.status,
    duration_ms: context.durationMs,
    created_date_time: context.createdAt,
    utm_tracker: JSON.stringify({
      utm_source: context.source === "Direct" ? null : context.source,
      utm_medium: context.medium === "unknown" ? null : context.medium,
    }),
    scoring_result:
      context.archetype || context.v5Archetype
        ? {
            primary_archetype: context.archetype,
            v5_primary_archetype: context.v5Archetype,
          }
        : null,
    app_user: {
      user_profile: {
        gender: context.gender,
        sexual_orientation: context.sexualOrientation,
        relationship_status: context.relationshipStatus,
        location_primary: context.geography === "Unknown" ? null : context.geography,
      },
    },
    personal_report: context.hasReport
      ? [
          {
            id: 1,
            payment_id: context.paid ? 1 : null,
          },
        ]
      : [],
  };
}

function addToAggregate(
  target: Map<string, LeakAggregate>,
  label: string,
  context: SubmissionContext
) {
  const aggregate = target.get(label) ?? emptyAggregate();
  aggregate.starts += 1;
  if (context.status === "completed") aggregate.completed += 1;
  if (context.scored) aggregate.scored += 1;
  if (context.viewedReport) aggregate.reported += 1;
  if (context.paid) aggregate.paid += 1;
  if (context.wasResumed) aggregate.resumed += 1;
  target.set(label, aggregate);
}

function buildRows(input: {
  dimension: LeakDimension;
  aggregates: Map<string, LeakAggregate>;
  days: number;
  hasDeviceCoverage: boolean;
}): LeakDebuggerRow[] {
  const deviceBlindspot = input.dimension === "device" && !input.hasDeviceCoverage;

  return [...input.aggregates.entries()]
    .map(([label, aggregate]) => {
      const leak = compareLeakStages(aggregate);
      const completionRate =
        aggregate.starts > 0 ? round1((aggregate.completed / aggregate.starts) * 100) : 0;
      const scoringRate =
        aggregate.completed > 0 ? round1((aggregate.scored / aggregate.completed) * 100) : null;
      const reportRate =
        aggregate.scored > 0 ? round1((aggregate.reported / aggregate.scored) * 100) : null;
      const paidRate =
        aggregate.reported > 0 ? round1((aggregate.paid / aggregate.reported) * 100) : null;
      const resumedShare =
        aggregate.starts > 0 ? round1((aggregate.resumed / aggregate.starts) * 100) : 0;
      const tone = leakTone({
        starts: aggregate.starts,
        leakRate: leak.leakRate,
        leakCount: leak.leakCount,
        isBlindspot: deviceBlindspot,
      });

      return {
        key: `${input.dimension}-${label}`,
        label,
        starts: aggregate.starts,
        completionRate,
        scoringRate,
        reportRate,
        paidRate,
        resumedShare,
        leakStage: leak.stage,
        leakStageLabel: LEAK_STAGE_LABELS[leak.stage],
        leakCount: leak.leakCount,
        leakRate: leak.leakRate,
        confidence: confidenceFromStarts(aggregate.starts),
        tone,
        explanation: explanationForLeak({
          dimension: input.dimension,
          label,
          stage: leak.stage,
          resumedShare,
          hasDeviceCoverage: input.hasDeviceCoverage,
        }),
        href: leakHref(input.dimension, leak.stage, input.days),
      } satisfies LeakDebuggerRow;
    })
    .sort((left, right) => {
      return (
        toneWeight(left.tone) - toneWeight(right.tone) ||
        right.leakCount - left.leakCount ||
        right.starts - left.starts
      );
    })
    .slice(0, 12);
}

export async function buildConversionLeakDebuggerSnapshot(
  inputDays: number,
  adminEmail: string
): Promise<ConversionLeakDebuggerSnapshot> {
  const days = clampDays(inputDays || 30, 7, 365);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  try {
    const submissionsRes = await supabaseFetch(
      `/rest/v1/survey_submission?select=id,user_id,status,duration_ms,created_date_time,utm_tracker,session_id&created_date_time=gte.${since}&order=created_date_time.desc`,
      { headers: { Range: "0-49999" } }
    );

    if (!submissionsRes.ok) {
      throw new Error("Unable to load submissions for leak debugger.");
    }

    const submissions = (await submissionsRes.json()) as SubmissionRow[];
    const submissionIds = submissions.map((submission) => submission.id);
    const userIds = uniqueNumbers(submissions.map((submission) => submission.user_id));

    const [partialsRes, analyticsRes, segmentsRes, scoringRows, profiles, reports] =
      await Promise.all([
        supabaseFetch(`/rest/v1/survey_partial_save?select=session_id&saved_at=gte.${since}`, {
          headers: { Range: "0-49999" },
        }),
        supabaseFetch(
          `/rest/v1/analytics_event?select=session_id,metadata&event_time=gte.${since}&metadata=not.is.null`,
          {
            headers: { Range: "0-49999" },
          }
        ),
        supabaseFetch(
          `/rest/v1/admin_segment?or=(admin_email.eq.${encodeURIComponent(adminEmail)},is_shared.eq.true)&select=id,name,rules,match_count&order=match_count.desc`,
          { headers: { Range: "0-49" } }
        ),
        submissionIds.length === 0
          ? Promise.resolve([] as ScoringRow[])
          : fetchBatches<ScoringRow>(submissionIds, buildScoringResultQuery),
        userIds.length === 0
          ? Promise.resolve([] as ProfileRow[])
          : fetchBatches<ProfileRow>(
              userIds,
              (batch) =>
                `/rest/v1/user_profile?select=id,gender,sexual_orientation,relationship_status,location_primary&id=in.(${batch.join(",")})`
            ),
        submissionIds.length === 0
          ? Promise.resolve([] as ReportRow[])
          : fetchBatches<ReportRow>(
              submissionIds,
              (batch) =>
                `/rest/v1/personal_report?select=id,survey_submission_id&survey_submission_id=in.(${batch.join(",")})`
            ),
      ]);

    if (!partialsRes.ok || !analyticsRes.ok || !segmentsRes.ok) {
      throw new Error("Unable to load leak debugger support data.");
    }

    const reportIds = reports.map((report) => report.id);
    const [reportSessions, payments] = await Promise.all([
      reportIds.length === 0
        ? Promise.resolve([] as ReportSessionRow[])
        : fetchBatches<ReportSessionRow>(
            reportIds,
            (batch) =>
              `/rest/v1/report_session?select=personal_report_id&personal_report_id=in.(${batch.join(",")})`
          ),
      reportIds.length === 0
        ? Promise.resolve([] as PaymentRow[])
        : fetchBatches<PaymentRow>(
            reportIds,
            (batch) =>
              `/rest/v1/payment?is_test=is.false&select=personal_report_id,status&personal_report_id=in.(${batch.join(",")})`
          ),
    ]);

    const partials = (await partialsRes.json()) as PartialRow[];
    const analytics = (await analyticsRes.json()) as AnalyticsRow[];
    const segments = (await segmentsRes.json()) as SegmentRow[];

    const scoringBySubmission = new Map(
      scoringRows.map((row) => [row.survey_submission_id, row] as const)
    );
    const profileByUser = new Map(profiles.map((row) => [row.id, row] as const));
    const reportBySubmission = new Map(
      reports.map((row) => [row.survey_submission_id, row] as const)
    );
    const viewedReports = new Set(reportSessions.map((row) => row.personal_report_id));
    const paidReports = new Set(
      payments
        .filter((payment) => payment.status === "succeeded")
        .map((payment) => payment.personal_report_id)
    );
    const resumedSessions = new Set(partials.map((row) => row.session_id));
    const deviceBySession = new Map<string, string>();

    for (const event of analytics) {
      if (!event.session_id || deviceBySession.has(event.session_id)) continue;
      const device = deviceFromMetadata(event.metadata);
      if (device) {
        deviceBySession.set(event.session_id, device);
      }
    }

    const contexts: SubmissionContext[] = submissions.map((submission) => {
      const scoring = scoringBySubmission.get(submission.id);
      const profile = submission.user_id != null ? profileByUser.get(submission.user_id) : null;
      const report = reportBySubmission.get(submission.id);
      const viewedReport = !!(report && viewedReports.has(report.id));
      const paid = !!(report && paidReports.has(report.id));
      const campaign = parseUtmCampaign(submission.utm_tracker);

      return {
        id: submission.id,
        userId: submission.user_id,
        status: submission.status,
        durationMs: submission.duration_ms,
        createdAt: submission.created_date_time,
        sessionId: submission.session_id,
        source: sourceLabel(submission.utm_tracker),
        medium: parseUtmMedium(submission.utm_tracker),
        campaign: campaign === "unknown" ? "Unknown" : campaign,
        device: submission.session_id
          ? (deviceBySession.get(submission.session_id) ?? "Unknown")
          : "Unknown",
        geography: profile?.location_primary?.trim() || "Unknown",
        archetype: scoring?.primary_archetype ?? null,
        v5Archetype: scoring?.v5_primary_archetype ?? null,
        gender: profile?.gender ?? null,
        sexualOrientation: profile?.sexual_orientation ?? null,
        relationshipStatus: profile?.relationship_status ?? null,
        scored: Boolean(scoring),
        hasReport: Boolean(report),
        viewedReport,
        paid,
        wasResumed: !!(submission.session_id && resumedSessions.has(submission.session_id)),
      };
    });

    const hasDeviceCoverage = contexts.some((context) => context.device !== "Unknown");
    const sourceAggregates = new Map<string, LeakAggregate>();
    const campaignAggregates = new Map<string, LeakAggregate>();
    const segmentAggregates = new Map<string, LeakAggregate>();
    const geoAggregates = new Map<string, LeakAggregate>();
    const deviceAggregates = new Map<string, LeakAggregate>();

    for (const context of contexts) {
      addToAggregate(sourceAggregates, context.source, context);
      addToAggregate(campaignAggregates, context.campaign, context);
      addToAggregate(geoAggregates, context.geography, context);
      addToAggregate(deviceAggregates, context.device, context);
    }

    const segmentCandidates = segments
      .filter(
        (segment) => Array.isArray(segment.rules?.conditions) && segment.rules.conditions.length > 0
      )
      .slice(0, 12);

    if (segmentCandidates.length > 0) {
      for (const context of contexts) {
        const comparable = toSegmentComparableRow(context);
        for (const segment of segmentCandidates) {
          if (evaluateSegmentRules(comparable, segment.rules)) {
            addToAggregate(segmentAggregates, segment.name, context);
          }
        }
      }
    }

    if (segmentAggregates.size === 0) {
      for (const context of contexts) {
        addToAggregate(segmentAggregates, context.archetype ?? "Unscored", context);
      }
    }

    const deviceRowsSource =
      deviceAggregates.size > 0
        ? deviceAggregates
        : contexts.length > 0
          ? new Map([["Unknown", aggregateFromContexts(contexts)]])
          : new Map<string, LeakAggregate>();

    const dimensions: Record<LeakDimension, LeakDimensionSnapshot> = {
      source: {
        key: "source",
        label: DIMENSION_META.source.label,
        description: DIMENSION_META.source.description,
        trustNote: null,
        strongestLeak: null,
        rows: buildRows({
          dimension: "source",
          aggregates: sourceAggregates,
          days,
          hasDeviceCoverage,
        }),
      },
      campaign: {
        key: "campaign",
        label: DIMENSION_META.campaign.label,
        description: DIMENSION_META.campaign.description,
        trustNote:
          campaignAggregates.size === 1 && campaignAggregates.has("Unknown")
            ? "Campaign tagging is largely missing in this window, so campaign leak analysis is limited."
            : null,
        strongestLeak: null,
        rows: buildRows({
          dimension: "campaign",
          aggregates: campaignAggregates,
          days,
          hasDeviceCoverage,
        }),
      },
      segment: {
        key: "segment",
        label: DIMENSION_META.segment.label,
        description: DIMENSION_META.segment.description,
        trustNote:
          segmentCandidates.length > 0
            ? null
            : "No saved segments are configured, so this view currently falls back to scored archetypes.",
        strongestLeak: null,
        rows: buildRows({
          dimension: "segment",
          aggregates: segmentAggregates,
          days,
          hasDeviceCoverage,
        }),
      },
      geo: {
        key: "geo",
        label: DIMENSION_META.geo.label,
        description: DIMENSION_META.geo.description,
        trustNote: geoAggregates.has("Unknown")
          ? "Some submissions do not have mapped profile location, so geography leakage is partially directional."
          : null,
        strongestLeak: null,
        rows: buildRows({
          dimension: "geo",
          aggregates: geoAggregates,
          days,
          hasDeviceCoverage,
        }),
      },
      device: {
        key: "device",
        label: DIMENSION_META.device.label,
        description: DIMENSION_META.device.description,
        trustNote: hasDeviceCoverage
          ? null
          : "No device metadata was captured in analytics_event for the selected window, so device leakage is a blindspot view.",
        strongestLeak: null,
        rows: buildRows({
          dimension: "device",
          aggregates: deviceRowsSource,
          days,
          hasDeviceCoverage,
        }),
      },
    };

    dimensions.source.strongestLeak = dimensions.source.rows[0]?.label ?? null;
    dimensions.campaign.strongestLeak = dimensions.campaign.rows[0]?.label ?? null;
    dimensions.segment.strongestLeak = dimensions.segment.rows[0]?.label ?? null;
    dimensions.geo.strongestLeak = dimensions.geo.rows[0]?.label ?? null;
    dimensions.device.strongestLeak = dimensions.device.rows[0]?.label ?? null;

    const priorities = (Object.entries(dimensions) as Array<[LeakDimension, LeakDimensionSnapshot]>)
      .flatMap(([dimension, snapshot]) =>
        snapshot.rows.slice(0, 3).map((row) => ({
          dimension,
          label: row.label,
          leakStageLabel: row.leakStageLabel,
          leakCount: row.leakCount,
          leakRate: row.leakRate,
          confidence: row.confidence,
          explanation: row.explanation,
          href: row.href,
          tone: row.tone,
        }))
      )
      .sort((left, right) => {
        return (
          toneWeight(left.tone) - toneWeight(right.tone) ||
          right.leakCount - left.leakCount ||
          right.leakRate - left.leakRate
        );
      })
      .slice(0, 8)
      .map(({ tone: _tone, ...priority }) => priority);

    const trust = buildTrustDescriptor({
      source:
        "survey_submission + scoring_result + personal_report + report_session + payment + analytics_event",
      mode: "derived",
      sampleSize: contexts.length,
      lastUpdated: new Date().toISOString(),
      warning:
        contexts.length < 20
          ? "Leak debugger is based on a small sample in the selected window."
          : !hasDeviceCoverage
            ? "Device leakage is directional only because analytics device metadata is missing in the current window."
            : null,
    });

    const trustNotes = [
      "Leak stage is the biggest sequential loss across Start -> Complete -> Scored -> Report -> Paid.",
      "Source and campaign are derived from submission-level UTM tracking.",
      dimensions.segment.trustNote ??
        "Segment analysis uses saved admin segments and only falls back to scored archetypes when no saved segments exist.",
      dimensions.device.trustNote ??
        "Device is mapped from analytics_event metadata by session and compared against the same conversion stages.",
    ];

    return {
      generatedAt: new Date().toISOString(),
      days,
      summary: {
        totalStarts: contexts.length,
        dimensionsCovered: Object.values(dimensions).filter((snapshot) => snapshot.rows.length > 0)
          .length,
        criticalLeaks: priorities.filter(
          (priority) => priority.leakRate >= 30 || priority.leakCount >= 5
        ).length,
        blindspots: Object.values(dimensions).filter((snapshot) => snapshot.trustNote != null)
          .length,
        strongestLeak: priorities[0]
          ? `${priorities[0].label} (${dimensions[priorities[0].dimension].label})`
          : null,
      },
      priorities,
      dimensions,
      trust: {
        warning: trust.warning,
        notes: trustNotes,
        windowDays: days,
        sampleSize: contexts.length,
      },
    };
  } catch (err) {
    // warn-not-error: caller (admin route or safeSnapshot in digest-metrics)
    // decides Slack-worthiness. Avoids double-paging on transient Supabase
    // outages. See channel-efficiency.ts for the full rationale.
    logger.warn({ err }, "Conversion leak debugger build error");
    throw err;
  }
}
