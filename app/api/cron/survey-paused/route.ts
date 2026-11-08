/**
 * GET /api/cron/survey-paused
 *
 * Scheduled job that sends the "paused survey" email to users who started but
 * did not finish the survey. Protected by `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Windowing:
 *   - Candidate: saved_at between (now-24h) and (now-1h)
 *     — skip anything older to avoid spamming stale abandons
 *     — skip anything newer to give users time to return on their own
 *   - Must have email captured (answers["00000"])
 *   - Must have no matching survey_submission by session_id
 *   - Deduped per session AND per email address via checkCooldown (30-day cooldown)
 */

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { checkCooldown } from "@shared/http/ratelimit";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { getBreaker } from "@shared/http/circuit-breaker";
import logger from "@shared/observability/logger";
import { recordCronRun, startCronTimer } from "@shared/observability/slack-alert-dedup";
import { surveyPausedEmail } from "@features/survey/server/emails/survey-paused";
import { surveyPausedBEmail } from "@features/survey/server/emails/survey-paused-b";
import { getEmailSiteUrl } from "@shared/emails/site-url";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import { emailExperimentTags, pickEmailVariant } from "@shared/emails/ab-variant";
import { buildUnsubscribeUrl, UNSUBSCRIBE_CAMPAIGNS } from "@shared/emails/unsubscribe-token";
import { isEmailSuppressed } from "@shared/emails/suppression";
import { getSurveyContactInfo } from "@features/survey/server/utils";
import type { SurveyAnswers } from "@features/survey/server/types";
import { supabaseRestUrl } from "@shared/env/supabase-urls";
import { EMAIL_LINKS, tagEmailLink } from "@shared/emails/email-link";
import { surveyPausedEmail as surveyPausedV2Email } from "@features/email-journeys/emails/survey-reminders";
import { EMAIL_STAGES, isEmailSwitchOn } from "@features/email-journeys/logic/catalog";
import { isPurchaseDraft } from "@features/email-journeys/server/journeys";
import { claimSend, settleClaim } from "@features/email-journeys/server/send";
import { countAnsweredQuestions } from "@features/survey/server/utils";

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Fail-safe before Vercel's 60s default so a stuck Supabase call surfaces
// as our own 504 with telemetry instead of a silent kill.
export const maxDuration = 50;

const PAUSE_AGE_MIN_MINUTES = 60;
const PAUSE_AGE_MAX_HOURS = 24;
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const CANDIDATE_LIMIT = 100;

// P-04: per-request SIGTERM flag — set by the listener installed in GET,
// cleared in finally. Stops the candidate loop cleanly when Vercel rolls
// the Lambda mid-cron.
let terminated = false;

let _resend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

interface PartialSaveRow {
  session_id: string;
  answers: Record<string, unknown> | null;
  saved_at: string;
}

async function supabaseGet(path: string) {
  const url = supabaseRestUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("supabase_not_configured");

  return getBreaker("supabase").fire(() =>
    fetchWithTimeout(`${url}${path}`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      method: "GET",
      timeoutMs: 8_000,
    })
  );
}

async function fetchCandidates(): Promise<PartialSaveRow[]> {
  const now = Date.now();
  const minAgeIso = new Date(now - PAUSE_AGE_MIN_MINUTES * 60 * 1000).toISOString();
  const maxAgeIso = new Date(now - PAUSE_AGE_MAX_HOURS * 60 * 60 * 1000).toISOString();

  const path = `/rest/v1/survey_partial_save?saved_at=lte.${encodeURIComponent(minAgeIso)}&saved_at=gte.${encodeURIComponent(maxAgeIso)}&select=session_id,answers,saved_at&order=saved_at.desc&limit=${CANDIDATE_LIMIT}`;
  const response = await supabaseGet(path);
  if (!response.ok) {
    throw new Error(`survey_partial_save_query_failed:${response.status}`);
  }
  return (await response.json()) as PartialSaveRow[];
}

