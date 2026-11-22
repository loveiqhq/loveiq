import { createHmac, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";
import { fetchAllRows, supabaseFetch } from "@features/admin/server/supabase";
import { isEmailSuppressed } from "@shared/emails/suppression";
import { getEmailSiteUrl } from "@shared/emails/site-url";
import logger from "@shared/observability/logger";
import nudgeConfig from "../content/nudges.json";
import { supportSince } from "./checks";
import { miraEmail } from "./email-shell";
import { askModel, isModelConfigured } from "./model";
import { addMessages, logMiraEvent } from "./store";

/**
 * Mira's daily nudge emails (Sanjin's coach config, board 09; Marcus's unsubscribe boards,
 * 18 Nov 2026). At most one a day, at the person's chosen time in their time zone; never the
 * same kind twice in a row; only for signed-in people whose chats Mira remembers, since a nudge
 * picks up on the last chat. The model writes the body; the subject is the kind's fixed teaser
 * alone and a neutral hidden line leads the email, so nothing personal shows in an inbox (Eman,
 * 20 Nov 2026: the sign-up page promises a neutral sender name and subject line). Once the
 * email has gone, the nudge becomes Mira's latest message in that chat, so the button opens the
 * chat with it in place. Nudges stop only when the person stops them (or pauses them, or the
 * address is suppressed, or they said they are under 18).
 */

export type NudgeType =
  "agreement" | "progress" | "heard_of" | "root_cause" | "share" | "celebrate";
export type NudgeTime = "08:00" | "19:00" | "21:30";

type NudgeKind = (typeof nudgeConfig.types)[number] & { id: NudgeType };
export const NUDGE_KINDS = nudgeConfig.types as NudgeKind[];
export const NUDGE_TYPES = NUDGE_KINDS.map((k) => k.id);
export const kindOf = (id: NudgeType) => NUDGE_KINDS.find((k) => k.id === id)!;

/** Twice a week means Tuesday and Friday, the person's local days. */
const TWICE_WEEKLY_DAYS = ["Tue", "Fri"];
/**
 * A person is due for the hour from their time. The cron runs every 30 minutes, so each slot
 * gets two runs: the second sends to anyone the first did not reach or failed to send to
 * (unique (user_id, local_day) still keeps it to one a day).
 */
const WINDOW_MIN = 60;
/** People nudged at once; the model's reply is most of each one's time. */
const CONCURRENCY = 4;
/** "Progress check: once a week" (Sanjin), counted from the last one that went. */
const PROGRESS_EVERY_DAYS = 7;
const PAUSE_DAYS = 14;
const DAY_MS = 86_400_000;
/** No nudge while someone is chatting, nor after a crisis (Sanjin's stop rails). */
const RECENT_CHAT_MS = 12 * 3_600_000;
const CRISIS_QUIET_DAYS = 14;
const HISTORY = 16;

// ── Tokens: stateless links in the email (no sign-in needed to stop or change nudges) ──────────

/**
 * The key for the links in a nudge, derived for this one use (HMAC of the base secret with a fixed
 * label), so it never equals a key used anywhere else. The base is UNSUBSCRIBE_SECRET, else
 * SHARE_VERIFY_SECRET, else the service-role key, like the share-recipient cookies.
 */
function secret(): Buffer | null {
  for (const v of [
    process.env.UNSUBSCRIBE_SECRET,
    process.env.SHARE_VERIFY_SECRET,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ]) {
    const s = v?.trim();
    if (s && s.length >= 16) return createHmac("sha256", s).update("mira-nudge-links/v1").digest();
  }
  return null;
}

/**
 * What a token may do, signed into it, so one purpose's token never passes as another's:
 * prefs and open: the nudge's links; "journal-stop" only stops the daily journal reminder
 * (server/journal.ts); "session-stop" only pauses the weekly session's reminders.
 */
export type TokenPurpose = "prefs" | "open" | "journal-stop" | "session-stop";

function sign(purpose: TokenPurpose, id: string, key: Buffer): string {
  return createHmac("sha256", key).update(`mira-nudge:${purpose}:${id}`).digest("base64url");
}

export function makeToken(purpose: TokenPurpose, id: string): string | null {
  const key = secret();
  return key ? `${id}.${sign(purpose, id, key)}` : null;
}

/** The id the token was made for, or null if it was not made by us for this purpose. */
export function readToken(purpose: TokenPurpose, token: string | null | undefined): string | null {
  const key = secret();
  if (!key || !token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const a = Buffer.from(token.slice(dot + 1));
  const b = Buffer.from(sign(purpose, id, key));
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

// ── Time: the person's own clock ───────────────────────────────────────────────────────────────

export type Local = { day: string; minutes: number; weekday: string };

export function localParts(at: Date, timeZone: string): Local {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    }).formatToParts(at);
  } catch {
    return localParts(at, "Europe/Berlin");
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    weekday: get("weekday"),
  };
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return tz.length <= 64;
  } catch {
    return false;
  }
}

