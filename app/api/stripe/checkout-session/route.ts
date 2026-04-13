import { NextResponse } from "next/server";
import { z } from "zod";
import {
  REPORT_ACCESS_TOKEN_REGEX,
  REPORT_PURCHASE_PLAN_IDS,
  type ReportPurchasePlanId,
} from "@/lib/checkout/reportPurchase";
import {
  STRIPE_CHECKOUT_DISABLED_MESSAGE,
  getStripePriceId,
  getStripeServerClient,
  isStripeCheckoutEnabled,
  type StripeCheckoutSessionResponse,
} from "@/lib/checkout/stripeCheckout";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

export const runtime = "nodejs";

const createCheckoutSessionSchema = z
  .object({
    plan: z.enum(REPORT_PURCHASE_PLAN_IDS),
    reportSessionId: z.string().uuid().nullable().optional(),
    reportToken: z.string().regex(REPORT_ACCESS_TOKEN_REGEX).nullable().optional(),
  })
  .refine((value) => !!(value.reportSessionId || value.reportToken), {
    message: "Report context required.",
  });

const RATE_LIMIT_CONFIG = {
  bucket: "checkout-session",
  limit: 10,
  windowMs: 60_000,
};
const CHECKOUT_PAYMENT_METHOD_TYPES: Array<"amazon_pay" | "card" | "link"> = [
  "card",
  "amazon_pay",
  "link",
];

function buildReturnUrl({
  origin,
  plan,
  reportToken,
}: {
  origin: string;
  plan: ReportPurchasePlanId;
  reportToken?: string | null;
}) {
  const params = [`plan=${encodeURIComponent(plan)}`, "session_id={CHECKOUT_SESSION_ID}"];

  if (reportToken) {
    params.push(`token=${encodeURIComponent(reportToken)}`);
  }

  return `${origin}/checkout/return?${params.join("&")}`;
}

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

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
    const priceId = getStripePriceId(parsed.data.plan);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

    if (!stripe || !priceId) {
      return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
    }

    const session = await stripe.checkout.sessions.create({
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        plan: parsed.data.plan,
        reportSessionId: parsed.data.reportSessionId ?? "",
        reportToken: parsed.data.reportToken ?? "",
      },
      mode: "payment",
      payment_method_types: CHECKOUT_PAYMENT_METHOD_TYPES,
      return_url: buildReturnUrl({
        origin: siteUrl,
        plan: parsed.data.plan,
        reportToken: parsed.data.reportToken ?? null,
      }),
      ui_mode: "elements",
    });

    if (!session.client_secret) {
      logger.error({ sessionId: session.id }, "Stripe checkout session missing client secret");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }

    const successResponse: StripeCheckoutSessionResponse = {
      clientSecret: session.client_secret,
      enabled: true,
    };

    return NextResponse.json(successResponse);
  } catch (error) {
    logger.error({ error }, "Stripe checkout session creation failed");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
