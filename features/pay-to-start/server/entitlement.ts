import { randomBytes } from "crypto";
import { getBreaker } from "@shared/http/circuit-breaker";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import {
  PREPAID_COOKIE_DEV,
  PREPAID_COOKIE_PROD,
  PREPAID_TOKEN_REGEX,
} from "@features/pay-to-start/logic/journey";
import type { PayToStartOfferId } from "@features/pay-to-start/logic/offer";

/**
 * The pay-to-start entitlement: one `prepaid_report_access` row per checkout, from the
 * moment the visitor clicks "Unlock survey & report" until a submitted survey claims it.
 *
 * Ported from June's pay-first test (`git show 3ec8c895^:features/checkout/server/
 * prepaidEntitlement.ts`). At payment time there is no submission, report or user yet,
 * and `payment.user_id` is NOT NULL, so the payment lives here first. The bearer token in
 * the httpOnly cookie is what ties the browser to it; it never goes into Stripe.
 *
 *   pending ─(paid: webhook, status poll or sweep)→ succeeded ─(survey claims)→ bound → applied
 *       └─(session expired)→ expired                 any state ─(full refund / dispute)→ refunded
 *
 * "Bound" is `consumed_submission_id` set; "applied" is `payment_id` set, once the claim has
 * written the payment row, report link and tier. A row may be bound while still pending
 * (the survey finished before the money settled); the payment applies when it does.
 *
 * Service-role only: the table's RLS denies everything, the service key bypasses it.
 */

const isProduction = process.env.NODE_ENV === "production";

export const PREPAID_COOKIE = isProduction ? PREPAID_COOKIE_PROD : PREPAID_COOKIE_DEV;

/**
 * 30 days. It only bridges "paid" to "survey submitted" in this browser; the link in the
 * confirmation email sets it again anywhere, and the claim clears it.
 */
export const PREPAID_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

// eslint-disable-next-line no-secrets/no-secrets -- base62 alphabet, not a secret
const BASE62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generatePrepaidToken(): string {
  let token = "rpp_";
  for (const b of randomBytes(32)) token += BASE62.charAt(b % BASE62.length);
  return token;
}

/**
 * httpOnly: this token unlocks a paid report, so page scripts must never read or forge it.
 * SameSite=Lax, so it rides along on the top-level return from Stripe Checkout.
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

/** Clears the cookie (after a claim): holding it means holding an unused entitlement. */
export function clearedPrepaidCookieOptions() {
  return { ...prepaidCookieOptions(), maxAge: 0 };
}

export type EntitlementStatus = "pending" | "succeeded" | "refunded" | "expired";

export interface Entitlement {
  id: number;
  prepaid_token: string;
  plan: string;
  status: EntitlementStatus;
  offer: PayToStartOfferId | null;
  landing_variant: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  payment_id: number | null;
  consumed_submission_id: number | null;
  consumed_at: string | null;
  amount_cents: number | null;
  list_price_cents: number | null;
  currency: string | null;
  customer_email: string | null;
  is_test: boolean;
  paid_at: string | null;
  utm_tracker: string | null;
  created_at: string;
}

const SELECT = [
  "id",
  "prepaid_token",
  "plan",
  "status",
  "offer",
  "landing_variant",
  "stripe_session_id",
  "stripe_payment_intent_id",
  "payment_id",
  "consumed_submission_id",
  "consumed_at",
  "amount_cents",
  "list_price_cents",
  "currency",
  "customer_email",
  "is_test",
  "paid_at",
  "utm_tracker",
  "created_at",
].join(",");

const SUPABASE_TIMEOUT_MS = 5_000;

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("supabase_not_configured");
  return { url, serviceRoleKey };
}

