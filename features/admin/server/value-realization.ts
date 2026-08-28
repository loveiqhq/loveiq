import {
  buildTrustDescriptor,
  clampDays,
  round1,
  sourceLabel,
} from "@features/admin/server/next-level";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

interface SubmissionRow {
  id: number;
  user_id: number | null;
  status: string;
  utm_tracker: string | null;
}

interface AppUserRow {
  id: number;
  email: string | null;
}

interface ScoringRow {
  survey_submission_id: number;
  primary_archetype: string | null;
}

interface ReportRow {
  id: number;
  survey_submission_id: number;
}

interface ReportSessionRow {
  personal_report_id: number;
  started_at: string;
}

interface ShareRow {
  personal_report_id: number;
}

interface PaymentRow {
  personal_report_id: number;
  status: string;
  amount: number | null;
}

interface InviteRow {
  referrer_email: string;
}

interface SubmissionOutcomeContext {
  source: string;
  archetype: string;
  viewed: boolean;
  sessionCount: number;
  sessionDayCount: number;
  shared: boolean;
  referred: boolean;
  retained: boolean;
  paid: boolean;
  upgradeIntent: boolean;
  revenue: number;
}

type SignalKey =
  | "report_viewed"
  | "repeat_session"
  | "multi_day_return"
  | "shared_report"
  | "sent_referral";

interface OutcomeStats {
  monetizationRate: number;
  monetizationLift: number;
  referralRate: number;
  referralLift: number;
  retentionRate: number;
  retentionLift: number;
  upgradeIntentRate: number;
  upgradeIntentLift: number;
}

export interface ValueRealizationSignalRow extends OutcomeStats {
  signal: string;
  audience: number;
  strongestOutcome: string;
  strongestLift: number;
}

export interface ValueRealizationChannelRow extends OutcomeStats {
  source: string;
  starts: number;
  revenueTotal: number;
  revenuePerStart: number;
  valueRealizationScore: number;
}

export interface ValueRealizationArchetypeRow extends OutcomeStats {
  archetype: string;
  starts: number;
  revenueTotal: number;
  revenuePerStart: number;
  valueRealizationScore: number;
}

export interface ValueRealizationRecommendation {
  title: string;
  detail: string;
  tone: "scale" | "watch" | "risk" | "blindspot";
}

export interface ValueRealizationSnapshot {
  generatedAt: string;
  days: number;
  summary: {
    starts: number;
    monetizedCount: number;
    retainedCount: number;
    referredCount: number;
    upgradeIntentCount: number;
    strongestMonetizationSignal: string | null;
    strongestRetentionSignal: string | null;
    strongestReferralSignal: string | null;
    strongestUpgradeSignal: string | null;
  };
  signals: ValueRealizationSignalRow[];
  channels: ValueRealizationChannelRow[];
  archetypes: ValueRealizationArchetypeRow[];
  recommendations: ValueRealizationRecommendation[];
  trust: {
    warning: string | null;
    notes: string[];
  };
}

const BATCH_SIZE = 500;

