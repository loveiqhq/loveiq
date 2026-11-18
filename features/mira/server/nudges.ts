import { createHmac, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";
import { supabaseFetch } from "@features/admin/server/supabase";
import { isEmailSuppressed } from "@shared/emails/suppression";
import { getEmailSiteUrl } from "@shared/emails/site-url";
import { escapeHtml } from "@shared/format/html-escape";
import logger from "@shared/observability/logger";
import nudgeConfig from "../content/nudges.json";
import { askModel, isModelConfigured } from "./model";
import { addMessages, logMiraEvent } from "./store";

/**
 * Mira's daily nudge emails (Sanjin's coach config, board 09; Marcus's unsubscribe boards,
 * 18 Nov 2026). At most one a day, at the person's chosen time in their time zone, outside the
 * quiet hours; never the same kind twice in a row; only for signed-in people whose chats Mira
 * remembers, since a nudge picks up on the last chat. The model writes the body; the subject is
 * the kind's fixed teaser plus the suffix, so nothing personal shows in an inbox. The nudge also
 * becomes Mira's latest message in that chat, so the button opens the chat with it in place.
 * Nudges stop only when the person stops them (or pauses them, or the address is suppressed).
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
const WINDOW_MIN = 30;
const PAUSE_DAYS = 14;
const DAY_MS = 86_400_000;
/** No nudge while someone is chatting, nor after a crisis (Sanjin's stop rails). */
const RECENT_CHAT_MS = 12 * 3_600_000;
const CRISIS_QUIET_DAYS = 14;
const HISTORY = 16;

// ── Tokens: stateless links in the email (no sign-in needed to stop or change nudges) ──────────

/** The same fallback chain as the share-recipient cookies: a dedicated secret, else derived. */
function secret(): string | null {
  for (const v of [
    process.env.UNSUBSCRIBE_SECRET,
    process.env.SHARE_VERIFY_SECRET,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ]) {
    const s = v?.trim();
    if (s && s.length >= 16) return s;
  }
  return null;
}

function sign(purpose: "prefs" | "open", id: string, key: string): string {
  return createHmac("sha256", key).update(`mira-nudge:${purpose}:${id}`).digest("base64url");
}

export function makeToken(purpose: "prefs" | "open", id: string): string | null {
  const key = secret();
  return key ? `${id}.${sign(purpose, id, key)}` : null;
}

/** The id the token was made for, or null if it was not made by us for this purpose. */
export function readToken(
  purpose: "prefs" | "open",
  token: string | null | undefined
): string | null {
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

/** The cron runs every 30 minutes; each person is due in the half hour from their time. */
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
  progressDay: boolean;
}): NudgeType[] {
  return NUDGE_TYPES.filter((t) => {
    if (t === input.lastType) return false;
    if (input.kept && !input.kept.includes(t)) return false;
    if (t === "agreement") return input.chattedYesterday;
    if (t === "progress") return input.progressDay;
    if (t === "share") return input.daysSinceChat >= 2;
    return true;
  });
}

/** When the next nudge can come, for the "saved" screen. */
export function nextNudgeAt(
  user: Pick<NudgeUser, "nudge_time" | "time_zone" | "nudge_frequency" | "nudges_paused_until">,
  now: Date
): Date {
  const from = Math.max(now.getTime(), Date.parse(user.nudges_paused_until ?? "") || 0);
  for (let step = 0; step < 14 * 48; step++) {
    const at = new Date(from + step * WINDOW_MIN * 60_000);
    if (isDue({ ...user, nudges_paused_until: null } as NudgeUser, at)) return at;
  }
  return new Date(from);
}

// ── The model's part: one short body, in Sanjin's words ───────────────────────────────────────

