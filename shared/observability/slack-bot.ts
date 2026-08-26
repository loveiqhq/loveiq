/**
 * Slack Web API transport, for the one thing incoming webhooks cannot do: edit a
 * message after it has been posted.
 *
 * WHY THIS EXISTS. The per-user journey notification is posted the moment a survey
 * is submitted, when the only milestone that can possibly be true is "survey
 * done" — report-open, paywall, checkout and paid are all read from rows that do
 * not exist yet. So the rail was permanently stuck at 1 of 5 and two of the four
 * experiment arms permanently read "Not recorded". An incoming webhook returns no
 * message id, so there was nothing to come back and update. `chat.postMessage`
 * returns a `ts`, which makes `chat.update` possible.
 *
 * DEGRADES TO NOTHING. Every function here returns null/false when
 * `SLACK_BOT_TOKEN` or `SLACK_JOURNEY_CHANNEL_ID` is unset, so callers fall back
 * to the existing webhook and behaviour is byte-identical without config. That
 * matches how every other optional integration in this repo is gated.
 *
 * Slack's Web API answers HTTP 200 with `{ok: false, error: "..."}` for
 * application errors, so the status code alone means nothing — the body has to be
 * read. Getting that wrong is why a "successful" post can silently vanish.
 */

import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import type { SlackBlock } from "@shared/observability/slack";

const SLACK_API = "https://slack.com/api";
const TIMEOUT_MS = 5000;

export interface PostedMessage {
  channel: string;
  ts: string;
}

function config(): { token: string; channel: string } | null {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_JOURNEY_CHANNEL_ID;
  if (!token || !channel) return null;
  return { token, channel };
}

/** True when live-updating journey messages are configured. */
export function isSlackBotConfigured(): boolean {
  return config() !== null;
}

async function callSlack(
  method: "chat.postMessage" | "chat.update",
  token: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetchWithTimeout(`${SLACK_API}/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
      timeoutMs: TIMEOUT_MS,
    });
    // Never log the token, and never log `blocks` — they can carry a masked email.
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!json || json.ok !== true) {
      logger.warn(
        { method, status: res.status, slackError: json?.error ?? "unparseable", slack: false },
        "slack-bot call failed"
      );
      return null;
    }
    return json;
  } catch (err) {
    // `slack: false` stops the pino transport alerting Slack about Slack.
    logger.warn({ err, method, slack: false }, "slack-bot call threw");
    return null;
  }
}

/**
 * Post a message and return its id so it can be edited later. Null when the bot
 * is not configured or the call failed — the caller must then post via webhook.
 */
export async function postJourneyMessage(input: {
  text: string;
  blocks: SlackBlock[];
  /**
   * Post as a reply under this message instead of into the channel.
   *
   * Used by the catch-up backfill: most of the past week's messages were posted
   * by the incoming webhook — a DIFFERENT Slack app — so chat.update cannot edit
   * them. Re-posting the week as thread replies gives one place to skim it
   * without eighty new messages in the channel.
   */
  threadTs?: string;
}): Promise<PostedMessage | null> {
  const cfg = config();
  if (!cfg) return null;
  const json = await callSlack("chat.postMessage", cfg.token, {
    channel: cfg.channel,
    text: input.text,
    blocks: input.blocks,
    ...(input.threadTs ? { thread_ts: input.threadTs } : {}),
    // Link previews would push the blocks down and add noise.
    unfurl_links: false,
    unfurl_media: false,
  });
  if (!json) return null;
  const ts = typeof json.ts === "string" ? json.ts : null;
  const channel = typeof json.channel === "string" ? json.channel : cfg.channel;
  if (!ts) {
    logger.warn({ slack: false }, "slack-bot postMessage returned no ts");
    return null;
  }
  return { channel, ts };
}

/**
 * Edit an already-posted message in place. Returns false on any failure,
 * including the two expected ones: the message was deleted, or the channel id
 * changed. Both are non-events — the original message simply stops updating.
 */
export async function updateJourneyMessage(input: {
  channel: string;
  ts: string;
  text: string;
  blocks: SlackBlock[];
}): Promise<boolean> {
  const cfg = config();
  if (!cfg) return false;
  const json = await callSlack("chat.update", cfg.token, {
    channel: input.channel,
    ts: input.ts,
    text: input.text,
    blocks: input.blocks,
  });
  return json !== null;
}
