import { NextResponse } from "next/server";
import { z } from "zod";
import { scheduleAfterResponse } from "@/lib/after-response";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { getBreaker, CircuitOpenError } from "@/lib/circuit-breaker";
import { verifyCsrfToken } from "@/lib/csrf";
import {
  ensurePersonalReportForSubmission,
  getReportAccessPlanForSubmission,
  recordReportSessionView,
} from "@/lib/report/personalReport";
import { getReportPriceQuotesForContext } from "@/lib/pricing/reportPricing";
import logger from "@/lib/logger";
import type { ReportPriceQuoteSnapshot } from "@/lib/pricing/reportPricing";
import type { ReportPurchasePlanId } from "@/lib/checkout/reportPurchase";

const sessionIdSchema = z.object({
  pricingSessionId: z.string().uuid().optional(),
  sessionId: z.string().uuid(),
});

const tokenSchema = z.object({
  pricingSessionId: z.string().uuid().optional(),
  token: z.string().regex(/^rpt_[a-zA-Z0-9]{20}$/),
});

const RATE_LIMIT_CONFIG = {
  bucket: "report-view",
  limit: 30,
  windowMs: 60_000,
};

const SUPABASE_TIMEOUT_MS = 5_000;
const SNAPSHOT_QUESTION_QIDS = ["01002", "16013"] as const;

type SnapshotQuestionQid = (typeof SNAPSHOT_QUESTION_QIDS)[number];

interface SubmissionUser {
  first_name: string | null;
  email: string | null;
}

interface SubmissionRow {
  id: number;
  created_date_time: string;
  app_user: SubmissionUser | SubmissionUser[] | null;
  utm_tracker: string | null;
  user_id: number | null;
}

interface SnapshotAnswers {
  currentSexualSatisfaction: number | null;
  importanceOfSex: number | null;
}

type ReportPricingQuotesResponse = Record<ReportPurchasePlanId, ReportPriceQuoteSnapshot> | null;

function getSubmissionUserName(submission: SubmissionRow): string | null {
  if (Array.isArray(submission.app_user)) {
    return submission.app_user[0]?.first_name ?? null;
  }

  return submission.app_user?.first_name ?? null;
}

function getSubmissionUserEmail(submission: SubmissionRow): string | null {
  if (Array.isArray(submission.app_user)) {
    return submission.app_user[0]?.email ?? null;
  }

  return submission.app_user?.email ?? null;
}

function normalizeScaleAnswer(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > 7) return null;
  return rounded;
}

