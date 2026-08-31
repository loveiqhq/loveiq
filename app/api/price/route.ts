import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";
import { scheduleAfterResponse } from "@shared/http/after-response";
import { resolveSubmissionAccessContext } from "@features/report/server/personalReport";
import { refreshJourneyMessage } from "@features/attribution/server/journey-message";
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

const armSchema = z
  .object({
    plan: z.enum(REPORT_PURCHASE_PLAN_IDS).optional(),
    pricingSessionId: z.string().uuid().optional(),
    reportSessionId: z.string().uuid().optional(),
    token: z.string().regex(REPORT_ACCESS_TOKEN_REGEX).optional(),
  })
  .refine((value) => Boolean(value.reportSessionId || value.token), {
    message: "Report context required.",
  });

/**
 * Record that a reader reached the paywall.
 *
 * This used to arm a three-minute urgency window with a price consequence; that
 * surcharge and its countdown were removed on 2026-08-31. What is left is the reason
 * the endpoint has to stay: it is the only SERVER-SIDE evidence that a reader got to
 * the paywall, so the Slack journey message can fill its "Paywall hit" step. The
 * `paywall_initiated` analytics event cannot stand in — it lives in the consent-gated
 * table, so it is missing for everyone who declined.
 *
 * Still a CSRF-guarded POST rather than a flag on the GET: a shared report link
 * unfurling in Slack or WhatsApp fetches the GET, and a link preview is not a reader.
 */
export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, RATE_LIMIT_CONFIG);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const parsed = armSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    // After-response and self-skipping, so reaching the paywall repeatedly is free.
    scheduleAfterResponse("journey-message-paywall", async () => {
      const accessContext = await resolveSubmissionAccessContext({
        reportSessionId: parsed.data.reportSessionId ?? null,
        reportToken: parsed.data.token ?? null,
      });
      if (accessContext?.submissionId) {
        await refreshJourneyMessage(accessContext.submissionId, "paywall");
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    // Never block the reader on a reporting write.
    logger.error({ error }, "Failed to record paywall reached");
    return NextResponse.json({ success: true });
  }
}

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
