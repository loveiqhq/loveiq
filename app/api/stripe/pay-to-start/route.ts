import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  STRIPE_CHECKOUT_DISABLED_MESSAGE,
  getStripeServerClient,
  isStripeCheckoutEnabled,
} from "@features/checkout/server/stripeCheckout";
import { settlePayToStartSession } from "@features/checkout/server/fulfillment";
import type { PayToStartCheckoutResponse } from "@features/pay-to-start/logic/api";
import { readPrepaidToken } from "@features/pay-to-start/logic/journey";
import {
  PAY_TO_START_LANDING_VARIANT,
  buildPayToStartSessionParams,
} from "@features/pay-to-start/server/checkout";
import {
  PREPAID_COOKIE,
  clearedPrepaidCookieOptions,
  createPendingEntitlement,
  findEntitlementByToken,
  generatePrepaidToken,
  prepaidCookieOptions,
  setEntitlementSession,
  type Entitlement,
} from "@features/pay-to-start/server/entitlement";
import { getPayToStartOffer } from "@features/pay-to-start/server/offer";
import { lookupReportTokenBySubmissionId } from "@features/report/server/personalReport";
import { isSurveyClosed } from "@features/survey/server/server";
import { isFeatureEnabled } from "@shared/flags/system-flags";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";
import { escapeSlack, notifySlack } from "@shared/observability/slack";

export const runtime = "nodejs";

/**
 * Pay to start the survey: the checkout behind every "Unlock survey & report" button on
 * /sexual-archetype (Figma 1706:1699).
 *
 * There is no survey, report or email yet, so the buyer is anchored by an opaque token in
 * an httpOnly cookie and a pending entitlement row (features/pay-to-start). Stripe
 * collects the email. Paying is confirmed by the webhook, the status page or the sweep;
 * the survey's submit claims it and the report opens fully unlocked.
 *
 * A browser that already holds a token never pays twice: paid sends it to the survey,
 * an open session is handed back, an expired one is replaced under the same token, and
 * one already used sends it to its report.
 */

const RATE_LIMIT = { bucket: "pay-to-start-checkout", limit: 10, windowMs: 60_000 };

const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate" };

const bodySchema = z.object({
  offer: z.literal("full"),
  /** The price the page showed: a mismatch means the setting changed under it. */
  displayedPriceCents: z.number().int().positive(),
  gaClientId: z.string().max(64).nullable().optional(),
  gaSessionId: z.string().max(64).nullable().optional(),
  gaConsent: z.boolean().nullable().optional(),
  /** The page's attribution snapshot (shared/url/utm.ts); over 1,000 characters is dropped. */
  utmTracker: z.string().nullable().optional(),
});

