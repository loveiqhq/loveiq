"use client";

import posthog from "posthog-js";
import { pingFunnelEvent, track, trackReportPurchase } from "@features/analytics/client";
import type { PayToStartPurchase, PayToStartStatusState } from "@features/pay-to-start/logic/api";
import { PAY_TO_START_JOURNEY } from "@features/pay-to-start/logic/journey";
import { getOfferDefinition, type PayToStartOfferId } from "@features/pay-to-start/logic/offer";

/**
 * What the pay-to-start pages tell PostHog, GA4 and `funnel_event`.
 *
 * Every event of the visit carries `journey: "pay_to_start"` (a PostHog session property),
 * so the free funnel's insights can leave this journey out with one filter, and its own
 * events are named `pts_*` so nothing it sends lands in a series the landing test reads.
 * The one shared name is GA4's ecommerce `begin_checkout`, which Google Ads reads; it
 * carries `journey` too.
 *
 * Never sent: the bearer token, the Stripe session id before payment, an email.
 */

/** Where on the page a checkout was started. */
export type PtsCtaLocation =
  "price_card" | "one_price" | "final_cta" | "sticky_bar" | "status_retry";

/** Called once per page load of a pay-to-start page. */
export function registerPayToStartVisit(offer: PayToStartOfferId, priceCents: number): void {
  if (typeof window === "undefined") return;
  try {
    posthog.register_for_session({
      journey: PAY_TO_START_JOURNEY,
      pts_offer: offer,
      pts_price_cents: priceCents,
    });
  } catch {
    // Analytics never breaks the page.
  }
}

/**
 * The page was seen: PostHog, and the durable `prepaid_gate_viewed` row (one per visitor
 * and day) that the June pay-first test used, so its funnel can be read beside this one.
 */
export function trackPtsLandingViewed(params: {
  priceCents: number;
  /** `?checkout=cancelled` or `?continue=…`, when the visit is a return. */
  notice: string | null;
}): void {
  track("pts_landing_viewed", { price_cents: params.priceCents, notice: params.notice });
  pingFunnelEvent("prepaid_gate_viewed");
}

/** A click on any "Unlock …" button, before the request goes out. */
export function trackPtsCtaClick(params: {
  location: PtsCtaLocation;
  offer: PayToStartOfferId;
  priceCents: number;
}): void {
  track("pts_cta_click", { location: params.location, price_cents: params.priceCents });
}

/**
 * The checkout the click asked for is opening: GA4's ecommerce `begin_checkout` (which
 * Google Ads reads) and the durable `prepaid_checkout_started` row. Only when the server
 * answers with a checkout to go to, never for a browser it sends to its survey or report
 * because it already paid, a price that changed, or a paused checkout: none of those is a
 * checkout started. Sent before the page leaves; the funnel ping is a beacon.
 */
export function trackPtsCheckoutOpened(params: {
  location: PtsCtaLocation;
  offer: PayToStartOfferId;
  priceCents: number;
}): void {
  const value = params.priceCents / 100;
  const itemName = getOfferDefinition(params.offer).productName;
  track("begin_checkout", {
    journey: PAY_TO_START_JOURNEY,
    currency: "EUR",
    value,
    items: [
      { item_id: `pay_to_start_${params.offer}`, item_name: itemName, price: value, quantity: 1 },
    ],
    location: params.location,
  });
  pingFunnelEvent("prepaid_checkout_started");
}

/** The click did not reach Stripe; `reason` is the state or HTTP status, never a message. */
export function trackPtsCheckoutFailed(params: { location: PtsCtaLocation; reason: string }): void {
  track("pts_checkout_failed", params);
}

/** Back from Stripe's own "back" link without paying. */
export function trackPtsCheckoutCancelled(): void {
  track("pts_checkout_cancelled");
}

/** The intro video started playing, with sound. */
export function trackPtsVideoPlay(): void {
  track("pts_video_play");
}

/** What the page's header can be pressed for: the site's pages, or its own price. */
export type PtsNavTarget = "logo" | "home" | "about" | "glossary" | "trust_center" | "price";

/**
 * A press in the header (the LoveIQ site's own nav), in the bar or the phone's menu. Every
 * target but `price` leaves the page for the site, where "Start test now" is the free
 * survey: this counts how many do.
 */
export function trackPtsNavClick(params: { target: PtsNavTarget; place: "bar" | "menu" }): void {
  track("pts_nav_click", params);
}

/** The status page settled on an answer (or gave up waiting: "timeout", "error"). */
export function trackPtsStatusViewed(
  state: PayToStartStatusState | "timeout" | "error" | "missing"
): void {
  track("pts_status_viewed", { state });
}

/**
 * The purchase, once per payment, from the page the buyer comes back to: GA4's `purchase`
 * and the Google Ads conversion (production only, never a staff or EUR 0 payment; the
 * server sends its own copy at the same transaction id, so GA4 counts one).
 */
export function trackPtsPurchase(purchase: PayToStartPurchase): void {
  trackReportPurchase({ ...purchase, journey: PAY_TO_START_JOURNEY });
}
