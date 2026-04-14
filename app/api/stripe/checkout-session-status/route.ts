import Stripe from "stripe";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  STRIPE_CHECKOUT_DISABLED_MESSAGE,
  STRIPE_CHECKOUT_SESSION_EXPAND,
  getStripeCheckoutPromotionSummary,
  getStripeServerClient,
  isStripeCheckoutEnabled,
  type StripeCheckoutPurchaseAnalytics,
  type StripeCheckoutSessionStatusResponse,
} from "@/lib/checkout/stripeCheckout";
import {
  getReportAccessPlanForSubmission,
  resolveSubmissionAccessContext,
} from "@/lib/report/personalReport";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

export const runtime = "nodejs";

const sessionStatusSchema = z.object({
  session_id: z.string().min(1).max(255),
});

const RATE_LIMIT_CONFIG = {
  bucket: "checkout-session-status",
  limit: 30,
  windowMs: 60_000,
};

function getMetadataString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function getMetadataNumber(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getPurchaseAnalytics(session: Stripe.Checkout.Session) {
  const amountTotal = typeof session.amount_total === "number" ? session.amount_total / 100 : null;
  const currency =
    typeof session.currency === "string" && session.currency.trim()
      ? session.currency.toUpperCase()
      : null;

  if (amountTotal === null || currency === null) {
    return null;
  }

  const purchaseAnalytics: StripeCheckoutPurchaseAnalytics = {
    value: amountTotal,
    currency,
    transaction_id: session.id,
  };

  const pricingClusterId = getMetadataString(session.metadata?.pricingClusterId);
  if (pricingClusterId) {
    purchaseAnalytics.pricing_cluster_id = pricingClusterId;
  }

  const basePriceBucket = getMetadataString(session.metadata?.basePriceBucket);
  if (basePriceBucket) {
    purchaseAnalytics.base_price_bucket = basePriceBucket;
  }

  const experimentGroup = getMetadataString(session.metadata?.experimentGroup);
  if (experimentGroup) {
    purchaseAnalytics.experiment_group = experimentGroup;
  }

  const discountStep = getMetadataNumber(session.metadata?.discountStep);
  if (discountStep !== null) {
    purchaseAnalytics.discount_step = discountStep;
  }

  const countryTier = getMetadataString(session.metadata?.countryTier);
  if (countryTier) {
    purchaseAnalytics.country_tier = countryTier;
  }

  const deviceType = getMetadataString(session.metadata?.deviceType);
  if (deviceType) {
    purchaseAnalytics.device_type = deviceType;
  }

  const trafficSource = getMetadataString(session.metadata?.trafficSource);
  if (trafficSource) {
    purchaseAnalytics.traffic_source = trafficSource;
  }

  const engagementScore = getMetadataNumber(session.metadata?.engagementScore);
  if (engagementScore !== null) {
    purchaseAnalytics.engagement_score = engagementScore;
  }

  const behavioralBucket = getMetadataString(session.metadata?.behavioralBucket);
  if (behavioralBucket) {
    purchaseAnalytics.behavioral_bucket = behavioralBucket;
  }

  const initialPrice = getMetadataNumber(session.metadata?.initialPrice);
  if (initialPrice !== null) {
    purchaseAnalytics.initial_price = initialPrice;
  }

  const promotion = getStripeCheckoutPromotionSummary(session);
  if (promotion?.promotionCode) {
    purchaseAnalytics.promotion_code = promotion.promotionCode;
  }
  if (promotion?.couponId) {
    purchaseAnalytics.coupon_id = promotion.couponId;
  }
  if (promotion?.couponName) {
    purchaseAnalytics.coupon_name = promotion.couponName;
  }
  if (promotion?.couponPercentOff !== null && promotion?.couponPercentOff !== undefined) {
    purchaseAnalytics.coupon_percent_off = promotion.couponPercentOff;
  }
  if (promotion?.couponAmountOff !== null && promotion?.couponAmountOff !== undefined) {
    purchaseAnalytics.coupon_amount_off = promotion.couponAmountOff / 100;
  }
  if (promotion?.discountAmount !== null && promotion?.discountAmount !== undefined) {
    purchaseAnalytics.discount_amount = promotion.discountAmount;
  }

  return purchaseAnalytics;
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

  const url = new URL(request.url);
  const parsed = sessionStatusSchema.safeParse({
    session_id: url.searchParams.get("session_id"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    if (!isStripeCheckoutEnabled()) {
      const disabledResponse: StripeCheckoutSessionStatusResponse = {
        enabled: false,
        message: STRIPE_CHECKOUT_DISABLED_MESSAGE,
        reason: "checkout_disabled",
      };

      return NextResponse.json(disabledResponse);
    }

    const stripe = getStripeServerClient();
    if (!stripe) {
      return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
    }

    const session = await stripe.checkout.sessions.retrieve(parsed.data.session_id, {
      expand: STRIPE_CHECKOUT_SESSION_EXPAND,
    });
    const reportSessionId =
      typeof session.metadata?.reportSessionId === "string" && session.metadata.reportSessionId
        ? session.metadata.reportSessionId
        : null;
    const reportToken =
      typeof session.metadata?.reportToken === "string" && session.metadata.reportToken
        ? session.metadata.reportToken
        : null;
    let accessPlan = null;

    try {
      const context = await resolveSubmissionAccessContext({
        reportSessionId,
        reportToken,
      });

      if (context?.submissionId) {
        const access = await getReportAccessPlanForSubmission(context.submissionId);
        accessPlan = access.accessPlan;
      }
    } catch (error) {
      logger.warn(
        { error, sessionId: session.id },
        "Report access lookup failed during checkout status"
      );
    }

    const successResponse: StripeCheckoutSessionStatusResponse = {
      enabled: true,
      accessPlan,
      paymentStatus: session.payment_status ?? null,
      purchaseAnalytics: getPurchaseAnalytics(session),
      sessionStatus: session.status ?? null,
    };

    return NextResponse.json(successResponse);
  } catch (error) {
    logger.error({ error }, "Stripe checkout session status lookup failed");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
