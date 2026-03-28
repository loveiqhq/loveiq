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
  if (worst < 15) return "Performing well — no changes needed";
  if (worst === dropoffRate)
    return "High abandonment — consider simplifying or splitting this question";
  if (worst === backtrackRate) return "Users frequently revisit — question may be confusing";
  if (worst === skipRate) return "Often skipped — consider making optional or improving relevance";
  return "Takes unusually long — consider reducing complexity";
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
  const days = parseInt(url.searchParams.get("days") || "0", 10);
  const since = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;

  try {
    const kpiRes = await supabaseFetch("/rest/v1/rpc/get_product_kpis", {
      method: "POST",
      body: JSON.stringify({ since_ts: since }),
    });

    if (!kpiRes.ok) {
      logger.error("Question effectiveness: KPI RPC failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const kpiData = await kpiRes.json();
    const rawQuestions = (kpiData.questions ?? []) as RpcQuestion[];
    const totalSessions = kpiData.totalSessions ?? 1;

    // Build question text lookup
    const questionTextMap = new Map(surveyQuestions.map((q) => [q.qId, q.question]));

    // Compute global avg time for z-score normalization
    const times = rawQuestions.map((q) => q.avg_active_time_s).filter((t) => t > 0);
    const avgTime = times.length > 0 ? times.reduce((s, t) => s + t, 0) / times.length : 10;
    const stdTime =
      times.length > 1
        ? Math.sqrt(times.reduce((s, t) => s + (t - avgTime) ** 2, 0) / (times.length - 1))
        : avgTime / 2;

    const questions = rawQuestions
      .filter((q) => q.reach_n > 0 && !q.q_id.startsWith("00"))
      .map((q) => {
        const completionRate = q.reach_n > 0 ? ((q.reach_n - q.dropoff_n) / q.reach_n) * 100 : 100;
        const dropoffRate = q.reach_n > 0 ? (q.dropoff_n / q.reach_n) * 100 : 0;
        const backtrackRate = q.reach_n > 0 ? (q.backtrack_n / q.reach_n) * 100 : 0;
        const skipRate = 0; // placeholder — would need answer-level data
        const timePenalty =
          stdTime > 0 ? Math.min(Math.abs(q.avg_active_time_s - avgTime) / stdTime, 2) * 50 : 0;
        const frictionPenalty = dropoffRate * 0.5 + backtrackRate * 0.3 + timePenalty * 0.2;

        const score = Math.max(
          0,
          Math.min(
            100,
            Math.round(
              100 -
                (dropoffRate * 0.3 +
                  timePenalty * 0.15 +
                  backtrackRate * 0.2 +
                  skipRate * 0.15 +
                  frictionPenalty * 0.2)
            )
          )
        );

        return {
          qId: q.q_id,
          chapterId: q.chapter,
          questionText: questionTextMap.get(q.q_id) || q.q_id,
          reachN: q.reach_n,
          dropoffN: q.dropoff_n,
          completionRate: Math.round(completionRate * 10) / 10,
          avgActiveTimeS: Math.round(q.avg_active_time_s * 10) / 10,
          backtrackN: q.backtrack_n,
          backtrackRate: Math.round(backtrackRate * 10) / 10,
          skipRate: 0,
          frictionIndex: Math.round(frictionPenalty * 10) / 10,
          effectivenessScore: score,
          grade: computeGrade(score),
          recommendation: computeRecommendation(dropoffRate, backtrackRate, skipRate, timePenalty),
        };
      })
      .sort((a, b) => a.effectivenessScore - b.effectivenessScore);

    const avgScore =
      questions.length > 0
        ? Math.round(questions.reduce((s, q) => s + q.effectivenessScore, 0) / questions.length)
        : 0;

    return NextResponse.json({
      questions,
      avgScore,
      totalQuestions: questions.length,
      totalSessions,
    });
  } catch (err) {
    logger.error({ err }, "Question effectiveness error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
