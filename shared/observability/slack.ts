import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";

/**
 * P-09: write a failed Slack send to the dead-letter table so an operator can
 * pull missed alerts post-incident. Best-effort — a Supabase write failure
 * here is also logged-and-dropped (with `slack:false` so the pino transport
 * does not recursively try to notify Slack about Slack's own DLQ failure).
 */
async function writeSlackDeadLetter(input: {
  channel: SlackChannel;
  kind: string;
  text: string;
  username?: string;
  failureReason: string;
  httpStatus?: number;
}): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return;

  try {
    await fetchWithTimeout(`${supabaseUrl}/rest/v1/slack_dead_letter`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        channel: input.channel,
        kind: input.kind,
        text: input.text,
        username: input.username ?? null,
        failure_reason: input.failureReason,
        http_status: input.httpStatus ?? null,
      }),
      timeoutMs: 3000,
    });
  } catch (err) {
    logger.error({ err, slack: false }, "Slack dead-letter write failed");
  }
}

export type SlackChannel = "ops" | "survey" | "contact" | "payments";

/* eslint-disable no-secrets/no-secrets -- env var names, not secrets */
const ENV_BY_CHANNEL: Record<SlackChannel, string> = {
  ops: "SLACK_OPS_WEBHOOK_URL",
  survey: "SLACK_SURVEY_WEBHOOK_URL",
  contact: "SLACK_CONTACT_WEBHOOK_URL",
  payments: "SLACK_PAYMENTS_WEBHOOK_URL",
};
/* eslint-enable no-secrets/no-secrets */

const DEDUP_WINDOW_MS = 60_000;
const DEDUP_MAX_ENTRIES = 500;

// Process-local dedup. Suppresses identical (channel, kind, text-prefix) pings
// within DEDUP_WINDOW_MS. Bounded to DEDUP_MAX_ENTRIES so a long-running
// process can't grow the map unbounded. Cross-instance dedup for cron-driven
// detectors is handled separately via the `slack_alert_sent` table.
const recentSends = new Map<string, number>();

function dedupKey(channel: SlackChannel, kind: string, text: string): string {
  return `${channel}:${kind}:${text.slice(0, 100)}`;
}

function shouldSuppress(key: string): boolean {
  const now = Date.now();
  const last = recentSends.get(key);
  if (last !== undefined && now - last < DEDUP_WINDOW_MS) return true;

  recentSends.set(key, now);

  // Bound the map: prune expired entries, then if still over the cap, drop
  // the oldest by insertion order (Map preserves insertion order). This
  // guarantees size <= DEDUP_MAX_ENTRIES even under a true storm where
  // every entry is still inside the dedup window.
  if (recentSends.size > DEDUP_MAX_ENTRIES) {
    for (const [k, t] of recentSends) {
      if (now - t >= DEDUP_WINDOW_MS) recentSends.delete(k);
    }
    while (recentSends.size > DEDUP_MAX_ENTRIES) {
      const first = recentSends.keys().next().value;
      if (first === undefined) break;
      recentSends.delete(first);
    }
  }
  return false;
}

export function maskEmail(email: string): string {
  return email.replace(/^(.).+(@.+)$/, "$1***$2");
}

// Slack mrkdwn treats `&<>*_~``` as formatting characters. Escape so
// user-supplied strings render literally and can't break the message layout.
export function escapeSlack(value: string): string {
  return value.replace(/[&<>*_~`]/g, (c) => `\\${c}`);
}

/**
 * Slack Block Kit primitives — typed loosely so call sites can pass any
 * supported block shape (section, image, divider, header, context). We don't
 * import @slack/types because it pulls in a large dependency we don't need;
 * the structural types here cover what notifySlack actually forwards.
 */
export type SlackBlock = {
  type: string;
  [key: string]: unknown;
};

interface NotifySlackInput {
  channel: SlackChannel;
  kind: string;
  /**
   * Plain-text fallback. ALWAYS required — Slack uses this for notification
   * previews, screen readers, and clients that don't render Block Kit.
   * Even when `blocks` is provided, `text` must be non-empty.
   */
  text: string;
  /**
   * Optional Block Kit blocks. When provided, Slack renders these in-channel
   * instead of `text`. `text` is still used as the notification preview.
   * Max 50 blocks per Slack rules.
   */
  blocks?: SlackBlock[];
  username?: string;
  context?: Record<string, unknown>;
}

export async function notifySlack(input: NotifySlackInput): Promise<void> {
  const { channel, kind, text, blocks, username, context } = input;
  const envVar = ENV_BY_CHANNEL[channel];
  const webhookUrl = process.env[envVar];

  if (!webhookUrl) {
    logger.warn({ channel, kind, envVar }, "Slack webhook env unset; skipping notification");
    return;
  }

  if (shouldSuppress(dedupKey(channel, kind, text))) return;

  try {
    const body: Record<string, unknown> = { text };
    if (username) body.username = username;
    if (blocks && blocks.length > 0) body.blocks = blocks;

    const res = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 5000,
    });

    if (!res.ok) {
      const respBody = await res.text().catch(() => "");
      logger.error(
        { channel, kind, status: res.status, respBody, ...context, slack: false },
        "Slack webhook failed"
      );
      // P-09: capture the missed alert so an operator can replay it.
      await writeSlackDeadLetter({
        channel,
        kind,
        text,
        username,
        failureReason: `HTTP ${res.status}: ${respBody.slice(0, 200)}`,
        httpStatus: res.status,
      });
    }
  } catch (err) {
    // slack:false here is critical — without it the pino transport hook would
    // recursively try to notify Slack about Slack's own failure.
    logger.error({ err, channel, kind, ...context, slack: false }, "Slack webhook error");
    // P-09: network/timeout failures also DLQ. fetchWithTimeout's AbortError
    // and DNS errors all land here.
    await writeSlackDeadLetter({
      channel,
      kind,
      text,
      username,
      failureReason: err instanceof Error ? err.message.slice(0, 200) : "unknown",
    });
  }
}

// Test-only escape hatch so deduplication doesn't bleed between test cases.
// Production code should never call this.
export function __resetSlackDedupForTests(): void {
  recentSends.clear();
}
