import { NextResponse } from "next/server";
import { claimQuestion, finishQuestion } from "@features/brain/server/log";
import {
  isBrainSlackConfigured,
  postBrainReply,
  stripMention,
  verifySlackSignature,
} from "@features/brain/server/slack";
import { scheduleAfterResponse } from "@shared/http/after-response";
import {
  markSlackAlertDelivered,
  tryClaimSlackAlert,
} from "@shared/observability/slack-alert-dedup";
import logger from "@shared/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The channel ingest runs after the 200 below, not inside it. The function must
// stay alive for that work, so the budget covers it.
export const maxDuration = 60;

/**
 * QUESTIONS ARE ANSWERED IN CLAUDE NOW, not here.
 *
 * Decided 2026-09-23: the brain lives in claude.ai and Claude Code, where it has every
 * tool, links every source and offers ready-made prompts. This Slack door answered one
 * question between 28 August and that day, against 1,647 calls through Claude, and each
 * answer spent a free-tier model request. A mention or a DM now gets this pointer and no
 * model call. Channel messages are still indexed below, which is unchanged.
 */
export const CLAUDE_REDIRECT =
  "I answer questions in Claude now, not in Slack. Open claude.ai or Claude Code with the " +
  "LoveIQ brain connector and ask there: it searches everything we have, links every " +
  'source, and has ready-made prompts like "Catch me up" and "What needs me".';

