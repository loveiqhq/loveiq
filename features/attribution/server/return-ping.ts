/**
 * "Came back" replies on #incoming-surveys (Software Board card "Ping #incoming-surveys when a
 * reader comes back", LoveIQ Sync 11 Nov 2026). When a reader comes back after their first
 * visit, the Slack bot replies in the thread of their survey message: when, and the email or
 * link that brought them. Once per reader per Berlin day; the team's own surveys (an @loveiq.org
 * address, or an account on the team list, ap_team_user), our probes and crawlers left out; the
 * address masked as the message masks it.
 *
 * A return (`isReturn`) comes half an hour or more after the first visit (AP's rule,
 * EMAIL_RETURN_AFTER_MS), never from a crawler (`isCrawler`), and is one of:
 * - report: their report link opened on a later Berlin day than they finished the survey, and
 *   SAME_SITTING_MS or more after it. The EUR 1.99 page counts: a reader it stops came back as
 *   much as one it lets in. A same-day re-open is the first visit's (report_session has a row
 *   per page load, reloads included), and so is one past midnight in the same sitting.
 * - email: a click in one of our emails (Resend's email.clicked). Not one seconds after the
 *   send, nor one a crawler made: those are link scanners.
 * - answer: the unlock-feedback question answered.
 * - draft: a survey finished on a later Berlin day than it was begun, their first visit, and
 *   SAME_SITTING_MS or more after it: they came back to finish it. A draft has no thread until
 *   it is finished, so the survey route notes it as it posts the message.
 *
 * The day is claimed in reader_return BEFORE the reply goes, so a second return that day, or a
 * retried webhook, posts nothing; a reply lost after its claim is preferred to a double one. The
 * row stays whether or not a reply went out (no stored message, no bot, Slack refused it):
 * AP-Analytics' Report page counts it, "Came back within 7 days".
 *
 * The same claim gates #report-reactivations (reactivation-post.ts), but posts nothing there by
 * itself: a returning reader is posted once they read for a minute that day (the report page's
 * `report_active_1min`, `postReactivationOnRead`). A browser reopening a tab claims a day too.
 *
 * Never throws. Every caller runs it after its response, and neither Slack nor the database may
 * touch the request that triggered it.
 */

import { EMAILS } from "@features/admin/server/ap/email-registry";
import { teamUserIds } from "@features/admin/server/ap/team";
import { supabaseFetch } from "@features/admin/server/supabase";
import { EMAIL_RETURN_AFTER_MS } from "@features/attribution/server/journey";
import { EMAIL_NAMES } from "@features/attribution/server/slack-journey";
import { isStaffEmail } from "@shared/env/staff-email";
import { BOT_UA_REGEX } from "@shared/http/bot-user-agent";
import logger from "@shared/observability/logger";
import { maskEmail, type SlackBlock } from "@shared/observability/slack";
import { codeSpan, section } from "@shared/observability/slack-blocks";
import { isSlackBotConfigured, postJourneyMessage } from "@shared/observability/slack-bot";
import { REPORTING_TIME_ZONE, reportingDay } from "@shared/time/reporting-day";

export type ReturnSource = "report" | "email" | "answer" | "draft";

/** What the rules and the reply need to know about the reader. */
export interface ReturnReader {
  /** The survey finished (survey_submission.created_date_time): the first visit. */
  finishedAt: string | null;
  /** The survey begun (start_date_time): a draft's first visit. */
  startedAt: string | null;
  /** One of ours (isStaffEmail, the message's [internal] tag): never pinged. */
  internal: boolean;
  /** The address as the message shows it, a***@example.com. */
  emailMasked: string | null;
  /**
   * The reader's account, for the team check (ap_team_user): the team also tests from addresses
   * of their own, which `internal` cannot see. Null or left out: not known, so never the team's.
   */
  userId?: number | null;
}

export interface ReturnSignal {
  submissionId: number;
  source: ReturnSource;
  /** When it happened; now when left out. */
  at?: Date;
  /**
   * The email that brought them: its link's utm_campaign or its Resend stage tag, EMAIL_LINK for
   * one of our links that names neither. Null or left out: no email did.
   */
  via?: string | null;
  /** When the clicked email was sent (Resend's data.created_at). */
  sentAt?: string | null;
  /** The click's own user agent (Resend's data.click.userAgent): a crawler's is no return. */
  userAgent?: string | null;
  /** What the caller already holds about the reader; read from the database when left out. */
  reader?: ReturnReader;
}

/**
 * A click this soon after its email was sent is a link scanner, not a reader. AP's BOT_MS is 2 s
 * after the delivery, which lands a few seconds after the send; the webhook carries the send.
 */
export const SCANNER_CLICK_MS = 10_000;

/**
 * A report visit or a finished draft must also be this long after the first visit: a later
 * Berlin day alone can be one sitting across midnight. In the 60 days to 16 Nov 2026, 10 of the
 * 24 surveys finished on a later day than begun were one sitting of under an hour (#2625's
 * longest pause: 10 minutes), and none of the 68 readers who came back to their report on a
 * later day did so within 3 hours of finishing. It costs one real resume in those 60 days
 * (#2569, 2.8 hours with a 113-minute pause).
 */
