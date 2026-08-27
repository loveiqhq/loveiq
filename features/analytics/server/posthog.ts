import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import { isProductionSite } from "@shared/env/is-non-prod-deploy";

/**
 * Server-side PostHog purchase tracking via the capture API.
 *
 * Why this exists: mirrors `sendGa4PurchaseEvent` in this directory. The
 * client-side funnel only reaches PostHog for buyers who actually land back on
 * /checkout/return — it is lost to ad blockers, closed tabs, and async payments.
 * The Stripe webhook fulfills 100% of payments, so sending from there is the
 * only way PostHog's purchase count matches money actually taken.
 *
 * Identity: `distinct_id` is the buyer's lower-cased email, which is exactly what
 * the client uses when it identifies on survey submit. That makes the server
 * purchase land on the SAME PostHog person as their whole browsing history,
 * rather than creating an orphan profile no funnel can join to.
 *
 * Consent: deliberately NOT consent-gated, unlike the GA4 sibling above it.
 * PostHog on this site is un-gated by owner decision (same call as Microsoft
 * Clarity — see app/layout.tsx), so gating only the server half would make
 * PostHog's purchase count quietly lower than reality — the exact bug this file
 * exists to prevent.
 *
 * No SDK on purpose: posthog-node buffers and needs an awaited shutdown()/flush()
 * or it drops events when a serverless function freezes. A direct POST cannot
 * lose an event that way, and it matches how ga4.ts already talks to Google.
 *
 * Best-effort — never throws. Fulfillment must never fail because analytics did.
 */
export interface PosthogPurchaseInput {
  /** Buyer email — becomes distinct_id, so it must match the client identify. */
  email: string | null;
  /** Stripe checkout session id. Used as the idempotency/reference property. */
  transactionId: string;
  /** Revenue in major currency units (e.g. EUR), not cents. */
  value: number;
  /** ISO currency code, e.g. "EUR". */
  currency: string;
  /** Purchased plan id (essentials | full_report | all_reports). */
  plan: string;
  /** Product display name. */
  itemName: string;
  /** Optional extra properties (cluster, arm, device, …). */
  params?: Record<string, string | number | undefined>;
}

export async function sendPosthogPurchaseEvent(input: PosthogPurchaseInput): Promise<void> {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!token || !host) {
    logger.info(
      { transactionId: input.transactionId },
      "PostHog token/host unset — skipping server-side purchase event"
    );
    return;
  }
  // Without an email there is no stable distinct_id, and inventing one would
  // create an orphan person that never joins to the buyer's real profile.
  if (!input.email) {
    logger.info(
      { transactionId: input.transactionId },
      "No buyer email — skipping PostHog server-side purchase event"
    );
    return;
  }

  // Drop empty extras. Built via fromEntries (not dynamic-key assignment) to
  // avoid tripping the security/detect-object-injection lint rule.
  const extraParams = Object.fromEntries(
    Object.entries(input.params ?? {}).filter(
      ([, val]) => val !== undefined && val !== null && val !== ""
    )
  ) as Record<string, string | number>;

  const distinctId = input.email.trim().toLowerCase();

  const body = {
    api_key: token,
    event: "purchase",
    distinct_id: distinctId,
    properties: {
      // Extras first so the canonical fields below can never be clobbered.
      ...extraParams,
      transaction_id: input.transactionId,
      plan: input.plan,
      item_name: input.itemName,
      currency: input.currency,
      // `$revenue` is what PostHog's revenue views read; `value` mirrors the
      // GA4 sibling so the two are comparable side by side.
      $revenue: input.value,
      value: input.value,
      // Server-sent, so mark it — otherwise it is indistinguishable from a
      // browser event when debugging a count mismatch.
      $lib: "loveiq-server",
      source: "stripe_webhook",
      // Mirrors the browser super property registered in instrumentation-client.ts,
      // so a staging test purchase is filterable out of PostHog revenue instead of
      // silently inflating it. PostHog is labelled rather than gated — see that file.
      deploy_env: resolveServerDeployEnv(),
      // Enrich the person record rather than only the event.
      $set: { email: distinctId, last_plan_purchased: input.plan },
    },
  };

  try {
    const res = await fetchWithTimeout(`${host.replace(/\/+$/, "")}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 5000,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.error(
        { transactionId: input.transactionId, status: res.status, body: text },
        "PostHog server-side purchase send failed"
      );
    } else {
      logger.info({ transactionId: input.transactionId }, "PostHog server-side purchase sent");
    }
  } catch (err) {
    logger.error(
      { err, transactionId: input.transactionId },
      "PostHog server-side purchase send error"
    );
  }
}

/**
 * Same three values as the browser's `deploy_env`, resolved server-side. Production
 * is delegated to `isProductionSite()` so the definition cannot drift from the gate
 * that decides whether GA4 / Ads / Clarity load at all.
 */
function resolveServerDeployEnv(): "production" | "staging" | "development" {
  if (isProductionSite()) return "production";
  if (process.env.NODE_ENV !== "production") return "development";
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").toLowerCase();
  if (siteUrl.includes("staging.") || siteUrl.includes(".vercel.app")) return "staging";
  return "development";
}
