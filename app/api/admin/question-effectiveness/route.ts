import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";
import { surveyQuestions } from "@/data/survey-data";

interface RpcQuestion {
  q_id: string;
  chapter: string;
  reach_n: number;
  dropoff_n: number;
  avg_active_time_s: number;
  backtrack_n: number;
}

interface QuestionMetricSnapshot {
  skipRate: number;
  avgRevisions: number;
}

interface ComparisonSnapshot {
  completionRate: number;
  avgActiveTimeS: number;
  backtrackRate: number;
  skipRate: number;
  avgRevisions: number;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

function computeRecommendation(
  dropoffRate: number,
  backtrackRate: number,
  skipRate: number,
  timePenalty: number
): string {
  const worst = Math.max(dropoffRate, backtrackRate, skipRate, timePenalty);
  if (worst < 15) return "Performing well; no immediate question change needed.";
  if (worst === dropoffRate) return "High abandonment; simplify or split this question.";
  if (worst === backtrackRate)
    return "Users revisit this question; clarify wording or answer options.";
  if (worst === skipRate) return "Often skipped; improve relevance or make it optional.";
  return "Time-to-answer is high; reduce complexity or cognitive load.";
}

function confidenceFromReach(reachN: number): "high" | "medium" | "low" {
  if (reachN >= 80) return "high";
  if (reachN >= 25) return "medium";
  return "low";
}

function makeSince(days: number): string | null {
  return days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
}

async function fetchQuestionKpis(sinceTs: string | null) {
  const res = await supabaseFetch("/rest/v1/rpc/get_product_kpis", {
    method: "POST",
    body: JSON.stringify({ since_ts: sinceTs }),
  });
  if (!res.ok) {
    logger.error({ status: res.status }, "Question effectiveness: KPI RPC failed");
    throw new Error("kpi_query_failed");
  }
  const data = await res.json();
  return {
    questions: (data.questions ?? []) as RpcQuestion[],
    totalSessions: data.totalSessions ?? 0,
  };
}

async function fetchAnswerMetrics(sinceTs: string | null) {
  let query =
    "/rest/v1/survey_submission_answer?select=was_skipped,revision_count,survey_question(frontend_qid)";
  if (sinceTs) {
    query =
      `/rest/v1/survey_submission_answer?select=was_skipped,revision_count,survey_question!inner(frontend_qid),survey_submission!inner(created_date_time)` +
      `&survey_submission.created_date_time=gte.${sinceTs}`;
  }

  const res = await supabaseFetch(query, {
    headers: { Range: "0-99999" },
  });

  if (!res.ok) {
    logger.error({ status: res.status }, "Question effectiveness: answer query failed");
    throw new Error("answer_query_failed");
  }

  const rows = (await res.json()) as Array<{
    was_skipped: boolean;
    revision_count: number | null;
    survey_question: { frontend_qid: string } | null;
  }>;

  const metrics = new Map<string, { total: number; skipped: number; revisionTotal: number }>();
  for (const row of rows) {
    const qId = row.survey_question?.frontend_qid;
    if (!qId || qId.startsWith("00")) continue;
    const current = metrics.get(qId) ?? { total: 0, skipped: 0, revisionTotal: 0 };
    current.total += 1;
    if (row.was_skipped) current.skipped += 1;
    current.revisionTotal += row.revision_count ?? 0;
    metrics.set(qId, current);
  }

  const result = new Map<string, QuestionMetricSnapshot>();
  for (const [qId, metric] of metrics) {
    result.set(qId, {
      skipRate: metric.total > 0 ? round1((metric.skipped / metric.total) * 100) : 0,
      avgRevisions: metric.total > 0 ? round2(metric.revisionTotal / metric.total) : 0,
    });
  }
  return result;
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
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-question-effectiveness",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const rawDays = parseInt(url.searchParams.get("days") || "30", 10);
  const days = Math.min(Math.max(Number.isNaN(rawDays) ? 30 : rawDays, 7), 90);
  const since = makeSince(days);

  try {
    const [currentKpi, baselineKpi, currentAnswerMetrics, baselineAnswerMetrics] =
      await Promise.all([
        fetchQuestionKpis(since),
        fetchQuestionKpis(null),
        fetchAnswerMetrics(since),
        fetchAnswerMetrics(null),
      ]);

    const questionTextMap = new Map(
      surveyQuestions
        .filter((question) => !question.qId.startsWith("00"))
        .map((question) => [question.qId, question.question])
    );

    const allTimeByQuestion = new Map(
      baselineKpi.questions.map((question) => [question.q_id, question])
    );

    const times = currentKpi.questions
      .filter((question) => question.reach_n > 0 && !question.q_id.startsWith("00"))
      .map((question) => question.avg_active_time_s)
      .filter((time) => time > 0);
    const avgTime =
      times.length > 0 ? times.reduce((sum, time) => sum + time, 0) / times.length : 10;
    const stdTime =
      times.length > 1
        ? Math.sqrt(
            times.reduce((sum, time) => sum + (time - avgTime) ** 2, 0) / (times.length - 1)
          )
        : avgTime / 2;

    const questions = currentKpi.questions
      .filter((question) => question.reach_n > 0 && !question.q_id.startsWith("00"))
      .map((question) => {
        const answerMetrics = currentAnswerMetrics.get(question.q_id) ?? {
          skipRate: 0,
          avgRevisions: 0,
        };
        const baselineQuestion = allTimeByQuestion.get(question.q_id);
        const baselineAnswer = baselineAnswerMetrics.get(question.q_id) ?? {
          skipRate: 0,
          avgRevisions: 0,
        };

        const completionRate =
          question.reach_n > 0
            ? ((question.reach_n - question.dropoff_n) / question.reach_n) * 100
            : 100;
        const dropoffRate =
          question.reach_n > 0 ? (question.dropoff_n / question.reach_n) * 100 : 0;
        const backtrackRate =
          question.reach_n > 0 ? (question.backtrack_n / question.reach_n) * 100 : 0;
        const timePenalty =
          stdTime > 0
            ? Math.min(Math.abs(question.avg_active_time_s - avgTime) / stdTime, 2) * 50
            : 0;
        const frictionPenalty =
          dropoffRate * 0.5 +
          backtrackRate * 0.25 +
          answerMetrics.skipRate * 0.2 +
          timePenalty * 0.15;

        const effectivenessScore = Math.max(
          0,
          Math.min(
            100,
            Math.round(
              100 -
                (dropoffRate * 0.28 +
                  timePenalty * 0.15 +
                  backtrackRate * 0.22 +
                  answerMetrics.skipRate * 0.2 +
                  answerMetrics.avgRevisions * 6 +
                  frictionPenalty * 0.15)
            )
          )
        );

        const baselineSnapshot: ComparisonSnapshot = baselineQuestion
          ? {
              completionRate:
                baselineQuestion.reach_n > 0
                  ? round1(
                      ((baselineQuestion.reach_n - baselineQuestion.dropoff_n) /
                        baselineQuestion.reach_n) *
                        100
                    )
                  : 100,
              avgActiveTimeS: round1(baselineQuestion.avg_active_time_s),
              backtrackRate:
                baselineQuestion.reach_n > 0
                  ? round1((baselineQuestion.backtrack_n / baselineQuestion.reach_n) * 100)
                  : 0,
              skipRate: baselineAnswer.skipRate,
              avgRevisions: baselineAnswer.avgRevisions,
            }
          : {
              completionRate: round1(completionRate),
              avgActiveTimeS: round1(question.avg_active_time_s),
              backtrackRate: round1(backtrackRate),
              skipRate: answerMetrics.skipRate,
              avgRevisions: answerMetrics.avgRevisions,
            };

        const deltas = {
          completionRate: round1(round1(completionRate) - baselineSnapshot.completionRate),
          avgActiveTimeS: round1(
            round1(question.avg_active_time_s) - baselineSnapshot.avgActiveTimeS
          ),
          backtrackRate: round1(round1(backtrackRate) - baselineSnapshot.backtrackRate),
          skipRate: round1(answerMetrics.skipRate - baselineSnapshot.skipRate),
          avgRevisions: round2(answerMetrics.avgRevisions - baselineSnapshot.avgRevisions),
        };

        const regressionScore = round2(
          Math.max(0, -deltas.completionRate) * 1.3 +
            Math.max(0, deltas.avgActiveTimeS) * 0.35 +
            Math.max(0, deltas.backtrackRate) * 1.1 +
            Math.max(0, deltas.skipRate) * 1.25 +
            Math.max(0, deltas.avgRevisions) * 8 -
            Math.max(0, deltas.completionRate) * 0.8
        );

        const improvementScore = round2(
          Math.max(0, deltas.completionRate) * 0.8 +
            Math.max(0, -deltas.avgActiveTimeS) * 0.3 +
            Math.max(0, -deltas.backtrackRate) * 0.9 +
            Math.max(0, -deltas.skipRate) * 1.0
        );

        const watchStatus =
          regressionScore >= 8 ? "regressed" : improvementScore >= 6 ? "improved" : "stable";

        const regressionReasons: string[] = [];
        if (deltas.completionRate <= -4) {
          regressionReasons.push(`Completion ${Math.abs(deltas.completionRate)}pp below baseline`);
        }
        if (deltas.avgActiveTimeS >= 4) {
          regressionReasons.push(`Time-to-answer +${deltas.avgActiveTimeS}s`);
        }
        if (deltas.backtrackRate >= 2) {
          regressionReasons.push(`Backtracks +${deltas.backtrackRate}pp`);
        }
        if (deltas.skipRate >= 2) {
          regressionReasons.push(`Skip rate +${deltas.skipRate}pp`);
        }
        if (deltas.avgRevisions >= 0.4) {
          regressionReasons.push(`Revisions +${deltas.avgRevisions}`);
        }

        return {
          qId: question.q_id,
          chapterId: question.chapter,
          questionText: questionTextMap.get(question.q_id) || question.q_id,
          reachN: question.reach_n,
          dropoffN: question.dropoff_n,
          completionRate: round1(completionRate),
          avgActiveTimeS: round1(question.avg_active_time_s),
          backtrackN: question.backtrack_n,
          backtrackRate: round1(backtrackRate),
          skipRate: answerMetrics.skipRate,
          avgRevisions: answerMetrics.avgRevisions,
          frictionIndex: round1(frictionPenalty),
          effectivenessScore,
          grade: computeGrade(effectivenessScore),
          recommendation: computeRecommendation(
            dropoffRate,
            backtrackRate,
            answerMetrics.skipRate,
            timePenalty
          ),
          confidence: confidenceFromReach(question.reach_n),
          regressionScore,
          watchStatus,
          comparisonWindowDays: days,
          comparisonBaseline: baselineSnapshot,
          comparisonDeltas: deltas,
          regressionReasons,
        };
      })
      .sort((a, b) => a.effectivenessScore - b.effectivenessScore);

    const avgScore =
      questions.length > 0
        ? Math.round(
            questions.reduce((sum, question) => sum + question.effectivenessScore, 0) /
              questions.length
          )
        : 0;
    const regressedCount = questions.filter(
      (question) => question.watchStatus === "regressed"
    ).length;
    const improvedCount = questions.filter(
      (question) => question.watchStatus === "improved"
    ).length;
    const lowConfidenceCount = questions.filter((question) => question.confidence === "low").length;
    const watchlist = questions
      .filter((question) => question.watchStatus === "regressed")
      .sort((a, b) => b.regressionScore - a.regressionScore)
      .slice(0, 12);

    return NextResponse.json({
      questions,
      watchlist,
      avgScore,
      totalQuestions: questions.length,
      totalSessions: currentKpi.totalSessions,
      summary: {
        regressedCount,
        improvedCount,
        lowConfidenceCount,
        comparisonWindowDays: days,
      },
    });
  } catch (err) {
    logger.error({ err }, "Question effectiveness error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
