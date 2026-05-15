import { NextResponse } from "next/server";
import { processStripeWebhookEvent } from "@features/checkout/server/fulfillment";
import {
  getStripeServerClient,
  isStripeCheckoutEnabled,
} from "@features/checkout/server/stripeCheckout";
import logger from "@shared/observability/logger";

export const runtime = "nodejs";

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

  try {
    const payload = await request.text();
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    await processStripeWebhookEvent({ event, stripe });
    logger.info({ eventId: event.id, type: event.type }, "Stripe webhook processed");

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (message.includes("Unable to extract timestamp and signatures from header")) {
      logger.error({ error }, "Stripe webhook signature verification failed");
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    logger.error({ error }, "Stripe webhook processing failed");
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
