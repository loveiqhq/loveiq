/**
 * #report-reactivations: one top-level post per reader who comes back to their report, in
 * Marcus's layout (#all-loveiq, 16 Nov 2026, ts 1794836612.093439; LoveIQ Sync 19 Nov: "a new
 * channel… only pushed for reactivations, not for submissions… this ID can point to the
 * survey"). Mark reads #incoming-surveys every day and could not see who opens their report
 * again days later: the "Came back" replies (return-ping.ts) sit in each reader's thread,
 * which the channel never shows.
 *
 * Fed by the return ping's own claim: `noteReaderReturn` calls `postReactivation` once it has
 * claimed the reader's Berlin day in `reader_return`, so this post has the same rules (a report
 * visit on a later day and SAME_SITTING_MS after the survey, a click in our email, the
 * unlock-feedback answer), the same once-per-reader-per-day and the same exclusions (the team,
 * crawlers, our probes, share views). Every source but `draft`: a survey finished on a later
 * day is a submission, and it gets its own #incoming-surveys message.
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
import type { ReturnSource } from "@features/attribution/server/return-ping";
import {
  cameFromValue,
  EMAIL_NAMES,
  formatDuration,
  formatReportDwell,
  funnelLine,
  JOURNEY_STEPS,
  journeyRail,
  landingValue,
  type JourneyStep,
} from "@features/attribution/server/slack-journey";
import { EMAIL_LINKS } from "@shared/emails/email-link";
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
  return [
    "Reactivation source: *Email*",
    `Email: *${escapeSlack(via ? emailTitleOf(via) : "email link")}* (${how})`,
  ];
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
    `Report time spent: *${formatReportDwell(journey.timings.dwellSinceMs)}*`,
    "",
    funnelLine(journey),
    `Survey time: *${formatDuration(journey.timings.durationMs) ?? "—"}*`,
    `Original acquisition: ${cameFromValue(journey)}`,
    `Landing page design: ${landingValue(journey)}`,
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

/**
 * Post a reactivation, once `noteReaderReturn` has claimed the reader's day, and keep its
 * channel and ts on that row for the redraws. Never throws.
 */
export async function postReactivation(input: {
  submissionId: number;
  source: ReturnSource;
  via: string | null;
  at: Date;
  /** The claimed row's Berlin day (reader_return.day). */
  day: string;
}): Promise<void> {
  const channel = reactivationsChannel();
  const { submissionId, source, via, day } = input;
  if (!channel || !isReactivationSource(source)) return;
  try {
    const returnedAt = input.at.toISOString();
    const [journey, message] = await Promise.all([
      buildSubmissionJourney(submissionId, { dwellSince: returnedAt }),
      readJourneyMessage(submissionId),
    ]);
    if (!journey) return;
    const post = buildReactivationMessage(
      journey,
      { submissionId, source, via, returnedAt },
      { floor: furthest(message?.state), journeyLink: await linkOf(message) }
    );
    const posted = await postJourneyMessage({ ...post, channel });
    if (!posted) return;
    await supabaseFetch(`${TABLE}?survey_submission_id=eq.${submissionId}&day=eq.${day}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ reactivation_channel: posted.channel, reactivation_ts: posted.ts }),
    });
    logger.info({ submissionId, source }, "reactivation post: posted");
  } catch (err) {
    logger.warn({ err, submissionId, source }, "reactivation post failed");
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

    const [journey, message] = await Promise.all([
      buildSubmissionJourney(submissionId, { dwellSince: row.returned_at }),
      readJourneyMessage(submissionId),
    ]);
    if (!journey) return;
    const post = buildReactivationMessage(
      journey,
      { submissionId, source: row.source, via: row.via, returnedAt: row.returned_at },
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