async function serviceFetch(
  path: string,
  options: { method?: string; body?: string; headers?: Record<string, string> } = {}
): Promise<Response> {
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

async function readRows(response: Response, failure: string): Promise<Entitlement[]> {
  if (!response.ok) throw new Error(failure);
  const rows = (await response.json().catch(() => [])) as unknown;
  return Array.isArray(rows) ? (rows as Entitlement[]) : [];
}

/**
 * The first row a query returns. Callers spell out the whole path, `select` and `limit=1`
 * included, so `npm run check:postgrest-columns` sees every column they filter on.
 */
async function findOne(path: string): Promise<Entitlement | null> {
  const response = await serviceFetch(path);
  const rows = await readRows(response, "prepaid_entitlement_lookup_failed");
  return rows[0] ?? null;
}

/** A new pending row for a checkout that is about to be created. Returns it, or null. */
export async function createPendingEntitlement({
  currency,
  landingVariant,
  listPriceCents,
  offer,
  plan,
  token,
  utmTracker,
}: {
  currency: string;
  landingVariant: string;
  listPriceCents: number;
  offer: PayToStartOfferId;
  plan: string;
  token: string;
  utmTracker: string | null;
}): Promise<Entitlement | null> {
  const response = await serviceFetch("/rest/v1/prepaid_report_access", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      prepaid_token: token,
      plan,
      status: "pending",
      offer,
      landing_variant: landingVariant,
      list_price_cents: listPriceCents,
      currency: currency.toUpperCase(),
      utm_tracker: utmTracker,
    }),
  });
  if (!response.ok) {
    logger.error({ status: response.status }, "pay-to-start: pending entitlement insert failed");
    return null;
  }
  const rows = (await response.json().catch(() => [])) as Entitlement[];
  return rows[0] ?? null;
}

/**
 * Point a still-pending row at its (new) Stripe session. Also used when an expired session
 * is replaced under the same token, so a cookie never ends up pointing at an unpaid token
 * while the visitor paid a different session.
 */
export async function setEntitlementSession({
  id,
  stripeSessionId,
}: {
  id: number;
  stripeSessionId: string;
}): Promise<boolean> {
  const response = await serviceFetch(
    `/rest/v1/prepaid_report_access?id=eq.${id}&status=in.(pending,expired)`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        stripe_session_id: stripeSessionId,
        status: "pending",
        updated_at: new Date().toISOString(),
      }),
    }
  );
  if (!response.ok) {
    logger.warn({ id, status: response.status }, "pay-to-start: session stamp failed");
    return false;
  }
  return true;
}

export async function findEntitlementByToken(token: string): Promise<Entitlement | null> {
  if (!PREPAID_TOKEN_REGEX.test(token)) return null;
  return findOne(
    `/rest/v1/prepaid_report_access?prepaid_token=eq.${encodeURIComponent(token)}&offer=not.is.null&select=${SELECT}&limit=1`
  );
}

export async function findEntitlementById(id: number): Promise<Entitlement | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return findOne(
    `/rest/v1/prepaid_report_access?id=eq.${id}&offer=not.is.null&select=${SELECT}&limit=1`
  );
}

/** Like every lookup here, journey rows only: June's rows (offer null) never match. */
export async function findEntitlementBySessionId(
  stripeSessionId: string
): Promise<Entitlement | null> {
  return findOne(
    `/rest/v1/prepaid_report_access?stripe_session_id=eq.${encodeURIComponent(stripeSessionId)}&offer=not.is.null&select=${SELECT}&limit=1`
  );
}

export async function findEntitlementByPaymentIntent(
  paymentIntentId: string
): Promise<Entitlement | null> {
  return findOne(
    `/rest/v1/prepaid_report_access?stripe_payment_intent_id=eq.${encodeURIComponent(paymentIntentId)}&offer=not.is.null&select=${SELECT}&limit=1`
  );
}

export async function findEntitlementByConsumedSubmission(
  submissionId: number
): Promise<Entitlement | null> {
  if (!Number.isSafeInteger(submissionId) || submissionId <= 0) return null;
  return findOne(
    `/rest/v1/prepaid_report_access?consumed_submission_id=eq.${submissionId}&offer=not.is.null&select=${SELECT}&limit=1`
  );
}