const minutesOf = (t: NudgeTime) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/** Due in the hour from their time, on their own clock (two of the half-hourly runs). */
export function inWindow(local: Local, time: NudgeTime): boolean {
  const start = minutesOf(time);
  return local.minutes >= start && local.minutes < start + WINDOW_MIN;
}

// ── Who is due, and which kinds of nudge fit ──────────────────────────────────────────────────

export type NudgeUser = {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  nudge_time: NudgeTime;
  time_zone: string;
  nudge_frequency: "daily" | "twice_weekly";
  nudge_types: NudgeType[] | null;
  nudges_paused_until: string | null;
};

export function isDue(user: NudgeUser, now: Date): boolean {
  if (user.nudges_paused_until && Date.parse(user.nudges_paused_until) > now.getTime())
    return false;
  const local = localParts(now, user.time_zone);
  if (!inWindow(local, user.nudge_time)) return false;
  return user.nudge_frequency !== "twice_weekly" || TWICE_WEEKLY_DAYS.includes(local.weekday);
}

/**
 * Sanjin's order: an open agreement first, then progress, then a root-cause or practice question;
 * never the kind sent last time; only the kinds the person kept.
 */
export function allowedTypes(input: {
  kept: NudgeType[] | null;
  lastType: NudgeType | null;
  daysSinceChat: number;
  chattedYesterday: boolean;
  /** A week since the last progress nudge that went (or since sign-up, before the first). */
  progressDue: boolean;
}): NudgeType[] {
  return NUDGE_TYPES.filter((t) => {
    if (t === input.lastType) return false;
    if (input.kept && !input.kept.includes(t)) return false;
    if (t === "agreement") return input.chattedYesterday;
    if (t === "progress") return input.progressDue;
    if (t === "share") return input.daysSinceChat >= 2;
    return true;
  });
}

/**
 * When the next nudge can come, for the "saved" screen. `lastSentDay` is the local day of the
 * last nudge that went: a day that already had its nudge is skipped.
 */
export function nextNudgeAt(
  user: Pick<NudgeUser, "nudge_time" | "time_zone" | "nudge_frequency" | "nudges_paused_until">,
  now: Date,
  lastSentDay: string | null = null
): Date {
  const from = Math.max(now.getTime(), Date.parse(user.nudges_paused_until ?? "") || 0);
  for (let step = 0; step < (14 * 1440) / WINDOW_MIN; step++) {
    const at = new Date(from + step * WINDOW_MIN * 60_000);
    if (
      isDue({ ...user, nudges_paused_until: null } as NudgeUser, at) &&
      localParts(at, user.time_zone).day !== lastSentDay
    )
      return at;
  }
  return new Date(from);
}

// ── The model's part: one short body, in Sanjin's words ───────────────────────────────────────

export const NUDGE_INSTRUCTIONS = `# Mira's daily nudge email

You are Mira, an AI coach for body confidence in sex. Write today's nudge email to a person who chats with you.

${nudgeConfig.instructions}

The subject is set by the app (the kind's own teaser), so write only the body: one or two short paragraphs, at most three sentences in all, greeting them by first name if you know it. Plain words, warm, never pushy. Never mention weight, sizes, food, body shape or appearance goals; never diagnose; never promise what a practice will do. If the last chat touched self-harm, abuse, an eating disorder or someone under 18, or you can't write a nudge that fits, reply with {"skip": true}.

Kinds of nudge (choose exactly one of the ids you are given):
${NUDGE_KINDS.map((k) => `- ${k.id} · ${k.title}. When: ${k.when}. Goal: ${k.goal}. Example: "${k.example}"`).join("\n")}

Choose in this order: an open agreement from the last chat comes first, then progress, then a root-cause or practice question. "celebrate" only after real progress the person named.

Reply with JSON only, no other text: {"type": "<id>", "body": "<the email body>"}`;

