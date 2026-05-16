import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";

const SUPABASE_TIMEOUT_MS = 5_000;

/**
 * Pattern of user-facing nurture promo codes — emitted by
 * `app/api/cron/nurture-sequence/route.ts` at send time. Validated upstream by
 * the checkout-session route's Zod schema so we never make a Supabase round
 * trip for an obviously bogus string.
 */
export const NURTURE_PROMO_CODE_REGEX = /^LIQ-(50|75)-[A-Za-z0-9]{8}$/;

export interface NurturePromoMatch {
  stage: string;
  percentOff: number;
  stripePromotionCodeId: string;
}

interface StoredNurturePromo {
  code?: unknown;
  stripePromotionCodeId?: unknown;
  percentOff?: unknown;
  expiresAt?: unknown;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function getSupabaseHeaders() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return {
    url,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
  };
}

async function resolveSubmissionId({
  reportToken,
  submissionId,
}: {
  reportToken?: string | null;
  submissionId?: number | null;
}): Promise<number | null> {
  if (typeof submissionId === "number" && submissionId > 0) return submissionId;

  const cfg = getSupabaseHeaders();
  if (!cfg) return null;

  if (reportToken) {
    const r = await fetchWithTimeout(
      `${cfg.url}/rest/v1/report_access_token?token=eq.${encodeURIComponent(reportToken)}&revoked_at=is.null&select=survey_submission_id&limit=1`,
      { cache: "no-store", headers: cfg.headers, timeoutMs: SUPABASE_TIMEOUT_MS }
    );
    if (!r.ok) return null;
    const rows = (await r.json()) as Array<{ survey_submission_id: number }>;
    return rows[0]?.survey_submission_id ?? null;
  }

  // No reportSessionId / pricingSessionId path: those are client-side concepts
  // (sessionStorage / cookie tokens) — the only durable identifier available
  // server-side at checkout time is the `reportToken`. Users without a token
  // (rare — every personal_report has one) fall through to the no-promo flow.
  return null;
}

/**
 * Resolve a user-typed nurture promo code against the recipient's stored
 * per-user promotion records. Returns null on any miss (unknown code, wrong
 * owner, expired) — never throws. Callers fall through to the no-promo flow.
 *
 * Scoping by submission ensures a leaked code can only be redeemed by the
 * user it was issued to. Stripe-side `max_redemptions: 1` + 24h expiry are
 * the second line of defence; this app-layer check is the primary guard.
 */
export async function resolveNurturePromo({
  reportToken,
  submissionId,
  userCode,
}: {
  reportToken?: string | null;
  submissionId?: number | null;
  userCode: string;
}): Promise<NurturePromoMatch | null> {
  if (!NURTURE_PROMO_CODE_REGEX.test(userCode)) return null;

  const resolved = await resolveSubmissionId({ reportToken, submissionId });
  if (!resolved) return null;

  const cfg = getSupabaseHeaders();
  if (!cfg) return null;

  const r = await fetchWithTimeout(
    `${cfg.url}/rest/v1/report_price_quote?survey_submission_id=eq.${resolved}&select=metadata&limit=20`,
    { cache: "no-store", headers: cfg.headers, timeoutMs: SUPABASE_TIMEOUT_MS }
  );
  if (!r.ok) {
    logger.warn(
      { status: r.status, submissionId: resolved },
      "resolveNurturePromo: quote lookup failed"
    );
    return null;
  }

  const rows = (await r.json()) as Array<{ metadata: Record<string, unknown> | null }>;
  const now = Date.now();

  for (const row of rows) {
    const codes = (row.metadata?.nurturePromoCodes ?? null) as Record<
      string,
      StoredNurturePromo
    > | null;
    if (!codes || typeof codes !== "object") continue;

    for (const [stage, entry] of Object.entries(codes)) {
      const storedCode = asString(entry?.code);
      if (storedCode !== userCode) continue;

      const stripeId = asString(entry?.stripePromotionCodeId);
      const percentOff = asNumber(entry?.percentOff);
      const expiresAtRaw = asString(entry?.expiresAt);

      if (!stripeId || !percentOff || !expiresAtRaw) continue;

      const expiresAt = Date.parse(expiresAtRaw);
      if (!Number.isFinite(expiresAt) || expiresAt < now) continue;

      return { stage, percentOff, stripePromotionCodeId: stripeId };
    }
  }

  return null;
}

export function getCouponIdForStage(stage: string): string | null {
  if (stage === "30h_no_unlock") return process.env.STRIPE_COUPON_50 ?? null;
  if (stage === "54h_no_unlock") return process.env.STRIPE_COUPON_75 ?? null;
  return null;
}
