import { toArchetypeSlug } from "@features/report/server/archetypeSlug";

export const REPORT_ACCESS_TOKEN_REGEX = /^rpt_[a-zA-Z0-9]{20}$/;

// `essentials` is RETIRED (2026-07 pricing 2.0) — kept in the id union so
// historical payments still validate + grandfather their access, but it's no
// longer offered in REPORT_PURCHASE_PLANS below. The three live tiers are:
//   full_report = "Just a snapshot" (own archetype), core = "All your core
//   archetypes" (top 3), all_reports = "For you & your partner" (all + partner code).
export const REPORT_PURCHASE_PLAN_IDS = [
  "essentials",
  "full_report",
  "core",
  "all_reports",
] as const;

export type ReportPurchasePlanId = (typeof REPORT_PURCHASE_PLAN_IDS)[number];

export interface ReportPurchaseFeature {
  icon?: "check" | "lock" | "none";
  label: string;
  tone?: "default" | "emphasis" | "muted";
}

export interface ReportPurchasePlan {
  badge?: string;
  ctaLabel: string;
  description: string;
  featuredLabel?: string;
  features: ReportPurchaseFeature[];
  /** Small note box under a tier (e.g. the tier-3 "no partner yet" invite). */
  footnote?: string;
  plan: ReportPurchasePlanId;
  /**
   * Flat selling price (cents) — display fallback when a live quote isn't
   * available. The live per-visitor quote (report_price_quote) is the source of
   * truth; the strike-through MSRP comes from `ReportPriceQuoteSnapshot.msrpCents`.
   */
  priceCents: number;
  priceSuffix: string;
  /** One-line note under the price (e.g. "The proven starting point"). */
  subtitle?: string;
  title: string;
  tone?: "highlight";
}

export const DEFAULT_REPORT_PURCHASE_PLAN_ID: ReportPurchasePlanId = "full_report";

// Uniform 6-feature list; each tier flips locks → checks as you go up (Figma 8442-16168).
export const REPORT_PURCHASE_PLANS: ReportPurchasePlan[] = [
  {
    ctaLabel: "Unlock my report",
    description: "Your full archetype, and the patterns beneath it.",
    subtitle: "The proven starting point",
    features: [
      { icon: "check", label: "Your complete archetype report" },
      { icon: "check", label: "30+ chapters and personalised growth" },
      { icon: "lock", label: "Your top 3 archetypes: the full blend" },
      { icon: "lock", label: "A free report for your partner" },
      { icon: "lock", label: "Your ideal-match archetype" },
      { icon: "lock", label: "Where you fit and where you clash" },
    ],
    plan: "full_report",
    priceCents: 999,
    priceSuffix: "one-off",
    title: "Just a snapshot",
  },
  {
    ctaLabel: "Unlock now",
    description: "How your three strongest types blend into one.",
    featuredLabel: "Most popular",
    subtitle: "Your three strongest, together",
    features: [
      { icon: "check", label: "Your complete archetype report" },
      { icon: "check", label: "30+ chapters and personalised growth" },
      { icon: "check", label: "Your top 3 archetypes: the full blend" },
      { icon: "lock", label: "A free report for your partner" },
      { icon: "lock", label: "Your ideal-match archetype" },
      { icon: "lock", label: "Where you fit and where you clash" },
    ],
    plan: "core",
    priceCents: 1999,
    priceSuffix: "one-off",
    title: "All your core archetypes",
    tone: "highlight",
  },
  {
    badge: "Go deeper",
    ctaLabel: "Unlock us",
    description: "Both of your profiles, and the chemistry between you.",
    subtitle: "Two full reports, one price",
    footnote:
      "No partner yet? Discover the archetype that completes you now, and keep your free invite for when you meet them.",
    features: [
      { icon: "check", label: "Your complete archetype report" },
      { icon: "check", label: "30+ chapters and personalised growth" },
      { icon: "check", label: "Your top 3 archetypes: the full blend" },
      { icon: "check", label: "A free report for your partner" },
      { icon: "check", label: "Your ideal-match archetype" },
      { icon: "check", label: "Where you fit and where you clash" },
    ],
    plan: "all_reports",
    priceCents: 2999,
    priceSuffix: "one-off",
    title: "For you & your partner",
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
    // /checkout reads archetype as a slug (toArchetypeSlug-compatible) and
    // calls fromArchetypeSlug on it. Slugify here so the URL stays stable
    // and de-slugification round-trips cleanly for any archetype name with
    // spaces (e.g. "Emotional Voyeur" → "emotional-voyeur").
    const slug = toArchetypeSlug(archetype);
    if (slug) {
      params.set("archetype", slug);
    }
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
 *
 * Pass `currentCents` to suppress a strike that has stopped being one. Some buckets
 * price at their own MSRP (Group B's full report is 29.00 against a 29.00 anchor), so
 * once the urgency surcharge lands the charged price OVERTAKES the anchor and the strike
 * would read "€31.00, was €29.00" — an advert for the cheaper past. Omitting
 * `currentCents` keeps the old unconditional behaviour for callers with no price to
 * compare against.
 */
export function getReportPurchaseStrikePrice(
  strikeCents: number | null | undefined,
  currentCents?: number
) {
  if (typeof strikeCents !== "number" || strikeCents <= 0) {
    return null;
  }
  if (typeof currentCents === "number" && currentCents >= strikeCents) {
    return null;
  }
  return formatReportPurchasePrice(strikeCents);
}

/**
 * The "Save €X" amount, or null when there is nothing to save. Same guard as the strike
 * above, so the two can never disagree.
 */
export function getReportPurchaseSaveCents({
  strikeCents,
  currentCents,
}: {
  strikeCents: number | null | undefined;
  currentCents: number;
}): number | null {
  if (typeof strikeCents !== "number" || strikeCents <= 0 || currentCents >= strikeCents) {
    return null;
  }
  return strikeCents - currentCents;
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