export const NUDGE_INSTRUCTIONS = `# Mira's daily nudge email

You are Mira, an AI coach for body confidence in sex. Write today's nudge email to a person who chats with you.

${nudgeConfig.instructions}

The subject is set by the app (the kind's own teaser and the suffix), so write only the body: one or two short paragraphs, at most three sentences in all, greeting them by first name if you know it. Plain words, warm, never pushy. Never mention weight, sizes, food, body shape or appearance goals; never diagnose; never promise what a practice will do. If the last chat touched self-harm, abuse, an eating disorder or someone under 18, or you can't write a nudge that fits, reply with {"skip": true}.

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

function from(): string {
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
  const subject = `${kind.teaser}${nudgeConfig.subjectSuffix}`;
  const css = (rules: Record<string, string>) =>
    Object.entries(rules)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");
  const ink = { color: "#3f3a4d", "font-size": "15px", "line-height": "1.6" };
  const paragraphs = input.body
    .split(/\n\s*\n/)
    .map((p) => `<p style="${css({ margin: "0 0 16px", ...ink })}">${escapeHtml(p.trim())}</p>`)
    .join("");
  const footerLink = (label: string) =>
    `<a href="${input.prefsUrl}" style="${css({ color: "#c4b5fd", "font-weight": "700", "margin-right": "18px" })}">${label}</a>`;
  const button = css({
    display: "inline-block",
    padding: "14px 24px",
    "border-radius": "9999px",
    background: "#000000",
    color: "#ffffff",
    "font-weight": "700",
    "text-decoration": "none",
  });
  const footer = css({
    background: "#161021",
    color: "#e2dafb",
    padding: "24px",
    "font-size": "13px",
  });
  const html = [
    `<!doctype html><html><body style="${css({ margin: "0", background: "#ffffff" })}">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${css({ "max-width": "560px", margin: "0 auto", "font-family": "Arial, sans-serif" })}">`,
    `<tr><td style="${css({ padding: "24px 20px 8px", "font-weight": "700" })}">Mira</td></tr>`,
    `<tr><td style="${css({ padding: "8px 20px 24px" })}">${paragraphs}`,
    `<a href="${input.openUrl}" style="${button}">${escapeHtml(kind.button)}</a></td></tr>`,
    `<tr><td style="${footer}">`,
    `<p style="${css({ margin: "0 0 12px", "font-size": "18px", "font-weight": "700" })}">LoveIQ</p>`,
    `<p style="${css({ margin: "0 0 12px" })}">You get this because you turned on <b>daily nudges from Mira</b>. One email a day at most.</p>`,
    `<p style="${css({ margin: "0 0 12px" })}">${footerLink("Fewer nudges")}${footerLink("Pause")}${footerLink("Unsubscribe")}</p>`,
    `<p style="${css({ margin: "0", color: "#b6aecb", "font-size": "12px" })}">Applied Psychometrics UG · Berlin</p>`,
    `</td></tr></table></body></html>`,
  ].join("\n");
  const text =
    `${input.body}\n\n${kind.button}: ${input.openUrl}\n\n` +
    `You get this because you turned on daily nudges from Mira. One email a day at most.\n` +
    `Fewer nudges, pause or unsubscribe: ${input.prefsUrl}\n\nApplied Psychometrics UG · Berlin`;
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

export async function nudgeCandidates(): Promise<NudgeUser[]> {
  return rows<NudgeUser>(
    `/rest/v1/mira_user?nudges_on=is.true&nudges_stopped_at=is.null&remember_chats=is.true&select=${USER_COLS}&order=created_at.asc&limit=2000`
  );
}

type ChatTurn = { role: "user" | "assistant"; content: string; created_at: string };

