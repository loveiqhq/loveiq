import { createHmac, timingSafeEqual } from "node:crypto";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import type { SlackBlock } from "@shared/observability/slack";

/**
 * Slack transport for the brain: signature verification in, replies out.
 *
 * A SEPARATE SLACK APP FROM THE JOURNEY BOT, DELIBERATELY. `SLACK_BOT_TOKEN`
 * drives the live per-user journey messages. Adding event subscriptions and the
 * `im:*` scopes to that app forces a reinstall, which risks breaking a working
 * production integration for no benefit -- and a distinct app also gets its own
 * name and avatar in Slack, which is better for something people talk to.
 *
 * `shared/observability/slack-bot.ts` is not reused for posting because it is
 * hardcoded to the journey channel and the journey token; the brain replies into
 * whatever channel or DM it was asked in, in-thread.
 */

/** Slack rejects a request older than 5 minutes; matching that bounds replay. */
const SIGNATURE_TOLERANCE_SEC = 300;
const TIMEOUT_MS = 8000;

export function isBrainSlackConfigured(): boolean {
  return Boolean(process.env.SLACK_BRAIN_BOT_TOKEN && process.env.SLACK_BRAIN_SIGNING_SECRET);
}

/**
 * Verify Slack's `v0` request signature: HMAC-SHA256 over
 * `v0:{timestamp}:{rawBody}`, compared in constant time.
 *
 * The raw body must be the EXACT bytes Slack sent -- re-serialising a parsed
 * object changes key order and whitespace and the signature will never match.
 */
export function verifySlackSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  secret: string,
  nowMs: number = Date.now()
): boolean {
  if (!signature || !timestamp) return false;

  const tsSec = Number(timestamp);
  if (!Number.isFinite(tsSec)) return false;
  if (Math.abs(nowMs / 1000 - tsSec) > SIGNATURE_TOLERANCE_SEC) return false;

  const expected = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(signature);
  // timingSafeEqual throws on a length mismatch, so this guard is required, not
  // an optimisation.
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

/** Remove the leading `<@U123ABC>` mention so the model sees only the question. */
export function stripMention(text: string): string {
  return text
    .replace(/<@[UWB][A-Z0-9]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function postBrainReply(input: {
  channel: string;
  threadTs?: string | null;
  text: string;
  blocks?: SlackBlock[];
}): Promise<boolean> {
  const token = process.env.SLACK_BRAIN_BOT_TOKEN;
  if (!token) return false;

  try {
    const res = await fetchWithTimeout("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: input.channel,
        text: input.text.slice(0, 3000),
        ...(input.blocks?.length ? { blocks: input.blocks } : {}),
        ...(input.threadTs ? { thread_ts: input.threadTs } : {}),
        unfurl_links: false,
        unfurl_media: false,
      }),
      timeoutMs: TIMEOUT_MS,
    });

    // Slack answers HTTP 200 with {ok:false, error} for application errors, so
    // the status code alone means nothing -- the body has to be read. Getting
    // this wrong is why a "successful" post can silently vanish.
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (json?.ok !== true) {
      // Never log the token or the blocks -- blocks carry corpus text.
      logger.warn(
        { status: res.status, slackError: json?.error ?? "unparseable", slack: false },
        "brain slack post failed"
      );
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err, slack: false }, "brain slack post threw");
    return false;
  }
}
