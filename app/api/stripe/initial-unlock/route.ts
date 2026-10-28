import { createHash } from "crypto";
import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { refreshJourneyMessage } from "@features/attribution/server/journey-message";
import { REPORT_ACCESS_TOKEN_REGEX } from "@features/checkout/server/reportPurchase";
import { buildCancelUrl, buildSuccessUrl } from "@features/checkout/server/reportReturnUrls";
import {
  STRIPE_CHECKOUT_DISABLED_MESSAGE,
  createCheckoutSession,
  getStripeCheckoutCustomerEmail,
  getStripeServerClient,
  isStripeCheckoutEnabled,
  type StripeCheckoutSessionResponse,
} from "@features/checkout/server/stripeCheckout";
import { toMetadataValue } from "@features/pay-to-start/server/checkout";
import { INITIAL_UNLOCK_PLAN } from "@features/report/logic/initialUnlock";
import { INITIAL_UNLOCK_PRICE_CENTS } from "@features/report/logic/initialUnlockGate";
import { ownerMeetsInitialGate } from "@features/report/server/initialUnlockGate";
import {
  ensurePersonalReportForSubmission,
  lookupReportTokenBySubmissionId,
  resolveSubmissionAccessContext,
} from "@features/report/server/personalReport";
import {
  LANDING_VARIANT_COOKIE,
  normalizeLandingVariant,
  type LandingVariant,
} from "@shared/experiments/landingVariant";
import { scheduleAfterResponse } from "@shared/http/after-response";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

/**
 * POST /api/stripe/initial-unlock: the EUR 1.99 gate's checkout (Notion "RFD > Pre-Unlock",
 * Figma Report-3.0 1604:2328). It sells the initial unlock, plan `initial`
 * (features/report/logic/initialUnlock.ts), to an owner the gate stops: one fixed price, no
 * quote, no archetype. Fulfillment records it as a payment of that plan, which opens the
 * Core Archetype card and the Summary and takes EUR 10 off the full report.
 *
 * A route of its own rather than a plan of checkout-session's: that one sells the paygate's
 * priced plans, each from a quote and for an archetype, and `initial` is neither.
 */

export const runtime = "nodejs";

const bodySchema = z
  .object({
    gaClientId: z.string().max(64).nullable().optional(),
    gaConsent: z.boolean().nullable().optional(),
    gaSessionId: z.string().max(64).nullable().optional(),
    reportSessionId: z.string().uuid().nullable().optional(),
    reportToken: z.string().regex(REPORT_ACCESS_TOKEN_REGEX).nullable().optional(),
  })
  .refine((value) => !!(value.reportSessionId || value.reportToken), {
    message: "Report context required.",
  });

/** Per IP. A reader clicks once or twice; ten in ten minutes is something else. */
const RATE_LIMIT_CONFIG = { bucket: "initial-unlock", limit: 10, windowMs: 10 * 60_000 };

