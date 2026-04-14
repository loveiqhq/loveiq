import { NextResponse } from "next/server";
import { z } from "zod";
import {
  STRIPE_CHECKOUT_DISABLED_MESSAGE,
  getStripeServerClient,
  isStripeCheckoutEnabled,
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

    const session = await stripe.checkout.sessions.retrieve(parsed.data.session_id);
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
      sessionStatus: session.status ?? null,
    };

    return NextResponse.json(successResponse);
  } catch (error) {
    logger.error({ error }, "Stripe checkout session status lookup failed");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
