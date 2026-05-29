import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { checkRateLimit, checkCooldown, getClientIp } from "@shared/http/ratelimit";
import { scheduleAfterResponse } from "@shared/http/after-response";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { verifyCsrfToken } from "@shared/http/csrf";
import logger from "@shared/observability/logger";
import { notifySlack, maskEmail, escapeSlack } from "@shared/observability/slack";
import { surveyCompleteEmail } from "@features/survey/server/emails/survey-complete";
import { surveyCompleteBEmail } from "@features/survey/server/emails/survey-complete-b";
import { buildUnsubscribeUrl } from "@shared/emails/unsubscribe-token";
import { isEmailSuppressed } from "@shared/emails/suppression";
import { pickEmailVariant } from "@shared/emails/ab-variant";
import { getEmailSiteUrl } from "@shared/emails/site-url";
import { ensurePersonalReportForSubmission } from "@features/report/server/personalReport";
import type { SurveyAnswers } from "@features/survey/server/types";
import {
  computeSurveyScoring,
  ensureSubmissionScored,
  isSurveyClosed,
  setSubmissionHotjarUserId,
  submitSurveyOnce,
} from "@features/survey/server/server";
import { isFeatureEnabled } from "@shared/flags/system-flags";

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
  hotjarUserId: z.string().max(64).optional().nullable(),
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
  // Server-Timing stage timestamps. Markers ship in the success response so
  // engineers can read per-stage durations from DevTools Network → Timing.
  const tStart = performance.now();

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

  // Survey-closed gate (F-04). Cached 30s. Fails open on Supabase trouble.
  if (await isSurveyClosed()) {
    return NextResponse.json({ error: "The survey is currently paused." }, { status: 409 });
  }

  // Kill switch (F-12). Admin flips `survey_submissions=false` for incident
  // containment without a redeploy.
  if (!(await isFeatureEnabled("survey_submissions"))) {
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }

  const parsed = surveySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const {
    email,
    firstName,
    answers,
    startedAt,
    durationMs,
    utmTracker,
    sessionId,
    hotjarUserId,
    website,
  } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedFirstName = firstName.trim();

  // R-09: stack two bot signals so a bot that scrubs the honeypot field
  // (after one reconnaissance request) is still caught by the duration
  // heuristic. A human cannot complete the 59-question survey in <10s.
  const MIN_HUMAN_DURATION_MS = 10_000;
  const failsHoneypot = Boolean(website);
  const failsDuration = durationMs < MIN_HUMAN_DURATION_MS;

  if (failsHoneypot || failsDuration) {
    const reason = failsHoneypot ? "honeypot_field" : "too_fast";
    const ip = getClientIp(request);
    scheduleAfterResponse("survey-honeypot-slack", () =>
      notifySlack({
        channel: "ops",
        kind: "honeypot_triggered",
        text: `:robot_face: Bot signal on /api/survey (${reason}) — IP ${escapeSlack(ip)} — email ${escapeSlack(maskEmail(normalizedEmail))} — duration ${durationMs}ms`,
        username: "ops_alerts",
      })
    );
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

  // End of gate (CSRF + rate limit + parse + cooldown). Scoring is sync.
  const tGate = performance.now();

  const questionCount = Object.keys(answers).filter((key) => !key.endsWith("_other")).length;
  const scoringResult = computeSurveyScoring(answers as SurveyAnswers);

  // Q16015 ("Would you like to receive free LoveIQ hints and insights?") —
  // marketing opt-in. "Yes, I want to keep learning about myself." → true,
  // "No, I am not interested in this growth opportunity." → false, anything
  // else (older clients, skipped question) → null.
  const q16015Answer = answers["16015"];
  const marketingOptIn: boolean | null =
    typeof q16015Answer === "string" ? q16015Answer.trim().toLowerCase().startsWith("yes") : null;

  try {
    const { submissionId, isExisting } = await submitSurveyOnce({
      email: normalizedEmail,
      firstName: normalizedFirstName,
      answers: answers as SurveyAnswers,
      startedAt,
      durationMs,
      utmTracker,
      sessionId,
      marketingOptIn,
    });
    const tSubmit = performance.now();

    // Marketing opt-in → push to the Resend Audience so the cohort exists for
    // future campaigns. Fire-and-forget — the 200 response must not block on
    // this. "No" answers do nothing here (option a): nurture emails about the
    // user's own report stay enabled; standard unsubscribe link still applies.
    if (marketingOptIn === true && !isExisting) {
      const audienceId = process.env.RESEND_AUDIENCE_ID;
      const resendClient = getResend();
      if (audienceId && resendClient) {
        scheduleAfterResponse("resend-audience-subscribe", async () => {
          try {
            await resendClient.contacts.create({
              email: normalizedEmail,
              firstName: normalizedFirstName,
              audienceId,
              unsubscribed: false,
            });
          } catch (err) {
            // Resend returns 422 for duplicate email — that's the common
            // case (re-submission with the same email) and is fine. Log
            // anything else for visibility; never escalates to the user.
            logger.warn(
              { err, submissionId },
              "marketing-opt-in: Resend contact create non-fatal failure"
            );
          }
        });
      } else if (!audienceId) {
        logger.warn(
          { submissionId },
          "marketing-opt-in: RESEND_AUDIENCE_ID is not set; skipping audience push"
        );
      }
    }

    // Bot signal: a real human cannot complete the assessment in under
    // 15 seconds. Fire a quiet ops ping for visibility — we don't block
    // the submission (false positives possible with the survey's resume
    // flow), just surface it so abuse patterns become traceable.
    const BOT_DURATION_MS = 15_000;
    if (
      !isExisting &&
      typeof durationMs === "number" &&
      durationMs > 0 &&
      durationMs < BOT_DURATION_MS
    ) {
      const ip = getClientIp(request);
      scheduleAfterResponse("survey-fast-completion-slack", () =>
        notifySlack({
          channel: "ops",
          // eslint-disable-next-line no-secrets/no-secrets -- alert kind label, not a secret
          kind: "survey_fast_completion",
          text: `:turtle: Survey completed in ${Math.round(durationMs / 1000)}s (likely bot) — submission #${submissionId} — IP ${escapeSlack(ip)} — ${escapeSlack(maskEmail(normalizedEmail))}`,
          username: "ops_alerts",
        })
      );
    }

    // Three independent post-submit writes run concurrently. Each only needs
    // submissionId (already in scope), writes a different table/column, and
    // has no data-flow dependency on the others. Failure semantics are
    // preserved per branch via try/catch or `.catch()`:
    //   - scoring: returns the summary or null on internal error (existing)
    //   - hotjar PATCH: lib swallows failures internally; defensive .catch keeps Promise.all alive
    //   - report-token POST: failure clears reportToken so the response omits it
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    let reportToken: string | undefined =
      supabaseUrl && serviceKey ? generateReportToken() : undefined;

    const reportTokenPromise: Promise<void> =
      reportToken && supabaseUrl && serviceKey
        ? fetchWithTimeout(`${supabaseUrl}/rest/v1/report_access_token`, {
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
          })
            .then((res) => {
              if (!res.ok) {
                // warn-not-error: best-effort token creation, route degrades
                // gracefully by setting reportToken = undefined. The user
                // still gets their submission saved; share URL just unset.
                logger.warn({ status: res.status }, "Failed to create report access token");
                reportToken = undefined;
              }
            })
            .catch((err) => {
              logger.warn({ err }, "Error creating report access token");
              reportToken = undefined;
            })
        : Promise.resolve();

    const hotjarPromise: Promise<void> =
      !isExisting && hotjarUserId
        ? setSubmissionHotjarUserId(submissionId, hotjarUserId).catch(() => {
            // setSubmissionHotjarUserId already swallows internally; defensive
            // catch here keeps Promise.all alive if that ever changes.
          })
        : Promise.resolve();

    const [scoringSummary] = await Promise.all([
      ensureSubmissionScored(submissionId, answers as SurveyAnswers, scoringResult),
      hotjarPromise,
      reportTokenPromise,
    ]);

    // End of user-blocking work. Everything below is fire-and-forget via
    // scheduleAfterResponse and does not affect response latency.
    const tPost = performance.now();

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

    // Once the submission is persisted, the partial-save row is dead weight
    // and contains PII (raw answers). Delete it so we don't retain abandoned
    // drafts past the point of need. A pg_cron job sweeps any stragglers
    // (e.g. session_id mismatch or pre-cleanup-deploy rows).
    if (sessionId) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && serviceKey) {
        scheduleAfterResponse("survey-partial-cleanup", async () => {
          try {
            await fetchWithTimeout(
              `${supabaseUrl}/rest/v1/survey_partial_save?session_id=eq.${encodeURIComponent(
                sessionId
              )}`,
              {
                method: "DELETE",
                headers: {
                  apikey: serviceKey,
                  Authorization: `Bearer ${serviceKey}`,
                  Prefer: "return=minimal",
                },
                timeoutMs: 5000,
              }
            );
          } catch (err) {
            logger.warn({ err, sessionId, submissionId }, "Failed to delete partial save");
          }
        });
      }
    }

    scheduleAfterResponse("survey-complete-email", async () => {
      if (isExisting) return;

      const resend = getResend();
      if (!resend) {
        logger.warn({ submissionId }, "RESEND_API_KEY missing — skipping survey completion email");
        return;
      }

      if (await isEmailSuppressed(normalizedEmail)) {
        logger.info({ submissionId }, "survey-complete: skip suppressed recipient");
        return;
      }

      const siteUrl = getEmailSiteUrl();
      const reportUrl = reportToken
        ? `${siteUrl}/report/${encodeURIComponent(reportToken)}`
        : `${siteUrl}/report`;

      const unsubSecret = process.env.UNSUBSCRIBE_SECRET;
      const unsubscribeUrl = unsubSecret
        ? buildUnsubscribeUrl(normalizedEmail, siteUrl, unsubSecret)
        : undefined;

      const variant = pickEmailVariant(normalizedEmail, "survey-complete");
      const tpl =
        variant === "b"
          ? surveyCompleteBEmail({
              firstName: normalizedFirstName,
              reportUrl,
              siteUrl,
              unsubscribeUrl,
            })
          : surveyCompleteEmail({
              firstName: normalizedFirstName,
              reportUrl,
              siteUrl,
              unsubscribeUrl,
            });

      try {
        const { error } = await Promise.race([
          resend.emails.send({
            from: process.env.RESEND_FROM || "LoveIQ <hello@loveiq.org>",
            to: normalizedEmail,
            replyTo: process.env.RESEND_REPLY_TO || "hello@loveiq.org",
            subject: tpl.subject,
            html: tpl.html,
            text: tpl.text,
            headers: {
              "X-LoveIQ-Variant": variant,
              ...(unsubscribeUrl && {
                "List-Unsubscribe": `<${unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              }),
            },
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Resend timeout")), 8_000)
          ),
        ]);
        if (error) {
          // warn-not-error: best-effort post-response email. Submission is
          // already persisted; nurture-sequence cron picks up unviewed
          // reports anyway. Resend-side outages are caught by their own
          // alerting; per-recipient failures here don't warrant a page.
          logger.warn({ error, submissionId, variant }, "Survey complete email send failed");
        } else {
          logger.info({ submissionId, variant }, "Survey complete email sent");
        }
      } catch (err) {
        logger.warn({ err, submissionId, variant }, "Survey complete email error");
      }
    });

    // Per-stage timing in Server-Timing format. Header name is X-Server-Timing
    // rather than Server-Timing because Vercel's edge strips Server-Timing
    // from Function responses (see vercel/next.js#12382, discussion #62353).
    // Visible in DevTools Network → Headers → Response Headers.
    const serverTiming = [
      `gate;dur=${(tGate - tStart).toFixed(1)}`,
      `submit;dur=${(tSubmit - tGate).toFixed(1)}`,
      `post-submit;dur=${(tPost - tSubmit).toFixed(1)}`,
    ].join(", ");

    return NextResponse.json(
      {
        success: true,
        // submissionId lets the client pre-set the analytics_event submission
        // context (window.__loveiqReportSubmissionId) BEFORE PreReportWizard
        // mounts. Without it, wizard_slide_advanced events skip durable
        // persistence (silent — see persistAnalyticsEvent in features/analytics/client.ts).
        // The id is an internal auto-increment int; access to /report/* is still
        // gated by report_token, so exposing this int is not a security risk.
        submissionId,
        ...(reportToken ? { reportToken } : {}),
        ...(scoringSummary
          ? {
              primaryArchetype: scoringSummary.primaryArchetype,
              ...(scoringSummary.v5PrimaryArchetype
                ? { v5PrimaryArchetype: scoringSummary.v5PrimaryArchetype }
                : {}),
            }
          : {}),
      },
      {
        // The response carries a fresh report access token + the user's
        // primary archetype — never let intermediaries cache it.
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "X-Server-Timing": serverTiming,
        },
      }
    );
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
