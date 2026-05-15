import {
  buildTrustDescriptor,
  clampDays,
  round1,
  sourceLabel,
} from "@features/admin/server/next-level";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@/lib/logger";

interface WaitlistRow {
  id: number;
  utm_tracker: string | null;
}

interface SubmissionRow {
  id: number;
  status: string;
  utm_tracker: string | null;
  duration_ms: number | null;
  session_id: string | null;
}

interface PartialSaveRow {
  session_id: string;
  utm_tracker: string | null;
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
  amount: number | null;
}

interface ScoringRow {
  survey_submission_id: number;
}

type ChannelAction = "scale" | "watch" | "fix" | "blindspot";
type ChannelConfidence = "high" | "medium" | "low";

export interface ChannelEfficiencyRow {
  source: string;
  signups: number;
  starts: number;
  startRate: number | null;
  completionRate: number;
  scoredRate: number;
  reportViewRate: number;
  paidRate: number;
  recoveryRate: number;
  flaggedRate: number;
  avgDurationMin: number | null;
  revenuePerStart: number;
  revenueTotal: number;
  efficiencyScore: number;
  confidence: ChannelConfidence;
  action: ChannelAction;
}

export interface ChannelEfficiencySnapshot {
  generatedAt: string;
  days: number;
  channels: ChannelEfficiencyRow[];
  summary: {
    totalSources: number;
    totalSignups: number;
    totalStarts: number;
    totalPartialSaves: number;
    avgEfficiencyScore: number;
    scaleCandidates: number;
    fixCandidates: number;
    bestSource: string | null;
    weakestHighVolumeSource: string | null;
  };
  trust: {
    windowDays: number;
    sampleSize: number;
    warning: string | null;
    source: string;
    mode: "live" | "derived" | "sampled" | "materialized";
    lastUpdated: string | null;
    freshnessHours: number | null;
  };
}

function confidenceFromStarts(starts: number): ChannelConfidence {
  if (starts >= 40) return "high";
  if (starts >= 15) return "medium";
  return "low";
}

function efficiencyScore(input: {
  startRate: number | null;
  completionRate: number;
  scoredRate: number;
  reportViewRate: number;
  paidRate: number;
  recoveryRate: number;
  revenuePerStart: number;
}): number {
  const startSignal = input.startRate ?? 0;
  const paidSignal = Math.min(input.paidRate * 8, 100);
  const valueSignal = Math.min(input.revenuePerStart * 4, 100);

  return round1(
    startSignal * 0.15 +
      input.completionRate * 0.25 +
      input.scoredRate * 0.1 +
      input.reportViewRate * 0.15 +
      paidSignal * 0.15 +
      input.recoveryRate * 0.1 +
      valueSignal * 0.1
  );
}

function actionForChannel(input: {
  signups: number;
  starts: number;
  efficiencyScore: number;
  paidRate: number;
  completionRate: number;
  reportViewRate: number;
}): ChannelAction {
  if (input.starts >= 20 && input.efficiencyScore >= 65 && input.paidRate >= 3) return "scale";
  if (
    input.starts >= 20 &&
    (input.efficiencyScore < 40 || input.completionRate < 35 || input.reportViewRate < 20)
  ) {
    return "fix";
  }
  if (input.signups > 0 && input.starts === 0) return "blindspot";
  return "watch";
}

