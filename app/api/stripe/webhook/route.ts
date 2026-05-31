import { NextResponse } from "next/server";
import { processStripeWebhookEvent } from "@features/checkout/server/fulfillment";
import {
  getStripeServerClient,
  isStripeCheckoutEnabled,
} from "@features/checkout/server/stripeCheckout";
import logger from "@shared/observability/logger";
import { notifySlack } from "@shared/observability/slack";

export const runtime = "nodejs";

/**
 * R-10: parse the timestamp from the stripe-signature header and compare to
 * local wall time. Stripe's default tolerance is 300s; a drift >60s is the
 * early signal of NTP failure that would otherwise silently break all
 * webhooks once it crosses the threshold.
 */
function logSignatureDrift(signature: string): void {
  const tMatch = /(?:^|,)t=(\d+)/.exec(signature);
  if (!tMatch) return;
  const stripeTimeSec = parseInt(tMatch[1]!, 10);
  if (!Number.isFinite(stripeTimeSec)) return;
  const localTimeSec = Math.floor(Date.now() / 1000);
  const driftSec = Math.abs(localTimeSec - stripeTimeSec);
  if (driftSec > 60) {
    // Loud-warn at 60s; the 300s tolerance ceiling is where real damage
    // starts. fail-and-fix before then.
    logger.warn({ driftSec, stripeTimeSec, localTimeSec }, "Stripe webhook clock drift > 60s");
    if (driftSec > 120) {
      // 2 min headroom before Stripe's 300s tolerance. Slack ops at this
      // point so the team can react before webhooks start failing.
      void notifySlack({
        channel: "ops",
        kind: "stripe_webhook_clock_drift",
        text: `:clock1: Stripe webhook clock drift *${driftSec}s* (tolerance 300s). Check server NTP sync.`,
        username: "ops_alerts",
      });
    }
  }
}

export async function POST(request: Request) {
  if (!isStripeCheckoutEnabled()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const stripe = getStripeServerClient();
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !signature || !webhookSecret) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  logSignatureDrift(signature);

  try {
    const payload = await request.text();
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    // T-01: livemode guard. Stripe sends `event.livemode=true` for live-mode
    // events and `false` for test-mode. We refuse events whose mode doesn't
    // match OURS so a misrouted test event can never fulfill against prod data
    // (or a live event against a sandbox).
    //
    // Expected mode = the Stripe SECRET KEY's mode (`sk_live_` ⇒ live — the very
    // key that created the checkout and verified this event) OR an explicit
    // STRIPE_LIVE_MODE=true opt-in. Critically this is OR, not an override: a
    // live key ALWAYS expects live events, so STRIPE_LIVE_MODE can only ADD
    // live-expectation, never downgrade a live key to test. That makes the guard
    // footgun-proof — a `STRIPE_LIVE_MODE` that is missing OR stale-`false` on a
    // live-mode prod can no longer silently refuse 100% of real purchases.
    // A test/sandbox key (no opt-in) expects test events and refuses live ones.
    const expectedLive =
      process.env.STRIPE_LIVE_MODE === "true" ||
      (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_");
    if (event.livemode !== expectedLive) {
      logger.error(
        { eventId: event.id, type: event.type, eventLivemode: event.livemode, expectedLive },
        "Stripe webhook livemode mismatch — refusing event"
      );
      void notifySlack({
        channel: "ops",
        kind: "stripe_webhook_livemode_mismatch",
        text: `:rotating_light: Stripe webhook livemode mismatch — event \`${event.id}\` (${event.type}) livemode=${event.livemode} but this deployment expects live=${expectedLive} (derived from STRIPE_SECRET_KEY mode + STRIPE_LIVE_MODE). A cross-mode event hit this endpoint — check the Stripe dashboard webhook endpoint is registered to the matching account/mode.`,
        username: "ops_alerts",
      });
      // 200 to stop Stripe from retrying — the mismatch is operator config,
      // not a transient error. Re-trying won't fix it.
      return NextResponse.json({ received: false, reason: "livemode_mismatch" });
    }

    await processStripeWebhookEvent({ event, stripe });
    logger.info({ eventId: event.id, type: event.type }, "Stripe webhook processed");

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    // Any signature-verification failure — malformed header, MISMATCHED
    // signature, or stale timestamp — is a client error (400), not a server
    // fault. Returning 500 here would (a) page ops with a false 5xx for a
    // forged/garbled request and (b) make Stripe retry a request that can
    // never succeed (Stripe retries 5xx, not 4xx). Match the SDK error type
    // (real Stripe throws StripeSignatureVerificationError) plus the canonical
    // messages so test doubles and older SDK versions are covered too.
    const errorType =
      error instanceof Error ? (error as Error & { type?: string }).type : undefined;
    const isSignatureError =
      errorType === "StripeSignatureVerificationError" ||
      message.includes("Unable to extract timestamp and signatures from header") ||
      message.includes("No signatures found matching") ||
      message.includes("Timestamp outside the tolerance zone");
    if (isSignatureError) {
      logger.error({ error }, "Stripe webhook signature verification failed");
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    logger.error({ error }, "Stripe webhook processing failed");
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
