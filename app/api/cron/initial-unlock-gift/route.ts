/**
 * E07, the day-1 gift (Pre-unlock, Notion "RFD > Pre-Unlock"; Figma Report-3.0 1669:2835). Day 1,
 * not the board's day 4: Marcus, LoveIQ Sync 27 Oct 2026 ("one day post-survey").
 *
 * Hourly. A reader the EUR 1.99 gate stopped (`personal_report.initial_gate_seen_at`, its
 * first view) who has paid nothing a day on gets one of two arms
 * (shared/experiments/initialGiftArm.ts), written to `personal_report.initial_gift_arm`:
 *   - gift (80%): the initial unlock as a EUR 0 payment (features/report/server/
 *     initialUnlockGift.ts) and E07, "We unlocked your Core Archetype for you";
 *   - holdout (20%): nothing, the arm only, so the gift can be read against them.
 *
 * Safe to rerun. The arm is written with `initial_gift_arm=is.null`, so a report is
 * treated by one run alone; the send is claimed with `initial_gift_sent_at=is.null` BEFORE
 * it goes out, as the nurture email does (F-06): a lost send is preferred to a double one.
 * A gift that could not be written gives its arm back, and the next run tries again.
 *
 * Who is looked at: reports first gated between one and two days ago, with no arm. A
 * reader who paid (a refund or a dispute included), unsubscribed, bounced or froze their
 * data (GDPR Art. 18) is left alone and given no arm, so they are in neither group, and so
 * is a report whose person already has an arm on another report: a retake is not a second
 * draw, and one person gets one E07. The day-wide window lets one missed tick be caught on
 * the next, and lets them age out instead of being re-read for good.
 *
 * Behind `initial_unlock_gift_email` (system_flags, off by default), and production only.
 */

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { initialUnlockGiftEmail } from "@features/report/server/emails/initial-unlock-gift";
import { isInitialGiftEmailEnabled } from "@features/report/server/initialGateState";
import { grantGiftedInitialUnlock } from "@features/report/server/initialUnlockGift";
import { INITIAL_UNLOCK_GIFT } from "@features/report/logic/initialUnlockGate";
import { assignInitialGiftArm } from "@shared/experiments/initialGiftArm";
import { suppressionState } from "@shared/emails/suppression";
import { getEmailSiteUrl } from "@shared/emails/site-url";
import { buildUnsubscribeUrl, UNSUBSCRIBE_CAMPAIGNS } from "@shared/emails/unsubscribe-token";
import { getBreaker } from "@shared/http/circuit-breaker";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import logger from "@shared/observability/logger";
import { recordCronRun, startCronTimer } from "@shared/observability/slack-alert-dedup";

export const maxDuration = 60;

const SUPABASE_TIMEOUT_MS = 8_000;
const RESEND_TIMEOUT_MS = 10_000;
const DAY_MS = 24 * 3_600_000;
const GIFT_AFTER_MS = DAY_MS;
const WINDOW_MS = DAY_MS;
/**
 * E07 says "Yesterday you answered…" only when the survey was that recent. The gate counts
 * from its first view, and a report can meet it long after its survey: a first open days
 * later, or the old-user campaign's stamped reports (docs/runbooks/PRE_UNLOCK.md).
 */
const ANSWERED_YESTERDAY_MS = 36 * 3_600_000;
/**
 * Readers left alone keep no arm and stay in the window for its day, read again each hour,
 * oldest first: the page is wide enough that they never crowd out the ones still to draw
 * (the run's 20 s walk budget stops it early, and the next hour carries on).
 */
const CANDIDATE_LIMIT = 100;
/** The Resend `stage` tag the webhook keeps this email's delivery, opens and clicks by. */
const STAGE = "initial_gift";

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

let _resend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("supabase_not_configured");
  return { url, serviceRoleKey };
}

async function supabaseFetch(
  path: string,
  init: { body?: string; headers?: Record<string, string>; method?: string } = {}
) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const { body, headers = {}, method = "GET" } = init;
  return getBreaker("supabase").fire(() =>
    fetchWithTimeout(`${url}${path}`, {
      body,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        ...headers,
      },
      method,
      timeoutMs: SUPABASE_TIMEOUT_MS,
    })
  );
}

interface CandidateRow {
  id: number;
  survey_submission_id: number;
  initial_gate_seen_at: string;
  survey_submission?: {
    user_id?: number | null;
    created_date_time?: string | null;
    app_user?: {
      email?: string | null;
      first_name?: string | null;
      processing_restricted_at?: string | null;
    } | null;
  } | null;
}

async function fetchCandidates(nowMs: number): Promise<CandidateRow[]> {
  const seenBy = new Date(nowMs - GIFT_AFTER_MS).toISOString();
  const seenAfter = new Date(nowMs - GIFT_AFTER_MS - WINDOW_MS).toISOString();
  const path =
    `/rest/v1/personal_report` +
    `?initial_gate_seen_at=lte.${encodeURIComponent(seenBy)}` +
    `&initial_gate_seen_at=gt.${encodeURIComponent(seenAfter)}` +
    `&initial_gift_arm=is.null` +
    `&select=id,survey_submission_id,initial_gate_seen_at,` +
    `survey_submission!fk_personal_report_submission(user_id,created_date_time,app_user!fk_survey_submission_user(email,first_name,processing_restricted_at))` +
    `&order=initial_gate_seen_at.asc` +
    `&limit=${CANDIDATE_LIMIT}`;
  const r = await supabaseFetch(path);
  if (!r.ok) throw new Error(`personal_report_query_failed:${r.status}`);
  return (await r.json()) as CandidateRow[];
}

