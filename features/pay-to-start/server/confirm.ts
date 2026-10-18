import type Stripe from "stripe";
import { sendGa4PurchaseEvent } from "@features/analytics/server/ga4";
import { sendPosthogPurchaseEvent } from "@features/analytics/server/posthog";
import { classifyTraffic } from "@features/attribution/server/traffic";
import {
  STRIPE_CHECKOUT_SESSION_EXPAND,
  getStripeCheckoutPromotionSummary,
} from "@features/checkout/server/stripeCheckout";
import { PAY_TO_START_JOURNEY } from "@features/pay-to-start/logic/journey";
import {
  formatOfferAmount,
  getOfferDefinition,
  isPayToStartOfferId,
} from "@features/pay-to-start/logic/offer";
import { isStaffEmail } from "@shared/env/staff-email";
import { scheduleAfterResponse } from "@shared/http/after-response";
import logger from "@shared/observability/logger";
import { escapeSlack, maskEmail, notifySlack } from "@shared/observability/slack";
import { sendPayToStartConfirmationEmail } from "./emails/confirmation";
import {
  findEntitlementById,
  findRecentPaidDuplicate,
  markEntitlementExpired,
  markEntitlementRefundedUnconfirmed,
  markEntitlementSucceeded,
  setEntitlementSession,
  type Entitlement,
} from "./entitlement";

/**
 * Settles a pay-to-start Checkout session against its entitlement: the one place that
 * decides whether a buyer has paid. The webhook, the status page's poll, the checkout
 * route (a buyer back from Stripe before the webhook) and the sweep all come here, in any
 * order and any number of times.
 *
 * Paid means what Stripe says now, not what an event said: the session complete and
 * `paid` (or `no_payment_required`, a 100% code), and its PaymentIntent `succeeded`. A
 * `processing` intent (a delayed method) is not paid yet: the survey must not unlock on
 * money that can still fail. Stricter than the report checkout's T-04 check, which also
 * accepts `processing`, because nothing here can be taken back once the report is read.
 *
 * Never imports `features/checkout/server/fulfillment.ts` (which imports this): applying
 * a bound entitlement to its report is the caller's next step (`settlePayToStartSession`).
 */

export type PayToStartSessionState =
  /** The money is in and the entitlement is `succeeded`. */
  | "paid"
  /** Stripe is still settling it (a delayed method, or a 3DS step being finished). */
  | "processing"
  /** Checkout not finished yet. */
  | "open"
  /** Checkout expired without payment. */
  | "expired"
  /** The payment failed. */
  | "failed"
  /** Refunded or disputed: the entitlement no longer unlocks anything. */
  | "refunded"
  /** Not a pay-to-start session, or no entitlement behind it. */
  | "unknown";

export interface ConfirmResult {
  state: PayToStartSessionState;
  entitlement: Entitlement | null;
  session: Stripe.Checkout.Session | null;
  /** True only for the call that flipped the row to paid; its one-time effects ran. */
  firstFlip: boolean;
}

export type ConfirmSource = "webhook" | "status" | "checkout" | "sweep" | "claim";

/** Read on each call, not at load: test files that mock stripeCheckout often omit it. */
function sessionExpand(): string[] {
  return [...STRIPE_CHECKOUT_SESSION_EXPAND, "payment_intent.latest_charge"];
}

/** A second paid entitlement for one address inside this window is reported to #ops. */
const DUPLICATE_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Every Stripe call here is bounded: the SDK's defaults are an 80 s timeout and two
 * retries, and the sweep that calls this runs inside a 50 s function (its cron_run row is
 * written only if it ends). A webhook or a poll that fails here is simply asked again.
 */
const STRIPE_REQUEST = { timeout: 8_000, maxNetworkRetries: 1 } as const;

/** A PaymentIntent that will not complete without the buyer starting over. */
function intentGaveUp(intent: Stripe.PaymentIntent | null): boolean {
  return intent?.status === "requires_payment_method" || intent?.status === "canceled";
}

function paymentIntentOf(session: Stripe.Checkout.Session): {
  id: string | null;
  intent: Stripe.PaymentIntent | null;
} {
  const raw = session.payment_intent;
  if (!raw) return { id: null, intent: null };
  if (typeof raw === "string") return { id: raw, intent: null };
  return { id: raw.id, intent: raw };
}

function chargeOf(intent: Stripe.PaymentIntent | null): Stripe.Charge | null {
  const charge = intent?.latest_charge;
  return charge && typeof charge !== "string" ? charge : null;
}

function result(
  state: PayToStartSessionState,
  entitlement: Entitlement | null,
  session: Stripe.Checkout.Session | null,
  firstFlip = false
): ConfirmResult {
  return { state, entitlement, session, firstFlip };
}

