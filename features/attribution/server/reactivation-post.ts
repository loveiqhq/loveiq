/**
 * #report-reactivations: one top-level post per reader who comes back to their report, in
 * Marcus's layout (#all-loveiq, 16 Nov 2026, ts 1794836612.093439; LoveIQ Sync 19 Nov: "a new
 * channel… only pushed for reactivations, not for submissions… this ID can point to the
 * survey"). Mark reads #incoming-surveys every day and could not see who opens their report
 * again days later: the "Came back" replies (return-ping.ts) sit in each reader's thread,
 * which the channel never shows.
 *
 * Gated twice. The return ping (return-ping.ts, `noteReaderReturn`) claims the reader's Berlin
 * day in `reader_return` with its own rules (a report visit on a later day and SAME_SITTING_MS
 * after the survey, a click in our email, the unlock-feedback answer), once per reader per day
 * and without the team, crawlers, our probes or share views. That claim alone posts nothing:
 * a browser reopening its tabs loads the report too, with nobody reading (24 Nov 2026: none of
 * the channel's first eleven customer posts had a minute on screen). The post waits for the
 * page's `report_active_1min`, a minute on screen with a touch, click, wheel or key in the
 * last 30 seconds (useReportEngagementTimers), and `postReactivationOnRead` then posts the
 * day's row. Every source but `draft`: a survey finished on a later day is a submission, and
 * it gets its own #incoming-surveys message.
 *
 * Kept current for REDRAW_WINDOW_MS: the post's channel and ts go on the claimed row, and
 * `refreshJourneyDetail` / `refreshJourneyMessage` (journey-message.ts) redraw it, so "Report
 * time spent" fills in as they read and the rail moves on when they reach the paywall, the
 * checkout or pay. The rail is the reader's, as on #incoming-surveys: a step reached before
 * the return is already green. Only the latest post is redrawn: one claimed just before
 * midnight stops moving once the next day's return is posted.
 *
 * Off unless SLACK_REACTIVATIONS_CHANNEL_ID is set (with the journey bot's SLACK_BOT_TOKEN +
 * SLACK_JOURNEY_CHANNEL_ID, and the bot invited to the channel). Unset, nothing here makes a
 * request. Never throws: every caller runs it after its response.
 */

import { EMAILS } from "@features/admin/server/ap/email-registry";
import { supabaseFetch } from "@features/admin/server/supabase";
import {
  buildSubmissionJourney,
  type SubmissionJourney,
} from "@features/attribution/server/journey";
import {
  EMAIL_LINK,
  isRestricted,
  VIA,
  type ReturnSource,
} from "@features/attribution/server/return-ping";
import {
  cameFromValue,
  EMAIL_NAMES,
  formatDuration,
  formatReportDwell,
  funnelLine,
  JOURNEY_STEPS,
  journeyRail,
  experimentLines,
  type JourneyStep,
} from "@features/attribution/server/slack-journey";
import { EMAIL_LINKS, EMAIL_LINKS_TAGGED_FROM } from "@shared/emails/email-link";
import { checkRateLimit } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";
import { escapeSlack, type SlackBlock } from "@shared/observability/slack";
import { codeSpan, fitBlocks, section, SECTION_BUDGET } from "@shared/observability/slack-blocks";
import {
  getMessagePermalink,
  isSlackBotConfigured,
  postJourneyMessage,
  updateJourneyMessage,
} from "@shared/observability/slack-bot";
import { reportingDay, reportingDayStart } from "@shared/time/reporting-day";

/** A return that gets a post: every source but a finished draft. */
export type ReactivationSource = Exclude<ReturnSource, "draft">;

export interface Reactivation {
  submissionId: number;
  source: ReactivationSource;
  /** The email that brought them (reader_return.via): a link's utm_campaign or a Resend stage. */
  via: string | null;
  /** When they came back (reader_return.returned_at). */
  returnedAt: string;
}

/** The post is redrawn for a day after the return; a later return gets a post of its own. */
export const REDRAW_WINDOW_MS = 24 * 3_600_000;

