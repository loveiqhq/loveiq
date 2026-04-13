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
  badgeTone?: "discount" | "accent";
  ctaLabel: string;
  description: string;
  featuredLabel?: string;
  features: ReportPurchaseFeature[];
  plan: ReportPurchasePlanId;
  price: string;
  priceSuffix: string;
  strikePrice?: string;
  title: string;
  tone?: "highlight";
}

export const DEFAULT_REPORT_PURCHASE_PLAN_ID: ReportPurchasePlanId = "full_report";

export const REPORT_PURCHASE_PLANS: ReportPurchasePlan[] = [
  {
    ctaLabel: "Unlock Essentials",
    description: "Built for those with limited time",
    features: [
      {
        label: "Includes the following chapter:",
      },
      {
        icon: "none",
        label: "Basic Archetype Info",
        tone: "muted",
      },
      {
        icon: "none",
        label: "Core Desire Drivers",
        tone: "muted",
      },
      {
        icon: "none",
        label: "Initial Growth Paths",
        tone: "muted",
      },
      {
        label: "Share report with 1 extra email",
      },
    ],
    plan: "essentials",
    price: "€14.99",
    priceSuffix: "one-time",
    title: "Essentials only",
  },
  {
    badge: "50% OFF",
    badgeTone: "discount",
    ctaLabel: "Unlock full report",
    description: "Perfect for individuals who want to dive deep",
    featuredLabel: "Most popular",
    features: [
      {
        label: "14-day money-back guarantee",
        tone: "emphasis",
      },
      {
        label: "Get full access to the report",
      },
      {
        label: "All sections unlocked",
      },
      {
        label: "18 analysed dimensions",
      },
      {
        label: "Share report with up to 2 emails",
      },
    ],
    plan: "full_report",
    price: "€29.99",
    priceSuffix: "one-time",
    strikePrice: "€59.00",
    title: "Full report",
    tone: "highlight",
  },
  {
    badge: "32% OFF",
    badgeTone: "accent",
    ctaLabel: "Unlock all reports",
    description: "Built for those wanting to explore all archetypes",
    features: [
      {
        label: "All 14 archetypes unlocked",
      },
      {
        label: "All benefits as full report",
      },
      {
        label: "Perfect for comparison across patterns",
      },
    ],
    plan: "all_reports",
    price: "€129.99",
    priceSuffix: "one-time",
    strikePrice: "€190.00",
    title: "All reports",
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
  plan,
  token,
}: {
  plan: ReportPurchasePlanId;
  token?: string | null;
}) {
  const params = new URLSearchParams({ plan });

  if (token) {
    params.set("token", token);
  }

  return `/checkout?${params.toString()}`;
}