/**
 * POST /api/slack/events
 *
 * Slack's side of the company brain. A public channel message is pushed here and
 * indexed; a mention or a DM gets a one-line pointer to Claude, where questions are
 * answered (see CLAUDE_REDIRECT).
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
  // Who SPOKE, as opposed to whose workspace the envelope was addressed to. In a
  // Slack Connect shared channel these differ: the envelope carries our own team_id
  // while the human is in theirs. `user_team` is the current field; `team` and
  // `source_team` appear on older/again-shared payloads.
  user_team?: string;
  team?: string;
  source_team?: string;
}

interface SlackEnvelope {
  type?: string;
  challenge?: string;
  event_id?: string;
  team_id?: string;
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

  /**
   * WHOSE WORKSPACE IS THE HUMAN IN? Not the envelope's.
   *
   * A signed request proves the sender is Slack, not that it is OUR Slack, and the
   * envelope's `team_id` is the workspace the app is INSTALLED in -- ours -- even
   * when the person who spoke is not in it. That is what an externally-shared
   * (Slack Connect) channel is. Gating on the envelope therefore let any member of
   * a foreign workspace in a shared channel both question the whole corpus and push
   * their text into it. `user_team` names the speaker; `team` / `source_team` are
   * the same thing on older or re-shared payloads.
   *
   * Falling back to the envelope keeps a same-workspace event working when Slack
   * omits all three, but an event with NO team field at all now fails CLOSED --
   * `expectedTeam && askerTeam !== expectedTeam` is true when askerTeam is
   * undefined. The previous `&& payload.team_id` clause answered those.
   *
   * Computed once because BOTH gates need it: the question path below, and the
   * public-channel branch that writes Slack messages into the corpus.
   */
  const expectedTeam = process.env.SLACK_BRAIN_TEAM_ID;
  const askerTeam = event.user_team ?? event.team ?? event.source_team ?? payload.team_id;
  const foreignWorkspace = Boolean(expectedTeam) && askerTeam !== expectedTeam;

  // LOOP GUARD. The brain's own reply into a DM comes straight back as another
  // `message.im`. Without this the bot answers itself until the daily quota is
  // gone. `subtype` also filters joins, edits and deletions, none of which are
  // questions.
  if (event.bot_id || event.subtype || !event.user) {
    return NextResponse.json({ ok: true });
  }

  const isMention = event.type === "app_mention";
  const isDirectMessage = event.type === "message" && event.channel_type === "im";

  /**
   * PUSH-BASED SLACK INGEST.
   *
   * A message in a public channel is not a question for the bot — it is new
   * corpus. Polling every 15 minutes made the brain up to 15 minutes behind the
   * conversation; this makes it seconds behind, because Slack tells us the moment
   * something is said. The 15-minute cron stays as the safety net: if this webhook
   * is ever unsubscribed, misconfigured or failing, the corpus degrades to
   * quarter-hourly rather than stopping.
   *
   * Requires the `message.channels` event subscription on the brain app. The
   * `channels:history` scope it needs is already granted.
   *
   * The team check is repeated here rather than reused below, because a signed
   * request only proves the sender is Slack — not that it is OUR Slack — and this
   * branch WRITES to the corpus.
   */
  const isPublicChannelMessage = event.type === "message" && event.channel_type === "channel";
  if (isPublicChannelMessage) {
    if (foreignWorkspace) {
      logger.warn(
        { askerTeam: askerTeam ?? null, envelopeTeam: payload.team_id ?? null },
        "brain: channel message from an unexpected workspace"
      );
      return NextResponse.json({ ok: true });
    }
    // Ack first, ingest after: Slack's deadline is 3s and the pass takes ~4-12s.
    scheduleAfterResponse("brain-slack-push", async () => {
      /**
       * DEBOUNCE TO ONE PASS PER MINUTE. A busy thread produces a burst of events,
       * and each one would otherwise start a full incremental pass — the same work,
       * concurrently, racing on the same rows. The claim is atomic (a UNIQUE
       * constraint), so exactly one event per minute wins and the rest return.
       */
      const minute = new Date().toISOString().slice(0, 16);
      if (!(await tryClaimSlackAlert("brain_slack_push", "minute", minute))) return;
      try {
        const { ingestSlack } = await import("@features/brain/server/ingest/slack");
        const startedAt = Date.now();
        const result = await ingestSlack(
          new Date().toISOString(),
          () => Date.now() - startedAt > 25_000
        );
        logger.info({ result }, "brain: slack push ingest");
      } catch (err) {
        // Never throw out of the deferred block: the 15-minute cron is the net,
        // and a failed push must not look like a failed Slack delivery.
        logger.error({ err }, "brain: slack push ingest failed");
      } finally {
        await markSlackAlertDelivered("brain_slack_push", "minute", minute);
      }
    });
    return NextResponse.json({ ok: true });
  }

  if (!isMention && !isDirectMessage) {
    return NextResponse.json({ ok: true });
  }

  const question = stripMention(event.text ?? "");
  const channel = event.channel;
  if (!channel || question.length < 2) {
    return NextResponse.json({ ok: true });
  }

  // A signed request proves it came from Slack, not that it came from OUR Slack.
  // The corpus is deliberately undifferentiated -- revenue, ad spend, cost per
  // customer, every internal doc -- so there is no per-source restriction to fall
  // back on if the app is ever installed somewhere else. Env-gated so an unset
  // value cannot lock the team out of its own bot.
  // The corpus is deliberately undifferentiated -- revenue, ad spend, cost per
  // customer, compensation threads, every internal doc -- so there is no per-source
  // restriction to fall back on if a stranger reaches this. See `askerTeam` above for
  // why the envelope's team_id was the wrong field to gate on.
  if (foreignWorkspace) {
    logger.warn(
      { askerTeam: askerTeam ?? null, envelopeTeam: payload.team_id ?? null },
      "brain: event from an unexpected Slack workspace"
    );
    return NextResponse.json({ ok: true });
  }

  // Dedupe is the ONLY thing standing between a Slack retry storm and answering
  // the same question three times, and it keys on `event_id`. Without one we
  // cannot tell a retry from a new question, so we decline rather than risk
  // uncapped duplicate answers. Slack sends it on every `event_callback`.
  const eventId = payload.event_id;
  if (!eventId) {
    logger.warn("brain: event_callback with no event_id — cannot dedupe, declining");
    return NextResponse.json({ ok: true });
  }

  // Reply in-thread: under the mention in a channel, and under the message in a
  // DM, so a busy channel does not fill with loose answers.
  const threadTs = event.thread_ts ?? event.ts ?? null;
  const userId = event.user;

  // NOTHING SLOW BEFORE THE ACK. The claim used to sit here, an awaited Supabase
  // round trip with an 8s ceiling inside a 3s budget -- and it fails open, so
  // when Supabase was slow the ack missed 3s, Slack retried, and every retry
  // also failed the claim open and answered. Three duplicate answers, three
  // model requests, none of them counted. Moved into the deferred block: both
  // deliveries now ack instantly and race on the UNIQUE constraint, where
  // exactly one wins.
  scheduleAfterResponse("brain-answer", async () => {
    const claim = await claimQuestion({
      question,
      slackEventId: eventId,
      slackUserId: userId ?? null,
      slackChannelId: channel,
    });
    if (claim.duplicate) {
      logger.info({ eventId }, "brain: duplicate Slack delivery ignored");
      return;
    }

    if (!isBrainSlackConfigured()) {
      logger.warn("SLACK_BRAIN_BOT_TOKEN not set — cannot reply");
      await finishQuestion(claim.id, { error: "slack bot token missing" });
      return;
    }

    const posted = await postBrainReply({ channel, threadTs, text: CLAUDE_REDIRECT });
    await finishQuestion(claim.id, {
      error: posted ? "redirected to Claude" : "slack post failed",
    });
  });

  return NextResponse.json({ ok: true });
}
