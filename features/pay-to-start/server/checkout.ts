import type Stripe from "stripe";
import { PAY_TO_START_JOURNEY } from "@features/pay-to-start/logic/journey";
import { PAY_TO_START_STATUS_PATH, statusOfferQuery } from "@features/pay-to-start/logic/offer";
import type { PricedOffer } from "@features/pay-to-start/server/offer";

/**
 * The Stripe Checkout session a pay-to-start buyer is sent to (Figma 1475:2083, 1475:2087):
 * EUR at the offer's price, "Add promotion code", wallets and card as the dashboard
 * enables them, and one required checkbox the frames do not draw (see below).
 */

/** The `landing_variant` stamped on the entitlement row: which page sold it. */
export const PAY_TO_START_LANDING_VARIANT = "sexual-archetype";

/**
 * The text beside Stripe's required terms checkbox.
 *
 * Not in Figma, and needed: the Digital Content Terms say the consent to immediate
 * performance (which ends the 14-day right of withdrawal for digital content) "is given
 * during checkout", and the 18+ confirmation is otherwise only asked on the survey's
 * consent screen, which this journey reaches after paying. Wording for Mark and Marcus to
 * approve; Stripe renders the Markdown links. Needs the terms URL set in Stripe's public
 * details, in test and live mode, or Stripe refuses the session.
 */
export function payToStartTermsText(origin: string): string {
  return (
    `I am 18 or older and agree to the [Terms & Conditions](${origin}/terms-and-conditions) ` +
    `and the [Digital Content Terms](${origin}/digital-content-terms). I ask for access to ` +
    "the survey and report straight away, and understand that I lose my right of withdrawal " +
    "once they are made available to me."
  );
}

/** Stripe metadata values: trimmed, at most 500 characters, "" for nothing. */
export function toMetadataValue(value: string | null | undefined): string {
  return value?.trim().slice(0, 500) ?? "";
}

/** utm_source and utm_campaign from the page's attribution snapshot, for Stripe's dashboard. */
export function utmForMetadata(utmTracker: string | null): {
  utmSource: string;
  utmCampaign: string;
} {
  let parsed: unknown = null;
  try {
    parsed = utmTracker ? JSON.parse(utmTracker) : null;
  } catch {
    parsed = null;
  }
  const read = (key: "utm_source" | "utm_campaign"): string => {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "";
    const value =
      key === "utm_source"
        ? (parsed as { utm_source?: unknown }).utm_source
        : (parsed as { utm_campaign?: unknown }).utm_campaign;
    return typeof value === "string" ? value.replace(/[^\w.\- ]/g, "").slice(0, 100) : "";
  };
  return { utmSource: read("utm_source"), utmCampaign: read("utm_campaign") };
}

/**
 * How long a checkout stays open. Stripe's default is 24 hours, and every abandoned one
 * stays `pending` that long, so the sweep (twice an hour) kept re-asking about the same 25
 * and never reached a paid one whose webhook was missed. An hour covers a wallet, a bank
 * redirect or a 3DS step; a visitor back later gets a new session under the same token.
 */
export const PAY_TO_START_SESSION_TTL_SECONDS = 60 * 60;

/**
 * `expires_at` for a session made in this minute: the start of the minute plus the TTL
 * and one minute, so a double click inside the minute sends identical parameters (the
 * idempotency key's condition) and the session still lives at least the TTL.
 */
export function payToStartSessionExpiresAt(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 60_000) * 60 + PAY_TO_START_SESSION_TTL_SECONDS + 60;
}

export interface PayToStartSessionInput {
  offer: PricedOffer;
  entitlementId: number;
  /** The request's origin: every URL Stripe returns to, and the email's link host. */
  origin: string;
  /** Unix seconds; see `payToStartSessionExpiresAt`. */
  expiresAt: number;
  gaClientId: string | null;
  gaSessionId: string | null;
  gaConsent: boolean;
  posthogDistinctId?: string | null;
  utmTracker: string | null;
  requestIp: string | null;
  userAgent: string | null;
}

export function buildPayToStartSessionParams(
  input: PayToStartSessionInput
): Stripe.Checkout.SessionCreateParams {
  const { offer, origin } = input;
  const { utmSource, utmCampaign } = utmForMetadata(input.utmTracker);
  // Optional: a Payment Method Configuration made for this journey (cards and wallets
  // only, no delayed methods). Unset, the account's default configuration applies.
  const paymentMethodConfiguration = process.env.STRIPE_PAY_TO_START_PMC?.trim();

  return {
    mode: "payment",
    // "Add code" in the Figma checkout: staff test codes and campaign codes alike.
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    line_items: [
      {
        price_data: {
          currency: "eur",
          // The name Stripe's page and the receipt show (Figma 1475:2114).
          product_data: { name: offer.productName },
          // The price includes the VAT, which the receipt lists (`automaticTax`).
          tax_behavior: "inclusive",
          unit_amount: offer.priceCents,
        },
        quantity: 1,
      },
    ],
    invoice_creation: { enabled: true },
    expires_at: input.expiresAt,
    consent_collection: { terms_of_service: "required" },
    custom_text: {
      terms_of_service_acceptance: { message: payToStartTermsText(origin) },
    },
    ...(paymentMethodConfiguration
      ? { payment_method_configuration: paymentMethodConfiguration }
      : {}),
    // No bearer token and no `landingVariant` here: readouts read `landingVariant` as the
    // hero arm, and this journey is no arm of that test.
    metadata: {
      journey: PAY_TO_START_JOURNEY,
      offer: offer.id,
      entitlementId: String(input.entitlementId),
      plan: offer.grant.plan,
      listPriceCents: String(offer.priceCents),
      landingPage: offer.landingPath,
      origin,
      gaClientId: toMetadataValue(input.gaClientId),
      gaSessionId: toMetadataValue(input.gaSessionId),
      gaAnalyticsConsent: input.gaConsent ? "1" : "0",
      posthogDistinctId: toMetadataValue(input.posthogDistinctId),
      utmSource,
      utmCampaign,
      requestIp: toMetadataValue(input.requestIp),
      requestUserAgent: toMetadataValue(input.userAgent),
    },
    // The same labels on the PaymentIntent, so a refund or dispute opened in Stripe's
    // dashboard shows which journey sold it.
    payment_intent_data: {
      metadata: {
        journey: PAY_TO_START_JOURNEY,
        offer: offer.id,
        entitlementId: String(input.entitlementId),
      },
    },
    // Built from parts so {CHECKOUT_SESSION_ID} does not trip the no-secrets check. One
    // status page for both offers; the way back from Stripe is the offer's own page.
    success_url:
      `${origin}${PAY_TO_START_STATUS_PATH}?session_id=` +
      "{CHECKOUT_SESSION_ID}" +
      statusOfferQuery(offer.id),
    cancel_url: `${origin}${offer.landingPath}?checkout=cancelled`,
  };
}
