import { surveyQuestions } from "@/data/survey-data";
import {
  buildTrustDescriptor,
  classifyPlacement,
  median,
  sourceLabel,
} from "@/lib/admin/next-level";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

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

interface BehaviorContextRow {
  session_id: string;
  q_id: string;
  chapter: string;
  time_spent_ms: number | null;
  direction: string;
}

interface ComparisonSnapshot {
  completionRate: number;
  avgActiveTimeS: number;
  backtrackRate: number;
  skipRate: number;
  avgRevisions: number;
}

export interface QuestionEffectivenessQuestion {
  qId: string;
  chapterId: string;
  questionText: string;
  reachN: number;
  dropoffN: number;
  completionRate: number;
  avgActiveTimeS: number;
  backtrackN: number;
  backtrackRate: number;
  skipRate: number;
  avgRevisions: number;
  frictionIndex: number;
  effectivenessScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  recommendation: string;
  confidence: "high" | "medium" | "low";
  regressionScore: number;
  watchStatus: "regressed" | "stable" | "improved";
  comparisonWindowDays: number;
  comparisonBaseline: ComparisonSnapshot;
  comparisonDeltas: ComparisonSnapshot;
  regressionReasons: string[];
}

export interface QuestionEffectivenessSnapshot {
  questions: QuestionEffectivenessQuestion[];
  watchlist: QuestionEffectivenessQuestion[];
  dropoffDeepView: {
    contextCoverage: {
      source: boolean;
      embed: boolean;
      browser: boolean;
      device: boolean;
    };
    trust: ReturnType<typeof buildTrustDescriptor>;
    questions: Array<{
      qId: string;
      chapterId: string;
      questionText: string;
      reachN: number;
      dropoffN: number;
      dropoffRate: number;
      medianDwellS: number | null;
      bounceAfterQuestionRate: number;
      sourceSplit: Array<{ label: string; count: number }>;
      embedSplit: Array<{ label: string; count: number }>;
      deviceSplit: Array<{ label: string; count: number }>;
      browserSplit: Array<{ label: string; count: number }>;
      trustNote: string | null;
    }>;
  };
  avgScore: number;
  totalQuestions: number;
  totalSessions: number;
  summary: {
    regressedCount: number;
    improvedCount: number;
    lowConfidenceCount: number;
    comparisonWindowDays: number;
  };
}

export interface QuestionLifecycleItem extends QuestionEffectivenessQuestion {
  discriminationIndex: number;
  lifecycleAction: "keep" | "revise" | "replace" | "retire";
  lifecyclePriority: number;
  lifecycleReasons: string[];
  drilldowns: Array<{ label: string; href: string; value: string }>;
}

