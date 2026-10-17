import { NextResponse } from "next/server";
import {
  STRIPE_CHECKOUT_DISABLED_MESSAGE,
  getStripeServerClient,
  isStripeCheckoutEnabled,
} from "@features/checkout/server/stripeCheckout";
import { settlePayToStartSession } from "@features/checkout/server/fulfillment";
import type {
  PayToStartPurchase,
  PayToStartStatusResponse,
} from "@features/pay-to-start/logic/api";
import { CHECKOUT_SESSION_ID_REGEX, readPrepaidToken } from "@features/pay-to-start/logic/journey";
import { getOfferDefinition, isPayToStartOfferId } from "@features/pay-to-start/logic/offer";
import {
  PREPAID_COOKIE,
  prepaidCookieOptions,
  type Entitlement,
} from "@features/pay-to-start/server/entitlement";
import { lookupReportTokenBySubmissionId } from "@features/report/server/personalReport";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const runtime = "nodejs";

/**
 * What the "Checkout status" page (Figma 1475:2090-2092) polls after Stripe sends the
 * buyer back: has this session paid? It settles the session itself when Stripe says so,
 * so a webhook that is late (or never comes) does not hold the buyer on that page.
 *
 * It also hands the entitlement's cookie to the browser that comes back, when that
 * browser does not hold it: a wallet or Link payment can finish in another browser than
 * the one that started it. Only for a paid (or settling) session whose entitlement is
 * unused and under a week old.
 */

const RATE_LIMIT = { bucket: "pay-to-start-status", limit: 60, windowMs: 60_000 };
const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate" };
const COOKIE_HANDOVER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function reply(body: PayToStartStatusResponse, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function purchaseOf(entitlement: Entitlement, sessionId: string): PayToStartPurchase {
  const offer = getOfferDefinition(
    isPayToStartOfferId(entitlement.offer) ? entitlement.offer : "full"
  );
  return {
    value: (entitlement.amount_cents ?? 0) / 100,
    currency: (entitlement.currency ?? "EUR").toUpperCase(),
    transaction_id: sessionId,
    item_name: offer.productName,
    isTest: entitlement.is_test,
  };
}

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, RATE_LIMIT);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const sessionId = new URL(request.url).searchParams.get("session_id") ?? "";
  if (!CHECKOUT_SESSION_ID_REGEX.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session." }, { status: 400 });
  }

  if (!isStripeCheckoutEnabled()) {
    return reply({ state: "unavailable", message: STRIPE_CHECKOUT_DISABLED_MESSAGE });
  }
  const stripe = getStripeServerClient();
  if (!stripe) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  try {
    const settled = await settlePayToStartSession({ sessionId, source: "status", stripe });
    const entitlement = settled.entitlement;
    if (!entitlement || settled.state === "unknown") return reply({ state: "unknown" });

    let response: NextResponse;
    if (settled.state === "paid" && entitlement.consumed_submission_id) {
      const reportToken = await lookupReportTokenBySubmissionId(entitlement.consumed_submission_id);
      response = reply({
        state: "used",
        reportPath: reportToken ? `/report/${encodeURIComponent(reportToken)}` : null,
        purchase: purchaseOf(entitlement, sessionId),
      });
    } else if (settled.state === "paid") {
      response = reply({ state: "paid", purchase: purchaseOf(entitlement, sessionId) });
    } else {
      response = reply({ state: settled.state });
    }

    const handOver =
      (settled.state === "paid" || settled.state === "processing") &&
      !entitlement.consumed_submission_id &&
      Date.now() - new Date(entitlement.created_at).getTime() < COOKIE_HANDOVER_MAX_AGE_MS &&
      readPrepaidToken(request.headers.get("cookie")) !== entitlement.prepaid_token;
    if (handOver) {
      response.cookies.set(PREPAID_COOKIE, entitlement.prepaid_token, prepaidCookieOptions());
    }
    return response;
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? { name: error.name, message: error.message } : error },
      "pay-to-start: status check failed"
    );
    return NextResponse.json({ error: "Unable to check payment." }, { status: 500 });
  }
}
