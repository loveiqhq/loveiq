import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { checkRateLimit, checkCooldown, getClientIp } from "@/lib/ratelimit";
import { scheduleAfterResponse } from "@/lib/after-response";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { verifyCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";
import { surveyCompleteEmail } from "@/lib/emails/survey-complete";
import { ensurePersonalReportForSubmission } from "@/lib/report/personalReport";
import type { SurveyAnswers } from "@/lib/survey/types";
import {
  computeSurveyScoring,
  ensureSubmissionScored,
  submitSurveyOnce,
} from "@/lib/survey/server";

let _resend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

// eslint-disable-next-line no-secrets/no-secrets
const BASE62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generateReportToken(): string {
  const bytes = randomBytes(20);
  let token = "rpt_";
  for (const b of bytes) token += BASE62[b % BASE62.length];
  return token;
}

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

const notifySlackSurvey = async ({
  submissionId,
  sessionId,
  email,
  firstName,
  questionCount,
  durationMs,
}: {
  submissionId: number;
  sessionId: string | null;
  email: string;
  firstName: string;
  questionCount: number;
  durationMs: number;
}) => {
  const url = process.env.SLACK_SURVEY_WEBHOOK_URL;

  if (!url) {
    logger.warn(
      { submissionId, sessionId },
      "Slack webhook missing: set SLACK_SURVEY_WEBHOOK_URL to enable survey alerts."
    );
    return;
  }

  const maskedEmail = email.replace(/^(.).+(@.+)$/, "$1***$2");
  const minutes = Math.round(durationMs / 60_000);
  const text = `Survey completed: *${firstName}* (${maskedEmail}) - ${questionCount} questions in ~${minutes} min`;

  try {
    logger.info({ submissionId, sessionId, maskedEmail }, "Sending Slack survey notification");
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, username: "survey_response" }),
      timeoutMs: 5000,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error(
        { submissionId, sessionId, status: res.status, body },
        "Slack survey webhook failed"
      );
    } else {
      logger.info({ submissionId, sessionId, status: res.status }, "Slack survey webhook sent");
    }
  } catch (err) {
    logger.error({ err, submissionId, sessionId }, "Slack survey webhook error");
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
    const scoringSummary = await ensureSubmissionScored(
      submissionId,
      answers as SurveyAnswers,
      scoringResult
    );

    // Generate permanent report access token (non-blocking — fire and forget)
    let reportToken: string | undefined;
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && serviceKey) {
        reportToken = generateReportToken();
        const tokenRes = await fetchWithTimeout(`${supabaseUrl}/rest/v1/report_access_token`, {
          method: "POST",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            token: reportToken,
            survey_submission_id: submissionId,
          }),
          timeoutMs: 5000,
        });
        if (!tokenRes.ok) {
          logger.error({ status: tokenRes.status }, "Failed to create report access token");
          reportToken = undefined;
        }
      }
    } catch (err) {
      logger.error({ err }, "Error creating report access token");
      reportToken = undefined;
    }

    scheduleAfterResponse("survey-slack-notification", async () => {
      if (isExisting) {
        logger.info(
          { submissionId, sessionId: sessionId ?? null, isExisting },
          "Skipping survey Slack notification for existing submission"
        );
        return;
      }

      await notifySlackSurvey({
        submissionId,
        sessionId: sessionId ?? null,
        email: normalizedEmail,
        firstName: normalizedFirstName,
        questionCount,
        durationMs,
      });
    });

    scheduleAfterResponse("personal-report-bootstrap", async () => {
      await ensurePersonalReportForSubmission({
        reportToken: reportToken ?? null,
        submissionId,
      });
    });

    scheduleAfterResponse("survey-complete-email", async () => {
      if (isExisting) return;

      const resend = getResend();
      if (!resend) {
        logger.warn({ submissionId }, "RESEND_API_KEY missing — skipping survey completion email");
        return;
      }

      const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://loveiq.org").replace(/\/$/, "");
      const reportUrl = reportToken
        ? `${siteUrl}/report/${encodeURIComponent(reportToken)}`
        : `${siteUrl}/report`;

      const tpl = surveyCompleteEmail({
        firstName: normalizedFirstName,
        reportUrl,
        siteUrl,
      });

      try {
        const { error } = await Promise.race([
          resend.emails.send({
            from: process.env.RESEND_FROM || "LoveIQ <hello@send.loveiq.org>",
            to: normalizedEmail,
            replyTo: process.env.RESEND_REPLY_TO || "hello@loveiq.org",
            subject: tpl.subject,
            html: tpl.html,
            text: tpl.text,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Resend timeout")), 8_000)
          ),
        ]);
        if (error) {
          logger.error({ error, submissionId }, "Survey complete email send failed");
        } else {
          logger.info({ submissionId }, "Survey complete email sent");
        }
      } catch (err) {
        logger.error({ err, submissionId }, "Survey complete email error");
      }
    });

    return NextResponse.json({
      success: true,
      ...(reportToken ? { reportToken } : {}),
      ...(scoringSummary
        ? {
            primaryArchetype: scoringSummary.primaryArchetype,
            ...(scoringSummary.v5PrimaryArchetype
              ? { v5PrimaryArchetype: scoringSummary.v5PrimaryArchetype }
              : {}),
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
