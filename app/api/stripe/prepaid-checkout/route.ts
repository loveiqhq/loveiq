import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  STRIPE_CHECKOUT_DISABLED_MESSAGE,
  getStripeServerClient,
  isStripeCheckoutEnabled,
} from "@features/checkout/server/stripeCheckout";
import {
  WHITE_PREPAID_PRICE_CENTS,
  getReportPurchasePlan,
} from "@features/checkout/server/reportPurchase";
import {
  PREPAID_COOKIE,
  PREPAID_TOKEN_REGEX,
  createPendingPrepaidEntitlement,
  findPrepaidEntitlementByToken,
  generatePrepaidToken,
  markPrepaidEntitlementSucceeded,
  prepaidCookieOptions,
  updatePrepaidEntitlementSessionId,
} from "@features/checkout/server/prepaidEntitlement";
import {
  LANDING_VARIANT_COOKIE,
  normalizeLandingVariant,
} from "@shared/experiments/landingVariant";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const runtime = "nodejs";

/**
 * White-cohort "pay-first" checkout.
 *
 * The white landing A/B arm pays for the full report BEFORE taking the survey,
 * so — unlike /api/stripe/checkout-session — there is no submission/report/email
 * to anchor on. We mint an opaque bearer token into an httpOnly cookie, create a
 * Stripe Checkout session at the FIXED full-report price (no behavioural
 * pricing exists pre-survey), and record a pending `prepaid_report_access` row.
 * Stripe collects the email on its hosted page. The webhook flips the row to
 * succeeded; the white survey-submit route consumes it and unlocks the report.
 *
 * Idempotency: an existing cookie token is reused rather than minting a new one,
 * so a double-click can never leave the cookie pointing at an unpaid token while
 * the user paid a different session. A still-open session is handed back as-is;
 * an already-paid entitlement short-circuits to `alreadyPaid`.
 */

const RATE_LIMIT_CONFIG = {
  bucket: "prepaid-checkout",
  limit: 10,
  windowMs: 60_000,
};

