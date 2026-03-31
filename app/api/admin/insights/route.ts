import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { supabaseFetch } from "@/lib/admin/supabase";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { surveyQuestions } from "@/data/survey-data";
import logger from "@/lib/logger";

type Severity = "critical" | "warning" | "positive" | "info" | "neutral";
type Confidence = "high" | "medium" | "low";
type InsightCategory = "volume" | "completion" | "question" | "acquisition" | "archetype" | "trust";

interface Insight {
  id: string;
  type: "triage" | "trend" | "opportunity" | "trust";
  severity: Severity;
  title: string;
  description: string;
  metric?: string;
  metricKey?: string | null;
  category: InsightCategory;
  priority: number;
  confidence: Confidence;
  sampleSize?: number;
  href?: string;
  actionLabel?: string;
}

interface PeriodComparison {
  current_submissions: number;
  previous_submissions: number;
  current_completion_rate: number | null;
  previous_completion_rate: number | null;
  current_avg_duration_min: number | null;
  previous_avg_duration_min: number | null;
  current_waitlist: number;
  previous_waitlist: number;
}

interface RpcResult {
  period_comparison: PeriodComparison | null;
  high_friction_questions: Array<{
    q_id: string;
    avg_time_sec: number;
    backtrack_count: number;
  }> | null;
  top_drop_off_questions: Array<{
    q_id: string;
    abandon_count: number;
  }> | null;
  fastest_growing_archetype: {
    archetype: string;
    current: number;
    previous: number;
  } | null;
}

interface SubmissionRow {
  id: number;
  status: string;
  utm_tracker: string | null;
}

const CONFIDENCE_ORDER: Record<Confidence, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  warning: 1,
  positive: 2,
  info: 3,
  neutral: 4,
};

const questionTextMap = new Map(
  surveyQuestions
    .filter((question) => !question.qId.startsWith("00"))
    .map((question) => [question.qId, question.question])
);

function confidenceFromSampleSize(sampleSize: number): Confidence {
  if (sampleSize >= 60) return "high";
  if (sampleSize >= 20) return "medium";
  return "low";
}

function parseUtmSource(tracker: string | null): string {
  if (!tracker?.trim()) return "Direct";
  try {
    const parsed = JSON.parse(tracker);
    return parsed.utm_source || "Direct";
  } catch {
    return tracker.trim();
  }
}

function formatQuestionLabel(qId: string): string {
  const question = questionTextMap.get(qId);
  return question ? `${qId} · ${question}` : qId;
}

