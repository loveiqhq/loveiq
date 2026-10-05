/**
 * GET /api/cron/invite-reminders
 *
 * Scheduled job that nudges paid users (Full Report or All Reports) to refer a
 * friend via the in-product Refer-a-Friend modal. Two reminder windows:
 *
 *   - Reminder 1 (Figma 6190-1182, "Could this help a friend?"):
 *       3..7 days after a successful purchase.
 *   - Reminder 2 (Figma 6190-1891, "Don't your friends deserve to know too?"):
 *       7..21 days after a successful purchase.
 *
 * Skip rules:
 *   - User has already sent at least one invite (any invite_event row matches
 *     the user's email as referrer_email).
 *   - 365-day cooldown per (user-email, reminder-bucket) prevents re-sends.
 *
 * Protected by `Authorization: Bearer ${CRON_SECRET}` (same scheme as
 * survey-paused cron).
 */

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { checkCooldown } from "@shared/http/ratelimit";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { recordCronRun, startCronTimer } from "@shared/observability/slack-alert-dedup";
import { getBreaker } from "@shared/http/circuit-breaker";
import logger from "@shared/observability/logger";
import { inviteReminder1Email } from "@features/invite/emails/invite-reminder-1";
import { inviteReminder2Email } from "@features/invite/emails/invite-reminder-2";
import { getEmailSiteUrl } from "@shared/emails/site-url";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import { buildUnsubscribeUrl } from "@shared/emails/unsubscribe-token";
import { isEmailSuppressed } from "@shared/emails/suppression";

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Fail-safe before Vercel's 60s default so a stuck send surfaces as our
// own 504 with telemetry instead of a silent kill.
export const maxDuration = 50;

const REMINDER_1_MIN_DAYS = 3;
const REMINDER_1_MAX_DAYS = 7;
const REMINDER_2_MIN_DAYS = 7;
const REMINDER_2_MAX_DAYS = 21;
const COOLDOWN_MS = 365 * 24 * 60 * 60 * 1000;
const CANDIDATE_LIMIT = 200;
const SUPABASE_TIMEOUT_MS = 8_000;

let _resend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

interface PaidUserRow {
  id: number;
  payment_date_time: string;
  personal_report_id?: number | null;
  metadata: { plan?: string | null; reportToken?: string | null } | null;
  app_user: { email?: string | null; first_name?: string | null } | null;
}

async function supabaseGet(path: string) {
  const url = process.env.SUPABASE_URL;
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
      timeoutMs: SUPABASE_TIMEOUT_MS,
    })
  );
}

async function fetchPaidCandidates(): Promise<PaidUserRow[]> {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  // Fetch the full Reminder-2 window — narrowing per-reminder happens per row
  // so a single query handles both reminder steps.
  const minIso = new Date(now - REMINDER_2_MAX_DAYS * day).toISOString();
  const maxIso = new Date(now - REMINDER_1_MIN_DAYS * day).toISOString();

  const path =
    `/rest/v1/payment` +
    `?status=eq.succeeded` +
    `&payment_date_time=gte.${encodeURIComponent(minIso)}` +
    `&payment_date_time=lte.${encodeURIComponent(maxIso)}` +
    `&select=id,payment_date_time,personal_report_id,metadata,app_user!fk_payment_user(email,first_name)` +
    `&order=payment_date_time.desc` +
    `&limit=${CANDIDATE_LIMIT}`;

  const response = await supabaseGet(path);
  if (!response.ok) {
    throw new Error(`payment_query_failed:${response.status}`);
  }
  return (await response.json()) as PaidUserRow[];
}

const REPORT_TOKEN_RE = /^rpt_[A-Za-z0-9]{20}$/;

/** The newest token matching `filter` that /api/report would still accept. */
async function liveReportToken(filter: string): Promise<string | null> {
  // The same test as /api/report: not revoked, and not expired.
  const live = `&revoked_at=is.null&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(new Date().toISOString())})`;
  const res = await supabaseGet(
    `/rest/v1/report_access_token?${filter}${live}&select=token&order=created_at.desc&limit=1`
  );
  // A refused lookup is a failure, not "no link": see the loop.
  if (!res.ok) throw new Error(`report_token_lookup_failed:${res.status}`);
  const token = ((await res.json()) as Array<{ token?: string }>)[0]?.token;
  return typeof token === "string" && REPORT_TOKEN_RE.test(token) ? token : null;
}

/**
 * The buyer's own report link, one that still opens. Checkout records it on the payment;
 * older payments, and a recorded token revoked since, are looked up through their
 * report's submission, as fulfillment does.
 */
async function reportTokenForPayment(row: PaidUserRow): Promise<string | null> {
  const recorded = row.metadata?.reportToken;
  if (typeof recorded === "string" && REPORT_TOKEN_RE.test(recorded)) {
    const token = await liveReportToken(`token=eq.${encodeURIComponent(recorded)}`);
    if (token) return token;
  }
  if (!row.personal_report_id) return null;
  const report = await supabaseGet(
    `/rest/v1/personal_report?id=eq.${row.personal_report_id}&select=survey_submission_id&limit=1`
  );
  if (!report.ok) throw new Error(`personal_report_lookup_failed:${report.status}`);
  const submissionId = ((await report.json()) as Array<{ survey_submission_id?: number }>)[0]
    ?.survey_submission_id;
  if (!submissionId) return null;
  return liveReportToken(`survey_submission_id=eq.${submissionId}`);
}

