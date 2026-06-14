import { randomBytes } from "crypto";
import { getBreaker } from "@shared/http/circuit-breaker";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import type { ReportPurchasePlanId } from "@features/checkout/server/reportPurchase";

/**
 * Prepaid report entitlement — the "pay-first" bridge for the white landing
 * cohort.
 *
 * The white A/B cohort pays for the full report BEFORE taking the survey, so at
 * payment time there is no survey_submission / personal_report / app_user yet
 * (and `payment.user_id` is NOT NULL, so no payment row can be written then).
 * This module owns the `prepaid_report_access` row that records the upfront
 * payment, keyed on a server-minted opaque bearer token stored in an httpOnly
 * cookie. The Stripe webhook flips it to `succeeded`; the white survey-submit
 * route then "consumes" it — creating the real payment row + unlocking the
 * report — bound to exactly one submission so a single payment can never unlock
 * two reports. See `applyPrepaidEntitlementToReport` in
 * `features/checkout/server/fulfillment.ts`.
 *
 * Service-role only: the table has RLS denying all, the service key bypasses it.
 */

const isProduction = process.env.NODE_ENV === "production";

/**
 * httpOnly bearer cookie. `__Host-` prefix in production (requires Secure +
 * Path=/ + no Domain — all satisfied below); plain name over http://localhost
 * in dev. Mirrors the CSRF / visitor-id / landing-variant cookie naming.
 * httpOnly because this token authorizes a paid entitlement — JS must never be
 * able to read or forge it (unlike the CSRF cookie which is intentionally
 * JS-readable).
 */
export const PREPAID_COOKIE = isProduction ? "__Host-liq_pp" : "__liq_pp";

/** 7 days — long enough to bridge "pay today, finish the survey tomorrow". */
export const PREPAID_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/** `rpp_` + 32 base62 chars ≈ 190 bits of entropy. Unguessable, DB-backed. */
export const PREPAID_TOKEN_REGEX = /^rpp_[a-zA-Z0-9]{32}$/;

// eslint-disable-next-line no-secrets/no-secrets -- base62 alphabet, not a secret
const BASE62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generatePrepaidToken(): string {
  const bytes = randomBytes(32);
  let token = "rpp_";
  for (const b of bytes) token += BASE62[b % BASE62.length];
  return token;
}

export type PrepaidEntitlementStatus = "pending" | "succeeded" | "refunded";

export interface PrepaidEntitlement {
  id: number;
  prepaid_token: string;
  plan: string;
  status: PrepaidEntitlementStatus;
  landing_variant: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  payment_id: number | null;
  consumed_submission_id: number | null;
  amount_cents: number | null;
  currency: string | null;
}

const PREPAID_SELECT =
  "id,prepaid_token,plan,status,landing_variant,stripe_session_id,stripe_payment_intent_id,payment_id,consumed_submission_id,amount_cents,currency";

const SUPABASE_TIMEOUT_MS = 5_000;

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("supabase_not_configured");
  }
  return { url, serviceRoleKey };
}

async function supabaseServiceFetch(
  path: string,
  options: { method?: string; body?: string; headers?: Record<string, string> } = {}
) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const { method = "GET", body, headers = {} } = options;
  return getBreaker("supabase").fire(() =>
    fetchWithTimeout(`${url}${path}`, {
      method,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body,
      timeoutMs: SUPABASE_TIMEOUT_MS,
    })
  );
}

/**
 * Cookie attributes for the prepaid bearer token. SameSite=Lax (not Strict) so
 * the cookie survives the top-level GET navigation back from Stripe Checkout.
 */
export function prepaidCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: PREPAID_COOKIE_MAX_AGE_SECONDS,
  };
}

/** Insert a fresh `pending` entitlement when a white user starts prepaid checkout. */
export async function createPendingPrepaidEntitlement({
  landingVariant,
  plan,
  stripeSessionId,
  token,
}: {
  landingVariant: string | null;
  plan: ReportPurchasePlanId;
  stripeSessionId: string;
  token: string;
}): Promise<boolean> {
  const response = await supabaseServiceFetch("/rest/v1/prepaid_report_access", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      prepaid_token: token,
      plan,
      status: "pending",
      landing_variant: landingVariant,
      stripe_session_id: stripeSessionId,
    }),
  });
  if (!response.ok) {
    logger.error(
      { status: response.status, stripeSessionId },
      "prepaid: failed to insert pending entitlement"
    );
    return false;
  }
  return true;
}

/**
 * Re-point an existing PENDING entitlement at a fresh Stripe session, keeping
 * the SAME token (and therefore the same cookie). Used when a prior prepaid
 * session expired: minting a new token instead would orphan the cookie if the
 * user later paid the old session, so we reuse the token and only swap the
 * session id. No-op (matches 0 rows) once the entitlement is succeeded.
 */
export async function updatePrepaidEntitlementSessionId({
  stripeSessionId,
  token,
}: {
  stripeSessionId: string;
  token: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const response = await supabaseServiceFetch(
    `/rest/v1/prepaid_report_access?prepaid_token=eq.${encodeURIComponent(token)}&status=eq.pending`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ stripe_session_id: stripeSessionId, updated_at: now }),
    }
  );
  if (!response.ok) {
    logger.warn({ status: response.status }, "prepaid: failed to re-point entitlement session");
  }
}