export function parseNudge(
  raw: string,
  allowed: NudgeType[]
): { type: NudgeType; body: string } | null {
  const json = /\{[\s\S]*\}/.exec(raw)?.[0];
  if (!json) return null;
  let data: { type?: unknown; body?: unknown; skip?: unknown };
  try {
    data = JSON.parse(json) as typeof data;
  } catch {
    return null;
  }
  if (data.skip === true) return null;
  const type = data.type as NudgeType;
  const body = typeof data.body === "string" ? data.body.trim() : "";
  if (!allowed.includes(type) || body.length < 20 || body.length > 900) return null;
  return { type, body };
}

// ── The email ─────────────────────────────────────────────────────────────────────────────────

/** "Mira <address>": the neutral sender of every Mira email (the weekly session's too). */
export function from(): string {
  const configured = process.env.RESEND_FROM || "LoveIQ <hello@send.loveiq.org>";
  const address = /<([^>]+)>/.exec(configured)?.[1] ?? configured;
  return `${nudgeConfig.senderName} <${address}>`;
}

export function nudgeEmail(input: {
  type: NudgeType;
  body: string;
  openUrl: string;
  prefsUrl: string;
}): { subject: string; html: string; text: string } {
  const kind = kindOf(input.type);
  // The teaser alone: nothing about the chats or what they are about (Eman, 20 Nov 2026).
  const subject = kind.teaser;
  // The neutral preheader comes first in the shell, so an inbox preview shows it and not the body.
  const { html, text } = miraEmail({
    preheader: nudgeConfig.preheader,
    paragraphs: input.body
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean),
    button: { label: kind.button, url: input.openUrl },
    footer: {
      why: "Daily nudges from Mira come with your free account. One email a day at most.",
      links: [
        { label: "Fewer nudges", url: input.prefsUrl },
        { label: "Pause", url: input.prefsUrl },
        { label: "Unsubscribe", url: input.prefsUrl },
        { label: "Privacy", url: `${getEmailSiteUrl()}/mira/privacy` },
      ],
    },
  });
  return { subject, html, text };
}

// ── The run (the cron calls this every 30 minutes) ────────────────────────────────────────────

const enc = encodeURIComponent;

async function rows<T>(path: string): Promise<T[]> {
  const res = await supabaseFetch(path);
  if (!res.ok) throw new Error(`mira nudge read failed (${res.status})`);
  return (await res.json()) as T[];
}

const USER_COLS =
  "id,email,name,created_at,nudge_time,time_zone,nudge_frequency,nudge_types,nudges_paused_until";

/**
 * Every candidate, page by page: one read stops at PostgREST's 1,000 rows, leaving the newest out.
 * Never anyone who said they are under 18 (minor_at, server/minor.ts), whatever their settings.
 */
export async function nudgeCandidates(): Promise<NudgeUser[]> {
  const users = await fetchAllRows<NudgeUser>(
    `/rest/v1/mira_user?nudges_on=is.true&nudges_stopped_at=is.null&remember_chats=is.true&minor_at=is.null&select=${USER_COLS}&order=created_at.asc,id.asc`
  );
  if (!users) throw new Error("mira nudge candidates read failed");
  return users;
}

type ChatTurn = { role: "user" | "assistant"; content: string; created_at: string };

/** The person's most recent chat and its newest turns, oldest first (the weekly session uses it too). */
export async function lastChat(userId: string): Promise<{ id: string; turns: ChatTurn[] } | null> {
  const chats = await rows<{ id: string }>(
    `/rest/v1/mira_chat?user_id=eq.${enc(userId)}&select=id&order=updated_at.desc&limit=1`
  );
  const chat = chats[0];
  if (!chat) return null;
  const turns = await rows<ChatTurn>(
    `/rest/v1/mira_message?chat_id=eq.${enc(chat.id)}&select=role,content,created_at&order=id.desc&limit=${HISTORY}`
  );
  return { id: chat.id, turns: turns.reverse() };
}

async function lastUserMessageAt(userId: string): Promise<number | null> {
  const found = await rows<{ created_at: string }>(
    `/rest/v1/mira_message?select=created_at,mira_chat!inner(user_id)&mira_chat.user_id=eq.${enc(userId)}&role=eq.user&order=created_at.desc&limit=1`
  );
  return found[0] ? Date.parse(found[0].created_at) : null;
}

