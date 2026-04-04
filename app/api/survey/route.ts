import { NextResponse, after } from "next/server";
import { z } from "zod";
import { checkRateLimit, checkCooldown, getClientIp } from "@/lib/ratelimit";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { verifyCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";
import type { SurveyAnswers } from "@/lib/survey/types";
import {
  computeSurveyScoring,
  ensureSubmissionScored,
  submitSurveyOnce,
} from "@/lib/survey/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const surveySchema = z.object({
  email: z.string().email().max(320),
  firstName: z.string().max(80),
  answers: z.record(
    z.string(),
    z.union([
      z.string().max(1000),
      z.array(z.string().max(500)).max(20),
      z.number().int().min(1).max(7),
    ])
  ),
  startedAt: z.string().datetime(),
  durationMs: z.number().int().min(0).max(86_400_000),
  utmTracker: z.string().max(500).optional().nullable(),
  sessionId: z.string().regex(UUID_RE).optional().nullable(),
  website: z.string().max(0).optional().nullable(),
});

const RATE_LIMIT_CONFIG = {
  bucket: "survey",
  limit: 3,
  windowMs: 60_000,
};

const EMAIL_COOLDOWN_MS = 300_000;

function scheduleAfterResponse(fn: () => Promise<void>): void {
  try {
    after(() => {
      void fn().catch((err) => {
        logger.error({ err }, "Post-submit background task failed");
      });
    });
  } catch {
    void fn().catch((err) => {
      logger.error({ err }, "Post-submit background task failed");
    });
  }
}

const notifySlackSurvey = async ({
  email,
  firstName,
  questionCount,
  durationMs,
}: {
  email: string;
  firstName: string;
  questionCount: number;
  durationMs: number;
}) => {
  const url = process.env.SLACK_SURVEY_WEBHOOK_URL;

  if (!url) {
    logger.warn("Slack webhook missing: set SLACK_SURVEY_WEBHOOK_URL to enable survey alerts.");
    return;
  }

  const maskedEmail = email.replace(/^(.).+(@.+)$/, "$1***$2");
  const minutes = Math.round(durationMs / 60_000);
  const text = `Survey completed: *${firstName}* (${maskedEmail}) - ${questionCount} questions in ~${minutes} min`;

  try {
    logger.info({ maskedEmail }, "Sending Slack survey notification");
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, username: "survey_response" }),
      timeoutMs: 5000,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error({ status: res.status, body }, "Slack survey webhook failed");
    } else {
      logger.info({ status: res.status }, "Slack survey webhook sent");
    }
  } catch (err) {
    logger.error({ err }, "Slack survey webhook error");
  }
};

export async function POST(request: Request) {
  const csrfValid = await verifyCsrfToken(request);
  if (!csrfValid) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

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

  const parsed = surveySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { email, firstName, answers, startedAt, durationMs, utmTracker, sessionId, website } =
    parsed.data;
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedFirstName = firstName.trim();

  if (website) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const cooldown = await checkCooldown(normalizedEmail, "survey-email", EMAIL_COOLDOWN_MS);
  if (!cooldown.allowed) {
    return NextResponse.json(
      { error: "Please wait before retrying." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(cooldown.retryAfterMs / 1000)) },
      }
    );
  }

  const questionCount = Object.keys(answers).filter((key) => !key.endsWith("_other")).length;
  const scoringResult = computeSurveyScoring(answers as SurveyAnswers);

  try {
    const { submissionId, isExisting } = await submitSurveyOnce({
      email: normalizedEmail,
      firstName: normalizedFirstName,
      answers: answers as SurveyAnswers,
      startedAt,
      durationMs,
      utmTracker,
      sessionId,
    });

    scheduleAfterResponse(async () => {
      await ensureSubmissionScored(submissionId, answers as SurveyAnswers, scoringResult);

      if (!isExisting) {
        await notifySlackSurvey({
          email: normalizedEmail,
          firstName: normalizedFirstName,
          questionCount,
          durationMs,
        });
      }
    });

    return NextResponse.json({
      success: true,
      ...(scoringResult
        ? {
            primaryArchetype: scoringResult.primaryArchetype,
            ...(scoringResult.v5 ? { v5PrimaryArchetype: scoringResult.v5.primaryArchetype } : {}),
          }
        : {}),
    });
  } catch (err) {
    if ((err as Error).message === "supabase_not_configured") {
      return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
    }

    if (
      (err as Error).message === "submit_survey_rpc_failed" ||
      (err as Error).message === "submit_survey_rpc_rejected" ||
      (err as Error).message === "submit_survey_rpc_missing_submission_id"
    ) {
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }

    logger.error({ err }, "Supabase error on survey submission");
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }
}
