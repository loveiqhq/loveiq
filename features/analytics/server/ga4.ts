import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import { isProductionSite } from "@shared/env/is-non-prod-deploy";

/**
 * Server-side GA4 purchase tracking via the Measurement Protocol.
 *
 * Why this exists: the client-side `purchase` event (features/analytics/client.ts →
 * GTM → GA4) only fires for the consented subset of buyers who actually land back
 * on /checkout/return with a "paid & complete" status — it's lost to ad blockers,
 * closed tabs, and async payments. The Stripe webhook, by contrast, fulfills 100%
 * of payments server-side, so sending the purchase from there recovers the buyers
 * who paid and never came back.
 *
 * IT DOES NOT MAKE GA4 MATCH REALITY, and an earlier version of this comment
 * claimed it did. Measured 2026-08-27 over 12 months: 81 succeeded payments in the
 * database against 24 purchases in GA4 — 30%. The cause is the two gates below,
 * which this function INHERITS from the client rather than bypassing:
 *
 *   - `consentGranted` — of 68 paying submissions, only 35 ever wrote a single
 *     `analytics_event` row, and that table is itself consent-gated. So roughly
 *     half of all buyers decline analytics, and for them there is nothing to send.
 *   - `clientId` — it comes from the buyer's `_ga` cookie. A buyer who declined
 *     analytics has no `_ga` cookie, so even if consent were ignored there would be
 *     no id to attribute the purchase to.
 *
 * Both gates are correct: sending a declined visitor's purchase to Google is
 * exactly what the CookieYes gate exists to prevent. The consequence is simply that
 * **GA4 is not a source of revenue truth for this product and cannot be made into
 * one from here** — the `payment` table is. Anything that needs a real number (the
 * digest, /admin, a board slide) must read the database.
 *
 * The number that matters for advertising: GA4 sees ~30% of sales and ~24% of
 * revenue (EUR 269 of EUR 1,099). A consistent undercount still ranks campaigns
 * correctly, so conversion-based bidding is not broken, but any target-ROAS figure
 * fed from GA4 will be wrong by roughly 4x. Closing that properly means Google
 * Consent Mode v2 with modelling, not more server-side sends.
 *
 * Dedup: we send the SAME `transaction_id` the client uses (the Stripe checkout
 * session id), so GA4 collapses the client + server events into one purchase.
 *
 * Consent: gated on the analytics-consent flag captured at checkout creation, so
 * we never send a declined visitor's purchase to Google (matches the CookieYes
 * gate on the client). No `client_id` (GA never loaded → no `_ga` cookie) also
 * skips the send.
 */

// Mirrors the web-stream ID in app/layout.tsx; override per-env if ever needed.
const GA4_DEFAULT_MEASUREMENT_ID = "G-QTYY69L46N";
const GA4_MP_ENDPOINT = "https://www.google-analytics.com/mp/collect";

export interface Ga4PurchaseInput {
  /** GA4 client_id from the buyer's `_ga` cookie (captured at checkout). */
  clientId: string | null;
  /** GA4 session_id from the `_ga_<id>` cookie — improves session attribution. */
  sessionId: string | null;
  /** Analytics consent captured at checkout time. Send only when true. */
  consentGranted: boolean;
  /** Stripe checkout session id — MUST match the client event for GA4 dedup. */
  transactionId: string;
  /** Revenue in major currency units (e.g. EUR), not cents. */
  value: number;
  /** ISO currency code, e.g. "EUR". */
  currency: string;
  /** Product display name for items[0].item_name. */
  itemName: string;
  /** Optional extra GA4 event params (cluster, arm, device, …). */
  params?: Record<string, string | number | undefined>;
}

/**
 * Best-effort — never throws. A missing API secret, missing consent, or missing
 * client_id is a clean skip (logged at info); network/HTTP errors log at error.
 * Fulfillment must never fail because analytics did.
 */
export async function sendGa4PurchaseEvent(input: Ga4PurchaseInput): Promise<void> {
  /**
   * Production only. This is the one analytics send that survives the client-side
   * gate in app/layout.tsx, because it runs in the Stripe webhook rather than in a
   * browser: staging shares the production Supabase database and can take Stripe
   * test-mode webhooks, so a sandbox test purchase would otherwise arrive in the
   * real GA4 property as revenue — and GA4 purchases feed Google Ads, so it would
   * arrive as a conversion the bidding algorithm optimises on. `GA4_API_SECRET`
   * being unset on staging today is a configuration accident, not a guard.
   */
  if (!isProductionSite()) {
    logger.info(
      { transactionId: input.transactionId },
      "Non-production deploy — skipping server-side GA4 purchase event"
    );
    return;
  }

  const apiSecret = process.env.GA4_API_SECRET;
  if (!apiSecret) {
    logger.info(
      { transactionId: input.transactionId },
      "GA4_API_SECRET unset — skipping server-side purchase event"
    );
    return;
  }
  if (!input.consentGranted) {
    logger.info(
      { transactionId: input.transactionId },
      "Analytics consent not granted — skipping GA4 purchase (Measurement Protocol)"
    );
    return;
  }
  if (!input.clientId) {
    logger.info(
      { transactionId: input.transactionId },
      "No GA client_id — skipping GA4 purchase (Measurement Protocol)"
    );
    return;
  }

  // Drop empty/undefined extras so the GA4 payload stays clean. Built via
  // fromEntries (not dynamic-key assignment) to avoid an object-injection sink.
  const extraParams = Object.fromEntries(
    Object.entries(input.params ?? {}).filter(
      ([, val]) => val !== undefined && val !== null && val !== ""
    )
  ) as Record<string, string | number>;

  const body = {
    client_id: input.clientId,
    events: [
      {
        name: "purchase",
        params: {
          // Extras first so the canonical ecommerce fields below always win and
          // can never be clobbered by a stray caller-supplied param.
          ...extraParams,
          transaction_id: input.transactionId,
          value: input.value,
          currency: input.currency,
          items: [{ item_name: input.itemName, price: input.value, quantity: 1 }],
          // session_id + engagement_time_msec let the event attribute to the
          // buyer's session/source instead of landing as a session-less hit.
          ...(input.sessionId ? { session_id: input.sessionId } : {}),
          engagement_time_msec: 1,
        },
      },
    ],
  };

  const measurementId = process.env.GA4_MEASUREMENT_ID || GA4_DEFAULT_MEASUREMENT_ID;
  const url = `${GA4_MP_ENDPOINT}?measurement_id=${encodeURIComponent(
    measurementId
  )}&api_secret=${encodeURIComponent(apiSecret)}`;

  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 5000,
    });
    // MP returns 204 on accept. It does NOT validate event shape here (only the
    // /debug/mp/collect endpoint does), so a 2xx means "received", not "valid".
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.error(
        { transactionId: input.transactionId, status: res.status, body: text },
        "GA4 purchase Measurement Protocol send failed"
      );
    } else {
      logger.info(
        { transactionId: input.transactionId },
        "GA4 purchase Measurement Protocol event sent"
      );
    }
  } catch (err) {
    logger.error(
      { err, transactionId: input.transactionId },
      "GA4 purchase Measurement Protocol send error"
    );
  }
}