export async function findPrepaidEntitlementByToken(
  token: string
): Promise<PrepaidEntitlement | null> {
  if (!PREPAID_TOKEN_REGEX.test(token)) return null;
  const response = await supabaseServiceFetch(
    `/rest/v1/prepaid_report_access?prepaid_token=eq.${encodeURIComponent(token)}&select=${PREPAID_SELECT}&limit=1`
  );
  if (!response.ok) {
    throw new Error("prepaid_entitlement_lookup_failed");
  }
  const rows = (await response.json()) as PrepaidEntitlement[];
  return rows[0] ?? null;
}

export async function findPrepaidEntitlementBySessionId(
  stripeSessionId: string
): Promise<PrepaidEntitlement | null> {
  const response = await supabaseServiceFetch(
    `/rest/v1/prepaid_report_access?stripe_session_id=eq.${encodeURIComponent(stripeSessionId)}&select=${PREPAID_SELECT}&limit=1`
  );
  if (!response.ok) {
    throw new Error("prepaid_entitlement_lookup_failed");
  }
  const rows = (await response.json()) as PrepaidEntitlement[];
  return rows[0] ?? null;
}

/**
 * The pre-submit hard gate for the white cohort: does a SUCCEEDED entitlement
 * exist for this token? Returns false on any lookup error (fail-closed — a
 * white user is refused the survey if we can't prove they paid). Never throws.
 */
export async function hasSucceededPrepaidEntitlement(
  token: string | null | undefined
): Promise<boolean> {
  if (!token || !PREPAID_TOKEN_REGEX.test(token)) return false;
  try {
    const entitlement = await findPrepaidEntitlementByToken(token);
    return entitlement?.status === "succeeded";
  } catch (err) {
    logger.warn({ err }, "prepaid: gate lookup failed; treating as unpaid");
    return false;
  }
}

/**
 * Flip a `pending` entitlement to `succeeded` and stamp the settled Stripe
 * facts. Idempotent: the `status=eq.pending` filter means a redelivered webhook
 * (already succeeded) updates nothing. Never resurrects a `refunded` row.
 */
export async function markPrepaidEntitlementSucceeded({
  amountCents,
  currency,
  stripePaymentIntentId,
  stripeSessionId,
}: {
  amountCents: number | null;
  currency: string | null;
  stripePaymentIntentId: string | null;
  stripeSessionId: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const response = await supabaseServiceFetch(
    `/rest/v1/prepaid_report_access?stripe_session_id=eq.${encodeURIComponent(stripeSessionId)}&status=eq.pending`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "succeeded",
        stripe_payment_intent_id: stripePaymentIntentId,
        amount_cents: amountCents,
        currency: currency ? currency.toUpperCase() : undefined,
        updated_at: now,
      }),
    }
  );
  if (!response.ok) {
    throw new Error("prepaid_entitlement_succeed_failed");
  }
}

/**
 * Atomically CLAIM a succeeded entitlement for ONE submission. The
 * `consumed_submission_id=is.null` filter is the concurrency barrier: of any
 * number of concurrent callers, exactly one PATCH matches the still-null row, so
 * only one wins. Returns true iff THIS call won (exactly one row updated). A
 * loser (false) must re-read to distinguish "already mine" (idempotent) from
 * "claimed by another submission" (refuse). `return=representation` is required
 * to count updated rows — a 0-row PATCH is HTTP 200 with an empty array, not an
 * error, so checking `response.ok` alone would hide a lost claim.
 */
export async function claimPrepaidEntitlement({
  entitlementId,
  submissionId,
}: {
  entitlementId: number;
  submissionId: number;
}): Promise<boolean> {
  const now = new Date().toISOString();
  const response = await supabaseServiceFetch(
    `/rest/v1/prepaid_report_access?id=eq.${entitlementId}&consumed_submission_id=is.null`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ consumed_submission_id: submissionId, updated_at: now }),
    }
  );
  if (!response.ok) {
    throw new Error("prepaid_entitlement_claim_failed");
  }
  const rows = (await response.json().catch(() => [])) as unknown[];
  return Array.isArray(rows) && rows.length === 1;
}

/** Stamp the created payment row id onto an already-claimed entitlement. */
export async function setPrepaidEntitlementPaymentId({
  entitlementId,
  paymentId,
}: {
  entitlementId: number;
  paymentId: number;
}): Promise<void> {
  const response = await supabaseServiceFetch(
    `/rest/v1/prepaid_report_access?id=eq.${entitlementId}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ payment_id: paymentId, updated_at: new Date().toISOString() }),
    }
  );
  if (!response.ok) {
    logger.warn({ entitlementId, paymentId }, "prepaid: failed to stamp payment_id on entitlement");
  }
}

/**
 * Invalidate a succeeded entitlement when its payment is reversed (full refund
 * or dispute opened). Without this, a refunded white user whose entitlement was
 * never consumed could still pass the survey gate and re-unlock a report for
 * free. Best-effort + idempotent (only flips succeeded→refunded). Never throws —
 * the refund/dispute handler's primary work has already succeeded.
 */
export async function markPrepaidEntitlementRefunded(
  stripePaymentIntentId: string | null
): Promise<void> {
  if (!stripePaymentIntentId) return;
  try {
    const response = await supabaseServiceFetch(
      `/rest/v1/prepaid_report_access?stripe_payment_intent_id=eq.${encodeURIComponent(stripePaymentIntentId)}&status=eq.succeeded`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "refunded", updated_at: new Date().toISOString() }),
      }
    );
    if (!response.ok) {
      logger.warn({ status: response.status }, "prepaid: failed to mark entitlement refunded");
    }
  } catch (err) {
    logger.warn({ err }, "prepaid: mark-refunded threw (non-fatal)");
  }
}
