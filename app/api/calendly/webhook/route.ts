import { NextResponse } from "next/server";
import logger from "@shared/observability/logger";
import { notifySlack } from "@shared/observability/slack";
import {
  calendlyEventKey,
  claimCalendlyEvent,
  processCalendlyEvent,
  releaseCalendlyEvent,
  verifyCalendlySignature,
  type CalendlyWebhookPayload,
} from "@features/booking/server/calendly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/calendly/webhook
 *
 * Receives Calendly v2 `invitee.created` / `invitee.canceled` events for the
 * 78h "book a call" nurture stage and records them in `booking_event`. Auth is
 * the Calendly signature (no CSRF/rate-limit — same posture as the Stripe and
 * Resend webhooks). Safe to deploy before Calendly is configured: with no
 * signing secret it returns 503 and no subscription exists to call it.
 *
 * Post-deploy setup: create the Calendly v2 webhook subscription pointing here
 * for `invitee.created` + `invitee.canceled`, then store the returned signing
 * key as CALENDLY_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.CALENDLY_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn("CALENDLY_WEBHOOK_SECRET not set — rejecting webhook");
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("calendly-webhook-signature");

  if (!verifyCalendlySignature(rawBody, signature, secret)) {
    logger.warn("Calendly webhook signature verification failed");
    await notifySlack({
      channel: "ops",
      // eslint-disable-next-line no-secrets/no-secrets -- alert kind label, not a secret
      kind: "calendly_webhook_signature_fail",
      text: `:no_entry_sign: Calendly webhook signature verification failed. Check CALENDLY_WEBHOOK_SECRET against the Calendly subscription.`,
      username: "ops_alerts",
    });
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: CalendlyWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as CalendlyWebhookPayload;
  } catch {
    // Signed but unparseable — 200 so Calendly doesn't retry a poison body.
    logger.warn("Calendly webhook body not JSON — ignoring");
    return NextResponse.json({ ok: true });
  }

  // Idempotency: claim the event before side-effects so a Calendly re-delivery
  // no-ops. Fails OPEN on Supabase error (prefer reprocess over silent drop).
  const eventKey = calendlyEventKey(payload);
  if (eventKey) {
    const claimed = await claimCalendlyEvent(eventKey, payload.event ?? "unknown");
    if (!claimed) {
      logger.info({ eventKey }, "Calendly webhook replay — already processed");
      return NextResponse.json({ ok: true, deduped: true });
    }
  }

  try {
    const result = await processCalendlyEvent(payload);
    if (result.status === "insert_failed") {
      // Release the idempotency claim so Calendly's retry reprocesses — without
      // this the retry would hit the claim conflict and no-op, losing the
      // booking on a transient Supabase write failure.
      if (eventKey) await releaseCalendlyEvent(eventKey);
      return NextResponse.json({ error: "Temporary error." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, handled: result.status === "stored" });
  } catch (err) {
    logger.error({ err, slack: false }, "Calendly webhook processing error");
    // Release the claim so the Calendly retry can reprocess this event.
    if (eventKey) await releaseCalendlyEvent(eventKey);
    return NextResponse.json({ error: "Temporary error." }, { status: 500 });
  }
}
