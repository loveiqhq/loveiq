import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  REPORT_ACCESS_TOKEN_REGEX,
  REPORT_PURCHASE_PLAN_IDS,
  type ReportPurchasePlanId,
} from "@features/checkout/server/reportPurchase";
import { KNOWN_ARCHETYPES, toArchetypeSlug } from "@features/report/server/archetypeSlug";
import {
  STRIPE_CHECKOUT_DISABLED_MESSAGE,
  getStripeCheckoutCustomerEmail,
  getStripeServerClient,
  isStripeCheckoutEnabled,
  type StripeCheckoutSessionResponse,
} from "@features/checkout/server/stripeCheckout";
import { getReportPurchasePlan } from "@features/checkout/server/reportPurchase";
import {
  NURTURE_PROMO_CODE_REGEX,
  resolveNurturePromo,
} from "@features/checkout/server/promoCodes";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { scheduleAfterResponse } from "@shared/http/after-response";
import { refreshJourneyMessage } from "@features/attribution/server/journey-message";
import {
  getReportAccessPlanForSubmission,
  resolveSubmissionAccessContext,
} from "@features/report/server/personalReport";
import { isPlanOwnedForArchetype } from "@features/report/server/access";
import {
  LANDING_VARIANT_COOKIE,
  normalizeLandingVariant,
  type LandingVariant,
} from "@shared/experiments/landingVariant";
import logger from "@shared/observability/logger";
import {
  getReportPriceQuoteForContext,
  markReportPriceQuoteCheckoutStarted,
} from "@features/pricing/logic/reportPricing";

export const runtime = "nodejs";

const createCheckoutSessionSchema = z
  .object({
    archetype: z.enum(KNOWN_ARCHETYPES as unknown as [string, ...string[]]).optional(),
    // GA4 client_id / session_id (from the buyer's `_ga` cookies) + analytics
    // consent, captured client-side so the webhook can replay the purchase via
    // the GA4 Measurement Protocol with correct attribution. All optional — a
    // consent-declining or cookie-less visitor simply omits them.
    gaClientId: z.string().max(64).nullable().optional(),
    gaConsent: z.boolean().nullable().optional(),
    gaSessionId: z.string().max(64).nullable().optional(),
    plan: z.enum(REPORT_PURCHASE_PLAN_IDS),
    pricingSessionId: z.string().uuid().nullable().optional(),
    promo: z.string().regex(NURTURE_PROMO_CODE_REGEX).nullable().optional(),
    quoteId: z.number().int().positive().nullable().optional(),
    reportSessionId: z.string().uuid().nullable().optional(),
    reportToken: z.string().regex(REPORT_ACCESS_TOKEN_REGEX).nullable().optional(),
  })
  .refine((value) => !!(value.reportSessionId || value.reportToken), {
    message: "Report context required.",
  })
  .refine((value) => !value.archetype || value.plan !== "all_reports", {
    message: "All-reports purchases are global and don't accept an archetype.",
  })
  .refine(
    (value) =>
      value.plan === "all_reports" || (typeof value.archetype === "string" && !!value.archetype),
    {
      message: "Essentials and Full Report purchases require an archetype.",
    }
  );

const RATE_LIMIT_CONFIG = {
  bucket: "checkout-session",
  limit: 10,
  windowMs: 60_000,
};

function toStripeMetadataValue(value: string | null) {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.slice(0, 500);
}

function buildSuccessUrl({
  archetypeSlug,
  origin,
  plan,
  reportToken,
}: {
  archetypeSlug?: string | null;
  origin: string;
  plan: ReportPurchasePlanId;
  reportToken?: string | null;
}) {
  const params = [`plan=${encodeURIComponent(plan)}`, "session_id={CHECKOUT_SESSION_ID}"];

  if (reportToken) {
    params.push(`token=${encodeURIComponent(reportToken)}`);
  }

  if (archetypeSlug) {
    params.push(`archetype=${encodeURIComponent(archetypeSlug)}`);
  }

  return `${origin}/checkout/return?${params.join("&")}`;
}

/**
 * Where Stripe sends a buyer who backs out.
 *
 * Straight back to the report they came from, since the `/checkout` review page
 * they used to land on was removed on 2026-08-31. An archetype-scoped purchase
 * returns to that archetype's view so the reader is where they left off.
 */
