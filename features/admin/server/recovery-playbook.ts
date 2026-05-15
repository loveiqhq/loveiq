import {
  buildTrustDescriptor,
  clampDays,
  median,
  round1,
  sourceLabel,
} from "@features/admin/server/next-level";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@/lib/logger";

interface SubmissionRow {
  id: number;
  status: string;
  start_date_time: string | null;
  created_date_time: string;
  duration_ms: number | null;
  session_id: string | null;
  utm_tracker: string | null;
}

interface PartialSaveRow {
  session_id: string;
  current_index: number;
  started_at: string | null;
  saved_at: string;
  utm_tracker: string | null;
}

interface RecoveryRecord {
  sessionId: string;
  currentIndex: number;
  source: string;
  savedAt: string;
  recovered: boolean;
  scored: boolean;
  recoveryHours: number | null;
}

type PlaybookAttention = "scale" | "watch" | "risk";
type PlaybookPriority = "high" | "medium" | "low";

export interface RecoverySource {
  source: string;
  partialSaves: number;
  recovered: number;
  recoveryRate: number;
}

export interface RecoveryCohortRow {
  week: string;
  totalSubmissions: number;
  completionRate: number;
  scoredRate: number;
  resumedShare: number;
  resumedCompletionRate: number;
  avgDurationMin: number | null;
  qualityScore: number;
}

export interface RecoveryPlaybookItem {
  id: string;
  cohortType: string;
  title: string;
  summary: string;
  intervention: string;
  ownerRole: string;
  attention: PlaybookAttention;
  priority: PlaybookPriority;
  partialSaves: number;
  recovered: number;
  recoveryRate: number;
  medianHoursToRecover: number | null;
  avgHoursToRecover: number | null;
  topResumePoint: number | null;
  topSource: string | null;
  actionTitle: string;
  linkedHref: string;
  dueDate: string;
  reviewDate: string;
}

export interface RecoveryPlaybookGroup {
  key: "stage" | "source";
  label: string;
  description: string;
  items: RecoveryPlaybookItem[];
}

export interface RecoveryPlaybookSnapshot {
  generatedAt: string;
  summary: {
    totalPartialSaves: number;
    recoveredCount: number;
    recoveryRate: number;
    medianHoursToRecover: number | null;
    avgHoursToRecover: number | null;
  };
  resumePoints: Array<{ currentIndex: number; count: number }>;
  recoveryBySource: RecoverySource[];
  cohorts: RecoveryCohortRow[];
  playbookGroups: RecoveryPlaybookGroup[];
  trust: {
    windowDays: number;
    sampleSize: number;
    warning: string | null;
    notes: string[];
  };
}

function weekKey(iso: string) {
  const date = new Date(iso);
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return start.toISOString().slice(0, 10);
}

function isoDate(daysFromNow: number) {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);
}

