import Stripe from "stripe";
import type { ReportPurchasePlanId } from "./reportPurchase";

export const STRIPE_CHECKOUT_DISABLED_MESSAGE =
  "Checkout preview only. Payments are not enabled in this environment yet.";

export type StripeCheckoutSessionResponse =
  | {
      enabled: false;
      message: string;
      reason: "checkout_disabled";
    }
  | {
      clientSecret: string;
      enabled: true;
    };

export type StripeCheckoutSessionStatusResponse =
  | {
      enabled: false;
      message: string;
      reason: "checkout_disabled";
    }
  | {
      enabled: true;
      paymentStatus: string | null;
      sessionStatus: string | null;
    };

let stripeClient: Stripe | null = null;

export function isStripeCheckoutEnabled() {
  return process.env.STRIPE_CHECKOUT_ENABLED === "true";
}

export function getStripeServerClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return null;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }

  return stripeClient;
}

export function getStripePriceId(plan: ReportPurchasePlanId) {
  switch (plan) {
    case "essentials":
      return process.env.STRIPE_PRICE_ID_ESSENTIALS ?? null;
    case "full_report":
      return process.env.STRIPE_PRICE_ID_FULL_REPORT ?? null;
    case "all_reports":
      return process.env.STRIPE_PRICE_ID_ALL_REPORTS ?? null;
    default:
      return null;
  }
}