function buildCancelUrl({
  archetypeSlug,
  origin,
  reportToken,
}: {
  archetypeSlug?: string | null;
  origin: string;
  reportToken?: string | null;
}) {
  const path = reportToken ? `/report/${encodeURIComponent(reportToken)}` : "/report";
  return archetypeSlug
    ? `${origin}${path}?archetype=${encodeURIComponent(archetypeSlug)}`
    : `${origin}${path}`;
}

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

  const parsed = createCheckoutSessionSchema.safeParse(await request.json().catch(() => ({})));
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

    const stripe = getStripeServerClient();
    const siteUrl = new URL(request.url).origin;
    const customerEmail = await getStripeCheckoutCustomerEmail({
      reportSessionId: parsed.data.reportSessionId ?? null,
      reportToken: parsed.data.reportToken ?? null,
    });
    const quote = await getReportPriceQuoteForContext({
      plan: parsed.data.plan,
      pricingSessionId: parsed.data.pricingSessionId ?? null,
      quoteId: parsed.data.quoteId ?? undefined,
      reportSessionId: parsed.data.reportSessionId ?? null,
      reportToken: parsed.data.reportToken ?? null,
      userAgent: request.headers.get("user-agent"),
    });

    if (!stripe || !customerEmail || !quote) {
      return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
    }

    // Refuse to start a Stripe session if the user already owns the requested
    // plan FOR THE REQUESTED ARCHETYPE — guards against the two-tab
    // double-purchase race. Per-archetype: owning essentials/full_report on
    // archetype X does NOT block buying the same tier on archetype Y.
    // Best-effort: a Supabase blip drops to a warn-log and lets checkout
    // proceed (webhook idempotency is the secondary defense).
    // Resolve the submission once — reused by the already-owns precheck AND by
    // per-user promo ownership below, so session-only checkouts (not just token
    // ones) can resolve a user's own nurture code. [Audit L6]
    let accessContext: Awaited<ReturnType<typeof resolveSubmissionAccessContext>> = null;
    try {
      accessContext = await resolveSubmissionAccessContext({
        reportSessionId: parsed.data.reportSessionId ?? null,
        reportToken: parsed.data.reportToken ?? null,
      });
    } catch (err) {
      logger.warn({ err }, "checkout-session: access-context resolve failed; continuing");
    }

    try {
      if (accessContext) {
        const access = await getReportAccessPlanForSubmission(accessContext.submissionId);
        const requestedArchetype = parsed.data.archetype ?? null;
        const unlockedTier =
          requestedArchetype && access.archetypeTiers[requestedArchetype]
            ? access.archetypeTiers[requestedArchetype]
            : null;
        const alreadyOwned = isPlanOwnedForArchetype({
          accessPlan: access.accessPlan,
          targetPlan: parsed.data.plan,
          unlockedTier,
        });
        if (alreadyOwned) {
          return NextResponse.json({ error: "You already own this plan." }, { status: 409 });
        }
      }
    } catch (err) {
      logger.warn({ err }, "checkout-session: paid-plan precheck failed; allowing checkout");
    }

    const plan = getReportPurchasePlan(parsed.data.plan);
    const archetypeName = parsed.data.archetype ?? null;
    const archetypeSlug = archetypeName ? toArchetypeSlug(archetypeName) : null;
    const planTitle = archetypeName ? `${archetypeName} report` : plan.title;

    // White-landing A/B arm, read from the sticky cookie, so revenue is
    // attributable to the landing variant the buyer first saw. Defaults to
    // "control" when the cookie is absent (e.g. they never hit `/`) or when
    // there is no request scope (cookies() throws — e.g. unit tests).
    let landingVariant: LandingVariant = "white";
    try {
      landingVariant = normalizeLandingVariant(
        (await cookies()).get(LANDING_VARIANT_COOKIE)?.value
      );
    } catch {
      /* no request scope — keep the control default */
    }

    // Resolve the optional nurture promo. A miss (unknown/expired/wrong-owner)
    // silently falls through to the no-promo flow — never 400 — because the
    // email link could be opened on a forwarded device. Logged for analytics.
    let nurturePromoMatch: Awaited<ReturnType<typeof resolveNurturePromo>> = null;
    if (parsed.data.promo) {
      try {
        nurturePromoMatch = await resolveNurturePromo({
          reportToken: parsed.data.reportToken ?? null,
          submissionId: accessContext?.submissionId ?? null,
          userCode: parsed.data.promo,
        });
      } catch (err) {
        logger.warn(
          { err, promoPrefix: parsed.data.promo.slice(0, 6) },
          "checkout-session: nurture promo resolve threw; falling through"
        );
      }
      if (!nurturePromoMatch) {
        logger.info(
          { promoPrefix: parsed.data.promo.slice(0, 6) },
          "checkout-session: nurture promo miss (unknown/expired/wrong-owner)"
        );
      }
    }

    // P-03: idempotency key dedupes double-clicks within the same minute.
    // Stripe matches on (key + endpoint + params); identical (submission, plan,
    // archetype, promo, minute) bucket returns the previously-created session
    // instead of creating a second one. Promo is included so a freshly-resolved
    // promo doesn't reuse a no-promo session from the same minute. The minute
    // bucket is intentional — it keeps the key stable across rapid retries but
    // lets the user create a fresh session a minute later (e.g. after Stripe's
    // 24h hold on the prior one).
    const idempotencyKey = createHash("sha256")
      .update(
        [
          parsed.data.reportToken ?? parsed.data.reportSessionId ?? "",
          parsed.data.plan,
          parsed.data.archetype ?? "",
          nurturePromoMatch?.stripePromotionCodeId ?? "",
          String(Math.floor(Date.now() / 60_000)),
        ].join("|")
      )
      .digest("hex");

    const session = await stripe.checkout.sessions.create(
      {
        // Manual promo entry on Stripe's hosted page is intentionally ON (product
        // decision 2026-06-10) so staff can hand-redeem test codes (e.g. a 100%-off
        // code) on production. Owned nurture codes from a ?promo= email link still
        // auto-apply via discounts[]. discounts[] and allow_promotion_codes are
        // mutually exclusive, so the pre-applied branch leaves allow_promotion_codes
        // unset. (Reverts the [Audit L6] field-off control — residual risk accepted:
        // a forwarded single-use LIQ code could be hand-typed by the wrong person.)
        ...(nurturePromoMatch
          ? { discounts: [{ promotion_code: nurturePromoMatch.stripePromotionCodeId }] }
          : { allow_promotion_codes: true }),
        billing_address_collection: "auto",
        customer_email: customerEmail,
        line_items: [
          {
            price_data: {
              currency: quote.currency.toLowerCase(),
              product_data: {
                description: plan.description,
                name: `LoveIQ ${planTitle}`,
              },
              // `chargedPriceCents`, never `currentPriceCents`: it is the same number
              // every price surface renders, so
              // the screen and the invoice cannot disagree.
              unit_amount: quote.chargedPriceCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          archetype: archetypeName ?? "",
          basePriceBucket: quote.basePriceBucket,
          behavioralBucket: quote.behavioralBucket,
          countryTier: quote.countryTier,
          // What we charged, and the base it was built from — so a support question
          // about a €2 difference is answerable from the payment alone.
          currentPrice: String((quote.chargedPriceCents / 100).toFixed(2)),
          basePrice: String((quote.currentPriceCents / 100).toFixed(2)),
          deviceType: quote.deviceType,
          discountStep: String(quote.discountStep),
          engagementScore: String(quote.engagementScore),
          experimentGroup: quote.experimentGroup,
          // GA4 Measurement Protocol context — replayed server-side at fulfillment
          // so the purchase reaches GA4 even when the client event is lost. Consent
          // is stored so the server send stays consent-compliant ("1"/"0").
          gaClientId: toStripeMetadataValue(parsed.data.gaClientId ?? null),
          gaSessionId: toStripeMetadataValue(parsed.data.gaSessionId ?? null),
          gaAnalyticsConsent: parsed.data.gaConsent ? "1" : "0",
          landingVariant,
          initialPrice: String((quote.initialPriceCents / 100).toFixed(2)),
          msrp: String((quote.msrpCents / 100).toFixed(2)),
          plan: parsed.data.plan,
          pricingClusterId: quote.pricingClusterId,
          pricingQuoteId: String(quote.id),
          ...(nurturePromoMatch && {
            promoCode: parsed.data.promo ?? "",
            promoStage: nurturePromoMatch.stage,
            promoPercentOff: String(nurturePromoMatch.percentOff),
          }),
          requestIp: toStripeMetadataValue(ip),
          requestUserAgent: toStripeMetadataValue(userAgent),
          reportSessionId: parsed.data.reportSessionId ?? "",
          reportToken: parsed.data.reportToken ?? "",
          startingPrice: String((quote.startingPriceCents / 100).toFixed(2)),
          trafficSource: quote.trafficSource,
        },
        mode: "payment",
        invoice_creation: { enabled: true },
        payment_intent_data: { receipt_email: customerEmail },
        success_url: buildSuccessUrl({
          archetypeSlug,
          origin: siteUrl,
          plan: parsed.data.plan,
          reportToken: parsed.data.reportToken ?? null,
        }),
        cancel_url: buildCancelUrl({
          archetypeSlug,
          origin: siteUrl,
          reportToken: parsed.data.reportToken ?? null,
        }),
      },
      { idempotencyKey }
    );

    // Nothing above this line may record a checkout. A session without a hosted
    // URL cannot be handed off: the reader gets a 500 and never sees Stripe, so
    // stamping the quote and telling Slack "checkout" first would report a
    // checkout that demonstrably did not happen — and `checkout_started_at` is
    // now the funnel's server-side truth for that stage, so the error would
    // land in the digest and the journey rail too.
    if (!session.url) {
      logger.error({ sessionId: session.id }, "Stripe checkout session missing hosted URL");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }

    await markReportPriceQuoteCheckoutStarted({ quoteId: quote.id });

    // Advance the Slack journey message to "checkout". After-response so the
    // redirect to Stripe is never delayed by a Slack call.
    if (accessContext?.submissionId) {
      const submissionIdForJourney = accessContext.submissionId;
      scheduleAfterResponse("journey-message-checkout", async () => {
        await refreshJourneyMessage(submissionIdForJourney, "checkout");
      });
    }

    const successResponse: StripeCheckoutSessionResponse = {
      enabled: true,
      url: session.url,
    };

    // Personal Stripe session URL — never let intermediaries cache. Without
    // this header, a shared proxy or browser back-cache could replay another
    // user's checkout link.
    return NextResponse.json(successResponse, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    const sanitized =
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            ...(typeof (error as { code?: string }).code === "string"
              ? { code: (error as { code?: string }).code }
              : {}),
          }
        : { name: "UnknownError" };
    logger.error({ err: sanitized }, "Stripe checkout session creation failed");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