type SentNudge = { type: NudgeType; local_day: string; sent_at: string };

/** The newest nudge whose email went (of one kind, if given); a claimed day that never went is ignored. */
async function lastSent(userId: string, type?: NudgeType): Promise<SentNudge | null> {
  const found = await rows<SentNudge>(
    `/rest/v1/mira_nudge?user_id=eq.${enc(userId)}&sent_at=not.is.null${type ? `&type=eq.${type}` : ""}&select=type,local_day,sent_at&order=created_at.desc&limit=1`
  );
  return found[0] ?? null;
}

/** Support lines shown in the chat or the journal, or opened by the mood check's question 9. */
async function hadCrisis(userId: string, since: Date): Promise<boolean> {
  const found = await rows<{ id: number }>(
    `/rest/v1/mira_event?user_id=eq.${enc(userId)}&name=eq.crisis_shown&created_at=gte.${enc(since.toISOString())}&select=id&limit=1`
  );
  return found.length > 0 || (await supportSince(userId, since));
}

export type NudgeRunSummary = {
  candidates: number;
  due: number;
  sent: number;
  skipped: Record<string, number>;
  errors: number;
  stoppedEarly: boolean;
};

let resend: Resend | null = null;

export async function runNudges(
  now = new Date(),
  opts: { outOfTime?: () => boolean; only?: string[] } = {}
): Promise<NudgeRunSummary> {
  const summary: NudgeRunSummary = {
    candidates: 0,
    due: 0,
    sent: 0,
    skipped: {},
    errors: 0,
    stoppedEarly: false,
  };
  const skipped = new Map<string, number>();
  const skip = (why: string) => {
    skipped.set(why, (skipped.get(why) ?? 0) + 1);
    summary.skipped = Object.fromEntries(skipped);
  };
  if (!isModelConfigured()) return (skip("no-model"), summary);
  if (!secret() || !process.env.RESEND_API_KEY) return (skip("no-email-setup"), summary);
  const mail = (resend ??= new Resend(process.env.RESEND_API_KEY));

  const started = Date.now();
  // The cron passes its own budget; this default matches it (app/api/cron/mira-nudges).
  const outOfTime = opts.outOfTime ?? (() => Date.now() - started > 225_000);
  const site = getEmailSiteUrl();
  let users = await nudgeCandidates();
  if (opts.only) users = users.filter((u) => opts.only!.includes(u.id));
  summary.candidates = users.length;
  const due = users.filter((u) => isDue(u, now));
  summary.due = due.length;

  async function nudgeOne(user: NudgeUser): Promise<void> {
    const local = localParts(now, user.time_zone);
    const previous = await lastSent(user.id);
    if (previous?.local_day === local.day) return skip("already-today");
    if (await isEmailSuppressed(user.email)) return skip("suppressed");
    if (await hadCrisis(user.id, new Date(now.getTime() - CRISIS_QUIET_DAYS * DAY_MS)))
      return skip("recent-crisis");
    const lastSaid = await lastUserMessageAt(user.id);
    const chat = await lastChat(user.id);
    if (!lastSaid || !chat || chat.turns.length === 0) return skip("no-chat");
    if (now.getTime() - lastSaid < RECENT_CHAT_MS) return skip("chatting");
    const lastDay = localParts(new Date(lastSaid), user.time_zone).day;
    const yesterday = localParts(new Date(now.getTime() - DAY_MS), user.time_zone).day;
    const lastProgress = await lastSent(user.id, "progress");
    const progressFrom = Date.parse(lastProgress?.sent_at ?? user.created_at);
    const allowed = allowedTypes({
      kept: user.nudge_types,
      lastType: previous?.type ?? null,
      daysSinceChat: Math.floor((now.getTime() - lastSaid) / DAY_MS),
      chattedYesterday: lastDay === yesterday,
      progressDue: now.getTime() - progressFrom >= PROGRESS_EVERY_DAYS * DAY_MS,
    });
    if (!allowed.length) return skip("no-kind-fits");

    const transcript = chat.turns
      .map((t) => `${t.role === "user" ? "Person" : "Mira"}: ${t.content.slice(0, 700)}`)
      .join("\n");
    const personal = [
      `Their first name: ${user.name ?? "unknown"}.`,
      `Kinds you may choose today: ${allowed.join(", ")}.`,
      `Days since they last wrote: ${Math.floor((now.getTime() - lastSaid) / DAY_MS)}.`,
      `The last chat, oldest first:\n${transcript}`,
    ].join("\n");
    const result = await askModel(NUDGE_INSTRUCTIONS, personal, [
      { role: "user", content: "Write today's nudge as JSON." },
    ]);
    const nudge = result.ok && !result.refused ? parseNudge(result.text, allowed) : null;
    if (!nudge) return skip(result.ok ? "model-declined" : "model-down");

    // The day is claimed before the email goes: unique (user_id, local_day) lets one run send.
    const created = await supabaseFetch(
      "/rest/v1/mira_nudge?on_conflict=user_id,local_day&select=id",
      {
        method: "POST",
        headers: { Prefer: "return=representation,resolution=ignore-duplicates" },
        body: JSON.stringify({
          user_id: user.id,
          type: nudge.type,
          subject: kindOf(nudge.type).teaser,
          local_day: local.day,
          chat_id: chat.id,
        }),
      }
    );
    const id = created.ok ? ((await created.json()) as Array<{ id: string }>)[0]?.id : null;
    if (!id) return skip("already-today");
    const claim = `/rest/v1/mira_nudge?id=eq.${enc(id)}`;
    let delivered = false;
    try {
      const openUrl = `${site}/api/mira/nudge?t=${enc(makeToken("open", id)!)}`;
      const prefsUrl = `${site}/mira/nudges?t=${enc(makeToken("prefs", user.id)!)}`;
      const unsubscribeUrl = `${site}/api/mira/nudges/unsubscribe?t=${enc(makeToken("prefs", user.id)!)}`;
      const email = nudgeEmail({ type: nudge.type, body: nudge.body, openUrl, prefsUrl });
      const mailed = await mail.emails.send(
        {
          from: from(),
          to: user.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
          // The Resend webhook writes delivery and first open onto this row (opened_at).
          tags: [{ name: "mira_nudge", value: id }],
        },
        { idempotencyKey: `mira-nudge-${id}` }
      ); // a retried call can't send it twice
      if (mailed.error) {
        summary.errors++;
        logger.error({ err: mailed.error.name }, "mira: a nudge email was not sent");
        return;
      }
      delivered = true;
      // The email went: record that first, whatever happens to the chat copy after.
      const marked = await supabaseFetch(claim, {
        method: "PATCH",
        body: JSON.stringify({
          resend_id: mailed.data?.id ?? null,
          sent_at: new Date().toISOString(),
        }),
      });
      if (!marked.ok) {
        summary.errors++;
        logger.error({ status: marked.status }, "mira: a sent nudge was not marked as sent");
      }
      // Only a nudge that went becomes Mira's latest message, where its button opens the chat.
      try {
        const [messageId] = await addMessages(chat.id, [
          { role: "assistant", content: nudge.body },
        ]);
        await supabaseFetch(claim, {
          method: "PATCH",
          body: JSON.stringify({ message_id: messageId ?? null }),
        });
      } catch (err) {
        summary.errors++;
        logger.error({ err }, "mira: a sent nudge was not added to the chat");
      }
    } finally {
      // Not sent: give the day back, so the next run can send it.
      if (!delivered) await supabaseFetch(claim, { method: "DELETE" });
    }
    summary.sent++;
    logMiraEvent("nudge_sent", { userId: user.id }, { type: nudge.type });
  }

  // A few people at a time. Nobody is started once the budget is spent, so the ones in flight
  // finish before the function is killed; the rest wait for the slot's second run.
  // ponytail: oldest accounts first; if two runs cannot reach everyone, the newest wait and the
  // run records an error. Raise CONCURRENCY (or rotate the order) when that shows up.
  let next = 0;
  const worker = async () => {
    while (next < due.length) {
      if (outOfTime()) {
        summary.stoppedEarly = true;
        return;
      }
      const user = due[next++]!;
      try {
        await nudgeOne(user);
      } catch (err) {
        summary.errors++;
        logger.error({ err }, "mira: a nudge failed");
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return summary;
}

/** The kind ids, for the "Only some nudges" choice. */
export const NUDGE_CHOICES = NUDGE_KINDS.map((k) => ({ id: k.id, title: k.title }));
export const NUDGE_PAUSE_DAYS = PAUSE_DAYS;

// Shared with the daily journal's reminder email (server/journal.ts): the same sender, company
// line and quiet days after a crisis.
export { from as miraEmailFrom, CRISIS_QUIET_DAYS, hadCrisis };