function chunk<T>(values: T[], size = BATCH_SIZE): T[][] {
  if (values.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function uniqueNumbers(values: Array<number | null | undefined>): number[] {
  return [...new Set(values.filter((value): value is number => Number.isFinite(value)))];
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

function rate(count: number, total: number) {
  return total > 0 ? round1((count / total) * 100) : 0;
}

function lift(current: number, baseline: number) {
  return round1(current - baseline);
}

function valueRealizationScore(input: {
  monetizationRate: number;
  referralRate: number;
  retentionRate: number;
  upgradeIntentRate: number;
  revenuePerStart: number;
}): number {
  return round1(
    Math.min(input.monetizationRate * 12, 100) * 0.3 +
      input.referralRate * 0.2 +
      input.retentionRate * 0.25 +
      input.upgradeIntentRate * 0.15 +
      Math.min(input.revenuePerStart * 5, 100) * 0.1
  );
}

function outcomeStats(
  contexts: SubmissionOutcomeContext[],
  baselines: {
    monetizationRate: number;
    referralRate: number;
    retentionRate: number;
    upgradeIntentRate: number;
  }
): OutcomeStats {
  const monetized = contexts.filter((context) => context.paid).length;
  const referred = contexts.filter((context) => context.referred).length;
  const retained = contexts.filter((context) => context.retained).length;
  const upgradeIntent = contexts.filter((context) => context.upgradeIntent).length;

  const monetizationRate = rate(monetized, contexts.length);
  const referralRate = rate(referred, contexts.length);
  const retentionRate = rate(retained, contexts.length);
  const upgradeIntentRate = rate(upgradeIntent, contexts.length);

  return {
    monetizationRate,
    monetizationLift: lift(monetizationRate, baselines.monetizationRate),
    referralRate,
    referralLift: lift(referralRate, baselines.referralRate),
    retentionRate,
    retentionLift: lift(retentionRate, baselines.retentionRate),
    upgradeIntentRate,
    upgradeIntentLift: lift(upgradeIntentRate, baselines.upgradeIntentRate),
  };
}

function strongestOutcome(stats: OutcomeStats) {
  const candidates = [
    { label: "Monetization", lift: stats.monetizationLift },
    { label: "Referral", lift: stats.referralLift },
    { label: "Retention", lift: stats.retentionLift },
    { label: "Upgrade proxy", lift: stats.upgradeIntentLift },
  ].sort((left, right) => right.lift - left.lift);

  return { label: candidates[0]?.label ?? "Monetization", lift: candidates[0]?.lift ?? 0 };
}

export async function buildValueRealizationSnapshot(
  inputDays: number
): Promise<ValueRealizationSnapshot> {
  const days = clampDays(inputDays || 30, 7, 365);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  try {
    const submissionsRes = await supabaseFetch(
      `/rest/v1/survey_submission?select=id,user_id,status,utm_tracker&created_date_time=gte.${since}`,
      { headers: { Range: "0-49999" } }
    );

    if (!submissionsRes.ok) {
      throw new Error("Unable to load value-realization submissions.");
    }

    const submissions = (await submissionsRes.json()) as SubmissionRow[];
    const submissionIds = submissions.map((submission) => submission.id);
    const userIds = uniqueNumbers(submissions.map((submission) => submission.user_id));

    const [appUsers, reports, scoringRows] = await Promise.all([
      userIds.length === 0
        ? Promise.resolve([] as AppUserRow[])
        : fetchBatches<AppUserRow>(userIds, (batch) => {
            return `/rest/v1/app_user?select=id,email&id=in.(${batch.join(",")})`;
          }),
      submissionIds.length === 0
        ? Promise.resolve([] as ReportRow[])
        : fetchBatches<ReportRow>(submissionIds, (batch) => {
            return `/rest/v1/personal_report?select=id,survey_submission_id&survey_submission_id=in.(${batch.join(",")})`;
          }),
      submissionIds.length === 0
        ? Promise.resolve([] as ScoringRow[])
        : fetchBatches<ScoringRow>(submissionIds, (batch) => {
            const select = ["survey_submission_id", "primary_archetype"].join(",");
            return `/rest/v1/scoring_result?select=${select}&survey_submission_id=in.(${batch.join(",")})`;
          }),
    ]);

    const reportIds = reports.map((report) => report.id);
    const [sessions, shares, payments, invites] = await Promise.all([
      reportIds.length === 0
        ? Promise.resolve([] as ReportSessionRow[])
        : fetchBatches<ReportSessionRow>(reportIds, (batch) => {
            return `/rest/v1/report_session?select=personal_report_id,started_at&personal_report_id=in.(${batch.join(",")})`;
          }),
      reportIds.length === 0
        ? Promise.resolve([] as ShareRow[])
        : fetchBatches<ShareRow>(reportIds, (batch) => {
            return `/rest/v1/report_access_email?select=personal_report_id&personal_report_id=in.(${batch.join(",")})`;
          }),
      reportIds.length === 0
        ? Promise.resolve([] as PaymentRow[])
        : fetchBatches<PaymentRow>(reportIds, (batch) => {
            return `/rest/v1/payment?is_test=is.false&select=personal_report_id,status,amount&personal_report_id=in.(${batch.join(",")})`;
          }),
      supabaseFetch(`/rest/v1/invite_event?select=referrer_email&created_at=gte.${since}`, {
        headers: { Range: "0-49999" },
      }).then(async (response) => {
        if (!response.ok) throw new Error("Unable to load invite events.");
        return (await response.json()) as InviteRow[];
      }),
    ]);

    const appUserById = new Map(appUsers.map((user) => [user.id, user] as const));
    const reportBySubmission = new Map(
      reports.map((report) => [report.survey_submission_id, report.id] as const)
    );
    const scoringBySubmission = new Map(
      scoringRows.map(
        (row) => [row.survey_submission_id, row.primary_archetype ?? "Unscored"] as const
      )
    );

    const sessionStatsByReport = new Map<number, { count: number; days: Set<string> }>();
    for (const session of sessions) {
      const current = sessionStatsByReport.get(session.personal_report_id) ?? {
        count: 0,
        days: new Set<string>(),
      };
      current.count += 1;
      current.days.add(session.started_at.slice(0, 10));
      sessionStatsByReport.set(session.personal_report_id, current);
    }

    const sharedReports = new Set(shares.map((share) => share.personal_report_id));
    const paidReportData = new Map<number, number>();
    for (const payment of payments) {
      if (payment.status !== "succeeded") continue;
      paidReportData.set(
        payment.personal_report_id,
        (paidReportData.get(payment.personal_report_id) ?? 0) + Number(payment.amount ?? 0)
      );
    }
    const referredEmails = new Set(
      invites
        .map((invite) => invite.referrer_email?.toLowerCase() ?? null)
        .filter((value): value is string => !!value)
    );

    const contexts: SubmissionOutcomeContext[] = submissions.map((submission) => {
      const reportId = reportBySubmission.get(submission.id);
      const sessionStats = reportId ? sessionStatsByReport.get(reportId) : undefined;
      const viewed = !!sessionStats;
      const sessionCount = sessionStats?.count ?? 0;
      const sessionDayCount = sessionStats?.days.size ?? 0;
      const shared = !!(reportId && sharedReports.has(reportId));
      const paid = !!(reportId && paidReportData.has(reportId));
      const revenue = reportId ? (paidReportData.get(reportId) ?? 0) : 0;
      const appUser =
        submission.user_id != null ? (appUserById.get(submission.user_id) ?? null) : null;
      const referred = !!appUser?.email && referredEmails.has(appUser.email.toLowerCase());
      const retained = sessionDayCount >= 2 || sessionCount >= 2;
      const upgradeIntent = shared || sessionCount >= 3 || sessionDayCount >= 2;

      return {
        source: sourceLabel(submission.utm_tracker),
        archetype: scoringBySubmission.get(submission.id) ?? "Unscored",
        viewed,
        sessionCount,
        sessionDayCount,
        shared,
        referred,
        retained,
        paid,
        upgradeIntent,
        revenue,
      };
    });

    const baselines = outcomeStats(contexts, {
      monetizationRate: 0,
      referralRate: 0,
      retentionRate: 0,
      upgradeIntentRate: 0,
    });

    const signalDefinitions: Array<{
      key: SignalKey;
      label: string;
      filter: (context: SubmissionOutcomeContext) => boolean;
    }> = [
      {
        key: "report_viewed",
        label: "Report Viewed",
        filter: (context) => context.viewed,
      },
      {
        key: "repeat_session",
        label: "Repeat Report Session",
        filter: (context) => context.sessionCount >= 2,
      },
      {
        key: "multi_day_return",
        label: "Multi-Day Return",
        filter: (context) => context.sessionDayCount >= 2,
      },
      {
        key: "shared_report",
        label: "Shared Report",
        filter: (context) => context.shared,
      },
      {
        key: "sent_referral",
        label: "Sent Referral",
        filter: (context) => context.referred,
      },
    ];

    const signals = signalDefinitions
      .map((signal) => {
        const filtered = contexts.filter(signal.filter);
        const stats = outcomeStats(filtered, baselines);
        const strongest = strongestOutcome(stats);

        return {
          signal: signal.label,
          audience: filtered.length,
          ...stats,
          strongestOutcome: strongest.label,
          strongestLift: strongest.lift,
        } satisfies ValueRealizationSignalRow;
      })
      .sort(
        (left, right) => right.strongestLift - left.strongestLift || right.audience - left.audience
      );

    const sourceGroups = new Map<string, SubmissionOutcomeContext[]>();
    const archetypeGroups = new Map<string, SubmissionOutcomeContext[]>();
    for (const context of contexts) {
      sourceGroups.set(context.source, [...(sourceGroups.get(context.source) ?? []), context]);
      archetypeGroups.set(context.archetype, [
        ...(archetypeGroups.get(context.archetype) ?? []),
        context,
      ]);
    }

    const channels = [...sourceGroups.entries()]
      .map(([source, group]) => {
        const stats = outcomeStats(group, baselines);
        const revenueTotal = round1(group.reduce((sum, context) => sum + context.revenue, 0));
        const revenuePerStart = group.length > 0 ? round1(revenueTotal / group.length) : 0;
        return {
          source,
          starts: group.length,
          revenueTotal,
          revenuePerStart,
          valueRealizationScore: valueRealizationScore({
            monetizationRate: stats.monetizationRate,
            referralRate: stats.referralRate,
            retentionRate: stats.retentionRate,
            upgradeIntentRate: stats.upgradeIntentRate,
            revenuePerStart,
          }),
          ...stats,
        } satisfies ValueRealizationChannelRow;
      })
      .sort(
        (left, right) =>
          right.valueRealizationScore - left.valueRealizationScore || right.starts - left.starts
      );

    const archetypes = [...archetypeGroups.entries()]
      .map(([archetype, group]) => {
        const stats = outcomeStats(group, baselines);
        const revenueTotal = round1(group.reduce((sum, context) => sum + context.revenue, 0));
        const revenuePerStart = group.length > 0 ? round1(revenueTotal / group.length) : 0;
        return {
          archetype,
          starts: group.length,
          revenueTotal,
          revenuePerStart,
          valueRealizationScore: valueRealizationScore({
            monetizationRate: stats.monetizationRate,
            referralRate: stats.referralRate,
            retentionRate: stats.retentionRate,
            upgradeIntentRate: stats.upgradeIntentRate,
            revenuePerStart,
          }),
          ...stats,
        } satisfies ValueRealizationArchetypeRow;
      })
      .sort(
        (left, right) =>
          right.valueRealizationScore - left.valueRealizationScore || right.starts - left.starts
      );

    const strongestMonetizationSignal =
      [...signals].sort((left, right) => right.monetizationLift - left.monetizationLift)[0]
        ?.signal ?? null;
    const strongestRetentionSignal =
      [...signals].sort((left, right) => right.retentionLift - left.retentionLift)[0]?.signal ??
      null;
    const strongestReferralSignal =
      [...signals].sort((left, right) => right.referralLift - left.referralLift)[0]?.signal ?? null;
    const strongestUpgradeSignal =
      [...signals].sort((left, right) => right.upgradeIntentLift - left.upgradeIntentLift)[0]
        ?.signal ?? null;

    const recommendations: ValueRealizationRecommendation[] = [];
    if (strongestMonetizationSignal) {
      recommendations.push({
        title: `${strongestMonetizationSignal} is the strongest monetization signal`,
        detail:
          "Protect and increase this behavior before spending to buy more top-of-funnel volume.",
        tone: "scale",
      });
    }
    if (strongestRetentionSignal && strongestRetentionSignal !== strongestMonetizationSignal) {
      recommendations.push({
        title: `${strongestRetentionSignal} drives repeat value`,
        detail:
          "Retention is clustering around this signal, so it should inform lifecycle nudges and report UX priorities.",
        tone: "watch",
      });
    }
    if ((strongestReferralSignal ?? "") === "Sent Referral") {
      recommendations.push({
        title: "Referral signal is too circular",
        detail:
          "Referral is currently best predicted by people who already refer. Add more explicit pre-referral value signals to improve this model.",
        tone: "blindspot",
      });
    } else if (strongestReferralSignal) {
      recommendations.push({
        title: `${strongestReferralSignal} precedes referral behavior`,
        detail: "Use this as the key pre-referral milestone in growth and report UX experiments.",
        tone: "scale",
      });
    }

    const trust = buildTrustDescriptor({
      source:
        "survey_submission + app_user + personal_report + report_session + report_access_email + payment + invite_event",
      mode: "derived",
      sampleSize: contexts.length,
      lastUpdated: new Date().toISOString(),
      warning:
        contexts.length < 20
          ? "Value realization is based on a small sample in the selected window."
          : contexts.filter((context) => context.paid).length === 0
            ? "No monetization events exist in this window, so value realization is directional for revenue."
            : null,
    });

    return {
      generatedAt: new Date().toISOString(),
      days,
      summary: {
        starts: contexts.length,
        monetizedCount: contexts.filter((context) => context.paid).length,
        retainedCount: contexts.filter((context) => context.retained).length,
        referredCount: contexts.filter((context) => context.referred).length,
        upgradeIntentCount: contexts.filter((context) => context.upgradeIntent).length,
        strongestMonetizationSignal,
        strongestRetentionSignal,
        strongestReferralSignal,
        strongestUpgradeSignal,
      },
      signals,
      channels,
      archetypes,
      recommendations,
      trust: {
        warning: trust.warning,
        notes: [
          "Upgrade intent is a proxy here: it means deep report use or report sharing, not a literal upgrade event.",
          "Retention is defined as two or more report sessions or report visits across two or more days.",
          "Referral is linked through app_user email matching against invite_event referrer_email, so some attribution may be directional.",
        ],
      },
    };
  } catch (err) {
    // warn-not-error: caller (admin route or safeSnapshot in digest-metrics)
    // decides Slack-worthiness. See channel-efficiency.ts for full rationale.
    logger.warn({ err }, "Value-realization build error");
    throw err;
  }
}
