import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import type { ReportPurchasePlanId } from "./reportPurchase";

const REPORT_CHECKOUT_QUOTE_CACHE_PREFIX = "loveiq-report-checkout-quote";
const REPORT_CHECKOUT_QUOTE_CACHE_VERSION = 1;

interface ReportCheckoutQuoteCacheEntry {
  quote: ReportPriceQuoteSnapshot;
  version: number;
}

function canUseStorage() {
  return typeof window !== "undefined";
}

function buildReportCheckoutQuoteCacheKey({
  plan,
  sessionId,
  token,
}: {
  plan: ReportPurchasePlanId;
  sessionId?: string | null;
  token?: string | null;
}) {
  if (token) {
    return `${REPORT_CHECKOUT_QUOTE_CACHE_PREFIX}:token:${token}:${plan}`;
  }

  if (sessionId) {
    return `${REPORT_CHECKOUT_QUOTE_CACHE_PREFIX}:session:${sessionId}:${plan}`;
  }

  return null;
}

function isReportPriceQuoteSnapshot(
  value: unknown,
  plan: ReportPurchasePlanId
): value is ReportPriceQuoteSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const snapshot = value as Partial<ReportPriceQuoteSnapshot>;
  return (
    typeof snapshot.id === "number" &&
    snapshot.plan === plan &&
    snapshot.currency === "EUR" &&
    typeof snapshot.currentPriceCents === "number" &&
    // Written before the urgency surcharge existed: such an entry has no charged price,
    // so honouring it would show the old number while checkout charged the new one.
    // Rejecting it just means one fetch from `/api/price`.
    typeof snapshot.chargedPriceCents === "number" &&
    typeof snapshot.initialPriceCents === "number" &&
    typeof snapshot.expiresAt === "string"
  );
}

export function cacheReportCheckoutQuote({
  plan,
  quote,
  sessionId,
  token,
}: {
  plan: ReportPurchasePlanId;
  quote: ReportPriceQuoteSnapshot;
  sessionId?: string | null;
  token?: string | null;
}) {
  if (!canUseStorage()) {
    return;
  }

  const storageKey = buildReportCheckoutQuoteCacheKey({ plan, sessionId, token });
  if (!storageKey) {
    return;
  }

  try {
    const payload: ReportCheckoutQuoteCacheEntry = {
      quote,
      version: REPORT_CHECKOUT_QUOTE_CACHE_VERSION,
    };
    sessionStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    /* storage unavailable */
  }
}

export function getCachedReportCheckoutQuote({
  plan,
  sessionId,
  token,
}: {
  plan: ReportPurchasePlanId;
  sessionId?: string | null;
  token?: string | null;
}) {
  if (!canUseStorage()) {
    return null;
  }

  const storageKey = buildReportCheckoutQuoteCacheKey({ plan, sessionId, token });
  if (!storageKey) {
    return null;
  }

  try {
    const rawValue = sessionStorage.getItem(storageKey);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<ReportCheckoutQuoteCacheEntry>;
    if (parsed.version !== REPORT_CHECKOUT_QUOTE_CACHE_VERSION) {
      return null;
    }

    if (!isReportPriceQuoteSnapshot(parsed.quote, plan)) {
      return null;
    }

    const expiresAt = Date.parse(parsed.quote.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return null;
    }

    // The 21-day `expiresAt` above is the quote's own lifetime; the reader's THREE-MINUTE
    // urgency window is a different clock, and crossing it changes the price. A quote
    // cached while that window was open would show the old figure here while the
    // checkout POST — which re-derives server-side — charged the surcharged one. That is
    // the single mismatch this feature must never produce, so such an entry is stale.
    const urgencyDeadline = parsed.quote.urgencyDeadlineAt
      ? Date.parse(parsed.quote.urgencyDeadlineAt)
      : null;
    if (
      parsed.quote.surchargeCents === 0 &&
      urgencyDeadline != null &&
      Number.isFinite(urgencyDeadline) &&
      urgencyDeadline <= Date.now()
    ) {
      return null;
    }

    return parsed.quote;
  } catch {
    return null;
  }
}
