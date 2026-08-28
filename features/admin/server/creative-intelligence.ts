import {
  buildTrustDescriptor,
  clampDays,
  parseUtmCampaign,
  parseUtmMedium,
  parseUtmTracker,
  round1,
  sourceLabel,
} from "@features/admin/server/next-level";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

interface SubmissionRow {
  id: number;
  status: string;
  utm_tracker: string | null;
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

interface ScoreRow {
  survey_submission_id: number;
}

export interface CreativeIntelligenceCreative {
  creativeKey: string;
  source: string;
  medium: string;
  campaign: string;
  content: string;
  theme: string;
  starts: number;
  completionRate: number;
  scoredRate: number;
  reportViewRate: number;
  paidRate: number;
  recoveryRate: number;
  revenuePerStart: number;
  revenueTotal: number;
  qualityScore: number;
  confidence: "high" | "medium" | "low";
  attention: "scale" | "watch" | "fix" | "blindspot";
}

export interface CreativeIntelligenceTheme {
  theme: string;
  creatives: number;
  starts: number;
  completionRate: number;
  paidRate: number;
  revenueTotal: number;
  topCreative: string;
  confidence: "high" | "medium" | "low";
}

export interface CreativeIntelligenceRecommendation {
  title: string;
  detail: string;
  tone: "scale" | "watch" | "risk" | "blindspot";
}

const MESSAGE_THEMES: Array<{ theme: string; tokens: string[] }> = [
  { theme: "Curiosity", tokens: ["quiz", "archetype", "discover", "learn", "insight"] },
  { theme: "Reconnect", tokens: ["reconnect", "spark", "distance", "close", "connection"] },
  { theme: "Desire", tokens: ["desire", "libido", "attraction", "chemistry", "sex"] },
  { theme: "Trust", tokens: ["trust", "safe", "honest", "loyal", "secure"] },
  {
    theme: "Communication",
    tokens: ["talk", "communicate", "listen", "conversation", "understand"],
  },
  { theme: "Healing", tokens: ["repair", "heal", "recover", "rebuild", "forgive"] },
  { theme: "Urgency", tokens: ["now", "today", "fix", "save", "before", "last chance"] },
];

function parseContent(tracker: string | null): string {
  const parsed = parseUtmTracker(tracker);
  return (
    parsed.utm_content ||
    parsed.content ||
    parsed.ad ||
    parsed.creative ||
    parsed.message ||
    "unknown"
  );
}

function classifyTheme(campaign: string, content: string): string {
  const combined = `${campaign} ${content}`.toLowerCase();
  for (const theme of MESSAGE_THEMES) {
    if (theme.tokens.some((token) => combined.includes(token))) {
      return theme.theme;
    }
  }
  return "General";
}

function confidenceFromStarts(starts: number): "high" | "medium" | "low" {
  if (starts >= 40) return "high";
  if (starts >= 15) return "medium";
  return "low";
}

function qualityScore(input: {
  completionRate: number;
  scoredRate: number;
  reportViewRate: number;
  paidRate: number;
  recoveryRate: number;
}): number {
  return round1(
    input.completionRate * 0.35 +
      input.scoredRate * 0.15 +
      input.reportViewRate * 0.2 +
      Math.min(input.paidRate * 8, 100) * 0.15 +
      input.recoveryRate * 0.15
  );
}

function attentionFromCreative(input: {
  campaign: string;
  content: string;
  starts: number;
  qualityScore: number;
  paidRate: number;
  completionRate: number;
}): CreativeIntelligenceCreative["attention"] {
  if (input.campaign === "unknown" || input.content === "unknown") return "blindspot";
  if (input.starts >= 15 && input.qualityScore >= 70 && input.paidRate >= 4) return "scale";
  if (
    input.starts >= 15 &&
    (input.qualityScore < 45 || input.completionRate < 35 || input.paidRate === 0)
  ) {
    return "fix";
  }
  return "watch";
}

export async function buildCreativeIntelligenceSnapshot(inputDays: number) {
  const days = clampDays(inputDays || 30, 7, 365);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  try {
    const [submissionsRes, partialsRes, reportsRes, reportSessionsRes, paymentsRes, scoresRes] =
      await Promise.all([
        supabaseFetch(
          `/rest/v1/survey_submission?select=id,status,utm_tracker,session_id&created_date_time=gte.${since}`,
          { headers: { Range: "0-49999" } }
        ),
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
          `/rest/v1/payment?is_test=is.false&select=personal_report_id,status,amount&payment_date_time=gte.${since}`,
          { headers: { Range: "0-49999" } }
        ),
        supabaseFetch(
          `/rest/v1/scoring_result?select=survey_submission_id&scored_at=gte.${since}`,
          {
            headers: { Range: "0-49999" },
          }
        ),
      ]);

    if (
      !submissionsRes.ok ||
      !partialsRes.ok ||
      !reportsRes.ok ||
      !reportSessionsRes.ok ||
      !paymentsRes.ok ||
      !scoresRes.ok
    ) {
      logger.error("Creative intelligence query failed");
      throw new Error("Unable to load creative intelligence.");
    }

    const submissions = (await submissionsRes.json()) as SubmissionRow[];
    const partials = (await partialsRes.json()) as PartialSaveRow[];
    const reports = (await reportsRes.json()) as ReportRow[];
    const reportSessions = (await reportSessionsRes.json()) as ReportSessionRow[];
    const payments = (await paymentsRes.json()) as PaymentRow[];
    const scores = (await scoresRes.json()) as ScoreRow[];

    const partialSessions = new Set(partials.map((row) => row.session_id));
    const partialsByCreative = new Map<string, number>();
    const reportBySubmission = new Map(reports.map((row) => [row.survey_submission_id, row.id]));
    const viewedReports = new Set(reportSessions.map((row) => row.personal_report_id));
    const paidAmountByReport = new Map<number, number>();
    for (const payment of payments) {
      if (payment.status !== "succeeded") continue;
      paidAmountByReport.set(
        payment.personal_report_id,
        (paidAmountByReport.get(payment.personal_report_id) ?? 0) + Number(payment.amount ?? 0)
      );
    }
    const scoredIds = new Set(scores.map((row) => row.survey_submission_id));

    const creativeMap = new Map<
      string,
      {
        source: string;
        medium: string;
        campaign: string;
        content: string;
        theme: string;
        starts: number;
        completed: number;
        scored: number;
        viewed: number;
        paid: number;
        recovered: number;
        revenue: number;
      }
    >();

    for (const partial of partials) {
      const source = sourceLabel(partial.utm_tracker);
      const medium = parseUtmMedium(partial.utm_tracker);
      const campaign = parseUtmCampaign(partial.utm_tracker);
      const content = parseContent(partial.utm_tracker);
      const creativeKey = `${source} / ${medium} / ${campaign} / ${content}`;
      partialsByCreative.set(creativeKey, (partialsByCreative.get(creativeKey) ?? 0) + 1);
    }

    for (const submission of submissions) {
      const source = sourceLabel(submission.utm_tracker);
      const medium = parseUtmMedium(submission.utm_tracker);
      const campaign = parseUtmCampaign(submission.utm_tracker);
      const content = parseContent(submission.utm_tracker);
      const theme = classifyTheme(campaign, content);
      const creativeKey = `${source} / ${medium} / ${campaign} / ${content}`;
      const reportId = reportBySubmission.get(submission.id);
      const paidAmount = reportId ? (paidAmountByReport.get(reportId) ?? 0) : 0;

      const current = creativeMap.get(creativeKey) ?? {
        source,
        medium,
        campaign,
        content,
        theme,
        starts: 0,
        completed: 0,
        scored: 0,
        viewed: 0,
        paid: 0,
        recovered: 0,
        revenue: 0,
      };

      current.starts += 1;
      if (submission.status === "completed") current.completed += 1;
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

      creativeMap.set(creativeKey, current);
    }

    const creatives = [...creativeMap.entries()]
      .map(([creativeKey, value]) => {
        const completionRate =
          value.starts > 0 ? round1((value.completed / value.starts) * 100) : 0;
        const scoredRate = value.starts > 0 ? round1((value.scored / value.starts) * 100) : 0;
        const reportViewRate = value.starts > 0 ? round1((value.viewed / value.starts) * 100) : 0;
        const paidRate = value.starts > 0 ? round1((value.paid / value.starts) * 100) : 0;
        const recoveryBase = partialsByCreative.get(creativeKey) ?? 0;
        const recoveryRate = recoveryBase > 0 ? round1((value.recovered / recoveryBase) * 100) : 0;
        const score = qualityScore({
          completionRate,
          scoredRate,
          reportViewRate,
          paidRate,
          recoveryRate,
        });
        return {
          creativeKey,
          source: value.source,
          medium: value.medium,
          campaign: value.campaign,
          content: value.content,
          theme: value.theme,
          starts: value.starts,
          completionRate,
          scoredRate,
          reportViewRate,
          paidRate,
          recoveryRate,
          revenuePerStart: value.starts > 0 ? round1(value.revenue / value.starts) : 0,
          revenueTotal: round1(value.revenue),
          qualityScore: score,
          confidence: confidenceFromStarts(value.starts),
          attention: attentionFromCreative({
            campaign: value.campaign,
            content: value.content,
            starts: value.starts,
            qualityScore: score,
            paidRate,
            completionRate,
          }),
        } satisfies CreativeIntelligenceCreative;
      })
      .sort((a, b) => b.qualityScore - a.qualityScore || b.starts - a.starts);

    const themeMap = new Map<
      string,
      {
        creatives: number;
        starts: number;
        completions: number;
        paid: number;
        revenue: number;
        topCreative: string;
        topQuality: number;
      }
    >();

    for (const creative of creatives) {
      const current = themeMap.get(creative.theme) ?? {
        creatives: 0,
        starts: 0,
        completions: 0,
        paid: 0,
        revenue: 0,
        topCreative: creative.content,
        topQuality: creative.qualityScore,
      };
      current.creatives += 1;
      current.starts += creative.starts;
      current.completions += Math.round((creative.completionRate / 100) * creative.starts);
      current.paid += Math.round((creative.paidRate / 100) * creative.starts);
      current.revenue += creative.revenueTotal;
      if (creative.qualityScore > current.topQuality) {
        current.topQuality = creative.qualityScore;
        current.topCreative = creative.content;
      }
      themeMap.set(creative.theme, current);
    }

    const messageThemes = [...themeMap.entries()]
      .map(([theme, value]) => ({
        theme,
        creatives: value.creatives,
        starts: value.starts,
        completionRate: value.starts > 0 ? round1((value.completions / value.starts) * 100) : 0,
        paidRate: value.starts > 0 ? round1((value.paid / value.starts) * 100) : 0,
        revenueTotal: round1(value.revenue),
        topCreative: value.topCreative,
        confidence: confidenceFromStarts(value.starts),
      }))
      .sort((a, b) => b.revenueTotal - a.revenueTotal || b.starts - a.starts);

    const scaleCreative = creatives.find((creative) => creative.attention === "scale");
    const fixCreative = creatives.find((creative) => creative.attention === "fix");
    const blindspotCreative = creatives.find((creative) => creative.attention === "blindspot");

    const recommendations: CreativeIntelligenceRecommendation[] = [
      scaleCreative
        ? {
            title: `Scale ${scaleCreative.content}`,
            detail: `${scaleCreative.source} / ${scaleCreative.campaign} is converting cleanly with ${scaleCreative.paidRate}% paid rate at ${scaleCreative.qualityScore} quality.`,
            tone: "scale",
          }
        : {
            title: "No scale-ready creative yet",
            detail:
              "No tracked creative cleared the current volume and efficiency thresholds in this window.",
            tone: "watch",
          },
      fixCreative
        ? {
            title: `Fix ${fixCreative.content}`,
            detail: `${fixCreative.source} / ${fixCreative.campaign} has enough volume but weak downstream performance. Review landing promise and message fit.`,
            tone: "risk",
          }
        : {
            title: "No urgent creative regression",
            detail: "No tracked creative crossed the current high-volume regression threshold.",
            tone: "watch",
          },
      blindspotCreative
        ? {
            title: "Fill message tracking blindspots",
            detail: `${blindspotCreative.source} is still sending starts without a usable campaign or content label.`,
            tone: "blindspot",
          }
        : {
            title: "Creative labeling coverage is healthy",
            detail: "Most starts in the selected window have campaign and content labeling.",
            tone: "watch",
          },
    ];

    const blindspotStarts = creatives
      .filter((creative) => creative.attention === "blindspot")
      .reduce((sum, creative) => sum + creative.starts, 0);

    return {
      days,
      generatedAt: new Date().toISOString(),
      summary: {
        creatives: creatives.length,
        messageThemes: messageThemes.length,
        trackedStarts: submissions.length,
        highConfidenceWinners: creatives.filter(
          (creative) => creative.attention === "scale" && creative.confidence === "high"
        ).length,
        blindspotStarts,
        avgPaidRate:
          creatives.length > 0
            ? round1(
                creatives.reduce((sum, creative) => sum + creative.paidRate, 0) / creatives.length
              )
            : 0,
      },
      creatives: creatives.slice(0, 40),
      messageThemes: messageThemes.slice(0, 12),
      recommendations,
      trust: buildTrustDescriptor({
        source: "survey_submission + survey_partial_save + personal_report + payment",
        mode: "derived",
        sampleSize: submissions.length,
        lastUpdated: new Date().toISOString(),
        warning:
          blindspotStarts > submissions.length * 0.35
            ? "A large share of starts still lacks campaign/content labeling, so message-level conclusions are incomplete."
            : null,
      }),
    };
  } catch (err) {
    // warn-not-error: caller decides Slack-worthiness. See
    // channel-efficiency.ts for full rationale.
    logger.warn({ err }, "Creative intelligence build error");
    throw err;
  }
}