async function lastChat(userId: string): Promise<{ id: string; turns: ChatTurn[] } | null> {
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

async function lastNudge(userId: string): Promise<{ type: NudgeType; local_day: string } | null> {
  const found = await rows<{ type: NudgeType; local_day: string }>(
    `/rest/v1/mira_nudge?user_id=eq.${enc(userId)}&select=type,local_day&order=created_at.desc&limit=1`
  );
  return found[0] ?? null;
}

async function hadCrisis(userId: string, since: Date): Promise<boolean> {
  const found = await rows<{ id: number }>(
    `/rest/v1/mira_event?user_id=eq.${enc(userId)}&name=eq.crisis_shown&created_at=gte.${enc(since.toISOString())}&select=id&limit=1`
  );
  return found.length > 0;
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
  opts: { budgetMs?: number; only?: string[] } = {}
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
  resend ??= new Resend(process.env.RESEND_API_KEY);

  const started = Date.now();
  const site = getEmailSiteUrl();
  let users = await nudgeCandidates();
  if (opts.only) users = users.filter((u) => opts.only!.includes(u.id));
  summary.candidates = users.length;

  for (const user of users) {
    if (Date.now() - started > (opts.budgetMs ?? 40_000)) {
      summary.stoppedEarly = true;
      break;
    }
    if (!isDue(user, now)) continue;
    summary.due++;
    try {
      const local = localParts(now, user.time_zone);
      const previous = await lastNudge(user.id);
      if (previous?.local_day === local.day) {
        skip("already-today");
        continue;
      }
      if (await isEmailSuppressed(user.email)) {
        skip("suppressed");
        continue;
      }
      if (await hadCrisis(user.id, new Date(now.getTime() - CRISIS_QUIET_DAYS * DAY_MS))) {
        skip("recent-crisis");
        continue;
      }
      const lastSaid = await lastUserMessageAt(user.id);
      const chat = await lastChat(user.id);
      if (!lastSaid || !chat || chat.turns.length === 0) {
        skip("no-chat");
        continue;
      }
      if (now.getTime() - lastSaid < RECENT_CHAT_MS) {
        skip("chatting");
        continue;
      }
      const lastDay = localParts(new Date(lastSaid), user.time_zone).day;
      const yesterday = localParts(new Date(now.getTime() - DAY_MS), user.time_zone).day;
      const allowed = allowedTypes({
        kept: user.nudge_types,
        lastType: previous?.type ?? null,
        daysSinceChat: Math.floor((now.getTime() - lastSaid) / DAY_MS),
        chattedYesterday: lastDay === yesterday,
        progressDay:
          localParts(new Date(user.created_at), user.time_zone).weekday === local.weekday,
      });
      if (!allowed.length) {
        skip("no-kind-fits");
        continue;
      }

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
      if (!nudge) {
        skip(result.ok ? "model-declined" : "model-down");
        continue;
      }

      const subject = `${kindOf(nudge.type).teaser}${nudgeConfig.subjectSuffix}`;
      const created = await supabaseFetch(
        "/rest/v1/mira_nudge?on_conflict=user_id,local_day&select=id",
        {
          method: "POST",
          headers: { Prefer: "return=representation,resolution=ignore-duplicates" },
          body: JSON.stringify({
            user_id: user.id,
            type: nudge.type,
            subject,

            local_day: local.day,
            chat_id: chat.id,
          }),
        }
      );
      const id = created.ok ? ((await created.json()) as Array<{ id: string }>)[0]?.id : null;
      if (!id) {
        skip("already-today");
        continue;
      }
      const [messageId] = await addMessages(chat.id, [{ role: "assistant", content: nudge.body }]);
      const openUrl = `${site}/api/mira/nudge?t=${enc(makeToken("open", id)!)}`;
      const prefsUrl = `${site}/mira/nudges?t=${enc(makeToken("prefs", user.id)!)}`;
      const unsubscribeUrl = `${site}/api/mira/nudges/unsubscribe?t=${enc(makeToken("prefs", user.id)!)}`;
      const email = nudgeEmail({ type: nudge.type, body: nudge.body, openUrl, prefsUrl });
      const sent = await resend.emails.send({
        from: from(),
        to: user.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      await supabaseFetch(`/rest/v1/mira_nudge?id=eq.${enc(id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          message_id: messageId ?? null,
          resend_id: sent.data?.id ?? null,
          sent_at: sent.error ? null : new Date().toISOString(),
        }),
      });
      if (sent.error) {
        summary.errors++;
        logger.error({ err: sent.error.name }, "mira: a nudge email was not sent");
        continue;
      }
      summary.sent++;
      logMiraEvent("nudge_sent", { userId: user.id }, { type: nudge.type });
    } catch (err) {
      summary.errors++;
      logger.error({ err }, "mira: a nudge failed");
    }
  }
  return summary;
}

/** The kind ids, for the "Only some nudges" choice. */
export const NUDGE_CHOICES = NUDGE_KINDS.map((k) => ({ id: k.id, title: k.title }));
export const NUDGE_PAUSE_DAYS = PAUSE_DAYS;