export async function buildChannelEfficiencySnapshot(
  inputDays: number
): Promise<ChannelEfficiencySnapshot> {
  const days = clampDays(inputDays || 30, 7, 365);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  try {
    const [
      waitlistRes,
      submissionsRes,
      scoringRes,
      partialsRes,
      reportsRes,
      reportSessionsRes,
      paymentsRes,
    ] = await Promise.all([
      supabaseFetch(`/rest/v1/waitlist_user?select=id,utm_tracker&created_date_time=gte.${since}`, {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch(
        `/rest/v1/survey_submission?select=id,status,utm_tracker,duration_ms,session_id&created_date_time=gte.${since}`,
        { headers: { Range: "0-49999" } }
      ),
      supabaseFetch(`/rest/v1/scoring_result?select=survey_submission_id&scored_at=gte.${since}`, {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch(
        `/rest/v1/survey_partial_save?select=session_id,utm_tracker&saved_at=gte.${since}`,
        { headers: { Range: "0-49999" } }
      ),
      supabaseFetch("/rest/v1/personal_report?select=id,survey_submission_id", {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch("/rest/v1/report_session?select=personal_report_id", {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch(
        `/rest/v1/payment?select=personal_report_id,status,amount&payment_date_time=gte.${since}`,
        { headers: { Range: "0-49999" } }
      ),
    ]);

    if (
      !waitlistRes.ok ||
      !submissionsRes.ok ||
      !scoringRes.ok ||
      !partialsRes.ok ||
      !reportsRes.ok ||
      !reportSessionsRes.ok ||
      !paymentsRes.ok
    ) {
      throw new Error("Unable to load channel efficiency data.");
    }

    const waitlist = (await waitlistRes.json()) as WaitlistRow[];
    const submissions = (await submissionsRes.json()) as SubmissionRow[];
    const scoringRows = (await scoringRes.json()) as ScoringRow[];
    const partials = (await partialsRes.json()) as PartialSaveRow[];
    const reports = (await reportsRes.json()) as ReportRow[];
    const reportSessions = (await reportSessionsRes.json()) as ReportSessionRow[];
    const payments = (await paymentsRes.json()) as PaymentRow[];

    const scoredIds = new Set(scoringRows.map((row) => row.survey_submission_id));
    const partialSessions = new Set(partials.map((row) => row.session_id));
    const reportsBySubmission = new Map(reports.map((row) => [row.survey_submission_id, row.id]));
    const viewedReports = new Set(reportSessions.map((row) => row.personal_report_id));
    const paidAmountByReport = new Map<number, number>();
    for (const payment of payments) {
      if (payment.status !== "succeeded") continue;
      paidAmountByReport.set(
        payment.personal_report_id,
        (paidAmountByReport.get(payment.personal_report_id) ?? 0) + Number(payment.amount ?? 0)
      );
    }

    const partialsBySource = new Map<string, number>();
    for (const partial of partials) {
      const source = sourceLabel(partial.utm_tracker);
      partialsBySource.set(source, (partialsBySource.get(source) ?? 0) + 1);
    }

    const sourceMap = new Map<
      string,
      {
        signups: number;
        starts: number;
        completed: number;
        scored: number;
        viewed: number;
        paid: number;
        recovered: number;
        flagged: number;
        revenue: number;
        durationTotal: number;
        durationCount: number;
      }
    >();

    for (const row of waitlist) {
      const source = sourceLabel(row.utm_tracker);
      const current = sourceMap.get(source) ?? {
        signups: 0,
        starts: 0,
        completed: 0,
        scored: 0,
        viewed: 0,
        paid: 0,
        recovered: 0,
        flagged: 0,
        revenue: 0,
        durationTotal: 0,
        durationCount: 0,
      };
      current.signups += 1;
      sourceMap.set(source, current);
    }

    for (const submission of submissions) {
      const source = sourceLabel(submission.utm_tracker);
      const reportId = reportsBySubmission.get(submission.id);
      const paidAmount = reportId ? (paidAmountByReport.get(reportId) ?? 0) : 0;

      const current = sourceMap.get(source) ?? {
        signups: 0,
        starts: 0,
        completed: 0,
        scored: 0,
        viewed: 0,
        paid: 0,
        recovered: 0,
        flagged: 0,
        revenue: 0,
        durationTotal: 0,
        durationCount: 0,
      };

      current.starts += 1;
      if (submission.status === "completed") current.completed += 1;
      if (submission.status === "flagged") current.flagged += 1;
      if (scoredIds.has(submission.id)) current.scored += 1;
      if (reportId && viewedReports.has(reportId)) current.viewed += 1;
      if (paidAmount > 0) {
        current.paid += 1;
        current.revenue += paidAmount;
      }
      if (
        submission.session_id &&
        partialSessions.has(submission.session_id) &&
        submission.status === "completed"
      ) {
        current.recovered += 1;
      }
      if (submission.duration_ms != null && submission.duration_ms > 0) {
        current.durationTotal += submission.duration_ms;
        current.durationCount += 1;
      }

      sourceMap.set(source, current);
    }

    const channels = [...sourceMap.entries()]
      .map(([source, stats]) => {
        const startRate = stats.signups > 0 ? round1((stats.starts / stats.signups) * 100) : null;
        const completionRate =
          stats.starts > 0 ? round1((stats.completed / stats.starts) * 100) : 0;
        const scoredRate = stats.starts > 0 ? round1((stats.scored / stats.starts) * 100) : 0;
        const reportViewRate = stats.starts > 0 ? round1((stats.viewed / stats.starts) * 100) : 0;
        const paidRate = stats.starts > 0 ? round1((stats.paid / stats.starts) * 100) : 0;
        const flaggedRate = stats.starts > 0 ? round1((stats.flagged / stats.starts) * 100) : 0;
        const partialBase = partialsBySource.get(source) ?? 0;
        const recoveryRate = partialBase > 0 ? round1((stats.recovered / partialBase) * 100) : 0;
        const revenuePerStart = stats.starts > 0 ? round1(stats.revenue / stats.starts) : 0;
        const avgDurationMin =
          stats.durationCount > 0
            ? round1(stats.durationTotal / stats.durationCount / 60_000)
            : null;
        const score = efficiencyScore({
          startRate,
          completionRate,
          scoredRate,
          reportViewRate,
          paidRate,
          recoveryRate,
          revenuePerStart,
        });

        return {
          source,
          signups: stats.signups,
          starts: stats.starts,
          startRate,
          completionRate,
          scoredRate,
          reportViewRate,
          paidRate,
          recoveryRate,
          flaggedRate,
          avgDurationMin,
          revenuePerStart,
          revenueTotal: round1(stats.revenue),
          efficiencyScore: score,
          confidence: confidenceFromStarts(stats.starts),
          action: actionForChannel({
            signups: stats.signups,
            starts: stats.starts,
            efficiencyScore: score,
            paidRate,
            completionRate,
            reportViewRate,
          }),
        } satisfies ChannelEfficiencyRow;
      })
      .sort((a, b) => b.efficiencyScore - a.efficiencyScore || b.starts - a.starts);

    const highVolume = channels.filter((channel) => channel.starts >= 20);
    const weakestHighVolumeSource =
      [...highVolume].sort((a, b) => a.efficiencyScore - b.efficiencyScore)[0]?.source ?? null;
    const trust = buildTrustDescriptor({
      source: "waitlist_user + survey_submission + personal_report + payment",
      mode: "derived",
      sampleSize: submissions.length,
      lastUpdated: new Date().toISOString(),
      warning:
        submissions.length < 20
          ? "Channel efficiency is based on a small sample in the selected window."
          : channels.some((channel) => channel.signups === 0 && channel.starts >= 10)
            ? "Some channels have starts without matching signup coverage, so acquisition efficiency is directional."
            : null,
    });

    return {
      generatedAt: new Date().toISOString(),
      days,
      channels,
      summary: {
        totalSources: channels.length,
        totalSignups: waitlist.length,
        totalStarts: submissions.length,
        totalPartialSaves: partials.length,
        avgEfficiencyScore:
          channels.length > 0
            ? round1(
                channels.reduce((sum, channel) => sum + channel.efficiencyScore, 0) /
                  channels.length
              )
            : 0,
        scaleCandidates: channels.filter((channel) => channel.action === "scale").length,
        fixCandidates: channels.filter((channel) => channel.action === "fix").length,
        bestSource: channels[0]?.source ?? null,
        weakestHighVolumeSource,
      },
      trust: {
        windowDays: days,
        sampleSize: submissions.length,
        warning: trust.warning,
        source: trust.source,
        mode: trust.mode,
        lastUpdated: trust.lastUpdated,
        freshnessHours: trust.freshnessHours,
      },
    };
  } catch (err) {
    logger.error({ err }, "Channel efficiency build error");
    throw err;
  }
}