export async function GET(request: Request) {
  // 1. Parse params first to decide auth strategy
  const url = new URL(request.url);
  const rawToken = url.searchParams.get("token");
  const rawSessionId = url.searchParams.get("sessionId");
  const isTokenAccess = !!rawToken;

  // 2. CSRF verification — skip for token-based access (email links won't have CSRF cookie)
  if (!isTokenAccess && !(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  // 3. Rate limiting
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent");
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

  const rawPricingSessionId = url.searchParams.get("pricingSessionId") ?? undefined;
  const tokenParsed = rawToken
    ? tokenSchema.safeParse({ pricingSessionId: rawPricingSessionId, token: rawToken })
    : null;
  const sessionParsed = rawSessionId
    ? sessionIdSchema.safeParse({
        pricingSessionId: rawPricingSessionId,
        sessionId: rawSessionId,
      })
    : null;

  if (!tokenParsed?.success && !sessionParsed?.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

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
    // 5. Look up survey_submission — by token or session_id
    let submissionQuery: string;

    if (tokenParsed?.success) {
      // Token-based: look up report_access_token → get submission_id → get submission
      const tokenRes = await getBreaker("supabase").fire(() =>
        fetchWithTimeout(
          `${supabaseUrl}/rest/v1/report_access_token?token=eq.${encodeURIComponent(tokenParsed.data.token)}&select=survey_submission_id&limit=1`,
          { headers, cache: "no-store", timeoutMs: SUPABASE_TIMEOUT_MS }
        )
      );

      if (!tokenRes.ok) {
        logger.error({ status: tokenRes.status }, "Token lookup failed");
        return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
      }

      const tokenRows = (await tokenRes.json()) as Array<{ survey_submission_id: number }>;
      if (!Array.isArray(tokenRows) || tokenRows.length === 0) {
        return NextResponse.json({ error: "Report not found." }, { status: 404 });
      }

      submissionQuery = `${supabaseUrl}/rest/v1/survey_submission?id=eq.${tokenRows[0].survey_submission_id}&select=id,user_id,utm_tracker,created_date_time,app_user!fk_survey_submission_user(first_name,email)&limit=1`;
    } else {
      const sid = (sessionParsed as { success: true; data: { sessionId: string } }).data.sessionId;
      submissionQuery = `${supabaseUrl}/rest/v1/survey_submission?session_id=eq.${encodeURIComponent(sid)}&select=id,user_id,utm_tracker,created_date_time,app_user!fk_survey_submission_user(first_name,email)&limit=1`;
    }

    const submissionRes = await getBreaker("supabase").fire(() =>
      fetchWithTimeout(submissionQuery, {
        headers,
        cache: "no-store",
        timeoutMs: SUPABASE_TIMEOUT_MS,
      })
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
    const snapshotAnswerQids = SNAPSHOT_QUESTION_QIDS.join(",");
    const snapshotAnswersSelect = ["normalized_value", "survey_question!inner(frontend_qid)"].join(
      ","
    );
    const snapshotAnswersQuery =
      `${supabaseUrl}/rest/v1/survey_submission_answer` +
      `?survey_submission_id=eq.${submission.id}` +
      `&select=${snapshotAnswersSelect}` +
      `&survey_question.frontend_qid=in.(${snapshotAnswerQids})`;

    const [scoringRes, snapshotAnswersRes] = await Promise.all([
      getBreaker("supabase").fire(() =>
        fetchWithTimeout(
          `${supabaseUrl}/rest/v1/scoring_result?survey_submission_id=eq.${submission.id}&select=primary_archetype,v5_primary_archetype,percentages,v5_percentages,diagnostics&limit=1`,
          {
            headers,
            cache: "no-store",
            timeoutMs: SUPABASE_TIMEOUT_MS,
          }
        )
      ),
      getBreaker("supabase")
        .fire(() =>
          fetchWithTimeout(snapshotAnswersQuery, {
            headers,
            cache: "no-store",
            timeoutMs: SUPABASE_TIMEOUT_MS,
          })
        )
        .catch((err) => {
          logger.warn({ err, submissionId: submission.id }, "Snapshot answers lookup failed");
          return null;
        }),
    ]);

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
    let snapshotAnswers: SnapshotAnswers = {
      currentSexualSatisfaction: null,
      importanceOfSex: null,
    };

    if (snapshotAnswersRes?.ok) {
      const snapshotAnswerRows = (await snapshotAnswersRes.json()) as Array<{
        normalized_value: number | null;
        survey_question: { frontend_qid: string } | null;
      }>;
      snapshotAnswers = snapshotAnswerRows.reduce<SnapshotAnswers>(
        (acc, row) => {
          const normalized = normalizeScaleAnswer(row.normalized_value);
          const qid = row.survey_question?.frontend_qid as SnapshotQuestionQid | undefined;

          if (qid === "01002") {
            acc.currentSexualSatisfaction = normalized;
          } else if (qid === "16013") {
            acc.importanceOfSex = normalized;
          }

          return acc;
        },
        {
          currentSexualSatisfaction: null,
          importanceOfSex: null,
        }
      );
    } else if (snapshotAnswersRes) {
      logger.warn(
        { status: snapshotAnswersRes.status, submissionId: submission.id },
        "Snapshot answers lookup returned a non-OK response"
      );
    }

    let accessPlan: "essentials" | "full_report" | "all_reports" | null = null;
    let pricingQuotes: ReportPricingQuotesResponse = null;

    try {
      await ensurePersonalReportForSubmission({
        reportToken: tokenParsed?.success ? tokenParsed.data.token : null,
        submissionId: submission.id,
      });

      const access = await getReportAccessPlanForSubmission(submission.id);
      accessPlan = access.accessPlan;

      if (access.personalReportId && !accessPlan) {
        await recordReportSessionView({
          ipAddress: ip,
          personalReportId: access.personalReportId,
          userAgent,
          userId: submission.user_id,
          utmTracker: submission.utm_tracker,
        });
      } else if (access.personalReportId) {
        scheduleAfterResponse("report-session-capture", async () => {
          await recordReportSessionView({
            ipAddress: ip,
            personalReportId: access.personalReportId!,
            userAgent,
            userId: submission.user_id,
            utmTracker: submission.utm_tracker,
          });
        });
      }
    } catch (err) {
      logger.warn({ err, submissionId: submission.id }, "Unable to sync report access state");
    }

    if (!accessPlan) {
      try {
        pricingQuotes = await getReportPriceQuotesForContext({
          pricingSessionId: tokenParsed?.success
            ? (tokenParsed.data.pricingSessionId ?? null)
            : sessionParsed?.success
              ? (sessionParsed.data.pricingSessionId ?? null)
              : null,
          reportSessionId: sessionParsed?.success ? sessionParsed.data.sessionId : null,
          reportToken: tokenParsed?.success ? tokenParsed.data.token : null,
          submissionId: submission.id,
          userAgent,
        });
      } catch (err) {
        logger.warn({ err, submissionId: submission.id }, "Unable to resolve report pricing");
      }
    }

    // 7. Build response — prefer v5 fields, fall back to v4
    return NextResponse.json({
      accessPlan,
      userName: getSubmissionUserName(submission),
      userEmail: getSubmissionUserEmail(submission),
      primaryArchetype: scoring.v5_primary_archetype || scoring.primary_archetype,
      percentages: scoring.v5_percentages || scoring.percentages || {},
      reportDate: submission.created_date_time,
      diagnostics: scoring.diagnostics ?? null,
      snapshotAnswers,
      pricingQuotes,
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