export const SAME_SITTING_MS = 3 * 3_600_000;

/**
 * Not a reader: a crawler or link previewer (BOT_UA_REGEX, as proxy.ts counts no visit for
 * one), or what AP-Analytics also leaves out of report sessions (its reading SQL): headless
 * browsers, which link-scanning sandboxes run, and plain HTTP clients.
 */
const NOT_A_BROWSER =
  /headless|^curl\/|^wget\/|python-requests|go-http-client|okhttp|node-fetch|axios\//i;

export function isCrawler(userAgent: string | null | undefined): boolean {
  return BOT_UA_REGEX.test(userAgent ?? "") || NOT_A_BROWSER.test(userAgent ?? "");
}

/** `via` for one of our links that names no campaign: from=email, the report links before 5 Nov 2026. */
export const EMAIL_LINK = "email";

/** A utm-shaped token, as the report page keeps an email return's campaign (and the table's CHECK). */
export const VIA = /^[A-Za-z0-9_.-]{1,64}$/;

export function readerOf(row: {
  finishedAt: string | null;
  startedAt?: string | null;
  email: string | null;
  userId?: number | null;
}): ReturnReader {
  return {
    finishedAt: row.finishedAt,
    startedAt: row.startedAt ?? null,
    internal: isStaffEmail(row.email),
    emailMasked: row.email?.trim() ? maskEmail(row.email) : null,
    userId: row.userId ?? null,
  };
}

/** Whether this is a return worth a reply, by the rules at the top of this file. */
export function isReturn(
  signal: { source: ReturnSource; at: Date; sentAt?: string | null; userAgent?: string | null },
  reader: ReturnReader
): boolean {
  if (reader.internal || isCrawler(signal.userAgent)) return false;
  const at = signal.at.getTime();
  const first = Date.parse(
    (signal.source === "draft" ? reader.startedAt : reader.finishedAt) ?? ""
  );
  if (!Number.isFinite(first) || at - first <= EMAIL_RETURN_AFTER_MS) return false;
  switch (signal.source) {
    case "report":
    case "draft":
      return (
        at - first >= SAME_SITTING_MS && reportingDay(signal.at) > reportingDay(new Date(first))
      );
    case "email": {
      const sent = Date.parse(signal.sentAt ?? "");
      return !(Number.isFinite(sent) && at - sent < SCANNER_CLICK_MS);
    }
    case "answer":
      return true;
  }
}

/**
 * The email a report link came through, from the page that asked for the report's data: the
 * request's Referer, same-origin, so it keeps the query (Referrer-Policy
 * strict-origin-when-cross-origin, proxy.ts). The report page's own rule (emailReturnOf): our
 * links carry from=email or utm_source=email, and the email's utm_campaign. Null for a link that
 * is none of ours, or no Referer.
 */
export function emailLinkOf(referer: string | null): string | null {
  if (!referer) return null;
  let params: URLSearchParams;
  try {
    params = new URL(referer).searchParams;
  } catch {
    return null;
  }
  if (params.get("from") !== "email" && params.get("utm_source") !== "email") return null;
  const campaign = params.get("utm_campaign");
  return campaign && VIA.test(campaign) ? campaign : EMAIL_LINK;
}

/**
 * An email by the name the message's "Came back by email" line gives it (its link's campaign),
 * else AP › Emails' name for its stage tag, else "email link".
 */
export function emailNameOf(via: string): string {
  return EMAIL_NAMES.get(via) ?? EMAILS.find((e) => e.stages.includes(via))?.name ?? "email link";
}

/** "Sun 16 Nov, 05:24", Berlin, as the message's own dates. */
const when = (d: Date) =>
  d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: REPORTING_TIME_ZONE,
  });

const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: REPORTING_TIME_ZONE,
  });

/**
 * The thread reply: ":leftwards_arrow_with_hook: *Came back* Sun 16 Nov, 05:24: clicked the *gift
 * email (E07)* · #2790 `j***@gmail.com`". Every name comes from our own tables, never from the
 * link, and the address goes in a code span, as the message writes it.
 */
export function buildReturnReply(
  signal: { submissionId: number; source: ReturnSource; at: Date; via: string | null },
  reader: ReturnReader
): { text: string; blocks: SlackBlock[] } {
  const email = signal.via ? `*${emailNameOf(signal.via)}*` : null;
  let what: string;
  switch (signal.source) {
    case "report":
      what = email ? `opened their report through the ${email}` : "opened their report";
      break;
    case "email":
      what = `clicked the ${email ?? "*email link*"}`;
      break;
    case "answer":
      what = `answered the question in the ${email ?? "*unlock feedback email*"}`;
      break;
    case "draft":
      what = `finished the survey they began on ${reader.startedAt ? dayOf(reader.startedAt) : "an earlier day"}`;
      break;
  }
  const who = `#${signal.submissionId}${reader.emailMasked ? ` ${codeSpan(reader.emailMasked)}` : ""}`;
  return {
    text: `Survey submission #${signal.submissionId} came back ${when(signal.at)}`,
    blocks: [
      section(`:leftwards_arrow_with_hook: *Came back* ${when(signal.at)}: ${what}  ·  ${who}`),
    ],
  };
}