export interface QuestionLifecycleSnapshot {
  days: number;
  summary: {
    keep: number;
    revise: number;
    replace: number;
    retire: number;
    urgent: number;
  };
  chapters: Array<{
    chapterId: string;
    questions: number;
    revise: number;
    replace: number;
    retire: number;
  }>;
  topCandidates: QuestionLifecycleItem[];
  questions: QuestionLifecycleItem[];
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
  if (worst === backtrackRate) {
    return "Users revisit this question; clarify wording or answer options.";
  }
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

async function fetchDiscriminationMap(sinceTs: string | null) {
  const res = await supabaseFetch("/rest/v1/rpc/get_question_discrimination", {
    method: "POST",
    body: JSON.stringify({ since_ts: sinceTs }),
  });
  if (!res.ok) {
    logger.warn({ status: res.status }, "Question lifecycle: discrimination RPC failed");
    return new Map<string, number>();
  }

  const rows = (await res.json()) as Array<{
    q_id: string;
    discrimination_index: number | null;
  }>;
  const result = new Map<string, number>();
  for (const row of rows) {
    if (row.q_id && row.discrimination_index != null) {
      result.set(row.q_id, Number(row.discrimination_index));
    }
  }
  return result;
}

async function fetchBehaviorContext(sinceTs: string | null) {
  const eventFilter = sinceTs ? `&event_time=gte.${sinceTs}` : "";
  const submissionFilter = sinceTs ? `&created_date_time=gte.${sinceTs}` : "";

  const [eventsRes, submissionsRes] = await Promise.all([
    supabaseFetch(
      `/rest/v1/survey_behavior_event?select=session_id,q_id,chapter,time_spent_ms,direction${eventFilter}&order=event_time.desc`,
      { headers: { Range: "0-99999" } }
    ),
    supabaseFetch(
      `/rest/v1/survey_submission?select=session_id,utm_tracker${submissionFilter}&order=created_date_time.desc`,
      { headers: { Range: "0-49999" } }
    ),
  ]);

  if (!eventsRes?.ok || !submissionsRes?.ok) {
    logger.warn(
      { eventStatus: eventsRes?.status, submissionStatus: submissionsRes?.status },
      "Question effectiveness: context query failed"
    );
    return {
      byQuestion: new Map<
        string,
        {
          dwellTimesS: number[];
          sourceCounts: Map<string, number>;
          embedCounts: Map<string, number>;
        }
      >(),
      sampleSize: 0,
    };
  }

  const events = (await eventsRes.json()) as BehaviorContextRow[];
  const submissions = (await submissionsRes.json()) as Array<{
    session_id: string | null;
    utm_tracker: string | null;
  }>;
  const sessionContext = new Map<string, { source: string; placement: string }>();
  for (const submission of submissions) {
    if (!submission.session_id) continue;
    sessionContext.set(submission.session_id, {
      source: sourceLabel(submission.utm_tracker),
      placement: classifyPlacement(submission.utm_tracker),
    });
  }

  const byQuestion = new Map<
    string,
    {
      dwellTimesS: number[];
      sourceCounts: Map<string, number>;
      embedCounts: Map<string, number>;
    }
  >();

  for (const event of events) {
    if (!event.q_id || event.q_id.startsWith("00")) continue;
    const current = byQuestion.get(event.q_id) ?? {
      dwellTimesS: [],
      sourceCounts: new Map<string, number>(),
      embedCounts: new Map<string, number>(),
    };
    if (event.time_spent_ms != null && event.time_spent_ms > 0) {
      current.dwellTimesS.push(event.time_spent_ms / 1000);
    }

    const context = sessionContext.get(event.session_id);
    if (context) {
      current.sourceCounts.set(context.source, (current.sourceCounts.get(context.source) ?? 0) + 1);
      current.embedCounts.set(
        context.placement,
        (current.embedCounts.get(context.placement) ?? 0) + 1
      );
    }
    byQuestion.set(event.q_id, current);
  }

  return { byQuestion, sampleSize: events.length };
}

export async function buildQuestionEffectivenessSnapshot(
  rawDays: number
): Promise<QuestionEffectivenessSnapshot> {
  const days = Math.min(Math.max(Number.isNaN(rawDays) ? 30 : rawDays, 7), 90);
  const since = makeSince(days);

  const [currentKpi, baselineKpi, currentAnswerMetrics, baselineAnswerMetrics, behaviorContext] =
    await Promise.all([
      fetchQuestionKpis(since),
      fetchQuestionKpis(null),
      fetchAnswerMetrics(since),
      fetchAnswerMetrics(null),
      fetchBehaviorContext(since),
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
  const avgTime = times.length > 0 ? times.reduce((sum, time) => sum + time, 0) / times.length : 10;
  const stdTime =
    times.length > 1
      ? Math.sqrt(times.reduce((sum, time) => sum + (time - avgTime) ** 2, 0) / (times.length - 1))
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
      const dropoffRate = question.reach_n > 0 ? (question.dropoff_n / question.reach_n) * 100 : 0;
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
      } satisfies QuestionEffectivenessQuestion;
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
  const improvedCount = questions.filter((question) => question.watchStatus === "improved").length;
  const lowConfidenceCount = questions.filter((question) => question.confidence === "low").length;
  const watchlist = questions
    .filter((question) => question.watchStatus === "regressed")
    .sort((a, b) => b.regressionScore - a.regressionScore)
    .slice(0, 12);

  const dropoffQuestions = questions
    .map((question) => {
      const context = behaviorContext.byQuestion.get(question.qId);
      return {
        qId: question.qId,
        chapterId: question.chapterId,
        questionText: question.questionText,
        reachN: question.reachN,
        dropoffN: question.dropoffN,
        dropoffRate: round1(question.reachN > 0 ? (question.dropoffN / question.reachN) * 100 : 0),
        medianDwellS: context ? median(context.dwellTimesS) : null,
        bounceAfterQuestionRate: round1(
          question.reachN > 0 ? (question.dropoffN / question.reachN) * 100 : 0
        ),
        sourceSplit: [...(context?.sourceCounts.entries() ?? [])]
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 4),
        embedSplit: [...(context?.embedCounts.entries() ?? [])]
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 4),
        deviceSplit: [] as Array<{ label: string; count: number }>,
        browserSplit: [] as Array<{ label: string; count: number }>,
        trustNote:
          context && context.sourceCounts.size > 0
            ? "Browser and device context are not instrumented on survey events yet."
            : "Only source and placement context are available for this question.",
      };
    })
    .sort((a, b) => b.dropoffN - a.dropoffN || b.dropoffRate - a.dropoffRate)
    .slice(0, 20);

