import { NextResponse } from "next/server";
import { z } from "zod";
import {
  REPORT_ACCESS_TOKEN_REGEX,
  REPORT_PURCHASE_PLAN_IDS,
  type ReportPurchasePlanId,
} from "@features/checkout/server/reportPurchase";
import { KNOWN_ARCHETYPES, toArchetypeSlug } from "@/lib/report/archetypeSlug";
import {
  STRIPE_CHECKOUT_DISABLED_MESSAGE,
  getStripeCheckoutCustomerEmail,
  getStripeServerClient,
  isStripeCheckoutEnabled,
  type StripeCheckoutSessionResponse,
} from "@features/checkout/server/stripeCheckout";
import { getReportPurchasePlan } from "@features/checkout/server/reportPurchase";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import {
  getReportAccessPlanForSubmission,
  resolveSubmissionAccessContext,
} from "@/lib/report/personalReport";
import { isPlanOwnedForArchetype } from "@/lib/report/access";
import logger from "@/lib/logger";
import {
  getReportPriceQuoteForContext,
  markReportPriceQuoteCheckoutStarted,
} from "@features/pricing/logic/reportPricing";

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

    // Refuse to start a Stripe session if the user already owns the requested
    // plan FOR THE REQUESTED ARCHETYPE — guards against the two-tab
    // double-purchase race. Per-archetype: owning essentials/full_report on
    // archetype X does NOT block buying the same tier on archetype Y.
    // Best-effort: a Supabase blip drops to a warn-log and lets checkout
    // proceed (webhook idempotency is the secondary defense).
    try {
      const accessContext = await resolveSubmissionAccessContext({
        reportSessionId: parsed.data.reportSessionId ?? null,
        reportToken: parsed.data.reportToken ?? null,
      });
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