const TABLE = "/rest/v1/reader_return";
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** The #report-reactivations channel id, or null when the post is off. */
export function reactivationsChannel(): string | null {
  const channel = process.env.SLACK_REACTIVATIONS_CHANNEL_ID?.trim();
  return channel && isSlackBotConfigured() ? channel : null;
}

function isReactivationSource(source: string): source is ReactivationSource {
  return source === "report" || source === "email" || source === "answer";
}

/**
 * An email as AP-Analytics › Emails names it (by its stage), else as the survey message's "Came
 * back by email" line does (by its link's campaign), else "email link". AP's own order
 * (`returnWay`, features/admin/server/ap/report-page.ts), so the post names the row Marcus reads
 * there: "Your Core Archetype, unlocked as a gift".
 */
export function emailTitleOf(via: string): string {
  return EMAILS.find((e) => e.stages.includes(via))?.name ?? EMAIL_NAMES.get(via) ?? "email link";
}

/** "2d 1h" from a day up (Marcus's "[X]d [Y]h"), else "45 min" / "5h 12m"; "—" when unknown. */
export function formatSince(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < DAY_MS) return formatDuration(ms) ?? "—";
  return `${Math.floor(ms / DAY_MS)}d ${Math.floor((ms % DAY_MS) / HOUR_MS)}h`;
}

function msBetween(from: string | null, to: string): number | null {
  const a = Date.parse(from ?? "");
  const b = Date.parse(to);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? b - a : null;
}

/**
 * Marcus's "Reactivation source" and "Promotion email" lines, in the words agreed on 19 Nov:
 * these are our automated emails, and AP keeps "Promotional emails" for one-off campaigns.
 */
function sourceLines(r: Reactivation): string[] {
  if (r.source === "report" && !r.via) return ["Reactivation source: *Report link* (no email)"];
  // The answer always names its email; the fallback keeps the line whole for a row without one.
  const via = r.via ?? (r.source === "answer" ? EMAIL_LINKS.unlockFeedback.campaign : null);
  const how =
    r.source === "email"
      ? "clicked"
      : r.source === "answer"
        ? "answered its question"
        : "opened the report through it";
  // A link that names no email can only come from one sent before every link was tagged: the
  // report-ready email of a survey from July carries one, and opens a report months later.
  const email =
    via === EMAIL_LINK
      ? `*older email link* (before ${EMAIL_LINKS_TAGGED_FROM}; ${how})`
      : `*${escapeSlack(via ? emailTitleOf(via) : "email link")}* (${how})`;
  return ["Reactivation source: *Email*", `Email: ${email}`];
}

/**
 * "Last read: *1d 2h* before this visit", from the reader's last minute of reading before the
 * return: the time since the survey alone reads 95 days for a reader who read yesterday.
 */
function lastReadLine(lastReadAt: string | null | undefined, returnedAt: string): string {
  const ms = msBetween(lastReadAt ?? null, returnedAt);
  return ms === null
    ? "Last read: *none recorded*"
    : `Last read: *${formatSince(ms)}* before this visit`;
}

/** A Slack permalink is ours to print inside `<url|text>` only if it cannot close the link. */
const SAFE_LINK = /^https:\/\/[^\s<>|]+$/;

/**
 * The post, as one section like the survey message: the reactivation, then Marcus's context
 * lines (the survey message's own builders, so the two channels read the same), then the rail.
 */
