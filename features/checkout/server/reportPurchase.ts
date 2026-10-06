import { toArchetypeSlug } from "@features/report/server/archetypeSlug";

export const REPORT_ACCESS_TOKEN_REGEX = /^rpt_[a-zA-Z0-9]{20}$/;

/**
 * Where on the report a reader started a checkout — "<sectionId>~<article>~<offset>~<y>",
 * built and read back by features/report/ui/unlockAnchor.ts — so Stripe's return can put
 * them back at that spot (Figma 1382:2010: "Anchor the user to the exact position were
 * he unlocked"). It travels in the success and cancel URLs, so it is validated as tightly
 * as the token: an id-shaped section, then small integers.
 */
export const UNLOCK_ANCHOR_REGEX = /^[A-Za-z0-9_-]{1,64}~\d{0,2}~-?\d{1,6}~-?\d{1,5}$/;

// Every plan id a payment can carry. Only two are SOLD since Pricing 3.0
// (REPORT_PURCHASE_PLANS): all_reports = "All 14 Archetype Reports", full_report =
// "Only Your Highest Archetype". `essentials` (retired 2026-07) and `core` (retired
// with 3.0) stay in the union so historical payments still validate, keep their
// access and keep their names (RETIRED_PLAN_TITLES).
export const REPORT_PURCHASE_PLAN_IDS = [
  "essentials",
  "full_report",
  "core",
  "all_reports",
] as const;

export type ReportPurchasePlanId = (typeof REPORT_PURCHASE_PLAN_IDS)[number];

export interface ReportPurchaseFeature {
  label: string;
  /** False draws the feature greyed out: on the page as what this plan leaves out. */
  included: boolean;
}

export interface ReportPurchasePlan {
  /** The pill: "Continue" on All 14, the outlined one on the single report. */
  ctaLabel: string;
  description: string;
  /** The pill above the card ("Most Popular"). */
  featuredLabel?: string;
  features: ReportPurchaseFeature[];
  plan: ReportPurchasePlanId;
  /**
   * Flat selling price (cents) — display fallback when a live quote isn't
   * available. The live per-visitor quote (report_price_quote) is the source of
   * truth; the strike-through MSRP comes from `ReportPriceQuoteSnapshot.msrpCents`.
   *
   * Keep this at the HIGHEST arm's price (arm A3). It renders for the
   * moment before /api/price resolves, so if it sits below what the visitor is
   * actually charged the price visibly jumps UP on them — a bait-and-switch on
   * a paywall. Anchored high, the correction is always downward.
   */
  priceCents: number;
  priceSuffix: string;
  /**
   * The phone layout's own title and line (paygate-mobile 842:584): the frames give
   * the single report a longer name there than beside All 14 on a wide screen
   * (paygate-desktop 963:6). Absent, the stacked card reads `title`/`description`.
   */
  stackedDescription?: string;
  stackedTitle?: string;
  /** The name everywhere else: Stripe's line item, the receipt, Slack, GA4. */
  title: string;
  /** The title's first words, set in the card's emphasis ("All 14", "Only"). */
  titleLead: string;
  tone?: "highlight";
}

export const DEFAULT_REPORT_PURCHASE_PLAN_ID: ReportPurchasePlanId = "full_report";

/**
 * The paygate's two cards, in the frames' order: All 14 first and highlighted, the
 * single report under it (842:584) or beside it (963:6). Copy is the frames' own,
 * with their slips put right: the duplicated "Your complete archetype report" row
 * on both desktop cards and the single report's phone card, and "report s". Titles
 * and the badge are in the report's 02.10 heading case (features/report/logic/titleCase.ts),
 * as the frames' other headings are, not the frames' sentence case.
 */