/** The state an already-settled row reports, whatever this one session did. */
function settledState(entitlement: Entitlement): PayToStartSessionState | null {
  if (entitlement.status === "refunded") return "refunded";
  if (entitlement.status === "succeeded") return "paid";
  return null;
}

export async function confirmPayToStartSession({
  sessionId,
  source,
  stripe,
}: {
  sessionId: string;
  source: ConfirmSource;
  stripe: Stripe;
}): Promise<ConfirmResult> {
  const session = await stripe.checkout.sessions.retrieve(
    sessionId,
    { expand: sessionExpand() },
    STRIPE_REQUEST
  );
  if (session.metadata?.journey !== PAY_TO_START_JOURNEY) {
    return result("unknown", null, session);
  }

  const entitlementId = Number(session.metadata?.entitlementId);
  const entitlement = Number.isSafeInteger(entitlementId)
    ? await findEntitlementById(entitlementId)
    : null;
  const sessionPaid =
    session.status === "complete" &&
    (session.payment_status === "paid" || session.payment_status === "no_payment_required");

  if (!entitlement) {
    if (sessionPaid) await alertPaidWithoutEntitlement(session, source);
    return result("unknown", null, session);
  }

  if (session.status === "expired") {
    if (entitlement.status === "pending" && entitlement.stripe_session_id === session.id) {
      await markEntitlementExpired({ id: entitlement.id, stripeSessionId: session.id });
      return result("expired", { ...entitlement, status: "expired" }, session);
    }
    return result(settledState(entitlement) ?? "expired", entitlement, session);
  }
  if (session.status === "open") {
    return result(settledState(entitlement) ?? "open", entitlement, session);
  }
  let { id: paymentIntentId, intent } = paymentIntentOf(session);
  const readIntent = async () => {
    if (paymentIntentId && !intent) {
      intent = await stripe.paymentIntents.retrieve(
        paymentIntentId,
        { expand: ["latest_charge"] },
        STRIPE_REQUEST
      );
    }
  };

  // Complete but unpaid: a delayed method still settling, or one that failed. A session
  // never expires once complete, so a failure read as "processing" would send every later
  // click to the status page for good; as "failed", the checkout route opens a new one.
  if (!sessionPaid) {
    const settled = settledState(entitlement);
    if (settled) return result(settled, entitlement, session);
    await readIntent();
    return result(intentGaveUp(intent) ? "failed" : "processing", entitlement, session);
  }

  await readIntent();
  if (intent && intent.status !== "succeeded") {
    const pending = intent.status === "processing" || intent.status === "requires_action";
    return result(
      settledState(entitlement) ?? (pending ? "processing" : "failed"),
      entitlement,
      session
    );
  }

  if (entitlement.status === "refunded") return result("refunded", entitlement, session);

  // Refunded in full, or disputed, before anything confirmed it (staff refunding a buyer
  // whose confirmation failed, or Stripe redelivering `charge.refunded` before
  // `completed`). The refund event found no row to void, because the PaymentIntent is
  // stamped only at confirmation, so this is the one place left to stop the unlock. A
  // partial refund still unlocks, as it does after a report purchase.
  const earlyCharge = chargeOf(intent);
  if (
    entitlement.status !== "succeeded" &&
    earlyCharge &&
    (earlyCharge.refunded || earlyCharge.disputed)
  ) {
    await markEntitlementRefundedUnconfirmed({ id: entitlement.id, paymentIntentId });
    logger.warn(
      { entitlementId: entitlement.id, sessionId: session.id, source },
      "pay-to-start: refunded or disputed before it was confirmed; not unlocking"
    );
    return result("refunded", { ...entitlement, status: "refunded" }, session);
  }

  if (entitlement.status === "succeeded") {
    const samePayment =
      entitlement.stripe_session_id === session.id ||
      (!!paymentIntentId && entitlement.stripe_payment_intent_id === paymentIntentId);
    if (!samePayment) await alertSecondPaidSession(entitlement, session, source);
    return result("paid", entitlement, session);
  }

  // Pending or expired, and this session is paid. A row pointing at another session (an
  // older one the buyer still paid, or a newer one opened in a second tab) follows the
  // money to this one first.
  if (entitlement.stripe_session_id !== session.id || entitlement.status === "expired") {
    await setEntitlementSession({ id: entitlement.id, stripeSessionId: session.id });
  }

  const email = session.customer_details?.email?.trim().toLowerCase() || null;
  const charge = chargeOf(intent);
  const isTest = isStaffEmail(email);
  const flipped = await markEntitlementSucceeded({
    amountCents: typeof session.amount_total === "number" ? session.amount_total : null,
    currency: session.currency ?? null,
    customerEmail: email,
    id: entitlement.id,
    isTest,
    paidAt: charge?.created
      ? new Date(charge.created * 1000).toISOString()
      : new Date().toISOString(),
    paymentIntentId,
  });

  if (!flipped) {
    // Another path flipped it first, or a refund got there: report what the row says now.
    const fresh = (await findEntitlementById(entitlement.id)) ?? entitlement;
    return result(settledState(fresh) ?? "processing", fresh, session);
  }

  logger.info(
    { entitlementId: flipped.id, sessionId: session.id, source },
    "pay-to-start: payment confirmed"
  );
  const effects = { charge, entitlement: flipped, isTest, session };
  scheduleAfterResponse("pts-first-payment", () => runFirstPaymentEffects(effects));
  return result("paid", flipped, session, true);
}