async function hasSentInvite(email: string): Promise<boolean> {
  const path = `/rest/v1/invite_event?referrer_email=eq.${encodeURIComponent(email)}&select=id&limit=1`;
  const response = await supabaseGet(path);
  if (!response.ok) return false;
  const rows = (await response.json()) as Array<{ id: number }>;
  return rows.length > 0;
}

function reminderForAge(daysSincePurchase: number): 1 | 2 | null {
  if (daysSincePurchase >= REMINDER_2_MIN_DAYS && daysSincePurchase < REMINDER_2_MAX_DAYS) {
    // Prefer reminder 2 (later in funnel) when both windows overlap (7d).
    return 2;
  }
  if (daysSincePurchase >= REMINDER_1_MIN_DAYS && daysSincePurchase < REMINDER_1_MAX_DAYS) {
    return 1;
  }
  return null;
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

  const trackDuration = startCronTimer("invite-reminders", 50);
  const startMs = Date.now();
  let cronError: string | undefined;

  const siteUrl = getEmailSiteUrl();

  const summary = {
    candidates: 0,
    reminder1Sent: 0,
    reminder2Sent: 0,
    skippedNoEmail: 0,
    skippedAlreadyInvited: 0,
    skippedCooldown: 0,
    skippedOutOfWindow: 0,
    skippedWrongPlan: 0,
    skippedSuppressed: 0,
    skippedNoToken: 0,
    errors: 0,
  };

  try {
    const candidates = await fetchPaidCandidates();
    summary.candidates = candidates.length;

    for (const row of candidates) {
      const plan = row.metadata?.plan;
      if (plan !== "full_report" && plan !== "all_reports") {
        summary.skippedWrongPlan++;
        continue;
      }

      const email = row.app_user?.email?.toLowerCase().trim();
      const firstName = row.app_user?.first_name?.trim() || null;
      if (!email) {
        summary.skippedNoEmail++;
        continue;
      }

      if (await isEmailSuppressed(email)) {
        summary.skippedSuppressed++;
        continue;
      }

      const ageDays =
        (Date.now() - new Date(row.payment_date_time).getTime()) / (24 * 60 * 60 * 1000);
      const reminder = reminderForAge(ageDays);
      if (!reminder) {
        summary.skippedOutOfWindow++;
        continue;
      }

      if (await hasSentInvite(email)) {
        summary.skippedAlreadyInvited++;
        continue;
      }

      // Deep-link into the Refer-a-Friend modal on the buyer's OWN report. It was bare
      // /report, which works only in the browser that took the survey: anywhere else
      // (another device, a mail app's browser, storage Safari cleared after 7 days)
      // it showed "Can't find your report", and on a shared device another person's
      // report. `from=email` softens the forced-paywall arm (see
      // resolveReportPaywallCohort) so the invite modal can open. No link, no email.
      let reportToken: string | null;
      try {
        reportToken = await reportTokenForPayment(row);
      } catch (err) {
        // A failed lookup is an error, not "no link", and costs only this buyer: the run
        // carries on, and with the cooldown taken after it, tomorrow's run tries again.
        summary.errors++;
        logger.error({ err, paymentId: row.id }, "invite-reminders: report link lookup failed");
        continue;
      }
      if (!reportToken) {
        summary.skippedNoToken++;
        logger.warn({ paymentId: row.id }, "invite-reminders: no report link for a buyer");
        continue;
      }
      const inviteCtaUrl = `${siteUrl}/report/${encodeURIComponent(reportToken)}?invite=1&from=email`;

      // After the link, never before: checkCooldown sets the year-long key as it checks,
      // so a lookup that failed after it cost the buyer their reminder for a year.
      const bucket = reminder === 1 ? "invite-reminder-1" : "invite-reminder-2";
      const cooldown = await checkCooldown(email, bucket, COOLDOWN_MS);
      if (!cooldown.allowed) {
        summary.skippedCooldown++;
        continue;
      }

      const unsubSecret = process.env.UNSUBSCRIBE_SECRET;
      const unsubscribeUrl = unsubSecret
        ? buildUnsubscribeUrl(email, siteUrl, unsubSecret, `invite_reminder_${reminder}`)
        : undefined;

      const tpl =
        reminder === 1
          ? inviteReminder1Email({ firstName, inviteCtaUrl, siteUrl, unsubscribeUrl })
          : inviteReminder2Email({ firstName, inviteCtaUrl, siteUrl, unsubscribeUrl });

      try {
        const { error } = await Promise.race([
          resend.emails.send({
            from: process.env.RESEND_FROM || "LoveIQ <hello@loveiq.org>",
            to: email,
            replyTo: process.env.RESEND_REPLY_TO || "hello@loveiq.org",
            subject: tpl.subject,
            html: tpl.html,
            text: tpl.text,
            headers: {
              "X-LoveIQ-Reminder": String(reminder),
              // P-06: dedicated list identity for per-list reputation in
              // Gmail/Outlook; Precedence:bulk suppresses auto-responders.
              "List-ID": "LoveIQ Invite Reminders <invite-reminders.send.loveiq.org>",
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
          logger.error({ error, paymentId: row.id, reminder }, "Invite reminder send failed");
        } else if (reminder === 1) {
          summary.reminder1Sent++;
        } else {
          summary.reminder2Sent++;
        }
      } catch (err) {
        summary.errors++;
        logger.error({ err, paymentId: row.id, reminder }, "Invite reminder error");
      }
    }

    logger.info(summary, "Invite-reminders cron finished");
    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    logger.error({ err }, "Invite-reminders cron failed");
    cronError = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  } finally {
    await trackDuration();
    await recordCronRun("invite-reminders", startMs, cronError ? "error" : "success", cronError);
  }
}