function pushInsight(insights: Insight[], insight: Omit<Insight, "id">) {
  insights.push({
    ...insight,
    id: `${insight.category}-${insight.priority}-${insight.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  });
}

export async function GET(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "viewer")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rl = await checkRateLimit(ip, {
    bucket: "admin-insights",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const rawDays = parseInt(url.searchParams.get("days") || "30", 10);
  const days = Math.min(Math.max(Number.isNaN(rawDays) ? 30 : rawDays, 7), 90);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  try {
    const [insightsRes, submissionsRes] = await Promise.all([
      supabaseFetch("/rest/v1/rpc/get_automated_insights", {
        method: "POST",
        body: JSON.stringify({ p_days: days }),
      }),
      supabaseFetch(
        `/rest/v1/survey_submission?select=id,status,utm_tracker&created_date_time=gte.${since}`,
        { headers: { Range: "0-49999" } }
      ),
    ]);

    if (!insightsRes.ok || !submissionsRes.ok) {
      logger.error("Insights: query failed");
      return NextResponse.json({ error: "Unable to load insights." }, { status: 500 });
    }

    const data: RpcResult = await insightsRes.json();
    const submissions = (await submissionsRes.json()) as SubmissionRow[];
    const sampleSize = submissions.length;
    const insights: Insight[] = [];

    const periodComparison = data.period_comparison;
    if (periodComparison) {
      const submissionDelta =
        periodComparison.previous_submissions > 0
          ? Math.round(
              ((periodComparison.current_submissions - periodComparison.previous_submissions) /
                periodComparison.previous_submissions) *
                100
            )
          : null;

      if (submissionDelta !== null && Math.abs(submissionDelta) >= 10) {
        pushInsight(insights, {
          type: "trend",
          severity: submissionDelta < 0 ? "critical" : "positive",
          title:
            submissionDelta < 0
              ? "Submission volume fell materially"
              : "Submission volume accelerated",
          description: `${Math.abs(submissionDelta)}% ${
            submissionDelta < 0 ? "drop" : "increase"
          } vs the previous ${days}-day window (${periodComparison.current_submissions} vs ${periodComparison.previous_submissions}).`,
          metric: `${submissionDelta > 0 ? "+" : ""}${submissionDelta}%`,
          metricKey: "total_submissions",
          category: "volume",
          priority: submissionDelta < 0 ? 1 : 4,
          confidence: confidenceFromSampleSize(
            periodComparison.current_submissions + periodComparison.previous_submissions
          ),
          sampleSize: periodComparison.current_submissions + periodComparison.previous_submissions,
          href: "/admin",
          actionLabel: "Open overview",
        });
      }

      if (
        periodComparison.current_completion_rate != null &&
        periodComparison.previous_completion_rate != null
      ) {
        const completionDelta =
          periodComparison.current_completion_rate - periodComparison.previous_completion_rate;
        if (Math.abs(completionDelta) >= 4) {
          pushInsight(insights, {
            type: "triage",
            severity: completionDelta < 0 ? "critical" : "positive",
            title:
              completionDelta < 0 ? "Completion rate needs attention" : "Completion rate improved",
            description: `${periodComparison.current_completion_rate}% now vs ${periodComparison.previous_completion_rate}% previously.`,
            metric: `${completionDelta > 0 ? "+" : ""}${completionDelta.toFixed(1)}pp`,
            metricKey: "completion_rate",
            category: "completion",
            priority: completionDelta < 0 ? 1 : 5,
            confidence: confidenceFromSampleSize(
              periodComparison.current_submissions + periodComparison.previous_submissions
            ),
            sampleSize:
              periodComparison.current_submissions + periodComparison.previous_submissions,
            href: "/admin/funnels",
            actionLabel: "Inspect funnel",
          });
        }
      }

      if (
        periodComparison.current_avg_duration_min != null &&
        periodComparison.previous_avg_duration_min != null
      ) {
        const durationDelta =
          periodComparison.current_avg_duration_min - periodComparison.previous_avg_duration_min;
        if (Math.abs(durationDelta) >= 1.5) {
          pushInsight(insights, {
            type: durationDelta > 0 ? "triage" : "opportunity",
            severity: durationDelta > 0 ? "warning" : "positive",
            title: durationDelta > 0 ? "Survey duration increased" : "Survey duration improved",
            description: `${periodComparison.current_avg_duration_min} min now vs ${periodComparison.previous_avg_duration_min} min previously.`,
            metric: `${durationDelta > 0 ? "+" : ""}${durationDelta.toFixed(1)}m`,
            metricKey: "avg_duration_minutes",
            category: "completion",
            priority: durationDelta > 0 ? 3 : 6,
            confidence: confidenceFromSampleSize(
              periodComparison.current_submissions + periodComparison.previous_submissions
            ),
            sampleSize:
              periodComparison.current_submissions + periodComparison.previous_submissions,
            href: "/admin/question-effectiveness",
            actionLabel: "Review question friction",
          });
        }
      }

      if (periodComparison.current_waitlist > 0 || periodComparison.previous_waitlist > 0) {
        const waitlistDelta =
          periodComparison.previous_waitlist > 0
            ? Math.round(
                ((periodComparison.current_waitlist - periodComparison.previous_waitlist) /
                  periodComparison.previous_waitlist) *
                  100
              )
            : periodComparison.current_waitlist > 0
              ? 100
              : 0;

        if (Math.abs(waitlistDelta) >= 15) {
          pushInsight(insights, {
            type: waitlistDelta < 0 ? "triage" : "opportunity",
            severity: waitlistDelta < 0 ? "warning" : "positive",
            title:
              waitlistDelta < 0 ? "Waitlist growth softened" : "Waitlist growth is accelerating",
            description: `${periodComparison.current_waitlist} signups in the current window vs ${periodComparison.previous_waitlist} previously.`,
            metric: `${waitlistDelta > 0 ? "+" : ""}${waitlistDelta}%`,
            metricKey: "waitlist_signups",
            category: "volume",
            priority: waitlistDelta < 0 ? 4 : 7,
            confidence: confidenceFromSampleSize(
              periodComparison.current_waitlist + periodComparison.previous_waitlist
            ),
            sampleSize: periodComparison.current_waitlist + periodComparison.previous_waitlist,
            href: "/admin/growth",
            actionLabel: "Review growth",
          });
        }
      }
    }

    if (data.high_friction_questions?.length) {
      const worst = data.high_friction_questions[0];
      pushInsight(insights, {
        type: "triage",
        severity: "warning",
        title: "High-friction question detected",
        description: `${formatQuestionLabel(worst.q_id)} is taking ${worst.avg_time_sec}s on average${
          worst.backtrack_count > 0 ? ` with ${worst.backtrack_count} backtracks` : ""
        }.`,
        metric: `${worst.avg_time_sec}s`,
        metricKey: "avg_duration_minutes",
        category: "question",
        priority: 2,
        confidence: confidenceFromSampleSize(sampleSize),
        sampleSize,
        href: "/admin/question-effectiveness",
        actionLabel: "Open watchlist",
      });
    }

    if (data.top_drop_off_questions?.length) {
      const top = data.top_drop_off_questions[0];
      pushInsight(insights, {
        type: "triage",
        severity: "critical",
        title: "Largest abandonment point found",
        description: `${formatQuestionLabel(top.q_id)} caused ${top.abandon_count} exits in the last ${days} days.`,
        metric: `${top.abandon_count} exits`,
        metricKey: "completion_rate",
        category: "question",
        priority: 1,
        confidence: confidenceFromSampleSize(top.abandon_count),
        sampleSize: top.abandon_count,
        href: "/admin/question-effectiveness",
        actionLabel: "Inspect question",
      });
    }

    if (
      data.fastest_growing_archetype &&
      data.fastest_growing_archetype.current > data.fastest_growing_archetype.previous
    ) {
      const growth =
        data.fastest_growing_archetype.current - data.fastest_growing_archetype.previous;
      pushInsight(insights, {
        type: "opportunity",
        severity: "info",
        title: `${data.fastest_growing_archetype.archetype} is gaining share`,
        description: `${data.fastest_growing_archetype.current} current-period results vs ${data.fastest_growing_archetype.previous} previously.`,
        metric: `+${growth}`,
        metricKey: null,
        category: "archetype",
        priority: 6,
        confidence: confidenceFromSampleSize(
          data.fastest_growing_archetype.current + data.fastest_growing_archetype.previous
        ),
        sampleSize:
          data.fastest_growing_archetype.current + data.fastest_growing_archetype.previous,
        href: "/admin/archetypes",
        actionLabel: "View archetypes",
      });
    }

    const sourceStats = new Map<
      string,
      {
        total: number;
        completed: number;
        flagged: number;
      }
    >();

    for (const submission of submissions) {
      const source = parseUtmSource(submission.utm_tracker);
      const current = sourceStats.get(source) ?? { total: 0, completed: 0, flagged: 0 };
      current.total += 1;
      if (submission.status === "completed") current.completed += 1;
      if (submission.status === "flagged") current.flagged += 1;
      sourceStats.set(source, current);
    }

    const comparableSources = [...sourceStats.entries()]
      .map(([source, stats]) => ({
        source,
        total: stats.total,
        completionRate: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
        flaggedRate: stats.total > 0 ? Math.round((stats.flagged / stats.total) * 100) : 0,
      }))
      .filter((entry) => entry.total >= 3)
      .sort((a, b) => b.total - a.total);

    if (comparableSources.length >= 2) {
      const worstSource = [...comparableSources].sort(
        (a, b) => a.completionRate - b.completionRate || b.flaggedRate - a.flaggedRate
      )[0];
      const bestSource = [...comparableSources].sort(
        (a, b) => b.completionRate - a.completionRate || a.flaggedRate - b.flaggedRate
      )[0];

      if (bestSource.completionRate - worstSource.completionRate >= 20) {
        pushInsight(insights, {
          type: "triage",
          severity: "warning",
          title: "Channel quality gap widened",
          description: `${bestSource.source} is converting at ${bestSource.completionRate}% while ${worstSource.source} is at ${worstSource.completionRate}%.`,
          metric: `${bestSource.completionRate - worstSource.completionRate}pp gap`,
          metricKey: "waitlist_to_start_rate",
          category: "acquisition",
          priority: 3,
          confidence: confidenceFromSampleSize(bestSource.total + worstSource.total),
          sampleSize: bestSource.total + worstSource.total,
          href: "/admin/growth",
          actionLabel: "Compare channels",
        });
      }
    }

    if (sampleSize < 15) {
      pushInsight(insights, {
        type: "trust",
        severity: "neutral",
        title: "Small sample size in current window",
        description: `Only ${sampleSize} submissions were captured in the last ${days} days. Treat changes as directional rather than decisive.`,
        metric: `${sampleSize} subs`,
        metricKey: null,
        category: "trust",
        priority: 2,
        confidence: "low",
        sampleSize,
        href: "/admin/product-kpis",
        actionLabel: "Review coverage",
      });
    }

    if (insights.length === 0) {
      pushInsight(insights, {
        type: "trust",
        severity: "neutral",
        title: "No material changes detected",
        description: `The last ${days} days look broadly stable across volume, completion, and question behavior.`,
        metricKey: null,
        category: "trust",
        priority: 9,
        confidence: confidenceFromSampleSize(sampleSize),
        sampleSize,
        href: "/admin",
        actionLabel: "Open overview",
      });
    }

    insights.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.confidence !== b.confidence) {
        return CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence];
      }
      return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    });

    const summary = {
      attentionCount: insights.filter(
        (insight) => insight.severity === "critical" || insight.severity === "warning"
      ).length,
      opportunityCount: insights.filter(
        (insight) => insight.severity === "positive" || insight.type === "opportunity"
      ).length,
      trustCount: insights.filter((insight) => insight.category === "trust").length,
    };

    return NextResponse.json({ insights, summary, period: days, sampleSize });
  } catch (err) {
    logger.error({ err }, "Insights error");
    return NextResponse.json({ error: "Unable to load insights." }, { status: 500 });
  }
}
