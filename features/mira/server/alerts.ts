import { Redis } from "@upstash/redis";
import { Resend } from "resend";
import { scheduleAfterResponse } from "@shared/http/after-response";
import { checkRateLimit } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";
import { escapeSlack, notifySlack } from "@shared/observability/slack";
import { GLOBAL_DAILY_MESSAGES } from "./config";

/**
 * Mira's alerts to her owner (20 Nov 2026): a plain email to MIRA_ALERT_EMAIL and a post in the
 * ops channel, at most once per key a day. What alerts: the AI budget used up (model.ts), this
 * month's estimated AI spend at 80% and 100% of MIRA_MONTHLY_BUDGET_USD (recordUsage, from every
 * model reply, the chat's and the nudges'), the daily ceiling for everyone (the chat route) and
 * the hourly cap on sign-in code emails (the auth route).
 */

export type Alert = { key: string; subject: string; text: string };

const DAY_MS = 86_400_000;

/**
 * Keys this server instance already alerted (or saw alerted) today. The rate limiter's own
 * in-memory fallback forgets every hit after 5 minutes, so without this, staging (no Upstash,
 * but production's Resend) or an Upstash outage could email the owner every few minutes.
 */
const alertedHere = new Map<string, number>();

export async function alertTeam({ key, subject, text }: Alert): Promise<void> {
  try {
    if (Date.now() - (alertedHere.get(key) ?? -Infinity) < DAY_MS) return;
    alertedHere.set(key, Date.now());
    // Once per key a day for every instance together, counted in Upstash
    // (shared/http/ratelimit). When Upstash errors the alert goes anyway, and the limiter logs it.
    const once = await checkRateLimit(key, { bucket: "mira-alert", limit: 1, windowMs: DAY_MS });
    if (!once.allowed) return;
    const where = `Sent by ${process.env.NEXT_PUBLIC_SITE_URL || "a local server"}.`;
    await Promise.all([
      emailOwner(subject, `${text}\n\n${where}`),
      notifySlack({
        channel: "ops",
        kind: `mira_alert_${key}`,
        text: `:warning: ${escapeSlack(text)}`,
        username: "ops_alerts",
      }),
    ]);
  } catch (err) {
    logger.error({ err, key }, "mira: an alert was not sent");
  }
}

/** The same system sender as the admin and Jarvis sign-in emails. Plain text, no tracking. */
async function emailOwner(subject: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.error({ subject }, "mira: RESEND_API_KEY is not set, so an alert was not emailed");
    return;
  }
  const sent = await Promise.race([
    new Resend(apiKey).emails.send({
      from: process.env.RESEND_FROM || "LoveIQ <hello@send.loveiq.org>",
      to: process.env.MIRA_ALERT_EMAIL?.trim() || "ec@loveiq.org",
      subject,
      text,
    }),
    new Promise<{ error: Error }>((resolve) =>
      setTimeout(() => resolve({ error: new Error("Resend timeout") }), 8_000)
    ),
  ]);
  if (sent.error) logger.error({ err: sent.error, subject }, "mira: an alert email was not sent");
}

/** After the response, so an alert never slows the reply or the answer that raised it. */
const later = (alert: Alert) => scheduleAfterResponse("mira-alert", () => alertTeam(alert));

/** Anthropic said the money is used up (model.ts); `detail` is its message, which says until when. */
export function alertBudgetUsedUp(detail: string): void {
  later({
    key: "ai-budget-used-up",
    subject: "Mira's AI budget is used up",
    text:
      `Mira's AI budget is used up: people see "Mira is resting" until it is raised or resets. ` +
      `Anthropic said: ${detail.replace(/\s+/g, " ").slice(0, 300)}`,
  });
}

/** Everyone's model calls together reached GLOBAL_DAILY_MESSAGES today (the chat route). */
export function alertDailyCeiling(): void {
  later({
    key: `daily-ceiling:${new Date().toISOString().slice(0, 10)}`,
    subject: "Mira hit her daily ceiling",
    text:
      `Mira hit her daily ceiling (${GLOBAL_DAILY_MESSAGES} AI replies for everyone together): ` +
      `people see "resting" until midnight UTC.`,
  });
}

/** The auth route's cap on sign-in code emails for everyone, per hour. */
export function alertCodeCap(perHour: number): void {
  later({
    key: "sign-in-code-cap",
    subject: "Mira's sign-in emails reached their hourly cap",
    text:
      `${perHour} sign-in code emails went out in the last hour, so email sign-up waits until ` +
      `the hour is over (Google sign-in still works). A launch spike, or someone sending codes ` +
      `to strangers: check signup_code_sent in mira_event.`,
  });
}

