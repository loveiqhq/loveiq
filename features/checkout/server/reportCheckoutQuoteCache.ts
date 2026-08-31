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
    // An entry written before `chargedPriceCents` existed has no charged price at all,
    // so it is rejected rather than guessed at. That costs one fetch from `/api/price`.
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

    return parsed.quote;
  } catch {
    return null;
  }
}