function reply(body: PayToStartCheckoutResponse, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

async function alertCheckoutFailure(detail: string): Promise<void> {
  await notifySlack({
    channel: "ops",
    kind: "pts_checkout_failure",
    text: `:rotating_light: Pay to start checkout FAILED: visitors on the assessment page may be unable to pay. ${escapeSlack(detail)}`,
    username: "ops_alerts",
  }).catch(() => undefined);
}

async function reportPathFor(submissionId: number): Promise<string | null> {
  const token = await lookupReportTokenBySubmissionId(submissionId);
  return token ? `/report/${encodeURIComponent(token)}` : null;
}

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, RATE_LIMIT);
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

  const offer = getPayToStartOffer(parsed.data.offer);
  if (!offer.enabled) {
    return NextResponse.json({ error: "Not available." }, { status: 400 });
  }

  if (!isStripeCheckoutEnabled()) {
    return reply({ state: "unavailable", message: STRIPE_CHECKOUT_DISABLED_MESSAGE });
  }
  if (!(await isFeatureEnabled("pay_to_start_checkout"))) {
    return reply(
      {
        state: "unavailable",
        message: "Checkout is paused for a moment. Please try again later.",
      },
      503
    );
  }
  // Never sell a survey that cannot be submitted.
  if ((await isSurveyClosed()) || !(await isFeatureEnabled("survey_submissions"))) {
    return reply(
      {
        state: "unavailable",
        message: "The survey is paused for a moment. Please check back soon; nothing was charged.",
      },
      409
    );
  }
  if (parsed.data.displayedPriceCents !== offer.priceCents) {
    return reply({ state: "price_changed", priceCents: offer.priceCents }, 409);
  }

  const stripe = getStripeServerClient();
  if (!stripe) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const origin = new URL(request.url).origin;

  try {
    // A token this browser already holds: settle it before anything new is sold.
    let reuse: Entitlement | null = null;
    const existingToken = readPrepaidToken(request.headers.get("cookie"));
    const existing = existingToken ? await findEntitlementByToken(existingToken) : null;

    // Paid and claimed: the report is theirs. A claim on a checkout left unpaid is not
    // "used": paying it now (below) unlocks the report that submission already has.
    if (existing?.consumed_submission_id && existing.status === "succeeded") {
      const response = reply({
        state: "used",
        reportPath: await reportPathFor(existing.consumed_submission_id),
      });
      response.cookies.set(PREPAID_COOKIE, "", clearedPrepaidCookieOptions());
      return response;
    }
    if (existing?.status === "succeeded") {
      const response = reply({ state: "paid" });
      response.cookies.set(PREPAID_COOKIE, existing.prepaid_token, prepaidCookieOptions());
      return response;
    }
    if (existing?.status === "pending" && existing.stripe_session_id) {
      const settled = await settlePayToStartSession({
        sessionId: existing.stripe_session_id,
        source: "checkout",
        stripe,
      });
      switch (settled.state) {
        case "paid":
          return reply({ state: "paid" });
        case "processing":
          // Paid with a method that is still settling: the status page waits for it.
          return reply({
            state: "redirect",
            url: `${origin}${offer.landingPath}/checkout?session_id=${encodeURIComponent(existing.stripe_session_id)}`,
          });
        case "open":
          // The same session again, unless the price changed since it opened.
          if (settled.session?.url && settled.session.amount_subtotal === offer.priceCents) {
            return reply({ state: "redirect", url: settled.session.url });
          }
          await stripe.checkout.sessions.expire(existing.stripe_session_id).catch((err) => {
            logger.warn({ err }, "pay-to-start: expiring a stale-priced session failed");
          });
          reuse = existing;
          break;
        case "expired":
        case "failed":
          reuse = existing;
          break;
        default:
          // Refunded or unknown: a fresh token below.
          break;
      }
    } else if (existing?.status === "expired" || existing?.status === "pending") {
      // Expired, or pending with no session (an earlier create failed): same token.
      reuse = existing;
    }

    const utmTracker =
      parsed.data.utmTracker && parsed.data.utmTracker.length <= 1000
        ? parsed.data.utmTracker
        : null;
    const token = reuse?.prepaid_token ?? generatePrepaidToken();
    const entitlement =
      reuse ??
      (await createPendingEntitlement({
        currency: "EUR",
        landingVariant: PAY_TO_START_LANDING_VARIANT,
        listPriceCents: offer.priceCents,
        offer: offer.id,
        plan: "full_report",
        token,
        utmTracker,
      }));
    if (!entitlement) {
      await alertCheckoutFailure("Recording the pending entitlement failed.");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }

    const params = buildPayToStartSessionParams({
      offer,
      entitlementId: entitlement.id,
      origin,
      gaClientId: parsed.data.gaClientId ?? null,
      gaSessionId: parsed.data.gaSessionId ?? null,
      gaConsent: parsed.data.gaConsent === true,
      utmTracker: entitlement.utm_tracker ?? utmTracker,
      requestIp: ip,
      userAgent: request.headers.get("user-agent"),
    });
    // A double click inside the same minute gets the same session back. The key covers
    // everything sent, because Stripe refuses a reused key whose parameters differ.
    const idempotencyKey = createHash("sha256")
      .update(`pts|${token}|${Math.floor(Date.now() / 60_000)}|${JSON.stringify(params)}`)
      .digest("hex");
    const session = await stripe.checkout.sessions.create(params, { idempotencyKey });

    if (!session.url) {
      logger.error({ sessionId: session.id }, "pay-to-start: session without a hosted URL");
      await alertCheckoutFailure("Stripe returned a session without a checkout URL.");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }

    // If this stamp fails, the session still names the entitlement in its metadata, and
    // confirming it points the row at it then.
    await setEntitlementSession({
      id: entitlement.id,
      listPriceCents: offer.priceCents,
      stripeSessionId: session.id,
    });

    const response = reply({ state: "redirect", url: session.url });
    response.cookies.set(PREPAID_COOKIE, token, prepaidCookieOptions());
    return response;
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
    logger.error({ err: sanitized }, "pay-to-start: checkout failed");
    await alertCheckoutFailure(
      `${sanitized.name}${"message" in sanitized ? `: ${sanitized.message}` : ""}`
    );
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