export function buildReactivationMessage(
  journey: SubmissionJourney,
  r: Reactivation,
  options: { floor?: JourneyStep; journeyLink?: string | null } = {}
): { text: string; blocks: SlackBlock[] } {
  const id = `#${r.submissionId}`;
  const ref =
    options.journeyLink && SAFE_LINK.test(options.journeyLink)
      ? `<${options.journeyLink}|${id}>`
      : id;
  const title =
    `*Report reactivation of survey submission ${ref}*` +
    (journey.emailMasked ? ` ${codeSpan(journey.emailMasked)}` : "");
  const since = formatSince(msBetween(journey.timings.completedAt, r.returnedAt));

  const lines = [
    title,
    ...sourceLines(r),
    `Time to reactivation: *${since}* (since survey submission)`,
    lastReadLine(journey.timings.lastReadAt, r.returnedAt),
    `Report time spent: *${formatReportDwell(journey.timings.dwellSinceMs)}*`,
    "",
    funnelLine(journey),
    `Survey time: *${formatDuration(journey.timings.durationMs) ?? "—"}*`,
    `Original acquisition: ${cameFromValue(journey)}`,
    ...experimentLines(journey),
    ...(journey.country ? [`Country (self-reported): *${escapeSlack(journey.country)}*`] : []),
  ];

  // The rail last and whole: a section is clamped from its END, so an oversized line above
  // must shorten itself rather than push the rail off (compactSurveyLines does the same).
  const rail = journeyRail(journey, options.floor);
  const factsBudget = SECTION_BUDGET - rail.length - 2;
  const facts = lines.join("\n");
  const body = `${facts.length > factsBudget ? `${facts.slice(0, factsBudget - 1)}…` : facts}\n\n${rail}`;

  const head = r.source === "report" && !r.via ? "report link" : "email";
  const text = `Report reactivation of survey submission ${id}: ${head}, ${since} after the survey`;
  return { text, blocks: fitBlocks([section(body)], text).blocks };
}

/** The furthest of the steps given, for the rail's floor (journeyRail's `reachedFloor`). */
function furthest(...steps: Array<string | null | undefined>): JourneyStep | undefined {
  const given = new Set(steps);
  let found: JourneyStep | undefined;
  for (const step of JOURNEY_STEPS) if (given.has(step)) found = step;
  return found;
}

interface JourneyRow {
  channel: string;
  message_ts: string;
  state: string | null;
  backfilled_at: string | null;
}

/** The reader's #incoming-surveys message: the link's target and the rail's floor. */
async function readJourneyMessage(submissionId: number): Promise<JourneyRow | null> {
  const res = await supabaseFetch(
    // eslint-disable-next-line no-secrets/no-secrets -- REST path, not a secret
    `/rest/v1/slack_journey_message?survey_submission_id=eq.${submissionId}&select=channel,message_ts,state,backfilled_at&limit=1`
  );
  if (!res.ok) return null;
  return ((await res.json()) as JourneyRow[])[0] ?? null;
}

/**
 * Permalinks never change, so each is asked for once per server instance. Not one the August
 * catch-up wrote (`backfilled_at`): its ts is a reply inside that catch-up's thread
 * (return-ping.ts reads the same rule).
 */
const permalinks = new Map<string, string>();

async function linkOf(message: JourneyRow | null): Promise<string | null> {
  if (!message || message.backfilled_at) return null;
  const key = `${message.channel}:${message.message_ts}`;
  const known = permalinks.get(key);
  if (known) return known;
  const link = await getMessagePermalink(message.channel, message.message_ts);
  if (link) {
    if (permalinks.size >= 500) permalinks.clear();
    permalinks.set(key, link);
  }
  return link;
}

/** The day's return row, as the post's claim hands it back. */
interface ClaimedRow {
  returned_at: string;
  source: string;
  via: string | null;
}

/**
 * The email the day's first minute of reading came through (`report_active_1min`'s `via`), for
 * a return whose row names none. The post and its redraws both read it here, so they agree, and
 * it is never written onto the row: AP-Analytics names a reader's way back by the row's own.
 * Undefined when it cannot be read.
 */
async function readEmailOfRead(
  submissionId: number,
  returnedAt: string
): Promise<string | null | undefined> {
  const res = await supabaseFetch(
    `/rest/v1/analytics_event?survey_submission_id=eq.${submissionId}` +
      `&event_type=eq.report_active_1min&event_time=gte.${encodeURIComponent(returnedAt)}` +
      `&select=metadata&order=event_time.asc&limit=1`
  );
  if (!res.ok) return undefined;
  const rows = (await res.json()) as Array<{ metadata?: { via?: unknown } | null }>;
  const via = rows[0]?.metadata?.via;
  return typeof via === "string" && VIA.test(via) ? via : null;
}

