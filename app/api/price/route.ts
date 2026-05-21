import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";
import {
  getReportPriceQuoteForContext,
  getReportPriceQuotesForContext,
} from "@features/pricing/logic/reportPricing";
import {
  REPORT_ACCESS_TOKEN_REGEX,
  REPORT_PURCHASE_PLAN_IDS,
} from "@features/checkout/server/reportPurchase";

const querySchema = z
  .object({
    plan: z.enum(REPORT_PURCHASE_PLAN_IDS).optional(),
    pricingSessionId: z.string().uuid().optional(),
    reportSessionId: z.string().uuid().optional(),
    token: z.string().regex(REPORT_ACCESS_TOKEN_REGEX).optional(),
  })
  .refine((value) => Boolean(value.reportSessionId || value.token), {
    message: "Report context required.",
  });

const RATE_LIMIT_CONFIG = {
  bucket: "price-quote",
  limit: 60,
  windowMs: 60_000,
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawToken = url.searchParams.get("token") ?? undefined;

  if (!rawToken && !(await verifyCsrfToken(request))) {
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

  const parsed = querySchema.safeParse({
    plan: url.searchParams.get("plan") ?? undefined,
    pricingSessionId: url.searchParams.get("pricingSessionId") ?? undefined,
    reportSessionId: url.searchParams.get("reportSessionId") ?? undefined,
    token: rawToken,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    const userAgent = request.headers.get("user-agent");

    if (parsed.data.plan) {
      const quote = await getReportPriceQuoteForContext({
        plan: parsed.data.plan,
        pricingSessionId: parsed.data.pricingSessionId ?? null,
        reportSessionId: parsed.data.reportSessionId ?? null,
        reportToken: parsed.data.token ?? null,
        userAgent,
      });

      if (!quote) {
        return NextResponse.json({ error: "Report not found." }, { status: 404 });
      }

      return NextResponse.json({ quote });
    }

    const quotes = await getReportPriceQuotesForContext({
      pricingSessionId: parsed.data.pricingSessionId ?? null,
      reportSessionId: parsed.data.reportSessionId ?? null,
      reportToken: parsed.data.token ?? null,
      userAgent,
    });

    if (!quotes) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    return NextResponse.json({ quotes });
  } catch (error) {
    logger.error({ error }, "Failed to resolve report pricing quote");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
