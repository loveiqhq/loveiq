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
 * of payments server-side. Sending the purchase from there makes GA4's purchase
 * count match reality.
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
