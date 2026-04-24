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
  priceCents: number;
  priceSuffix: string;
  strikePriceCents?: number;
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
    priceCents: 1499,
    priceSuffix: "one-time",
    strikePriceCents: 1499,
    title: "Essentials only",
  },
  {
    badge: "50% OFF",
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
        label: "18 analysed dimensions",
      },
      {
        label: "Share report with 2 extra emails",
      },
    ],
    plan: "full_report",
    priceCents: 2999,
    priceSuffix: "one-time",
    strikePriceCents: 5900,
    title: "Full report",
    tone: "highlight",
  },
  {
    badge: "32% OFF",
    ctaLabel: "Unlock all reports",
    description: "Built for those wanting to explore all archetypes",
    features: [
      {
        label: "All 14 archetypes unlocked",
        tone: "emphasis",
      },
      {
        label: "All benefits as full report",
        tone: "emphasis",
      },
    ],
    plan: "all_reports",
    priceCents: 12999,
    priceSuffix: "one-time",
    strikePriceCents: 19000,
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

export function getReportPurchaseStrikePrice(plan: ReportPurchasePlan) {
  return typeof plan.strikePriceCents === "number"
    ? formatReportPurchasePrice(plan.strikePriceCents)
    : null;
}

export function getReportPurchaseBadgeFromPrice({
  plan,
  priceCents,
}: {
  plan: ReportPurchasePlan;
  priceCents: number;
}) {
  if (
    typeof plan.strikePriceCents !== "number" ||
    plan.strikePriceCents <= 0 ||
    priceCents >= plan.strikePriceCents
  ) {
    return plan.badge;
  }

  const percentOff = Math.round(
    ((plan.strikePriceCents - priceCents) / plan.strikePriceCents) * 100
  );
  return percentOff > 0 ? `${percentOff}% OFF` : plan.badge;
}
