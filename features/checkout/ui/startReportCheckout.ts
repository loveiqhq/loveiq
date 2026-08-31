"use client";

import posthog from "posthog-js";
import {
  getReportNurturePromo,
  getReportPricingSessionId,
} from "@features/survey/ui/hooks/surveySession";
import { getCsrfToken } from "@shared/http/csrf-client";
import { getGaMeasurementContext } from "@features/analytics/client";
import type { ReportPurchasePlanId } from "@features/checkout/server/reportPurchase";
import {
  STRIPE_CHECKOUT_DISABLED_MESSAGE,
  type StripeCheckoutSessionResponse,
} from "@features/checkout/server/stripeCheckout";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";

/**
 * Create the Stripe session and go there — the whole of what used to be the
 * `/checkout` page.
 *
 * That page repeated the price the reader had just seen, then auto-forwarded to
 * Stripe on a `useEffect` because the extra tap was redundant (Stripe always
 * shows the final amount before charging). What it actually added was a
 * navigation, a second price fetch, and a class of bug that needed three
 * separate guards: a back-from-Stripe marker in sessionStorage, a bfcache
 * `pageshow` handler to un-stick a frozen "Redirecting…", and a ref that could
 * never be reset without risking a double-POST redirect loop. Removed on
 * 2026-08-31 — none of those guards is needed when nothing auto-forwards,
 * because the only thing that starts a checkout is a click.
 *
 * Returns on FAILURE only. On success the browser has already been sent to
 * Stripe, so nothing after the call runs.
 */
export interface StartReportCheckoutFailure {
  /** `disabled` = checkout is switched off for this environment, not an error. */
  status: "disabled" | "error";
  message: string;
}

export async function startReportCheckout({
  archetype,
  plan,
  quote,
  reportSessionId,
  token,
}: {
  archetype?: string | null;
  plan: ReportPurchasePlanId;
  /** The quote the reader was actually shown. */
  quote: ReportPriceQuoteSnapshot | null;
  reportSessionId?: string | null;
  token?: string | null;
}): Promise<StartReportCheckoutFailure | null> {
  if (!token && !reportSessionId) {
    return {
      status: "error",
      message: "This checkout is tied to a saved report. Open your report again and retry.",
    };
  }
  if (!quote) {
    return {
      status: "error",
      message: "We're still preparing your price. Try again in a moment.",
    };
  }

  // Any stashed nurture promo (set by /report/[token]?promo=...). Forwarded raw;
  // the server validates ownership and expiry, and treats an unparseable value
  // as absent.
  const promo = getReportNurturePromo({ sessionId: token ? null : reportSessionId, token });
  // GA4 client_id / session_id + analytics consent, so the webhook can replay the
  // purchase server-side via the Measurement Protocol with attribution intact —
  // the client-side purchase event is lossy (blockers, closed tabs).
  const ga = getGaMeasurementContext();

  try {
    const response = await fetch("/api/stripe/checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() },
      body: JSON.stringify({
        archetype: archetype ?? undefined,
        gaClientId: ga.clientId ?? undefined,
        gaConsent: ga.consent,
        gaSessionId: ga.sessionId ?? undefined,
        plan,
        pricingSessionId: getReportPricingSessionId({
          sessionId: token ? null : reportSessionId,
          token,
        }),
        promo: promo ?? undefined,
        quoteId: quote.id,
        reportSessionId: token ? null : reportSessionId,
        reportToken: token,
      }),
    });

    const json = (await response.json().catch(() => null)) as
      | StripeCheckoutSessionResponse
      | { error?: string }
      | null;

    if (!response.ok) {
      return {
        status: "error",
        message:
          json && "error" in json && typeof json.error === "string"
            ? json.error
            : "We couldn't prepare secure checkout right now. Please try again.",
      };
    }

    if (!json || !("enabled" in json) || !json.enabled) {
      return {
        status: "disabled",
        message:
          json && "message" in json && typeof json.message === "string"
            ? json.message
            : STRIPE_CHECKOUT_DISABLED_MESSAGE,
      };
    }

    if (!json.url) {
      return {
        status: "error",
        message: "Stripe checkout could not be started right now. Please try again.",
      };
    }

    posthog.capture("checkout_started", { currency: quote.currency, plan });
    window.location.assign(json.url);
    return null;
  } catch {
    return { status: "error", message: "We couldn't reach Stripe right now. Please try again." };
  }
}
