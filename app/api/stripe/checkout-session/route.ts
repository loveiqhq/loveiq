import { NextResponse } from "next/server";
import { z } from "zod";
import {
  REPORT_ACCESS_TOKEN_REGEX,
  REPORT_PURCHASE_PLAN_IDS,
  type ReportPurchasePlanId,
} from "@/lib/checkout/reportPurchase";
import { KNOWN_ARCHETYPES, toArchetypeSlug } from "@/lib/report/archetypeSlug";
import {
  STRIPE_CHECKOUT_DISABLED_MESSAGE,
  getStripeCheckoutCustomerEmail,
  getStripeServerClient,
  isStripeCheckoutEnabled,
  type StripeCheckoutSessionResponse,
} from "@/lib/checkout/stripeCheckout";
import { getReportPurchasePlan } from "@/lib/checkout/reportPurchase";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";
import {
  getReportPriceQuoteForContext,
  markReportPriceQuoteCheckoutStarted,
} from "@/lib/pricing/reportPricing";

export const runtime = "nodejs";

const createCheckoutSessionSchema = z
  .object({
    archetype: z.enum(KNOWN_ARCHETYPES as unknown as [string, ...string[]]).optional(),
    plan: z.enum(REPORT_PURCHASE_PLAN_IDS),
    pricingSessionId: z.string().uuid().nullable().optional(),
    quoteId: z.number().int().positive().nullable().optional(),
    reportSessionId: z.string().uuid().nullable().optional(),
    reportToken: z.string().regex(REPORT_ACCESS_TOKEN_REGEX).nullable().optional(),
  })
  .refine((value) => !!(value.reportSessionId || value.reportToken), {
    message: "Report context required.",
  })
  .refine((value) => !value.archetype || value.plan === "full_report", {
    message: "Per-archetype unlocks are only available on the full_report plan.",
  });

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

function buildCancelUrl({
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
  const params = [`plan=${encodeURIComponent(plan)}`];

  if (reportToken) {
    params.push(`token=${encodeURIComponent(reportToken)}`);
  }

  if (archetypeSlug) {
    params.push(`archetype=${encodeURIComponent(archetypeSlug)}`);
  }

  return `${origin}/checkout?${params.join("&")}`;
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

    const plan = getReportPurchasePlan(parsed.data.plan);
    const archetypeName = parsed.data.archetype ?? null;
    const archetypeSlug = archetypeName ? toArchetypeSlug(archetypeName) : null;
    const planTitle = archetypeName ? `${archetypeName} report` : plan.title;
    const session = await stripe.checkout.sessions.create({
      allow_promotion_codes: true,
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
            unit_amount: quote.currentPriceCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        archetype: archetypeName ?? "",
        basePriceBucket: quote.basePriceBucket,
        behavioralBucket: quote.behavioralBucket,
        countryTier: quote.countryTier,
        currentPrice: String((quote.currentPriceCents / 100).toFixed(2)),
        deviceType: quote.deviceType,
        discountStep: String(quote.discountStep),
        engagementScore: String(quote.engagementScore),
        experimentGroup: quote.experimentGroup,
        initialPrice: String((quote.initialPriceCents / 100).toFixed(2)),
        msrp: String((quote.msrpCents / 100).toFixed(2)),
        plan: parsed.data.plan,
        pricingClusterId: quote.pricingClusterId,
        pricingQuoteId: String(quote.id),
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
        plan: parsed.data.plan,
        reportToken: parsed.data.reportToken ?? null,
      }),
    });

    await markReportPriceQuoteCheckoutStarted({ quoteId: quote.id });

    if (!session.url) {
      logger.error({ sessionId: session.id }, "Stripe checkout session missing hosted URL");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }

    const successResponse: StripeCheckoutSessionResponse = {
      enabled: true,
      url: session.url,
    };

    return NextResponse.json(successResponse);
  } catch (error) {
    logger.error({ error }, "Stripe checkout session creation failed");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
