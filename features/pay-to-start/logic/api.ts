/**
 * What the pay-to-start routes answer, shared by the routes and the page's hooks. Pure.
 */

/** What the checkout answers while the kill switch (`pay_to_start_checkout`) is off. */
export const PAY_TO_START_PAUSED_MESSAGE =
  "Checkout is paused for a moment. Please try again later.";

/** What it answers while the survey cannot take submissions: never sell one. */
export const PAY_TO_START_SURVEY_CLOSED_MESSAGE =
  "The survey is paused for a moment. Please check back soon; nothing was charged.";

/** POST /api/stripe/pay-to-start */
export type PayToStartCheckoutResponse =
  /** Go to Stripe (or, while a payment settles, to the status page). */
  | { state: "redirect"; url: string }
  /** Already paid in this browser: straight to the survey. */
  | { state: "paid" }
  /** Already paid and used: the report exists. */
  | { state: "used"; reportPath: string | null }
  /** The price on the page is not the price now: reload it. */
  | { state: "price_changed"; priceCents: number }
  /** Checkout is switched off (an environment without payments, or the kill switch). */
  | { state: "unavailable"; message: string };

/** The purchase the status page reports once (GA4 `purchase`, the Ads conversion). */
export interface PayToStartPurchase {
  value: number;
  currency: string;
  /** The Checkout session id, as the server-side purchase event sends it: GA4 dedupes. */
  transaction_id: string;
  item_name: string;
  isTest: boolean;
}

/** GET /api/stripe/pay-to-start/status?session_id= */
export type PayToStartStatusResponse =
  | { state: "paid"; purchase: PayToStartPurchase }
  | { state: "used"; reportPath: string | null; purchase: PayToStartPurchase }
  | { state: "processing" | "open" | "expired" | "failed" | "refunded" | "unknown" }
  | { state: "unavailable"; message: string };

export type PayToStartStatusState = PayToStartStatusResponse["state"];
