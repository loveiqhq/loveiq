import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

interface QuestionRow {
  id: number;
  frontend_qid: string;
  question: string;
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
    bucket: "admin-scorecard",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    /**
     * Aggregated in SQL, because the table is far past the response cap.
     *
     * This read survey_submission_answer with no filter and no ORDER BY behind
     * `Range: "0-49999"`. PostgREST caps a response at 1,000 rows with no
     * error, so the scorecard was built from an arbitrary 1,000 of 121,987
     * answers — 0.8%, and at about 59 questions per submission that is roughly
     * seventeen people out of 2,061. Skip rate, average time and revision count
     * were every one of them computed on that slice.
     *
     * Paging it would be 122 requests. get_question_scorecard() returns the
     * TOTALS and the scoring below is unchanged, so this fixes what the numbers
     * are computed from without touching how they are scored.
     */
    const [totalsRes, questionsRes] = await Promise.all([
      supabaseFetch(`/rest/v1/rpc/get_question_scorecard`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
      supabaseFetch(`/rest/v1/survey_question?select=id,frontend_qid,question`),
    ]);

    if (!totalsRes.ok || !questionsRes.ok) {
      logger.error("Scorecard: query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const totals = (await totalsRes.json()) as Array<{
      survey_question_id: number;
      total_answers: number;
      skipped: number;
      total_time: number;
      time_count: number;
      total_revisions: number;
    }>;
    const questions = (await questionsRes.json()) as QuestionRow[];

    const questionMap = new Map(questions.map((q) => [q.id, q]));

    // Aggregate per question
    const stats: Record<
      number,
      {
        totalAnswers: number;
        skipped: number;
        totalTime: number;
        timeCount: number;
        totalRevisions: number;
      }
    > = {};

    for (const row of totals) {
      stats[row.survey_question_id] = {
        totalAnswers: Number(row.total_answers) || 0,
        skipped: Number(row.skipped) || 0,
        totalTime: Number(row.total_time) || 0,
        timeCount: Number(row.time_count) || 0,
        totalRevisions: Number(row.total_revisions) || 0,
      };
    }

    const scorecard = Object.entries(stats)
      .map(([qidStr, s]) => {
        const qid = Number(qidStr);
        const question = questionMap.get(qid);
        const skipRate = s.totalAnswers > 0 ? (s.skipped / s.totalAnswers) * 100 : 0;
        const avgTime = s.timeCount > 0 ? s.totalTime / s.timeCount : 0;
        const avgRevisions = s.totalAnswers > 0 ? s.totalRevisions / s.totalAnswers : 0;

        // Composite score: lower skip rate + reasonable time + low revisions = better
        // Score 0-100: 100 = perfect
        const skipScore = Math.max(0, 100 - skipRate * 2);
        const timeScore = avgTime > 0 && avgTime < 120 ? 100 : avgTime >= 120 ? 50 : 30;
        const revisionScore = Math.max(0, 100 - avgRevisions * 20);
        const compositeScore = Math.round(skipScore * 0.4 + timeScore * 0.3 + revisionScore * 0.3);

        return {
          questionId: qid,
          frontendQid: question?.frontend_qid || `Q${qid}`,
          questionText: question?.question?.slice(0, 80) || `Question ${qid}`,
          totalAnswers: s.totalAnswers,
          skipRate: Math.round(skipRate * 10) / 10,
          avgTimeSec: Math.round(avgTime * 10) / 10,
          avgRevisions: Math.round(avgRevisions * 100) / 100,
          compositeScore,
          status: compositeScore >= 80 ? "green" : compositeScore >= 50 ? "yellow" : "red",
        };
      })
      .sort((a, b) => a.compositeScore - b.compositeScore);

    return NextResponse.json({ scorecard });
  } catch (err) {
    logger.error({ err }, "Scorecard error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