function average(values: number[]) {
  return values.length > 0
    ? round1(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null;
}

function stageBucket(
  currentIndex: number,
  earlyThreshold: number,
  midThreshold: number
): "early" | "mid" | "late" {
  if (currentIndex <= earlyThreshold) return "early";
  if (currentIndex <= midThreshold) return "mid";
  return "late";
}

function playbookAttention(input: {
  recoveryRate: number;
  partialSaves: number;
  avgHoursToRecover: number | null;
}): PlaybookAttention {
  if (input.recoveryRate < 22 || (input.partialSaves >= 8 && (input.avgHoursToRecover ?? 0) > 24)) {
    return "risk";
  }
  if (input.recoveryRate >= 48 && input.partialSaves >= 4) return "scale";
  return "watch";
}

function playbookPriority(attention: PlaybookAttention): PlaybookPriority {
  if (attention === "risk") return "high";
  if (attention === "scale") return "low";
  return "medium";
}

function ownerRoleForStage(bucket: "early" | "mid" | "late") {
  if (bucket === "early") return "Product lead";
  if (bucket === "mid") return "Product + lifecycle";
  return "Growth lead";
}

function titleForStage(bucket: "early" | "mid" | "late") {
  if (bucket === "early") return "Early-friction rescue";
  if (bucket === "mid") return "Mid-funnel hesitation rescue";
  return "Late-intent rescue";
}

function cohortTypeForStage(bucket: "early" | "mid" | "late") {
  if (bucket === "early") return "Stage cohort: early abandonment";
  if (bucket === "mid") return "Stage cohort: mid-funnel hesitation";
  return "Stage cohort: late-intent stall";
}

function summaryForStage(
  bucket: "early" | "mid" | "late",
  recoveryRate: number,
  topResumePoint: number | null
) {
  if (bucket === "early") {
    return `Users are saving early in the survey and only ${recoveryRate}% return to complete. The biggest hotspot is around Q${topResumePoint ?? "?"}.`;
  }
  if (bucket === "mid") {
    return `Users are getting partway through and losing momentum. Recovery is ${recoveryRate}% with hesitation clustering around Q${topResumePoint ?? "?"}.`;
  }
  return `These users are high intent but stall late. Recovery is ${recoveryRate}% and the highest-risk return point is around Q${topResumePoint ?? "?"}.`;
}

function interventionForStage(bucket: "early" | "mid" | "late", avgHours: number | null) {
  const timing =
    avgHours == null
      ? "Use a fast resume prompt."
      : avgHours <= 6
        ? "Push a same-day resume prompt while intent is still warm."
        : avgHours <= 24
          ? "Push a sub-24h resume reminder before intent decays."
          : "Tighten the reminder window because recovery is happening too late.";

  if (bucket === "early") {
    return `Reduce first-impression friction, shorten early questions, and add stronger progress reassurance. ${timing}`;
  }
  if (bucket === "mid") {
    return `Improve momentum with tighter grouping, clearer value framing, and stronger save-progress reassurance. ${timing}`;
  }
  return `Show report-preview value earlier, tighten the resume CTA, and reinforce why finishing now matters. ${timing}`;
}

function summaryForSource(source: string, recoveryRate: number) {
  return `${source} is generating meaningful recovery volume but only ${recoveryRate}% of partial saves return to completion.`;
}

function interventionForSource(source: string) {
  return `Audit ${source} promise-to-flow alignment, then test source-specific resume reminders and a tailored return-value message.`;
}

export async function buildRecoveryPlaybookSnapshot(
  inputDays: number
): Promise<RecoveryPlaybookSnapshot> {
  const days = clampDays(inputDays || 30, 7, 365);
  const since =
    days > 0
      ? new Date(Date.now() - days * 86_400_000).toISOString()
      : new Date("2000-01-01").toISOString();

  try {
    const [submissionsRes, partialsRes, scoringRes] = await Promise.all([
      supabaseFetch(
        `/rest/v1/survey_submission?select=id,status,start_date_time,created_date_time,duration_ms,session_id,utm_tracker&created_date_time=gte.${since}`,
        { headers: { Range: "0-49999" } }
      ),
      supabaseFetch(
        `/rest/v1/survey_partial_save?select=session_id,current_index,started_at,saved_at,utm_tracker&saved_at=gte.${since}`,
        { headers: { Range: "0-49999" } }
      ),
      supabaseFetch(`/rest/v1/scoring_result?select=survey_submission_id&scored_at=gte.${since}`, {
        headers: { Range: "0-49999" },
      }),
    ]);

    if (!submissionsRes.ok || !partialsRes.ok || !scoringRes.ok) {
      throw new Error("Unable to load recovery data.");
    }

    const submissions = (await submissionsRes.json()) as SubmissionRow[];
    const partials = (await partialsRes.json()) as PartialSaveRow[];
    const scoredIds = new Set(
      ((await scoringRes.json()) as Array<{ survey_submission_id: number }>).map(
        (row) => row.survey_submission_id
      )
    );

    const submissionBySession = new Map(
      submissions
        .filter((submission) => submission.session_id)
        .map((submission) => [submission.session_id as string, submission] as const)
    );
    const recoveredDurationsHours: number[] = [];
    const sourceMap = new Map<string, { partialSaves: number; recovered: number }>();
    const resumePoints = new Map<number, number>();
    const recoveryRecords: RecoveryRecord[] = [];

    for (const partial of partials) {
      const submission = submissionBySession.get(partial.session_id);
      const source = sourceLabel(partial.utm_tracker);
      const recovered = submission?.status === "completed";
      const recoveryHours =
        recovered && submission
          ? (new Date(submission.created_date_time).getTime() -
              new Date(partial.saved_at).getTime()) /
            3_600_000
          : null;

      const sourceStats = sourceMap.get(source) ?? { partialSaves: 0, recovered: 0 };
      sourceStats.partialSaves += 1;
      if (recovered) {
        sourceStats.recovered += 1;
      }
      sourceMap.set(source, sourceStats);

      resumePoints.set(partial.current_index, (resumePoints.get(partial.current_index) ?? 0) + 1);

      if (recoveryHours != null && recoveryHours >= 0) {
        recoveredDurationsHours.push(recoveryHours);
      }

      recoveryRecords.push({
        sessionId: partial.session_id,
        currentIndex: partial.current_index,
        source,
        savedAt: partial.saved_at,
        recovered,
        scored: !!(submission && scoredIds.has(submission.id)),
        recoveryHours: recoveryHours != null && recoveryHours >= 0 ? recoveryHours : null,
      });
    }

    const recoveryRecordBySession = new Map(
      recoveryRecords.map((record) => [record.sessionId, record] as const)
    );

    const cohorts = new Map<
      string,
      {
        total: number;
        completed: number;
        scored: number;
        resumed: number;
        resumedCompleted: number;
        durationTotal: number;
        durationCount: number;
      }
    >();

    for (const submission of submissions) {
      const firstTouch = submission.start_date_time || submission.created_date_time;
      const key = weekKey(firstTouch);
      const cohort = cohorts.get(key) ?? {
        total: 0,
        completed: 0,
        scored: 0,
        resumed: 0,
        resumedCompleted: 0,
        durationTotal: 0,
        durationCount: 0,
      };
      const partial = submission.session_id
        ? recoveryRecordBySession.get(submission.session_id)
        : undefined;
      cohort.total += 1;
      if (submission.status === "completed") cohort.completed += 1;
      if (scoredIds.has(submission.id)) cohort.scored += 1;
      if (partial) {
        cohort.resumed += 1;
        if (submission.status === "completed") cohort.resumedCompleted += 1;
      }
      if (submission.duration_ms != null && submission.duration_ms > 0) {
        cohort.durationTotal += submission.duration_ms;
        cohort.durationCount += 1;
      }
      cohorts.set(key, cohort);
    }

    const cohortRows = [...cohorts.entries()]
      .map(([week, cohort]) => {
        const completionRate =
          cohort.total > 0 ? round1((cohort.completed / cohort.total) * 100) : 0;
        const scoredRate = cohort.total > 0 ? round1((cohort.scored / cohort.total) * 100) : 0;
        const resumedShare = cohort.total > 0 ? round1((cohort.resumed / cohort.total) * 100) : 0;
        const resumedCompletionRate =
          cohort.resumed > 0 ? round1((cohort.resumedCompleted / cohort.resumed) * 100) : 0;
        const avgDurationMin =
          cohort.durationCount > 0
            ? round1(cohort.durationTotal / cohort.durationCount / 60_000)
            : null;
        const qualityScore = round1(
          completionRate * 0.45 +
            scoredRate * 0.25 +
            resumedCompletionRate * 0.2 +
            Math.max(0, 100 - resumedShare) * 0.1
        );

        return {
          week,
          totalSubmissions: cohort.total,
          completionRate,
          scoredRate,
          resumedShare,
          resumedCompletionRate,
          avgDurationMin,
          qualityScore,
        } satisfies RecoveryCohortRow;
      })
      .sort((left, right) => left.week.localeCompare(right.week));

    const recoveryBySource = [...sourceMap.entries()]
      .map(([source, stats]) => ({
        source,
        partialSaves: stats.partialSaves,
        recovered: stats.recovered,
        recoveryRate:
          stats.partialSaves > 0 ? round1((stats.recovered / stats.partialSaves) * 100) : 0,
      }))
      .sort(
        (left, right) =>
          right.recoveryRate - left.recoveryRate || right.partialSaves - left.partialSaves
      );

    const maxIndex = Math.max(...partials.map((partial) => partial.current_index), 30);
    const earlyThreshold = Math.max(5, Math.ceil(maxIndex * 0.33));
    const midThreshold = Math.max(10, Math.ceil(maxIndex * 0.66));

    const stageGroups = {
      early: [] as RecoveryRecord[],
      mid: [] as RecoveryRecord[],
      late: [] as RecoveryRecord[],
    };
    for (const record of recoveryRecords) {
      const bucket = stageBucket(record.currentIndex, earlyThreshold, midThreshold);
      if (bucket === "early") {
        stageGroups.early.push(record);
      } else if (bucket === "mid") {
        stageGroups.mid.push(record);
      } else {
        stageGroups.late.push(record);
      }
    }

    const stagePlaybooks: RecoveryPlaybookItem[] = [];
    for (const bucket of ["early", "mid", "late"] as const) {
      const records =
        bucket === "early"
          ? stageGroups.early
          : bucket === "mid"
            ? stageGroups.mid
            : stageGroups.late;
      if (records.length === 0) continue;

      const recovered = records.filter((record) => record.recovered).length;
      const recoveryRate = round1((recovered / records.length) * 100);
      const hours = records
        .map((record) => record.recoveryHours)
        .filter((value): value is number => value != null);
      const resumePointCounts = new Map<number, number>();
      const sourceCounts = new Map<string, number>();
      for (const record of records) {
        resumePointCounts.set(
          record.currentIndex,
          (resumePointCounts.get(record.currentIndex) ?? 0) + 1
        );
        sourceCounts.set(record.source, (sourceCounts.get(record.source) ?? 0) + 1);
      }

      const topResumePoint =
        [...resumePointCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
      const topSource =
        [...sourceCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
      const avgHours = average(hours);
      const attention = playbookAttention({
        recoveryRate,
        partialSaves: records.length,
        avgHoursToRecover: avgHours,
      });
      const priority = playbookPriority(attention);

      stagePlaybooks.push({
        id: `stage-${bucket}`,
        cohortType: cohortTypeForStage(bucket),
        title: titleForStage(bucket),
        summary: summaryForStage(bucket, recoveryRate, topResumePoint),
        intervention: interventionForStage(bucket, avgHours),
        ownerRole: ownerRoleForStage(bucket),
        attention,
        priority,
        partialSaves: records.length,
        recovered,
        recoveryRate,
        medianHoursToRecover: median(hours),
        avgHoursToRecover: avgHours,
        topResumePoint,
        topSource,
        actionTitle: `${titleForStage(bucket)} playbook`,
        linkedHref: "/admin/growth",
        dueDate: priority === "high" ? isoDate(7) : isoDate(14),
        reviewDate: priority === "high" ? isoDate(14) : isoDate(21),
      });
    }

    const sourcePlaybooks = recoveryBySource
      .filter((source) => source.partialSaves >= 3)
      .sort(
        (left, right) =>
          left.recoveryRate - right.recoveryRate || right.partialSaves - left.partialSaves
      )
      .slice(0, 3)
      .map((source) => {
        const records = recoveryRecords.filter((record) => record.source === source.source);
        const hours = records
          .map((record) => record.recoveryHours)
          .filter((value): value is number => value != null);
        const resumePointCounts = new Map<number, number>();
        for (const record of records) {
          resumePointCounts.set(
            record.currentIndex,
            (resumePointCounts.get(record.currentIndex) ?? 0) + 1
          );
        }
        const topResumePoint =
          [...resumePointCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
          null;
        const attention = playbookAttention({
          recoveryRate: source.recoveryRate,
          partialSaves: source.partialSaves,
          avgHoursToRecover: average(hours),
        });
        const priority = playbookPriority(attention);

        return {
          id: `source-${source.source.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          cohortType: "Channel cohort",
          title: `${source.source} recovery hotspot`,
          summary: summaryForSource(source.source, source.recoveryRate),
          intervention: interventionForSource(source.source),
          ownerRole: "Growth lead",
          attention,
          priority,
          partialSaves: source.partialSaves,
          recovered: source.recovered,
          recoveryRate: source.recoveryRate,
          medianHoursToRecover: median(hours),
          avgHoursToRecover: average(hours),
          topResumePoint,
          topSource: source.source,
          actionTitle: `${source.source} recovery hotspot`,
          linkedHref: "/admin/growth",
          dueDate: priority === "high" ? isoDate(7) : isoDate(14),
          reviewDate: priority === "high" ? isoDate(14) : isoDate(21),
        } satisfies RecoveryPlaybookItem;
      });

    const playbookGroups: RecoveryPlaybookGroup[] = [
      {
        key: "stage" as const,
        label: "Stage cohorts",
        description:
          "Intervene based on where users stall in the flow, not only who they are or where they came from.",
        items: stagePlaybooks,
      },
      {
        key: "source" as const,
        label: "Source hotspots",
        description:
          "Target channel-specific rescue work where recovery is weak but the partial-save volume is real.",
        items: sourcePlaybooks,
      },
    ].filter((group) => group.items.length > 0);

    const recoveredCount = recoveredDurationsHours.length;
    const totalPartialSaves = partials.length;
    const trust = buildTrustDescriptor({
      source: "survey_partial_save + survey_submission + scoring_result",
      mode: "derived",
      sampleSize: submissions.length,
      lastUpdated: new Date().toISOString(),
      warning:
        submissions.length < 20
          ? "Recovery playbooks are based on a small sample in the selected window."
          : totalPartialSaves === 0
            ? "No partial-save volume exists in the selected window."
            : null,
    });

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalPartialSaves,
        recoveredCount,
        recoveryRate:
          totalPartialSaves > 0 ? round1((recoveredCount / totalPartialSaves) * 100) : 0,
        medianHoursToRecover: median(recoveredDurationsHours),
        avgHoursToRecover: average(recoveredDurationsHours),
      },
      resumePoints: [...resumePoints.entries()]
        .map(([currentIndex, count]) => ({ currentIndex, count }))
        .sort((left, right) => right.count - left.count),
      recoveryBySource,
      cohorts: cohortRows,
      playbookGroups,
      trust: {
        windowDays: days,
        sampleSize: submissions.length,
        warning: trust.warning,
        notes: [
          `Stage cohorts are split dynamically from partial-save depth using current-index thresholds ${earlyThreshold}/${midThreshold}.`,
          "Recovery actions should be owned explicitly; this playbook center is designed to feed the existing admin action tracker.",
          "Source hotspots only appear when a source has enough partial-save volume to be actionable.",
        ],
      },
    };
  } catch (err) {
    logger.error({ err }, "Recovery playbook build error");
    throw err;
  }
}
