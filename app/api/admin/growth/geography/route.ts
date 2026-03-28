import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

interface AnswerRow {
  answer_text: string | null;
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
    bucket: "admin-growth-geography",
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
    // Step 1: Get the survey_question ID for frontend_qid = '15001'
    const qRes = await supabaseFetch(`/rest/v1/survey_question?frontend_qid=eq.15001&select=id`);

    if (!qRes.ok) {
      logger.error("Growth geography: failed to fetch question ID");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const questions = (await qRes.json()) as Array<{ id: number }>;
    if (!questions.length) {
      return NextResponse.json({ countries: [], total: 0 });
    }

    const qId = questions[0].id;

    // Step 2: Get all answers for this question
    // Filter by submission date if a time range is specified
    let query = `/rest/v1/survey_submission_answer?survey_question_id=eq.${qId}&select=answer_text&answer_text=not.is.null`;
    if (since) {
      // Join to survey_submission to filter by date
      query = `/rest/v1/survey_submission_answer?survey_question_id=eq.${qId}&select=answer_text,survey_submission!inner(created_date_time)&answer_text=not.is.null&survey_submission.created_date_time=gte.${since}`;
    }

    const answersRes = await supabaseFetch(query, {
      headers: { Range: "0-9999" },
    });

    if (!answersRes.ok) {
      logger.error("Growth geography: failed to fetch answers");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const answers = (await answersRes.json()) as AnswerRow[];

    // Step 3: Group by country in JS
    const countryMap = new Map<string, number>();
    for (const a of answers) {
      if (a.answer_text) {
        const country = a.answer_text.trim();
        if (country) {
          countryMap.set(country, (countryMap.get(country) || 0) + 1);
        }
      }
    }

    const countries = Array.from(countryMap.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count);

    const total = countries.reduce((s, c) => s + c.count, 0);

    return NextResponse.json({ countries, total });
  } catch (err) {
    logger.error({ err }, "Growth geography error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
