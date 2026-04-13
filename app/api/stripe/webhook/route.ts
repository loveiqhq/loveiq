import { NextResponse } from "next/server";
import { getStripeServerClient, isStripeCheckoutEnabled } from "@/lib/checkout/stripeCheckout";
import logger from "@/lib/logger";

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

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      logger.info({ eventId: event.id, type: event.type }, "Stripe checkout event received");
    } else {
      logger.info({ eventId: event.id, type: event.type }, "Stripe webhook ignored");
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error({ error }, "Stripe webhook signature verification failed");
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