  return {
    questions,
    watchlist,
    dropoffDeepView: {
      contextCoverage: {
        source: true,
        embed: true,
        browser: false,
        device: false,
      },
      trust: buildTrustDescriptor({
        source: "survey_behavior_event + survey_submission",
        mode: "derived",
        sampleSize: behaviorContext.sampleSize,
        lastUpdated: since ?? new Date().toISOString(),
        warning:
          behaviorContext.sampleSize === 0
            ? "Question context needs more survey behavior events before the deep view is reliable."
            : "Browser and device slices are unavailable until survey instrumentation captures user agents.",
      }),
      questions: dropoffQuestions,
    },
    avgScore,
    totalQuestions: questions.length,
    totalSessions: currentKpi.totalSessions,
    summary: {
      regressedCount,
      improvedCount,
      lowConfidenceCount,
      comparisonWindowDays: days,
    },
  };
}

function buildLifecycleReasons(
  question: QuestionEffectivenessQuestion,
  discriminationIndex: number
) {
  const reasons: string[] = [];
  if (question.comparisonDeltas.completionRate <= -4) {
    reasons.push(`${Math.abs(question.comparisonDeltas.completionRate)}pp completion regression`);
  }
  if (question.skipRate >= 18) reasons.push(`${question.skipRate}% skip rate`);
  if (question.backtrackRate >= 10) reasons.push(`${question.backtrackRate}% backtrack rate`);
  if (question.avgActiveTimeS >= 20)
    reasons.push(`${question.avgActiveTimeS}s average answer time`);
  if (discriminationIndex <= 0.04)
    reasons.push(`weak predictive value (${round2(discriminationIndex)})`);
  if (question.reachN < 20) reasons.push(`only ${question.reachN} recent reaches`);
  if (reasons.length === 0) reasons.push("stable recent behavior");
  return reasons;
}

function buildLifecycleAction(
  question: QuestionEffectivenessQuestion,
  discriminationIndex: number
): QuestionLifecycleItem["lifecycleAction"] {
  if (
    question.reachN < 20 &&
    question.skipRate >= 20 &&
    discriminationIndex <= 0.04 &&
    question.effectivenessScore < 55
  ) {
    return "retire";
  }
  if (
    question.effectivenessScore < 45 &&
    discriminationIndex <= 0.06 &&
    (question.skipRate >= 12 || question.backtrackRate >= 8 || question.completionRate < 78)
  ) {
    return "replace";
  }
  if (
    question.watchStatus === "regressed" ||
    question.effectivenessScore < 70 ||
    question.skipRate >= 10 ||
    question.backtrackRate >= 7
  ) {
    return "revise";
  }
  return "keep";
}