/**
 * Whether the reader opened their report on `day` (Berlin): a report_session from that day, which
 * a load of their report writes (/api/report).
 */
async function openedReportOn(submissionId: number, day: string): Promise<boolean> {
  const res = await supabaseFetch(
    `/rest/v1/report_session?select=id,personal_report!inner(survey_submission_id)` +
      `&personal_report.survey_submission_id=eq.${submissionId}` +
      `&started_at=gte.${encodeURIComponent(reportingDayStart(day).toISOString())}&limit=1`
  );
  if (!res.ok) return false;
  return ((await res.json()) as unknown[]).length > 0;
}

/** Give a claimed day back, so a later minute that day can post it. Never throws. */
async function releaseClaim(rowFilter: string): Promise<void> {
  try {
    await supabaseFetch(`${rowFilter}&reactivation_ts=is.null`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ reactivation_channel: null }),
    });
  } catch (err) {
    logger.warn({ err }, "reactivation post: could not release its claim");
  }
}

/**
 * Post a returning reader once they have read for a minute: `/api/analytics-event` hands each
 * stored `report_active_1min` over. The day's return row is the gate, and so is a report session
 * opened that day: a reader who only clicked an email or answered its question that day is not
 * posted on a minute sent in their name. The event names its reader by the submission id the
 * browser sends, so a minute faked for a reader who did open their report that day can still post
 * them (into our own channel). A reader who asked us to restrict processing (Art. 18) since their
 * return is not posted either. The row is claimed for the post with a
 * conditional update on `reactivation_channel`, so two tabs' minutes post once; a post that
 * does not go out gives the claim back. Times are measured from the day's return, as the
 * redraws measure them. A minute that crosses Berlin midnight looks for the new day's row only.
 * Never throws.
 */
export async function postReactivationOnRead(input: {
  submissionId: number;
  /** When the minute arrived: its Berlin day picks the return row. */
  at: Date;
  /** The page's email (`pageEmailVia`): the link's campaign, "email", or null. */
  via: string | null;
}): Promise<void> {
  const channel = reactivationsChannel();
  if (!channel) return;
  const { submissionId } = input;
  const day = reportingDay(input.at);
  const rowFilter = `${TABLE}?survey_submission_id=eq.${submissionId}&day=eq.${day}`;
  let claimed = false;
  try {
    // Before any claim: a report session that day (the page's own, which takes the token), and
    // no restriction. A failed read posts nothing; a later minute can try again.
    if (!(await openedReportOn(submissionId, day))) return;
    if (await isRestricted(submissionId)) return;
    const claim = await supabaseFetch(
      `${rowFilter}&source=neq.draft&reactivation_channel=is.null&select=returned_at,source,via`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ reactivation_channel: channel }),
      }
    );
    if (!claim.ok) return;
    const row = ((await claim.json()) as ClaimedRow[])[0];
    if (!row) return;
    claimed = true;
    if (!isReactivationSource(row.source)) return;

    // The day's own email first (the click, the email link the return came through); else the
    // one its first minute of reading came through, as every redraw reads it; else, if that
    // cannot be read, this minute's own.
    const [journey, message, readEmail] = await Promise.all([
      buildSubmissionJourney(submissionId, { dwellSince: row.returned_at }),
      readJourneyMessage(submissionId),
      row.via ? null : readEmailOfRead(submissionId, row.returned_at),
    ]);
    const via =
      row.via ??
      (readEmail === undefined ? (input.via && VIA.test(input.via) ? input.via : null) : readEmail);
    if (!journey) return;
    const post = buildReactivationMessage(
      journey,
      { submissionId, source: row.source, via, returnedAt: row.returned_at },
      { floor: furthest(message?.state), journeyLink: await linkOf(message) }
    );
    const posted = await postJourneyMessage({ ...post, channel });
    if (!posted) return;
    // Out: never give the claim back now, or a later minute would post it again.
    claimed = false;
    await supabaseFetch(rowFilter, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      // Never `via`: AP-Analytics names a reader's way back by the row's own (report-page.ts).
      body: JSON.stringify({
        // Slack's own id for the channel, which the redraws' chat.update needs.
        reactivation_channel: posted.channel,
        reactivation_ts: posted.ts,
      }),
    });
    logger.info({ submissionId, source: row.source }, "reactivation post: posted");
  } catch (err) {
    logger.warn({ err, submissionId }, "reactivation post failed");
  } finally {
    if (claimed) await releaseClaim(rowFilter);
  }
}

