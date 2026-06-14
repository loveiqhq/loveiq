import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getStripeServerClient } from "@features/checkout/server/stripeCheckout";
import {
  PREPAID_COOKIE,
  PREPAID_TOKEN_REGEX,
  findPrepaidEntitlementByToken,
  markPrepaidEntitlementSucceeded,
} from "@features/checkout/server/prepaidEntitlement";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const runtime = "nodejs";

/**
 * Poll the prepaid entitlement state for the white pay-first flow. The survey
 * interstitial calls this to decide when to let the user into the questions.
 *
 * Returns `{ paid }`. If the entitlement is still `pending` but Stripe reports
 * the session as paid (webhook slow or missed), we reconcile inline — promoting
 * the row to `succeeded` — so the user is never stuck behind a lagging webhook.
 * This is the single Stripe-reconciliation chokepoint; the survey route itself
 * never calls Stripe.
 */

const RATE_LIMIT_CONFIG = {
  bucket: "prepaid-status",
  // Polled in a loop during the post-Stripe "confirming payment" window; kept
  // generous so a couple of mobile refreshes mid-poll don't exhaust the bucket
  // and surface a false "couldn't confirm payment" to a user who actually paid.
  limit: 60,
  windowMs: 60_000,
};

function paidResponse(paid: boolean) {
  return NextResponse.json(
    { paid },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
  );
}

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, RATE_LIMIT_CONFIG);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000)),
        },
      }
    );
  }

  const cookieStore = await cookies();
  const tokenRaw = cookieStore.get(PREPAID_COOKIE)?.value ?? null;
  const token = tokenRaw && PREPAID_TOKEN_REGEX.test(tokenRaw) ? tokenRaw : null;
  if (!token) {
    return paidResponse(false);
  }

  try {
    const entitlement = await findPrepaidEntitlementByToken(token);
    if (!entitlement) {
      return paidResponse(false);
    }
    if (entitlement.status === "succeeded") {
      return paidResponse(true);
    }
    if (entitlement.status !== "pending" || !entitlement.stripe_session_id) {
      return paidResponse(false);
    }

    // Pending: reconcile against Stripe so a slow/missed webhook can't strand a
    // user who has actually paid.
    const stripe = getStripeServerClient();
    if (!stripe) {
      return paidResponse(false);
    }

    const session = await stripe.checkout.sessions.retrieve(entitlement.stripe_session_id);
    if (session.payment_status === "paid") {
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null);
      // T-04 parity: a session can report "paid" then have its PaymentIntent
      // voided by Stripe Radar seconds later. Only promote when the intent
      // itself agrees, matching the webhook handler — this is the
      // highest-exposure reconcile path (polled in a loop), so the guard matters
      // most here. A disagreement reads as not-yet-paid; the webhook is canonical.
      if (paymentIntentId) {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (paymentIntent.status !== "succeeded" && paymentIntent.status !== "processing") {
          return paidResponse(false);
        }
      }
      await markPrepaidEntitlementSucceeded({
        amountCents: typeof session.amount_total === "number" ? session.amount_total : null,
        currency: session.currency ?? null,
        stripePaymentIntentId: paymentIntentId,
        stripeSessionId: entitlement.stripe_session_id,
      });
      return paidResponse(true);
    }

    return paidResponse(false);
  } catch (err) {
    logger.warn({ err }, "prepaid-status: lookup/reconcile failed");
    return paidResponse(false);
  }
}