/**
 * Once per entitlement, on the flip to paid: the buyer's email, the #payments line, the
 * server-side purchase events, and the ops lines the report checkout also sends. Each is
 * independent; one failing never stops the others.
 */
export async function runFirstPaymentEffects({
  charge,
  entitlement,
  isTest,
  session,
}: {
  charge: Stripe.Charge | null;
  entitlement: Entitlement;
  isTest: boolean;
  session: Stripe.Checkout.Session;
}): Promise<void> {
  const offerId = isPayToStartOfferId(entitlement.offer) ? entitlement.offer : "full";
  const offer = getOfferDefinition(offerId);
  const amountCents = entitlement.amount_cents ?? session.amount_total ?? 0;
  const currency = (entitlement.currency ?? session.currency ?? "EUR").toUpperCase();
  const amountText = formatOfferAmount(amountCents);
  const email = entitlement.customer_email;
  const promotion = getStripeCheckoutPromotionSummary(session);
  const internalTag = isTest ? ":test_tube: [internal] " : "";
  const metadata = session.metadata ?? {};

  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      logger.error(
        { err, entitlementId: entitlement.id, step: name },
        "pay-to-start: effect failed"
      );
    }
  };

  if (email) {
    await step("email", async () => {
      let sent = false;
      try {
        sent = await sendPayToStartConfirmationEmail({
          amountText,
          email,
          entitlementId: entitlement.id,
          origin: metadata.origin ?? null,
          productName: offer.productName,
          token: entitlement.prepaid_token,
          // Paid after the survey was finished: the report is what unlocks now.
          variant: entitlement.consumed_submission_id ? "report" : "survey",
        });
      } finally {
        // The email is the buyer's way back in (the continue link): someone who paid and
        // closed the tab has nothing else, so one that did not go needs a person.
        if (!sent) {
          await notifySlack({
            channel: "ops",
            kind: "pts_confirmation_failed",
            text: `${internalTag}:warning: Pay to start: the confirmation email for entitlement #${entitlement.id} (${escapeSlack(maskEmail(email))}) was not sent. Send them their continue link (docs/runbooks/PAY_TO_START.md).`,
            username: "ops_alerts",
            context: { entitlementId: entitlement.id },
          });
        }
      }
    });
  } else {
    logger.warn({ entitlementId: entitlement.id }, "pay-to-start: no buyer email, nothing sent");
  }

  await step("slack", () =>
    notifySlack({
      channel: "payments",
      kind: "pts_paid",
      text: paidLine({ amountText, email, entitlement, internalTag, promotion }),
      username: "payment_notification",
      context: { entitlementId: entitlement.id },
    })
  );

  const promoParams = {
    promotion_code: promotion?.promotionCode ?? undefined,
    coupon_percent_off: promotion?.couponPercentOff ?? undefined,
    discount_amount: promotion?.discountAmount ?? undefined,
  };
  const listPrice =
    typeof entitlement.list_price_cents === "number"
      ? entitlement.list_price_cents / 100
      : undefined;

  await step("ga4", () =>
    sendGa4PurchaseEvent({
      clientId: metadata.gaClientId || null,
      sessionId: metadata.gaSessionId || null,
      consentGranted: metadata.gaAnalyticsConsent === "1",
      transactionId: session.id,
      value: amountCents / 100,
      currency,
      itemName: offer.productName,
      isTest,
      params: {
        plan: "full_report",
        journey: PAY_TO_START_JOURNEY,
        offer: offerId,
        list_price: listPrice,
        ...promoParams,
      },
    })
  );

  await step("posthog", () =>
    sendPosthogPurchaseEvent({
      email,
      anonDistinctId: metadata.posthogDistinctId || null,
      transactionId: session.id,
      value: amountCents / 100,
      currency,
      plan: "full_report",
      itemName: offer.productName,
      isTest,
      params: {
        journey: PAY_TO_START_JOURNEY,
        offer: offerId,
        list_price: listPrice,
        entitlement_id: entitlement.id,
        ...promoParams,
      },
    })
  );

  const riskLevel = charge?.outcome?.risk_level ?? null;
  if (riskLevel === "elevated" || riskLevel === "highest") {
    const icon = riskLevel === "highest" ? ":rotating_light:" : ":warning:";
    await step("radar", () =>
      notifySlack({
        channel: "ops",
        kind: `stripe_risk_${riskLevel}`,
        text: `${internalTag}${icon} Stripe Radar *${riskLevel}* risk on pay-to-start entitlement #${entitlement.id} (score ${charge?.outcome?.risk_score ?? "?"}). Paid before the survey; review for a proactive refund or contact.`,
        username: "ops_alerts",
      })
    );
  }

  if (promotion?.promotionCode) {
    const discount =
      typeof promotion.couponPercentOff === "number"
        ? `${promotion.couponPercentOff}% off`
        : typeof promotion.couponAmountOff === "number"
          ? `${(promotion.couponAmountOff / 100).toFixed(2)} off`
          : "promo applied";
    await step("promo", () =>
      notifySlack({
        channel: "ops",
        kind: "promo_redeemed",
        text: `${internalTag}:tag: Promo *${escapeSlack(promotion.promotionCode ?? "")}* redeemed (${discount}) on pay to start, entitlement #${entitlement.id}`,
        username: "ops_alerts",
      })
    );
  }

  if (email) {
    await step("duplicate", async () => {
      const duplicate = await findRecentPaidDuplicate({
        customerEmail: email,
        excludeId: entitlement.id,
        since: new Date(Date.now() - DUPLICATE_WINDOW_MS),
      });
      if (!duplicate) return;
      await notifySlack({
        channel: "ops",
        kind: "pts_double_payment",
        text: `${internalTag}:warning: Pay to start: ${escapeSlack(maskEmail(email))} paid twice within 48 hours (entitlements #${duplicate.id} and #${entitlement.id}). Each works through its own link; refund one if they ask.`,
        username: "ops_alerts",
      });
    });
  }
}