const TABLE = "/rest/v1/reader_return";

/**
 * Whether the reader asked us to restrict processing (GDPR Art. 18, `app_user.processing_restricted_at`):
 * then no thread reply and no #report-reactivations post, as the email crons and the team export
 * already skip them. Unknown counts as restricted, so a failed read stays quiet.
 */
async function isRestricted(submissionId: number): Promise<boolean> {
  const res = await supabaseFetch(
    `/rest/v1/survey_submission?id=eq.${submissionId}` +
      "&select=app_user!fk_survey_submission_user" +
      "(processing_restricted_at)&limit=1"
  );
  if (!res.ok) return true;
  const rows = (await res.json()) as Array<{
    app_user?: { processing_restricted_at?: string | null } | null;
  }>;
  return Boolean(rows[0]?.app_user?.processing_restricted_at);
}

async function readReader(submissionId: number): Promise<ReturnReader | null> {
  const res = await supabaseFetch(
    `/rest/v1/survey_submission?id=eq.${submissionId}` +
      `&select=created_date_time,start_date_time,user_id,app_user!fk_survey_submission_user(email)&limit=1`
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{
    created_date_time: string | null;
    start_date_time: string | null;
    user_id: number | null;
    app_user: { email: string | null } | null;
  }>;
  const row = rows[0];
  return row
    ? readerOf({
        finishedAt: row.created_date_time,
        startedAt: row.start_date_time,
        email: row.app_user?.email ?? null,
        userId: row.user_id,
      })
    : null;
}

/**
 * One of the team's own accounts (ap_team_user: an @loveiq.org address, or one that redeemed the
 * team's 100% test code), whose returns are tests. A failed read counts nobody as the team's: a
 * missed test costs one wrong post, a dropped reader a real return.
 */
async function isTeamReader(reader: ReturnReader): Promise<boolean> {
  if (reader.userId === null || reader.userId === undefined) return false;
  const team = await teamUserIds().catch(() => new Set<number>());
  return team.has(reader.userId);
}

/**
 * The reader's #incoming-surveys message (slack_journey_message), or null: nothing to reply to.
 * Not one the August catch-up wrote (journey-backfill, `backfilled_at`): it re-posted 66 old
 * messages as replies under one thread and kept those replies' ts, so a reply to one would land
 * in that thread, not under the reader's own message.
 */
async function readMessage(
  submissionId: number
): Promise<{ channel: string; message_ts: string } | null> {
  const res = await supabaseFetch(
    // eslint-disable-next-line no-secrets/no-secrets -- REST path, not a secret
    `/rest/v1/slack_journey_message?survey_submission_id=eq.${submissionId}&select=channel,message_ts,backfilled_at&limit=1`
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{
    channel: string;
    message_ts: string;
    backfilled_at: string | null;
  }>;
  const row = rows[0];
  return row && !row.backfilled_at ? { channel: row.channel, message_ts: row.message_ts } : null;
}

/**
 * Note a reader coming back: claim their day, then reply in their thread. Never throws; see the
 * top of this file for the rules.
 */
export async function noteReaderReturn(signal: ReturnSignal): Promise<void> {
  const { submissionId, source } = signal;
  try {
    const at = signal.at ?? new Date();
    const reader = signal.reader ?? (await readReader(submissionId));
    const { sentAt, userAgent } = signal;
    if (!reader || !isReturn({ source, at, sentAt, userAgent }, reader)) return;
    if (await isRestricted(submissionId)) return;
    if (await isTeamReader(reader)) return;

    const via = signal.via && VIA.test(signal.via) ? signal.via : null;
    const day = reportingDay(at);
    // Ignore-duplicates on the (submission, day) key: a row back means this call claimed it.
    const claim = await supabaseFetch(TABLE, {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({
        survey_submission_id: submissionId,
        day,
        returned_at: at.toISOString(),
        source,
        via,
      }),
    });
    if (!claim.ok) {
      logger.warn({ status: claim.status, submissionId, source }, "return ping: claim failed");
      return;
    }
    if (((await claim.json()) as unknown[]).length === 0) return;

    // #report-reactivations waits for a minute of reading that day (postReactivationOnRead,
    // which claims this row for its post): only the thread reply goes out here.
    if (!isSlackBotConfigured()) return;
    const message = await readMessage(submissionId);
    if (!message) return;
    const reply = buildReturnReply({ submissionId, source, at, via }, reader);
    const posted = await postJourneyMessage({
      ...reply,
      channel: message.channel,
      threadTs: message.message_ts,
    });
    if (!posted) return;
    await supabaseFetch(`${TABLE}?survey_submission_id=eq.${submissionId}&day=eq.${day}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ slack_ts: posted.ts }),
    });
    logger.info({ submissionId, source }, "return ping: posted");
  } catch (err) {
    logger.warn({ err, submissionId, source }, "return ping failed");
  }
}
