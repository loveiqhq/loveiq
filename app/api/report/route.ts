import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { getBreaker, CircuitOpenError } from "@/lib/circuit-breaker";
import { verifyCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";

const sessionIdSchema = z.object({
  sessionId: z.string().uuid(),
});

const RATE_LIMIT_CONFIG = {
  bucket: "report-view",
  limit: 10,
  windowMs: 60_000,
};

const SUPABASE_TIMEOUT_MS = 5_000;

interface SubmissionUser {
  first_name: string | null;
}

interface SubmissionRow {
  id: number;
  created_date_time: string;
  app_user: SubmissionUser | SubmissionUser[] | null;
}

function getSubmissionUserName(submission: SubmissionRow): string | null {
  if (Array.isArray(submission.app_user)) {
    return submission.app_user[0]?.first_name ?? null;
  }

  return submission.app_user?.first_name ?? null;
}

export async function GET(request: Request) {
  // 1. CSRF verification
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  // 2. Rate limiting
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, RATE_LIMIT_CONFIG);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000)),
        },
      }
    );
  }

  // 3. Validate query param
  const url = new URL(request.url);
  const parsed = sessionIdSchema.safeParse({
    sessionId: url.searchParams.get("sessionId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { sessionId } = parsed.data;

  // 4. Supabase config
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  try {
    // 5. Look up survey_submission by session_id
    const submissionRes = await getBreaker("supabase").fire(() =>
      fetchWithTimeout(
        `${supabaseUrl}/rest/v1/survey_submission?session_id=eq.${encodeURIComponent(sessionId)}&select=id,created_date_time,app_user!fk_survey_submission_user(first_name)&limit=1`,
        {
          headers,
          cache: "no-store",
          timeoutMs: SUPABASE_TIMEOUT_MS,
        }
      )
    );

    if (!submissionRes.ok) {
      logger.error({ status: submissionRes.status }, "Supabase survey_submission lookup failed");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }

    const submissions = (await submissionRes.json()) as SubmissionRow[];

    if (!Array.isArray(submissions) || submissions.length === 0) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    const submission = submissions[0];

    // 6. Look up scoring_result by survey_submission_id
    const scoringRes = await getBreaker("supabase").fire(() =>
      fetchWithTimeout(
        `${supabaseUrl}/rest/v1/scoring_result?survey_submission_id=eq.${submission.id}&select=primary_archetype,v5_primary_archetype,percentages,v5_percentages,diagnostics&limit=1`,
        {
          headers,
          cache: "no-store",
          timeoutMs: SUPABASE_TIMEOUT_MS,
        }
      )
    );

    if (!scoringRes.ok) {
      logger.error({ status: scoringRes.status }, "Supabase scoring_result lookup failed");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }

    const scoringRows = (await scoringRes.json()) as Array<{
      primary_archetype: string;
      v5_primary_archetype: string | null;
      percentages: Record<string, number> | null;
      v5_percentages: Record<string, number> | null;
      diagnostics: Record<string, unknown> | null;
    }>;

    if (!Array.isArray(scoringRows) || scoringRows.length === 0) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    const scoring = scoringRows[0];

    // 7. Build response — prefer v5 fields, fall back to v4
    return NextResponse.json({
      userName: getSubmissionUserName(submission),
      primaryArchetype: scoring.v5_primary_archetype || scoring.primary_archetype,
      percentages: scoring.v5_percentages || scoring.percentages || {},
      reportDate: submission.created_date_time,
      diagnostics: scoring.diagnostics ?? null,
    });
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      logger.warn("Supabase circuit open on report lookup");
      return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
    }
    logger.error({ err }, "Error processing report request");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