/**
 * A paid pay-to-start purchase (or the older prepaid checkout) this address has not used
 * yet: its survey belongs to the purchase, and only the confirmation email's continue link
 * carries it to another browser. This email's bare /survey link would start a free survey
 * there, and its report would come back locked although paid for.
 */
async function hasUnusedPrepaidPurchase(email: string): Promise<boolean> {
  const path = `/rest/v1/prepaid_report_access?customer_email=eq.${encodeURIComponent(email.trim().toLowerCase())}&status=eq.succeeded&consumed_submission_id=is.null&select=id&limit=1`;
  const response = await supabaseGet(path);
  if (!response.ok) return false;
  const rows = (await response.json()) as Array<{ id: number }>;
  return rows.length > 0;
}

async function isSubmitted(sessionId: string): Promise<boolean> {
  const path = `/rest/v1/survey_submission?session_id=eq.${encodeURIComponent(sessionId)}&select=id&limit=1`;
  const response = await supabaseGet(path);
  if (!response.ok) return false;
  const rows = (await response.json()) as Array<{ id: number }>;
  return rows.length > 0;
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const auth = request.headers.get("authorization") || "";
  if (!safeCompare(auth, `Bearer ${expected}`)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 401 });
  }

  // Skip on the staging Vercel project (shares the prod DB).
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const resend = getResend();
  if (!resend) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const trackDuration = startCronTimer("survey-paused", 50);
  const startMs = Date.now();
  let cronError: string | undefined;

  // P-04: one-shot SIGTERM listener.
  terminated = false;
  const onSigterm = () => {
    terminated = true;
    logger.warn("survey-paused: SIGTERM received");
  };
  process.once("SIGTERM", onSigterm);

  const siteUrl = getEmailSiteUrl();
  const resumeUrl = tagEmailLink(`${siteUrl}/survey`, EMAIL_LINKS.surveyPaused);

  const summary = {
    candidates: 0,
    sent: 0,
    skippedSubmitted: 0,
    skippedCooldown: 0,
    skippedSuppressed: 0,
    skippedPrepaid: 0,
    errors: 0,
  };
  // R1 redesigned (features/email-journeys), behind its switch: one email, no A/B.
  const redesign = await isEmailSwitchOn("r1");
  // A buyer's linked draft is left to pay to start's own reminders only once they are on;
  // until then the draft is treated as today.
  const buyersRemindedElsewhere = await isEmailSwitchOn("ptsReminders");

  try {
    const candidates = await fetchCandidates();
    summary.candidates = candidates.length;

    for (const row of candidates) {
      if (terminated) {
        logger.warn(
          { processed: summary.sent + summary.errors, total: candidates.length },
          "survey-paused: SIGTERM received mid-loop; exiting"
        );
        break;
      }
      const answers = (row.answers ?? {}) as SurveyAnswers;
      const { email, firstName } = getSurveyContactInfo(answers);
      if (!email) continue;

      if (await isEmailSuppressed(email)) {
        summary.skippedSuppressed++;
        continue;
      }

      if (await isSubmitted(row.session_id)) {
        summary.skippedSubmitted++;
        continue;
      }

      // A pay-to-start buyer's draft is theirs: their reminders go to the address they paid
      // with, with their continue link (the email journeys' job), never to this one.
      // An unreadable link reads as no link: today's R1 goes, as it did before the link existed.
      if (
        (await hasUnusedPrepaidPurchase(email)) ||
        (buyersRemindedElsewhere && (await isPurchaseDraft(row.session_id).catch(() => false)))
      ) {
        summary.skippedPrepaid++;
        continue;
      }

      // Per draft AND per address. The draft key stops the hourly run re-sending
      // one draft; the address key stops two drafts from one person (two tabs, a
      // restart) each getting the same email, seconds apart in one run.
      const cooldown = await checkCooldown(row.session_id, "survey-paused-email", COOLDOWN_MS);
      const perAddress = cooldown.allowed
        ? await checkCooldown(email, "survey-paused-address", COOLDOWN_MS)
        : cooldown;
      if (!perAddress.allowed) {
        summary.skippedCooldown++;
        continue;
      }

      const unsubSecret = process.env.UNSUBSCRIBE_SECRET;
      const unsubscribeUrl = unsubSecret
        ? buildUnsubscribeUrl(email, siteUrl, unsubSecret, UNSUBSCRIBE_CAMPAIGNS.surveyPaused)
        : undefined;

      /**
       * Recorded in email_journey_send before it goes, whatever the switch: R2 goes only after
       * an R1 (features/email-journeys). A draft already recorded there is not sent again; a
       * claim that can't be written leaves today's cooldown as the only guard, as before.
       */
      let claimId: number | null = null;
      try {
        claimId = await claimSend({
          emailKey: EMAIL_STAGES.r1,
          target: `session:${row.session_id}`,
        });
        if (claimId === null) {
          summary.skippedCooldown++;
          continue;
        }
      } catch (err) {
        logger.warn({ err, sessionId: row.session_id }, "survey-paused: R1 not recorded");
      }

      const experiment = redesign ? null : "survey-paused";
      const variant = experiment ? pickEmailVariant(email, experiment) : "a";
      const tpl = redesign
        ? surveyPausedV2Email({
            firstName,
            answered: countAnsweredQuestions(row.answers),
            resumeUrl,
            siteUrl,
            unsubscribeUrl,
          })
        : variant === "b"
          ? surveyPausedBEmail({ firstName, resumeUrl, siteUrl, unsubscribeUrl })
          : surveyPausedEmail({ firstName, resumeUrl, siteUrl, unsubscribeUrl });

      try {
        const { data, error } = await Promise.race([
          resend.emails.send({
            from: process.env.RESEND_FROM || "LoveIQ <hello@loveiq.org>",
            to: email,
            replyTo: process.env.RESEND_REPLY_TO || "hello@loveiq.org",
            subject: tpl.subject,
            html: tpl.html,
            text: tpl.text,
            // Echoed back on every Resend webhook, which is how the A/B result is read; the
            // redesign's `stage` keeps its delivery, opens and clicks (no `sub`: no survey yet).
            tags: experiment
              ? emailExperimentTags(experiment, variant)
              : [{ name: "stage", value: EMAIL_STAGES.r1 }],
            headers: {
              "X-LoveIQ-Variant": variant,
              // P-06: dedicated list identity for per-list reputation in
              // Gmail/Outlook; Precedence:bulk suppresses auto-responders.
              "List-ID": "LoveIQ Survey-Paused <survey-paused.send.loveiq.org>",
              Precedence: "bulk",
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
          summary.errors++;
          // Per-message Resend failure inside a batch cron — captured in
          // `summary.errors` and visible in structured logs. Not Slack-worthy
          // for a single send; the outer cron-level try/catch still escalates
          // a whole-cron failure as api_5xx.
          logger.warn({ error, sessionId: row.session_id, variant }, "Paused email send failed");
          if (claimId !== null) {
            const status = (error as { statusCode?: number | null }).statusCode;
            await settleClaim(claimId, {
              sent: false,
              retry: status === 429,
              reason: String((error as { message?: string }).message ?? "send failed"),
            });
          }
        } else {
          summary.sent++;
          if (claimId !== null)
            await settleClaim(claimId, { sent: true, resendId: data?.id ?? null });
        }
      } catch (err) {
        summary.errors++;
        if (claimId !== null) {
          await settleClaim(claimId, { sent: false, retry: false, reason: "send threw" });
        }
        // Same rationale: one timed-out send shouldn't ping ops. Whole-cron
        // failures still alert via the outer cron-level catch.
        logger.warn({ err, sessionId: row.session_id, variant }, "Paused email error");
      }
    }

    logger.info(summary, "Survey-paused cron finished");
    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    logger.error({ err }, "Survey-paused cron failed");
    cronError = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  } finally {
    process.off("SIGTERM", onSigterm);
    await trackDuration();
    await recordCronRun("survey-paused", startMs, cronError ? "error" : "success", cronError);
  }
}