/**
 * Whether a submission was paid for up front. For gates that must stand aside for these
 * readers, such as a future paywall shown after the wizard; a paid reader is also caught by
 * their payment row, this covers the moments before it is written.
 */
export async function hasBoundEntitlement(submissionId: number): Promise<boolean> {
  try {
    return (await findEntitlementByConsumedSubmission(submissionId)) !== null;
  } catch (err) {
    logger.warn({ err, submissionId }, "pay-to-start: bound-entitlement lookup failed");
    return false;
  }
}

/**
 * Flip pending → succeeded and stamp what Stripe settled. Returns the flipped row when
 * THIS call did the flip, null when the row was not pending (another path got there first,
 * or it is refunded or expired). That return is what makes the one-time side effects (the
 * email, the Slack line, the server-side purchase events) run exactly once, whichever of
 * the webhook, the status poll and the sweep arrives first.
 */
export async function markEntitlementSucceeded({
  amountCents,
  currency,
  customerEmail,
  id,
  isTest,
  paidAt,
  paymentIntentId,
}: {
  amountCents: number | null;
  currency: string | null;
  customerEmail: string | null;
  id: number;
  isTest: boolean;
  paidAt: string;
  paymentIntentId: string | null;
}): Promise<Entitlement | null> {
  const response = await serviceFetch(
    `/rest/v1/prepaid_report_access?id=eq.${id}&status=eq.pending&select=${SELECT}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        status: "succeeded",
        amount_cents: amountCents,
        ...(currency ? { currency: currency.toUpperCase() } : {}),
        customer_email: customerEmail,
        is_test: isTest,
        paid_at: paidAt,
        stripe_payment_intent_id: paymentIntentId,
        updated_at: new Date().toISOString(),
      }),
    }
  );
  const rows = await readRows(response, "prepaid_entitlement_succeed_failed");
  return rows[0] ?? null;
}

/** Pending → expired, only while the row still points at this session. */
export async function markEntitlementExpired({
  id,
  stripeSessionId,
}: {
  id: number;
  stripeSessionId: string;
}): Promise<void> {
  const response = await serviceFetch(
    `/rest/v1/prepaid_report_access?id=eq.${id}&status=eq.pending&stripe_session_id=eq.${encodeURIComponent(stripeSessionId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "expired", updated_at: new Date().toISOString() }),
    }
  );
  if (!response.ok) {
    logger.warn({ id, status: response.status }, "pay-to-start: expire failed");
  }
}

/**
 * Bind the row to ONE submission. The filter is the concurrency barrier: of any number of
 * simultaneous callers exactly one PATCH matches, so one payment unlocks one report.
 * `payment_id is null` keeps a row whose submission was deleted (consumed_submission_id
 * nulled by its foreign key) from being claimed a second time. Returns whether THIS call
 * bound it; a loser re-reads to tell "already ours" from "someone else's".
 *
 * `return=representation` is required to count the rows: a PATCH matching nothing is a
 * 200 with an empty array, not an error.
 */
export async function bindEntitlement({
  id,
  submissionId,
}: {
  id: number;
  submissionId: number;
}): Promise<boolean> {
  const now = new Date().toISOString();
  const response = await serviceFetch(
    `/rest/v1/prepaid_report_access?id=eq.${id}&consumed_submission_id=is.null&payment_id=is.null&status=in.(pending,succeeded)`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        consumed_submission_id: submissionId,
        consumed_at: now,
        updated_at: now,
      }),
    }
  );
  const rows = await readRows(response, "prepaid_entitlement_bind_failed");
  return rows.length === 1;
}

