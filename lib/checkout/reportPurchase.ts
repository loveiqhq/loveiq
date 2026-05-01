export const REPORT_ACCESS_TOKEN_REGEX = /^rpt_[a-zA-Z0-9]{20}$/;

export const REPORT_PURCHASE_PLAN_IDS = ["essentials", "full_report", "all_reports"] as const;

export type ReportPurchasePlanId = (typeof REPORT_PURCHASE_PLAN_IDS)[number];

export interface ReportPurchaseFeature {
  icon?: "check" | "none";
  label: string;
  tone?: "default" | "emphasis" | "muted";
}

export interface ReportPurchasePlan {
  badge?: string;
  ctaLabel: string;
  description: string;
  featuredLabel?: string;
  features: ReportPurchaseFeature[];
  plan: ReportPurchasePlanId;
  /**
   * Bucket-B MSRP — only used as a display fallback when a live quote isn't
   * available (e.g. the marketing site before the paywall). The real
   * per-user strike + current price come from `ReportPriceQuoteSnapshot`.
   */
  priceCents: number;
  priceSuffix: string;
  title: string;
  tone?: "highlight";
}

export const DEFAULT_REPORT_PURCHASE_PLAN_ID: ReportPurchasePlanId = "full_report";

export const REPORT_PURCHASE_PLANS: ReportPurchasePlan[] = [
  {
    ctaLabel: "Unlock essentials",
    description: "Built for those with limited time",
    features: [
      { label: "Includes the following chapters:" },
      { icon: "none", label: "- Summary of the archetype", tone: "muted" },
      { icon: "none", label: "- Attachment Style", tone: "muted" },
      { icon: "none", label: "- Core Insecurities", tone: "muted" },
      { icon: "none", label: "- Confidence Level", tone: "muted" },
      { icon: "none", label: "- Typical Beliefs", tone: "muted" },
      { label: "Unlocked report summary" },
      { label: "Share report with 1 extra email" },
    ],
    plan: "essentials",
    priceCents: 1999,
    priceSuffix: "one-time",
    title: "Essentials only",
  },
  {
    ctaLabel: "Unlock full report",
    description: "Perfect for individuals who want to dive deep",
    featuredLabel: "Most popular",
    features: [
      { label: "14-day money-back guarantee", tone: "emphasis" },
      { label: "Get full access to the report" },
      { label: "30+ analysed chapters" },
      { label: "Personalized growth paths" },
      { label: "Everything from Essentials and more" },
      { label: "Share report with 2 extra emails" },
    ],
    plan: "full_report",
    priceCents: 2999,
    priceSuffix: "one-time",
    title: "Full report",
    tone: "highlight",
  },
  {
    ctaLabel: "Unlock all reports",
    description: "Built for those wanting to explore all archetypes",
    features: [
      { label: "All 14 archetypes unlocked", tone: "emphasis" },
      { label: "All benefits as full report" },
      { label: "A complete map of human desire patterns" },
      { label: "Decode attraction & compatibility" },
    ],
    plan: "all_reports",
    priceCents: 25900,
    priceSuffix: "one-time",
    title: "All 14 reports",
  },
];

export function isReportPurchasePlanId(
  value: string | null | undefined
): value is ReportPurchasePlanId {
  return (
    typeof value === "string" && REPORT_PURCHASE_PLAN_IDS.includes(value as ReportPurchasePlanId)
  );
}

export function getReportPurchasePlan(plan: ReportPurchasePlanId): ReportPurchasePlan {
  return (
    REPORT_PURCHASE_PLANS.find((entry) => entry.plan === plan) ??
    REPORT_PURCHASE_PLANS.find((entry) => entry.plan === DEFAULT_REPORT_PURCHASE_PLAN_ID)!
  );
}

export function isReportAccessToken(value: string | null | undefined): value is string {
  return typeof value === "string" && REPORT_ACCESS_TOKEN_REGEX.test(value);
}

export function getReportReturnHref(token?: string | null) {
  return token ? `/report/${encodeURIComponent(token)}` : "/report";
}

export function buildReportCheckoutHref({
  archetype,
  plan,
  token,
}: {
  archetype?: string | null;
  plan: ReportPurchasePlanId;
  token?: string | null;
}) {
  const params = new URLSearchParams({ plan });

  if (token) {
    params.set("token", token);
  }

  if (archetype) {
    params.set("archetype", archetype);
  }

  return `/checkout?${params.toString()}`;
}

export function formatReportPurchasePrice(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("en-IE", {
    currency,
    style: "currency",
  }).format(cents / 100);
}

/**
 * Format the MSRP strike for display. Accepts the cents value directly so
 * callers can pull it from a live quote (`snapshot.msrpCents`) or from a
 * static catalogue fallback when no quote is present.
 */
export function getReportPurchaseStrikePrice(strikeCents: number | null | undefined) {
  return typeof strikeCents === "number" && strikeCents > 0
    ? formatReportPurchasePrice(strikeCents)
    : null;
}

/**
 * Derive the green "N% OFF" badge from the live strike/current pair. Returns
 * null when the discount is zero or negative so the UI can skip the pill.
 */
export function getReportPurchaseBadgeFromPrice({
  strikeCents,
  currentCents,
}: {
  strikeCents: number | null | undefined;
  currentCents: number;
}) {
  if (!strikeCents || strikeCents <= 0 || currentCents >= strikeCents) {
    return null;
  }
  const percentOff = Math.round(((strikeCents - currentCents) / strikeCents) * 100);
  return percentOff > 0 ? `${percentOff}% OFF` : null;
}