function buildLifecyclePriority(
  question: QuestionEffectivenessQuestion,
  action: QuestionLifecycleItem["lifecycleAction"],
  discriminationIndex: number
) {
  const actionWeight =
    action === "replace" ? 40 : action === "retire" ? 38 : action === "revise" ? 26 : 5;
  return Math.round(
    actionWeight +
      Math.max(0, 100 - question.effectivenessScore) * 0.45 +
      Math.max(0, question.skipRate - 8) * 1.1 +
      Math.max(0, question.backtrackRate - 5) * 1.2 +
      Math.max(0, -question.comparisonDeltas.completionRate) * 2.2 +
      Math.max(0, 0.09 - discriminationIndex) * 120
  );
}

export async function buildQuestionLifecycleSnapshot(
  rawDays: number,
  precomputedEffectiveness?: QuestionEffectivenessSnapshot
): Promise<QuestionLifecycleSnapshot> {
  const effectiveness =
    precomputedEffectiveness ?? (await buildQuestionEffectivenessSnapshot(rawDays));
  const discrimination = await fetchDiscriminationMap(
    makeSince(effectiveness.summary.comparisonWindowDays)
  );

  const questions = effectiveness.questions
    .map((question) => {
      const discriminationIndex = round2(discrimination.get(question.qId) ?? 0);
      const lifecycleAction = buildLifecycleAction(question, discriminationIndex);
      const lifecycleReasons = buildLifecycleReasons(question, discriminationIndex);
      const lifecyclePriority = buildLifecyclePriority(
        question,
        lifecycleAction,
        discriminationIndex
      );

      return {
        ...question,
        discriminationIndex,
        lifecycleAction,
        lifecyclePriority,
        lifecycleReasons,
        drilldowns: [
          {
            label: "Effectiveness",
            href: "/admin/question-effectiveness",
            value: `${question.effectivenessScore} score`,
          },
          {
            label: "Scorecard",
            href: "/admin/scorecard",
            value: `${question.grade} grade`,
          },
          {
            label: "Abandonment",
            href: "/admin/abandonment",
            value: `${question.completionRate}% completion`,
          },
        ],
      } satisfies QuestionLifecycleItem;
    })
    .sort((a, b) => b.lifecyclePriority - a.lifecyclePriority);

  const chaptersMap = new Map<
    string,
    { chapterId: string; questions: number; revise: number; replace: number; retire: number }
  >();

  for (const question of questions) {
    const chapter = chaptersMap.get(question.chapterId) ?? {
      chapterId: question.chapterId,
      questions: 0,
      revise: 0,
      replace: 0,
      retire: 0,
    };
    chapter.questions += 1;
    if (question.lifecycleAction === "revise") chapter.revise += 1;
    if (question.lifecycleAction === "replace") chapter.replace += 1;
    if (question.lifecycleAction === "retire") chapter.retire += 1;
    chaptersMap.set(question.chapterId, chapter);
  }

  const summary = {
    keep: questions.filter((question) => question.lifecycleAction === "keep").length,
    revise: questions.filter((question) => question.lifecycleAction === "revise").length,
    replace: questions.filter((question) => question.lifecycleAction === "replace").length,
    retire: questions.filter((question) => question.lifecycleAction === "retire").length,
    urgent: questions.filter((question) => question.lifecyclePriority >= 70).length,
  };

  return {
    days: effectiveness.summary.comparisonWindowDays,
    summary,
    chapters: [...chaptersMap.values()].sort(
      (a, b) => b.replace + b.retire + b.revise - (a.replace + a.retire + a.revise)
    ),
    topCandidates: questions.filter((question) => question.lifecycleAction !== "keep").slice(0, 12),
    questions,
  };
}