/**
 * USD per million tokens, from the prices in Anthropic's claude-api skill (shared/models.md and
 * shared/model-migration.md, read 20 Nov 2026). Claude Sonnet 5.5: $2 in, $10 out, cache reads
 * $0.10, cache writes $2.50 (5 minutes) and $4 (1 hour). Claude Haiku 5.5: $0.10 in, $0.50 out,
 * cache reads 0.1x and writes 1.25x (5 minutes) and 2x (1 hour) the input price, for a prompt of
 * 100K tokens or fewer (5x above; Mira's whole prompt is about 125 KB of text, far below). Any
 * other model is priced as Sonnet.
 */
export const MODEL_PRICES = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, write5m: 2.5, write1h: 4 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, write5m: 0.125, write1h: 0.2 },
} as const;

/** The `usage` of a Messages API reply. */
export type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
};

export function costUsd(model: string, usage: Usage): number {
  const p = model.startsWith("claude-haiku-5-5")
    ? MODEL_PRICES["claude-haiku-5-5"]
    : MODEL_PRICES["claude-sonnet-5-5"];
  const n = (v: unknown) => (typeof v === "number" && v > 0 ? v : 0);
  const split = usage.cache_creation;
  return (
    (n(usage.input_tokens) * p.input +
      n(usage.output_tokens) * p.output +
      n(usage.cache_read_input_tokens) * p.cacheRead +
      n(split?.ephemeral_5m_input_tokens) * p.write5m +
      // Mira writes only 1-hour cache entries, so a write without the split is priced as one.
      n(split ? split.ephemeral_1h_input_tokens : usage.cache_creation_input_tokens) * p.write1h) /
    1e6
  );
}

export function monthlyBudgetUsd(): number {
  const v = Number(process.env.MIRA_MONTHLY_BUDGET_USD);
  return v > 0 ? v : 500;
}

let kv: Redis | null | undefined;
function spendStore(): Redis | null {
  if (kv !== undefined) return kv;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  // One try (`retry: false` still tries twice in @upstash/redis 1.39): a retried INCRBY whose
  // first answer was lost would count a reply twice.
  kv =
    url && token
      ? new Redis({ url, token, retry: { retries: 0 }, signal: () => AbortSignal.timeout(2_000) })
      : null;
  if (!kv) logger.warn("mira: no Upstash, so this month's AI spend is not counted");
  return kv;
}

/**
 * INCRBY that always leaves a TTL: a fixed Lua script Redis runs (EVAL, not JavaScript's eval),
 * as shared/http/ratelimit.ts's INCR_WITH_TTL.
 */
const ADD_SPEND = `
local total = redis.call('INCRBY', KEYS[1], ARGV[1])
if redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
end
return total
`;

/**
 * Adds one reply's estimated cost (millionths of a dollar) to this calendar month's total (UTC)
 * in Upstash, and alerts as the total crosses 80% and 100% of the budget: only the reply that
 * crosses a line alerts, so each line alerts once a month. After the response.
 */
export function recordUsage(model: string, usage: Usage): void {
  scheduleAfterResponse("mira-spend", async () => {
    const micros = Math.round(costUsd(model, usage) * 1e6);
    const store = micros > 0 ? spendStore() : null;
    if (!store) return;
    const month = new Date().toISOString().slice(0, 7);
    let total: number;
    try {
      total = Number(await store.eval(ADD_SPEND, [`mira:spend:${month}`], [micros, 40 * 86_400]));
    } catch (err) {
      logger.warn({ err }, "mira: a reply's AI spend was not counted");
      return;
    }
    const budget = monthlyBudgetUsd();
    for (const pct of [80, 100]) {
      const line = (pct / 100) * budget * 1e6;
      if (total - micros >= line || total < line) continue;
      const spent = `an estimated $${(total / 1e6).toFixed(2)} of $${budget}`;
      await alertTeam({
        key: `budget-${pct}:${month}`,
        subject: `Mira has used ${pct}% of this month's AI budget`,
        text:
          `Mira has used ${pct}% of this month's AI budget: ${spent}, counted from her ` +
          `replies' token use. This note stops nothing; when the Claude Console's limit is ` +
          `reached, people see "Mira is resting" until it is raised or the month ends.`,
      });
    }
  });
}