/**
 * Whether the reader paid anything since: any payment but the gift itself that took money,
 * refunded or disputed ones included, so a EUR 1.99 refunded under the guarantee (or
 * charged back) never comes back free on day 1. A checkout left open (`canceled`) is not
 * a payment: E07 is for those readers. Null when it can't be read; the report waits.
 */
async function hasPaid(personalReportId: number): Promise<boolean | null> {
  const r = await supabaseFetch(
    `/rest/v1/payment?personal_report_id=eq.${personalReportId}&status=in.(succeeded,refunded,disputed)&select=metadata&limit=50`
  );
  if (!r.ok) return null;
  const rows = (await r.json()) as Array<{ metadata: Record<string, unknown> | null }>;
  return rows.some((row) => row.metadata?.gifted !== INITIAL_UNLOCK_GIFT);
}

/**
 * Whether the person already has an arm on another of their reports (a retake). Null when it
 * can't be read; the report waits.
 */
async function hasArmElsewhere(personalReportId: number, userId: number): Promise<boolean | null> {
  const r = await supabaseFetch(
    `/rest/v1/personal_report?id=neq.${personalReportId}&initial_gift_arm=not.is.null` +
      `&select=id,survey_submission!fk_personal_report_submission!inner(user_id)` +
      `&survey_submission.user_id=eq.${userId}&limit=1`
  );
  if (!r.ok) return null;
  return ((await r.json()) as unknown[]).length > 0;
}

async function fetchAccessToken(submissionId: number): Promise<string | null> {
  // As the nurture email (F-17): a revoked or expiring link is worse than no email.
  const nowIso = encodeURIComponent(new Date().toISOString());
  const path =
    `/rest/v1/report_access_token` +
    `?survey_submission_id=eq.${submissionId}` +
    `&revoked_at=is.null&token=not.is.null` +
    `&or=(expires_at.is.null,expires_at.gt.${nowIso})` +
    `&select=token&limit=1`;
  const r = await supabaseFetch(path);
  if (!r.ok) return null;
  const rows = (await r.json()) as Array<{ token: string | null }>;
  return rows[0]?.token ?? null;
}

/** A conditional PATCH on the report: true when this run's write landed. */
async function patchReport(
  personalReportId: number,
  condition: string,
  body: Record<string, unknown>
): Promise<boolean> {
  const r = await supabaseFetch(`/rest/v1/personal_report?id=eq.${personalReportId}&${condition}`, {
    body: JSON.stringify(body),
    headers: { Prefer: "return=representation" },
    method: "PATCH",
  });
  if (!r.ok) throw new Error(`personal_report_patch_failed:${r.status}`);
  return ((await r.json()) as unknown[]).length > 0;
}

interface Summary {
  candidates: number;
  gifted: number;
  heldOut: number;
  skippedPaid: number;
  /** The person already has an arm on another report (a retake). */
  skippedEarlierReport: number;
  skippedSuppressed: number;
  skippedRestricted: number;
  skippedNoEmail: number;
  skippedNoToken: number;
  /** Another run assigned or sent first. */
  skippedTaken: number;
  failed: number;
}

interface RunContext {
  resend: Resend;
  siteUrl: string;
  unsubSecret: string | undefined;
  summary: Summary;
}

