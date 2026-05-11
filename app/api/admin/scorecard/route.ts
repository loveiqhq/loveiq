import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

interface AnswerRow {
  survey_question_id: number;
  time_spent_seconds: number | null;
  revision_count: number | null;
  was_skipped: boolean | null;
}

interface QuestionRow {
  id: number;
  frontend_qid: string;
  question_text: string;
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
    const [answersRes, questionsRes] = await Promise.all([
      supabaseFetch(
        `/rest/v1/survey_submission_answer?select=survey_question_id,time_spent_seconds,revision_count,was_skipped`,
        { headers: { Range: "0-49999" } }
      ),
      supabaseFetch(`/rest/v1/survey_question?select=id,frontend_qid,question_text`),
    ]);

    if (!answersRes.ok || !questionsRes.ok) {
      logger.error("Scorecard: query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const answers = (await answersRes.json()) as AnswerRow[];
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

    for (const a of answers) {
      if (!stats[a.survey_question_id]) {
        stats[a.survey_question_id] = {
          totalAnswers: 0,
          skipped: 0,
          totalTime: 0,
          timeCount: 0,
          totalRevisions: 0,
        };
      }
      // stats[a.survey_question_id] is initialised in the if-block above; safe.
      const s = stats[a.survey_question_id]!;
      s.totalAnswers++;
      if (a.was_skipped) s.skipped++;
      if (a.time_spent_seconds != null && a.time_spent_seconds > 0) {
        s.totalTime += a.time_spent_seconds;
        s.timeCount++;
      }
      s.totalRevisions += a.revision_count || 0;
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
          questionText: question?.question_text?.slice(0, 80) || `Question ${qid}`,
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