function paidLine({
  amountText,
  email,
  entitlement,
  internalTag,
  promotion,
}: {
  amountText: string;
  email: string | null;
  entitlement: Entitlement;
  internalTag: string;
  promotion: ReturnType<typeof getStripeCheckoutPromotionSummary>;
}): string {
  const traffic = classifyTraffic(entitlement.utm_tracker);
  const via = [traffic.source, traffic.campaign].filter(Boolean).map((v) => escapeSlack(v ?? ""));
  const parts = [
    `${internalTag}:moneybag: Pay to start: *${amountText}* paid, ${
      entitlement.consumed_submission_id
        ? `survey already finished (submission #${entitlement.consumed_submission_id})`
        : "survey not started yet"
    }`,
    email ? escapeSlack(maskEmail(email)) : "no email",
    via.length > 0 ? `${traffic.bucket} (${via.join(" / ")})` : traffic.bucket,
  ];
  if (
    typeof entitlement.list_price_cents === "number" &&
    entitlement.amount_cents !== entitlement.list_price_cents
  ) {
    parts.push(
      `list ${formatOfferAmount(entitlement.list_price_cents)}${
        promotion?.promotionCode ? `, code ${escapeSlack(promotion.promotionCode)}` : ""
      }`
    );
  }
  parts.push(`entitlement #${entitlement.id}`);
  return parts.join(" · ");
}

async function alertPaidWithoutEntitlement(
  session: Stripe.Checkout.Session,
  source: ConfirmSource
): Promise<void> {
  logger.error({ sessionId: session.id, source }, "pay-to-start: paid session has no entitlement");
  await notifySlack({
    channel: "ops",
    kind: "pts_paid_without_entitlement",
    text: `:rotating_light: Pay to start: session \`${escapeSlack(session.id)}\` is paid (${escapeSlack(
      String(session.amount_total ?? "?")
    )} cents) but no entitlement row matches it (entitlementId \`${escapeSlack(
      String(session.metadata?.entitlementId ?? "none")
    )}\`). The buyer cannot unlock anything: attach it by hand or refund. Seen by ${source}.`,
    username: "ops_alerts",
  }).catch(() => undefined);
}

async function alertSecondPaidSession(
  entitlement: Entitlement,
  session: Stripe.Checkout.Session,
  source: ConfirmSource
): Promise<void> {
  logger.warn(
    { entitlementId: entitlement.id, sessionId: session.id, source },
    "pay-to-start: a second paid session for one entitlement"
  );
  await notifySlack({
    channel: "ops",
    kind: "pts_second_paid_session",
    text: `:warning: Pay to start: entitlement #${entitlement.id} was already paid, and session \`${escapeSlack(
      session.id
    )}\` paid for it again (${escapeSlack(String(session.amount_total ?? "?"))} cents). Refund the second payment in Stripe.`,
    username: "ops_alerts",
  }).catch(() => undefined);
}