/** Stamp the payment row the claim wrote. Applying twice is then refused by the bind filter. */
export async function setEntitlementPaymentId({
  id,
  paymentId,
}: {
  id: number;
  paymentId: number;
}): Promise<void> {
  const response = await serviceFetch(`/rest/v1/prepaid_report_access?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ payment_id: paymentId, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) {
    logger.warn({ id, paymentId }, "pay-to-start: failed to stamp payment_id on the entitlement");
  }
}

/**
 * A full refund or an opened dispute: the money is gone, so the token must stop unlocking.
 * Returns the rows it voided (for the ops line). Never throws: the refund handler's own
 * work has already happened.
 */
export async function voidEntitlementByPaymentIntent(
  paymentIntentId: string | null
): Promise<Entitlement[]> {
  if (!paymentIntentId) return [];
  try {
    const response = await serviceFetch(
      `/rest/v1/prepaid_report_access?stripe_payment_intent_id=eq.${encodeURIComponent(paymentIntentId)}&offer=not.is.null&status=eq.succeeded&select=${SELECT}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ status: "refunded", updated_at: new Date().toISOString() }),
      }
    );
    return await readRows(response, "prepaid_entitlement_void_failed");
  } catch (err) {
    logger.warn({ err }, "pay-to-start: void failed (non-fatal)");
    return [];
  }
}

/**
 * A dispute won before the survey was claimed: the money came back, so the entitlement
 * works again. A claimed one is restored through its payment row instead.
 */
export async function restoreUnclaimedEntitlement(
  paymentIntentId: string | null
): Promise<Entitlement[]> {
  if (!paymentIntentId) return [];
  try {
    const response = await serviceFetch(
      `/rest/v1/prepaid_report_access?stripe_payment_intent_id=eq.${encodeURIComponent(paymentIntentId)}&offer=not.is.null&status=eq.refunded&consumed_submission_id=is.null&select=${SELECT}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ status: "succeeded", updated_at: new Date().toISOString() }),
      }
    );
    return await readRows(response, "prepaid_entitlement_restore_failed");
  } catch (err) {
    logger.warn({ err }, "pay-to-start: restore failed (non-fatal)");
    return [];
  }
}

/**
 * Journey rows still pending a while after their checkout, for the sweep to settle with
 * Stripe: a webhook that never came, from a buyer who also closed the tab.
 */
export async function listPendingForReconcile({
  limit = 50,
  newerThan,
  olderThan,
}: {
  limit?: number;
  newerThan: Date;
  olderThan: Date;
}): Promise<Entitlement[]> {
  const response = await serviceFetch(
    `/rest/v1/prepaid_report_access?status=eq.pending&offer=not.is.null&stripe_session_id=not.is.null` +
      `&created_at=lt.${encodeURIComponent(olderThan.toISOString())}` +
      `&created_at=gt.${encodeURIComponent(newerThan.toISOString())}` +
      `&select=${SELECT}&order=created_at.asc&limit=${limit}`
  );
  return readRows(response, "prepaid_entitlement_list_failed");
}

/** Paid and claimed, but the payment row never got written (a failure mid-claim). */
export async function listBoundUnapplied(limit = 50): Promise<Entitlement[]> {
  const response = await serviceFetch(
    `/rest/v1/prepaid_report_access?status=eq.succeeded&offer=not.is.null&consumed_submission_id=not.is.null&payment_id=is.null` +
      `&select=${SELECT}&order=paid_at.asc&limit=${limit}`
  );
  return readRows(response, "prepaid_entitlement_list_failed");
}

/**
 * Another paid entitlement for the same address in the last 48 hours: a buyer who paid
 * twice (two tabs, a lost cookie). Reported, not blocked: either entitlement still works
 * through its own link, and the second is refunded on request.
 */
export async function findRecentPaidDuplicate({
  customerEmail,
  excludeId,
  since,
}: {
  customerEmail: string;
  excludeId: number;
  since: Date;
}): Promise<Entitlement | null> {
  return findOne(
    `/rest/v1/prepaid_report_access?customer_email=eq.${encodeURIComponent(customerEmail)}&id=neq.${excludeId}&status=eq.succeeded&offer=not.is.null` +
      `&paid_at=gt.${encodeURIComponent(since.toISOString())}&select=${SELECT}&limit=1`
  );
}