/** The line on Stripe's page and the receipt (the design's Stripe frames are placeholders). */
const PRODUCT_NAME = "LoveIQ: Your Core Archetype";

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent");
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

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    if (!isStripeCheckoutEnabled()) {
      const disabledResponse: StripeCheckoutSessionResponse = {
        enabled: false,
        message: STRIPE_CHECKOUT_DISABLED_MESSAGE,
        reason: "checkout_disabled",
      };
      return NextResponse.json(disabledResponse);
    }

    const reportToken = parsed.data.reportToken ?? null;
    const reportSessionId = parsed.data.reportSessionId ?? null;
    const context = await resolveSubmissionAccessContext({ reportSessionId, reportToken });
    if (!context) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    // Sold only to a reader the gate stops. One it lets through (bought, switched off, not
    // in the cohort, or a read that failed) is told to reload, and their report opens.
    const report = await ensurePersonalReportForSubmission({
      reportToken,
      submissionId: context.submissionId,
    });
    const gated = report?.id
      ? await ownerMeetsInitialGate({
          personalReportId: report.id,
          submissionId: context.submissionId,
        })
      : false;
    if (!gated) {
      return NextResponse.json({ error: "already_unlocked" }, { status: 409 });
    }

    const stripe = getStripeServerClient();
    const customerEmail = await getStripeCheckoutCustomerEmail({ reportSessionId, reportToken });
    if (!stripe || !customerEmail) {
      return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
    }

    // Both return URLs name the report on their own, as on the report checkout: a reader
    // who came by session would otherwise be returned to a bare /report.
    const returnToken =
      reportToken ?? (await lookupReportTokenBySubmissionId(context.submissionId));

    let landingVariant: LandingVariant = "white";
    try {
      landingVariant = normalizeLandingVariant(
        (await cookies()).get(LANDING_VARIANT_COOKIE)?.value
      );
    } catch {
      /* no request scope — keep the default */
    }

    const siteUrl = new URL(request.url).origin;
    const params: Stripe.Checkout.SessionCreateParams = {
      // Typed codes stay on, as for every sale, so staff can test it with a 100% code.
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      customer_email: customerEmail,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: PRODUCT_NAME },
            // EUR 1.99 includes the VAT, which the receipt lists (`automaticTax`).
            tax_behavior: "inclusive",
            unit_amount: INITIAL_UNLOCK_PRICE_CENTS,
          },
          quantity: 1,
        },
      ],
      metadata: {
        archetype: "",
        currentPrice: (INITIAL_UNLOCK_PRICE_CENTS / 100).toFixed(2),
        // GA4 Measurement Protocol context, replayed at fulfillment ("1"/"0" consent).
        gaAnalyticsConsent: parsed.data.gaConsent ? "1" : "0",
        gaClientId: toMetadataValue(parsed.data.gaClientId),
        gaSessionId: toMetadataValue(parsed.data.gaSessionId),
        landingVariant,
        // What fulfillment grants. No `journey`: "pay_to_start" would send the webhook
        // down pay to start's branch.
        plan: INITIAL_UNLOCK_PLAN,
        reportSessionId: reportSessionId ?? "",
        reportToken: reportToken ?? "",
        requestIp: toMetadataValue(ip),
        requestUserAgent: toMetadataValue(userAgent),
        // How the Core Archetype was bought: from this gate, not before the survey.
        unlockSource: "report_gate",
      },
      mode: "payment",
      invoice_creation: { enabled: true },
      payment_intent_data: { receipt_email: customerEmail },
      success_url: buildSuccessUrl({
        origin: siteUrl,
        plan: INITIAL_UNLOCK_PLAN,
        reportToken: returnToken,
      }),
      cancel_url: buildCancelUrl({ origin: siteUrl, reportToken: returnToken }),
    };

    // As checkout-session's P-03: everything sent, by the minute, so a double click gets the
    // session already made and a request that differs in any field never reuses a key.
    const idempotencyKey = createHash("sha256")
      .update(`${Math.floor(Date.now() / 60_000)}|${JSON.stringify(params)}`)
      .digest("hex");

    const session = await createCheckoutSession(stripe, params, idempotencyKey);
    if (!session.url) {
      logger.error({ sessionId: session.id }, "initial-unlock: Stripe session missing hosted URL");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }

    const submissionIdForJourney = context.submissionId;
    scheduleAfterResponse("journey-message-checkout", async () => {
      await refreshJourneyMessage(submissionIdForJourney, "checkout");
    });

    const successResponse: StripeCheckoutSessionResponse = { enabled: true, url: session.url };
    // A personal Stripe session URL: never cached by a proxy or the browser.
    return NextResponse.json(successResponse, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    const sanitized =
      error instanceof Error ? { name: error.name, message: error.message } : { name: "Unknown" };
    logger.error({ err: sanitized }, "initial-unlock: Stripe session creation failed");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