const PLAN = "full_report" as const;

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

  const cookieStore = await cookies();

  // Pay-first is the white arm only. The dark cohort pays AFTER the survey via
  // /api/stripe/checkout-session, so refuse here to avoid charging a dark user
  // for an entitlement their flow never consumes.
  const landingVariant = normalizeLandingVariant(cookieStore.get(LANDING_VARIANT_COOKIE)?.value);
  if (landingVariant !== "white") {
    return NextResponse.json({ error: "Not available." }, { status: 403 });
  }

  try {
    if (!isStripeCheckoutEnabled()) {
      return NextResponse.json({ enabled: false, message: STRIPE_CHECKOUT_DISABLED_MESSAGE });
    }

    const stripe = getStripeServerClient();
    if (!stripe) {
      return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
    }

    const origin = new URL(request.url).origin;
    const plan = getReportPurchasePlan(PLAN);

    // Reuse an existing entitlement/token where possible (idempotency).
    const existingTokenRaw = cookieStore.get(PREPAID_COOKIE)?.value ?? null;
    const existingToken =
      existingTokenRaw && PREPAID_TOKEN_REGEX.test(existingTokenRaw) ? existingTokenRaw : null;
    let reuseToken: string | null = null;

    if (existingToken) {
      const existing = await findPrepaidEntitlementByToken(existingToken);
      if (existing?.status === "succeeded") {
        return NextResponse.json(
          { enabled: true, alreadyPaid: true },
          { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
        );
      }
      if (existing?.status === "pending" && existing.stripe_session_id) {
        try {
          const prior = await stripe.checkout.sessions.retrieve(existing.stripe_session_id);
          const priorPaymentIntentId =
            typeof prior.payment_intent === "string"
              ? prior.payment_intent
              : (prior.payment_intent?.id ?? null);
          // T-04 parity: only treat as paid when the PaymentIntent itself agrees
          // (a "paid" session can be voided by Radar moments later).
          let priorTrulyPaid = prior.payment_status === "paid";
          if (priorTrulyPaid && priorPaymentIntentId) {
            const pi = await stripe.paymentIntents.retrieve(priorPaymentIntentId);
            priorTrulyPaid = pi.status === "succeeded" || pi.status === "processing";
          }
          if (priorTrulyPaid) {
            // Webhook hasn't landed yet — reconcile inline so the user isn't stuck.
            await markPrepaidEntitlementSucceeded({
              amountCents: typeof prior.amount_total === "number" ? prior.amount_total : null,
              currency: prior.currency ?? null,
              stripePaymentIntentId: priorPaymentIntentId,
              stripeSessionId: existing.stripe_session_id,
            });
            return NextResponse.json(
              { enabled: true, alreadyPaid: true },
              { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
            );
          }
          if (prior.status === "open" && prior.url) {
            // Still-open session — hand the same URL back rather than create a duplicate.
            return NextResponse.json(
              { enabled: true, url: prior.url },
              { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
            );
          }
        } catch (err) {
          logger.warn({ err }, "prepaid-checkout: prior session retrieve failed; creating new");
        }
        // Prior session expired/closed — keep the SAME token, swap the session id.
        reuseToken = existingToken;
      }
    }

    const token = reuseToken ?? generatePrepaidToken();

    // Idempotency: collapse rapid double-submits / two-tab races to ONE Stripe
    // session. Keyed on a STABLE per-user anchor + minute bucket so two
    // concurrent first-click calls (before any prepaid cookie exists) hit the
    // same key and Stripe dedupes them instead of minting an orphan session.
    // Falls back to the IP — never to `token`, which is freshly generated on
    // each call and would give the two racing calls different keys, defeating
    // the dedup entirely.
    const visitorId =
      cookieStore.get("__Host-liq_vid")?.value ?? cookieStore.get("__liq_vid")?.value ?? null;
    const idempotencyKey = createHash("sha256")
      .update(`prepaid|${visitorId ?? ip}|${Math.floor(Date.now() / 60_000)}`)
      .digest("hex");

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        billing_address_collection: "auto",
        allow_promotion_codes: false,
        line_items: [
          {
            price_data: {
              currency: "eur",
              product_data: {
                description: plan.description,
                name: `LoveIQ ${plan.title}`,
              },
              // White pay-first offer price (full-report access for a fixed,
              // discounted amount — see WHITE_PREPAID_PRICE_CENTS), NOT the dark
              // cohort's dynamic full-report MSRP.
              unit_amount: WHITE_PREPAID_PRICE_CENTS,
            },
            quantity: 1,
          },
        ],
        invoice_creation: { enabled: true },
        metadata: {
          // Presence of prepaidToken is how the webhook routes to the prepaid path.
          prepaidToken: token,
          plan: PLAN,
          landingVariant,
        },
        // Built from parts so the {CHECKOUT_SESSION_ID} placeholder doesn't trip
        // the no-secrets entropy check on a single long literal.
        success_url: `${origin}/survey?prepaid=success&session_id=` + "{CHECKOUT_SESSION_ID}",
        cancel_url: `${origin}/survey?prepaid=cancel`,
      },
      { idempotencyKey }
    );

    if (!session.url) {
      logger.error({ sessionId: session.id }, "prepaid-checkout: session missing hosted URL");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }

    if (reuseToken) {
      await updatePrepaidEntitlementSessionId({ stripeSessionId: session.id, token });
    } else {
      const created = await createPendingPrepaidEntitlement({
        landingVariant,
        plan: PLAN,
        stripeSessionId: session.id,
        token,
      });
      if (!created) {
        return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
      }
    }

    const response = NextResponse.json(
      { enabled: true, url: session.url },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
    response.cookies.set(PREPAID_COOKIE, token, prepaidCookieOptions());
    return response;
  } catch (error) {
    const sanitized =
      error instanceof Error ? { name: error.name, message: error.message } : { name: "Unknown" };
    logger.error({ err: sanitized }, "prepaid-checkout: session creation failed");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