interface ReactivationRow {
  returned_at: string;
  source: string;
  via: string | null;
  reactivation_channel: string | null;
  reactivation_ts: string | null;
}

/**
 * Redraw the reader's latest reactivation post while it is under REDRAW_WINDOW_MS old: the
 * report time and the rail. Called from the journey message's own refreshes. `witnessed` is the
 * step a caller just saw server-side (the rail's floor, as for the survey message).
 *
 * Time updates (no `witnessed`) come deduped by their callers, as for the survey message: one a
 * minute for a session's close, one per five minutes or milestone for report events. A step
 * repeats with every page load and click (a reload is `report_opened` again, the paywall ping
 * comes once per load, every Unlock click starts a checkout), so each step redraws at most once
 * a minute. A payment always redraws. Never throws.
 */
export async function refreshReactivationPost(
  submissionId: number,
  witnessed?: JourneyStep
): Promise<void> {
  if (!reactivationsChannel()) return;
  try {
    const since = new Date(Date.now() - REDRAW_WINDOW_MS).toISOString();
    const res = await supabaseFetch(
      `${TABLE}?survey_submission_id=eq.${submissionId}&reactivation_ts=not.is.null` +
        `&returned_at=gte.${encodeURIComponent(since)}` +
        `&select=returned_at,source,via,reactivation_channel,reactivation_ts` +
        `&order=returned_at.desc&limit=1`
    );
    if (!res.ok) return;
    const row = ((await res.json()) as ReactivationRow[])[0];
    if (!row?.reactivation_channel || !row.reactivation_ts || !isReactivationSource(row.source)) {
      return;
    }

    // A step's first redraw already greens the rail; its repeats (reloads, paywall pings, Unlock
    // clicks) would each cost a chat.update from the bot's budget, which the #incoming-surveys
    // message shares, at the pace of anyone holding the report link. One a minute per step, each
    // in its own slot so a new step never waits behind another. A payment always redraws (the
    // funnel line takes it). A time update is already deduped by its caller, and its last one
    // (the session's close) must not be dropped.
    if (witnessed && witnessed !== "paid") {
      const slot = await checkRateLimit(`${submissionId}:${witnessed}`, {
        bucket: "reactivation-redraw",
        limit: 1,
        windowMs: 60_000,
      });
      if (!slot.allowed) return;
    }

    // The email as the post named it: the row's own, else its first minute's (postReactivationOnRead).
    const [journey, message, readEmail] = await Promise.all([
      buildSubmissionJourney(submissionId, { dwellSince: row.returned_at }),
      readJourneyMessage(submissionId),
      row.via ? null : readEmailOfRead(submissionId, row.returned_at),
    ]);
    if (!journey) return;
    const post = buildReactivationMessage(
      journey,
      {
        submissionId,
        source: row.source,
        via: row.via ?? readEmail ?? null,
        returnedAt: row.returned_at,
      },
      { floor: furthest(message?.state, witnessed), journeyLink: await linkOf(message) }
    );
    await updateJourneyMessage({
      channel: row.reactivation_channel,
      ts: row.reactivation_ts,
      ...post,
    });
  } catch (err) {
    logger.warn({ err, submissionId }, "reactivation post: refresh failed");
  }
}
