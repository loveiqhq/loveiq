import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";
import { scheduleAfterResponse } from "@shared/http/after-response";
import { resolveSubmissionAccessContext } from "@features/report/server/personalReport";
import { refreshJourneyMessage } from "@features/attribution/server/journey-message";
import {
  armReportUrgencyWindow,
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
 * Start the reader's urgency window — the three minutes after which every plan costs
 * two euros more.
 *
 * A POST, not a query flag on the GET, even though that GET already writes (it upserts
 * the quote and bumps `view_count`). Arming is the one write with a PRICE consequence,
 * and a GET is fetched by things that are not readers: a shared report link unfurling
 * in Slack or WhatsApp would start the clock, and the human who opened the chat would
 * arrive to a report that had already gone up in price. A CSRF-guarded POST is only
 * reachable from our own page.
 *
 * Idempotent: an armed window is returned unchanged, elapsed or not.
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
    const urgencyDeadlineAt = await armReportUrgencyWindow({
      plan: parsed.data.plan,
      pricingSessionId: parsed.data.pricingSessionId ?? null,
      reportSessionId: parsed.data.reportSessionId ?? null,
      reportToken: parsed.data.token ?? null,
      userAgent: request.headers.get("user-agent"),
    });

    // Advance the Slack journey message to "Paywall hit".
    //
    // This POST is the only SERVER-SIDE evidence that a reader reached the paywall:
    // it is fired when the pricing modal opens (ReportPage.armPaywallCountdown) and
    // is CSRF-guarded, so it is only reachable from our own page. Without it the
    // "Paywall hit" step carried no independent information — it could only ever
    // fill by inference once checkout started, because the `paywall_initiated`
    // event it would otherwise rely on lives in the consent-gated analytics table.
    //
    // After-response and self-skipping, so opening the modal repeatedly is free.
    scheduleAfterResponse("journey-message-paywall", async () => {
      const accessContext = await resolveSubmissionAccessContext({
        reportSessionId: parsed.data.reportSessionId ?? null,
        reportToken: parsed.data.token ?? null,
      });
      if (accessContext?.submissionId) {
        await refreshJourneyMessage(accessContext.submissionId, "paywall");
      }
    });

    return NextResponse.json({ urgencyDeadlineAt });
  } catch (error) {
    // Never block the reader on this: without a deadline they simply keep the base
    // price, which is the safe direction to fail in.
    logger.error({ error }, "Failed to arm report urgency window");
    return NextResponse.json({ urgencyDeadlineAt: null });
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
