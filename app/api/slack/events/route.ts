import { NextResponse } from "next/server";
import { answerQuestion } from "@features/brain/server/answer";
import {
  claimQuestion,
  finishQuestion,
  questionsToday,
  DAILY_QUESTION_LIMIT,
} from "@features/brain/server/log";
import {
  isBrainSlackConfigured,
  postBrainReply,
  stripMention,
  verifySlackSignature,
} from "@features/brain/server/slack";
import { scheduleAfterResponse } from "@shared/http/after-response";
import logger from "@shared/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Retrieval plus a model call runs after the 200 below, not inside it. The
// function must stay alive for that work, so the budget covers it.
export const maxDuration = 60;

/**
 * POST /api/slack/events
 *
 * The company brain's front door. Someone @-mentions the bot in a channel or DMs
 * it; this answers in-thread from LoveIQ's own docs, commits and Jira.
 *
 * Auth is the Slack request signature -- no CSRF, no rate-limit middleware, same
 * posture as the Stripe, Calendly and Resend webhooks. Safe to deploy before the
 * Slack app exists: with no signing secret it returns 503 and nothing calls it.
 *
 * THE 3-SECOND RULE SHAPES THIS WHOLE FILE. Slack retries any event it does not
 * see acknowledged within 3 seconds, and an answer takes longer than that. So the
 * 200 goes back immediately and the real work runs in `scheduleAfterResponse`.
 * The alternative -- answering inline -- produces duplicate answers under load
 * and burns a scarce daily model request on each duplicate.
 *
 * Post-deploy setup: create a Slack app (separate from the journey bot), add bot
 * scopes `app_mentions:read`, `chat:write`, `im:history`, `im:read`, `im:write`,
 * subscribe to `app_mention` and `message.im`, point the Request URL here, then
 * set SLACK_BRAIN_BOT_TOKEN and SLACK_BRAIN_SIGNING_SECRET.
 */

interface SlackEvent {
  type?: string;
  subtype?: string;
  bot_id?: string;
  user?: string;
  text?: string;
  channel?: string;
  channel_type?: string;
  ts?: string;
  thread_ts?: string;
}

interface SlackEnvelope {
  type?: string;
  challenge?: string;
  event_id?: string;
  event?: SlackEvent;
}

export async function POST(request: Request) {
  const secret = process.env.SLACK_BRAIN_SIGNING_SECRET;
  if (!secret) {
    logger.warn("SLACK_BRAIN_SIGNING_SECRET not set — refusing Slack event");
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  // Must be the exact bytes Slack signed. Parsing first and re-serialising would
  // change key order and whitespace, and the signature would never match.
  const rawBody = await request.text();

  if (
    !verifySlackSignature(
      rawBody,
      request.headers.get("x-slack-signature"),
      request.headers.get("x-slack-request-timestamp"),
      secret
    )
  ) {
    logger.warn("Slack events signature verification failed");
    return NextResponse.json({ error: "Invalid request." }, { status: 401 });
  }

  const payload = JSON.parse(rawBody || "{}") as SlackEnvelope;

  // Slack's one-time endpoint handshake.
  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge ?? "" });
  }

  const event = payload.event;
  if (payload.type !== "event_callback" || !event) {
    return NextResponse.json({ ok: true });
  }

  // LOOP GUARD. The brain's own reply into a DM comes straight back as another
  // `message.im`. Without this the bot answers itself until the daily quota is
  // gone. `subtype` also filters joins, edits and deletions, none of which are
  // questions.
  if (event.bot_id || event.subtype || !event.user) {
    return NextResponse.json({ ok: true });
  }

  const isMention = event.type === "app_mention";
  const isDirectMessage = event.type === "message" && event.channel_type === "im";
  if (!isMention && !isDirectMessage) {
    return NextResponse.json({ ok: true });
  }

  const question = stripMention(event.text ?? "");
  const channel = event.channel;
  if (!channel || question.length < 2) {
    return NextResponse.json({ ok: true });
  }

  // Reply in-thread: under the mention in a channel, and under the message in a
  // DM, so a busy channel does not fill with loose answers.
  const threadTs = event.thread_ts ?? event.ts ?? null;

  // The claim IS the dedupe: `slack_event_id` is UNIQUE, so a retried delivery
  // loses the insert and stops here rather than spending a second model request.
  const claim = await claimQuestion({
    question,
    slackEventId: payload.event_id ?? null,
    slackUserId: event.user ?? null,
    slackChannelId: channel,
  });
  if (claim.duplicate) {
    logger.info({ eventId: payload.event_id }, "brain: duplicate Slack delivery ignored");
    return NextResponse.json({ ok: true });
  }

  scheduleAfterResponse("brain-answer", async () => {
    if (!isBrainSlackConfigured()) {
      logger.warn("SLACK_BRAIN_BOT_TOKEN not set — cannot reply");
      await finishQuestion(claim.id, { error: "slack bot token missing" });
      return;
    }

    // Fails OPEN when the count cannot be read: refusing to answer because a
    // bookkeeping query failed is worse than briefly overrunning the quota.
    const asked = await questionsToday();
    if (asked !== null && asked > DAILY_QUESTION_LIMIT) {
      await postBrainReply({
        channel,
        threadTs,
        text: `We've used up today's free model quota (${DAILY_QUESTION_LIMIT} questions). It resets at midnight UTC.`,
      });
      await finishQuestion(claim.id, { error: "daily quota exceeded" });
      return;
    }

    const answer = await answerQuestion({ question });
    const posted = await postBrainReply({
      channel,
      threadTs,
      text: answer.text,
      blocks: answer.blocks,
    });

    await finishQuestion(claim.id, {
      sourceCount: answer.sources.length,
      latencyMs: answer.latencyMs,
      error: posted ? (answer.status === "answered" ? null : answer.status) : "slack post failed",
    });
  });

  return NextResponse.json({ ok: true });
}