async function processCandidate(candidate: CandidateRow, ctx: RunContext): Promise<void> {
  const { summary } = ctx;
  const user = candidate.survey_submission?.app_user;
  if (user?.processing_restricted_at) {
    summary.skippedRestricted++;
    return;
  }
  const email = user?.email?.trim() ?? "";
  const userId = candidate.survey_submission?.user_id ?? null;
  if (!email || !userId) {
    summary.skippedNoEmail++;
    return;
  }

  const paid = await hasPaid(candidate.id);
  if (paid === null) {
    summary.failed++;
    return;
  }
  if (paid) {
    summary.skippedPaid++;
    return;
  }
  const earlier = await hasArmElsewhere(candidate.id, userId);
  if (earlier === null) {
    summary.failed++;
    return;
  }
  if (earlier) {
    summary.skippedEarlierReport++;
    return;
  }
  // E07 sells (its P.S. is the EUR 10 off): an address that can't be checked waits, as the
  // unlock-feedback email's does, rather than reaching someone who unsubscribed.
  const suppression = await suppressionState(email);
  if (suppression === "unknown") {
    summary.failed++;
    return;
  }
  if (suppression === "suppressed") {
    summary.skippedSuppressed++;
    return;
  }
  const reportToken = await fetchAccessToken(candidate.survey_submission_id);
  if (!reportToken) {
    summary.skippedNoToken++;
    return;
  }

  const arm = assignInitialGiftArm(candidate.id);
  if (!(await patchReport(candidate.id, "initial_gift_arm=is.null", { initial_gift_arm: arm }))) {
    summary.skippedTaken++;
    return;
  }
  if (arm === "holdout") {
    summary.heldOut++;
    return;
  }

  const giftId = await grantGiftedInitialUnlock({ personalReportId: candidate.id, userId, email });
  if (giftId === null) {
    // Given back, so the next run tries again; if that write fails too, the report keeps
    // an arm without its gift and is logged for a person.
    await patchReport(candidate.id, "initial_gift_arm=eq.gift", { initial_gift_arm: null }).catch(
      (err: unknown) =>
        logger.error(
          { err, personalReportId: candidate.id },
          "initial-unlock-gift: gift arm kept without its gift"
        )
    );
    summary.failed++;
    return;
  }

  const claimed = await patchReport(candidate.id, "initial_gift_sent_at=is.null", {
    initial_gift_sent_at: new Date().toISOString(),
  });
  if (!claimed) {
    summary.skippedTaken++;
    return;
  }

  const unsubscribeUrl = ctx.unsubSecret
    ? buildUnsubscribeUrl(email, ctx.siteUrl, ctx.unsubSecret, UNSUBSCRIBE_CAMPAIGNS.initialGift)
    : undefined;
  const surveyAt = Date.parse(candidate.survey_submission?.created_date_time ?? "");
  const tpl = initialUnlockGiftEmail({
    answeredYesterday: Date.now() - surveyAt < ANSWERED_YESTERDAY_MS,
    firstName: user?.first_name?.trim() || null,
    reportUrl: `${ctx.siteUrl}/report/${encodeURIComponent(reportToken)}?from=email`,
    siteUrl: ctx.siteUrl,
    unsubscribeUrl,
  });
  try {
    const { error } = await Promise.race([
      ctx.resend.emails.send({
        from: process.env.RESEND_FROM || "LoveIQ <hello@loveiq.org>",
        to: email,
        replyTo: process.env.RESEND_REPLY_TO || "hello@loveiq.org",
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        headers: {
          "X-LoveIQ-Stage": STAGE,
          ...(unsubscribeUrl && {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }),
        },
        // Ids only, never the address: the webhook keeps this email's events by them.
        tags: [
          { name: "stage", value: STAGE },
          { name: "sub", value: String(candidate.survey_submission_id) },
        ],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Resend timeout")), RESEND_TIMEOUT_MS)
      ),
    ]);
    if (error) throw new Error(String((error as { message?: string }).message ?? "send failed"));
    summary.gifted++;
  } catch (err) {
    // The unlock stands; the reader finds it on their report. The claim stays, so no resend.
    logger.error(
      { err, personalReportId: candidate.id, slack: false },
      "initial-unlock-gift: send failed"
    );
    summary.failed++;
  }
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
  // Production only: a staging or preview deploy never grants or mails anything.
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }
  if (!(await isInitialGiftEmailEnabled().catch(() => false))) {
    // Recorded, or the stall watch would call the cron dead every day it is off.
    await recordCronRun("initial-unlock-gift", Date.now(), "success", "skipped: the flag is off");
    return NextResponse.json({ skipped: true, reason: "flag_off" });
  }
  const resend = getResend();
  // E07 sells (its P.S. is the EUR 10 off), so its Unsubscribe has to work: no secret, no run.
  if (!resend || !process.env.UNSUBSCRIBE_SECRET) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const trackDuration = startCronTimer("initial-unlock-gift", maxDuration);
  const startedAtMs = Date.now();
  let cronError: string | undefined;
  const summary: Summary = {
    candidates: 0,
    gifted: 0,
    heldOut: 0,
    skippedPaid: 0,
    skippedEarlierReport: 0,
    skippedSuppressed: 0,
    skippedRestricted: 0,
    skippedNoEmail: 0,
    skippedNoToken: 0,
    skippedTaken: 0,
    failed: 0,
  };

  try {
    const candidates = await fetchCandidates(startedAtMs);
    summary.candidates = candidates.length;
    const ctx: RunContext = {
      resend,
      siteUrl: getEmailSiteUrl(),
      unsubSecret: process.env.UNSUBSCRIBE_SECRET,
      summary,
    };
    for (const candidate of candidates) {
      // A walk budget well under the 60s ceiling: the rest wait for the next hour.
      if (Date.now() - startedAtMs > 20_000) break;
      try {
        await processCandidate(candidate, ctx);
      } catch (err) {
        logger.error(
          { err, personalReportId: candidate.id, slack: false },
          "initial-unlock-gift: report failed"
        );
        summary.failed++;
      }
    }
    logger.info({ summary }, "initial-unlock-gift cron finished");
    return NextResponse.json({ success: true, summary });
  } catch (err) {
    logger.error({ err }, "initial-unlock-gift cron failed");
    cronError = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  } finally {
    await trackDuration();
    await recordCronRun(
      "initial-unlock-gift",
      startedAtMs,
      cronError ? "error" : "success",
      cronError
    );
  }
}