export const REPORT_PURCHASE_PLANS: ReportPurchasePlan[] = [
  {
    ctaLabel: "Continue",
    description: "Your full archetype report + Access to all 14 archetype reports",
    featuredLabel: "Most Popular",
    features: [
      { included: true, label: "Your complete archetype report" },
      { included: true, label: "20+ chapters and personalised growth" },
      { included: true, label: "Access to all 14 Archetype reports" },
      { included: true, label: "~14h of reading material" },
    ],
    plan: "all_reports",
    priceCents: 3999,
    priceSuffix: "one time payment",
    title: "All 14 Archetype Reports",
    titleLead: "All 14",
    tone: "highlight",
  },
  {
    ctaLabel: "Only Unlock My Highest Scoring Report",
    description: "Your single full archetype report without comparative views",
    features: [
      { included: true, label: "Your complete archetype report" },
      { included: true, label: "20+ chapters and personalised growth" },
      { included: false, label: "Access to all 14 Archetype reports" },
      { included: false, label: "~14h of reading material" },
    ],
    plan: "full_report",
    priceCents: 2999,
    priceSuffix: "one time payment",
    stackedDescription: "Your full archetype report",
    stackedTitle: "Only Your Highest Scoring Archetype Report",
    title: "Only Your Highest Archetype",
    titleLead: "Only",
  },
];

/**
 * Stamped on every Stripe session the 3.0 paygate opens (`metadata.pricingCatalog`),
 * so fulfillment can tell what a session was sold as when the same plan id meant
 * something else before: all_reports was "For you & your partner", with a partner code.
 */
export const PRICING_CATALOG = "3.0";

/**
 * The day Pricing 3.0 started quoting (UTC). The price test is read from here on: the
 * axis trend and the /admin readout count readers who finished the survey from this
 * day, and the conversion digest treats it as the last repricing. Readers from before
 * it were re-priced at launch, after seeing the 2.x prices, so they belong to neither
 * list. Live on production since 2026-10-06 (staging ran it from 2026-10-05).
 */
export const PRICING_3_LAUNCH_DAY = "2026-10-06";

/** The plans the paygate sells — and so the only ones quoted or checked out. */
export const OFFERED_REPORT_PURCHASE_PLAN_IDS: ReportPurchasePlanId[] = REPORT_PURCHASE_PLANS.map(
  (entry) => entry.plan
);

export function isOfferedReportPurchasePlan(plan: ReportPurchasePlanId): boolean {
  return OFFERED_REPORT_PURCHASE_PLAN_IDS.includes(plan);
}

export function isReportPurchasePlanId(
  value: string | null | undefined
): value is ReportPurchasePlanId {
  return (
    typeof value === "string" && REPORT_PURCHASE_PLAN_IDS.includes(value as ReportPurchasePlanId)
  );
}

/** An offered plan's card; a retired id falls back to the default plan's. */
export function getReportPurchasePlan(plan: ReportPurchasePlanId): ReportPurchasePlan {
  return (
    REPORT_PURCHASE_PLANS.find((entry) => entry.plan === plan) ??
    REPORT_PURCHASE_PLANS.find((entry) => entry.plan === DEFAULT_REPORT_PURCHASE_PLAN_ID)!
  );
}

/**
 * The name of any plan id, retired ones included — never another plan's. A session
 * opened on the old paygate can complete after this one ships, and its receipt,
 * payment row and Slack line must name what was bought, not the fallback card.
 */
export function getReportPurchasePlanTitle(plan: ReportPurchasePlanId): string {
  if (plan === "essentials") return "Essentials";
  if (plan === "core") return "All your core archetypes";
  return getReportPurchasePlan(plan).title;
}

/**
 * What was bought, in words, for the receipt line, the payment description and the
 * analytics item name. A single report bought for ANOTHER archetype (its row in
 * "Other Archetypes") is not "Only Your Highest Archetype", so it is named, as the
 * Stripe line item and the purchase email already were. Payments 462 and 463 on
 * 2026-10-06 both read "Only Your Highest Archetype"; the second bought Minimalist
 * Companion.
 */
export function getPurchaseTitle(
  plan: ReportPurchasePlanId,
  archetype: string | null,
  primaryArchetype: string | null
): string {
  return plan === "full_report" && archetype && archetype !== primaryArchetype
    ? `Only the ${archetype} Report`
    : getReportPurchasePlanTitle(plan);
}

export function isReportAccessToken(value: string | null | undefined): value is string {
  return typeof value === "string" && REPORT_ACCESS_TOKEN_REGEX.test(value);
}

export function getReportReturnHref(token?: string | null) {
  return token ? `/report/${encodeURIComponent(token)}` : "/report";
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
