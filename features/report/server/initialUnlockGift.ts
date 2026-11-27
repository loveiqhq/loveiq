import { INITIAL_UNLOCK_PLAN } from "@features/report/logic/initialUnlock";
import {
  INITIAL_UNLOCK_GIFT,
  INITIAL_UNLOCK_TITLE,
} from "@features/report/logic/initialUnlockGate";
import { isStaffEmail } from "@shared/env/staff-email";
import { getBreaker } from "@shared/http/circuit-breaker";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import { supabaseRestUrl } from "@shared/env/supabase-urls";

/**
 * E07's gift (Pre-unlock; app/api/cron/initial-unlock-gift): the initial unlock given, not
 * sold. It is a EUR 0 `initial` payment, which opens what the EUR 1.99 does (access reads
 * `metadata.plan`) and carries the same EUR 10 credit (`getReportCredits` reads `gifted`).
 * Money readers skip it as they skip every EUR 0 row: a gift is never revenue.
 */

const SUPABASE_TIMEOUT_MS = 5_000;

function getSupabaseConfig() {
  const url = supabaseRestUrl();
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

/**
 * The report's gift, written once: a second call finds the first row and returns its id.
 * Null when it could not be read or written; the cron then gives the report back for the
 * next run. `email` decides `is_test`, as the address that paid does for a sale.
 */
export async function grantGiftedInitialUnlock({
  personalReportId,
  userId,
  email,
}: {
  personalReportId: number;
  userId: number;
  email: string | null;
}): Promise<number | null> {
  try {
    const existing = await serviceFetch(
      `/rest/v1/payment?personal_report_id=eq.${personalReportId}&metadata->>gifted=eq.${INITIAL_UNLOCK_GIFT}&select=id&limit=1`
    );
    if (!existing.ok) throw new Error(`gift_lookup_failed:${existing.status}`);
    const found = (await existing.json()) as Array<{ id: number }>;
    if (found[0]) return found[0].id;

    const now = new Date().toISOString();
    const created = await serviceFetch("/rest/v1/payment", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        amount: 0,
        currency: "EUR",
        description: `LoveIQ ${INITIAL_UNLOCK_TITLE} (gift)`,
        is_test: isStaffEmail(email),
        metadata: {
          plan: INITIAL_UNLOCK_PLAN,
          gifted: INITIAL_UNLOCK_GIFT,
          unlockSource: "e07_gift",
        },
        payment_date_time: now,
        personal_report_id: personalReportId,
        status: "succeeded",
        user_id: userId,
        created_date_time: now,
        updated_date_time: now,
      }),
    });
    if (!created.ok) throw new Error(`gift_write_failed:${created.status}`);
    const rows = (await created.json()) as Array<{ id: number }>;
    return rows[0]?.id ?? null;
  } catch (err) {
    logger.warn({ err, personalReportId }, "initial-unlock gift: grant failed");
    return null;
  }
}

/**
 * EUR 0 chosen on the price test's "Choose your price" page (shared/experiments/gatePriceArm.ts,
 * logic/choosePrice.ts): the initial unlock at the reader's own price, written as the gift is,
 * a succeeded EUR 0 `initial` row, so it opens what the EUR 1.99 does and carries its EUR 10
 * credit ("Every price includes €10 off": `getReportCredits` reads `priceOption`). Money readers
 * skip it as every EUR 0 row; AP's price test counts it as a free claim. No Stripe, no receipt.
 *
 * POST /api/stripe/initial-unlock writes it only for an owner the gate stops, in the half that
 * chooses, so it never opens a report for anyone else. Written once: a second call finds the
 * report's initial unlock and returns its id, and one at the same moment is refused by
 * payment_chosen_free_once (20261127210000) and returns the first one's. Null when it could not
 * be read or written.
 */
export async function grantChosenFreeInitialUnlock({
  personalReportId,
  userId,
  email,
  landingVariant,
}: {
  personalReportId: number;
  userId: number | null;
  email: string | null;
  landingVariant: string | null;
}): Promise<number | null> {
  const initialUnlockId = async (): Promise<number | null> => {
    const existing = await serviceFetch(
      `/rest/v1/payment?personal_report_id=eq.${personalReportId}&metadata->>plan=eq.${INITIAL_UNLOCK_PLAN}&status=eq.succeeded&select=id&limit=1`
    );
    if (!existing.ok) throw new Error(`free_lookup_failed:${existing.status}`);
    const found = (await existing.json()) as Array<{ id: number }>;
    return found[0]?.id ?? null;
  };
  try {
    const found = await initialUnlockId();
    if (found !== null) return found;

    const now = new Date().toISOString();
    const created = await serviceFetch("/rest/v1/payment", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        amount: 0,
        currency: "EUR",
        description: `LoveIQ ${INITIAL_UNLOCK_TITLE} (chosen price, EUR 0)`,
        is_test: isStaffEmail(email),
        metadata: {
          plan: INITIAL_UNLOCK_PLAN,
          priceOption: "free",
          currentPrice: "0.00",
          // Its half, as a sale's row carries it (fulfillment): only that half can choose.
          gateRevealArm: "choose",
          landingVariant,
          // Where it was taken: the gate, as the EUR 1.99's own `unlockSource`.
          unlockSource: "report_gate",
        },
        payment_date_time: now,
        personal_report_id: personalReportId,
        status: "succeeded",
        user_id: userId,
        created_date_time: now,
        updated_date_time: now,
      }),
    });
    // Two requests at the same moment both found none: payment_chosen_free_once keeps the second
    // row out (PostgREST answers 409), and the first one's row is the claim.
    if (created.status === 409) return await initialUnlockId();
    if (!created.ok) throw new Error(`free_write_failed:${created.status}`);
    const rows = (await created.json()) as Array<{ id: number }>;
    return rows[0]?.id ?? null;
  } catch (err) {
    logger.warn({ err, personalReportId }, "initial-unlock: the EUR 0 choice could not be written");
    return null;
  }
}
