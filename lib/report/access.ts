import { reportSections } from "@/data/report-general";
import type { ReportPurchasePlanId } from "@/lib/checkout/reportPurchase";

export const ESSENTIALS_SECTION_IDS = [
  "summary",
  "attachment_style_how_safety_closeness_and_distance_shape_desire",
  "core_insecurities_the_hidden_fears_that_shape_desire_protection_and_erotic_expression",
  "confidence_level_how_secure_a_person_feels_in_their_sexual_self",
  // eslint-disable-next-line no-secrets/no-secrets -- section id, not a secret
  "typical_beliefs_how_early_learning_shapes_sexual_meaning",
] as const;

const ESSENTIALS_SECTION_SET = new Set<string>(ESSENTIALS_SECTION_IDS);

export type ReportAccessPlan = ReportPurchasePlanId | null;

export function isReportPurchasePlan(value: unknown): value is ReportPurchasePlanId {
  return value === "essentials" || value === "full_report" || value === "all_reports";
}

export function getStrongestReportAccessPlan(
  plans: Array<ReportPurchasePlanId | null | undefined>
): ReportAccessPlan {
  let strongest: ReportPurchasePlanId | null = null;

  for (const plan of plans) {
    if (!plan) continue;
    if (!strongest || getPlanPriority(plan) > getPlanPriority(strongest)) {
      strongest = plan;
    }
  }

  return strongest;
}

function getPlanPriority(plan: ReportPurchasePlanId) {
  switch (plan) {
    case "essentials":
      return 1;
    case "full_report":
      return 2;
    case "all_reports":
      return 3;
    default:
      return 0;
  }
}

/**
 * Whether the user's current `accessPlan` already covers `targetPlan`. Used by
 * the pricing modal to show an "owned" pill instead of a buy button when the
 * user is already entitled (e.g. full_report owns essentials).
 */
export function doesAccessPlanCover(
  accessPlan: ReportAccessPlan,
  targetPlan: ReportPurchasePlanId
): boolean {
  if (!accessPlan) return false;
  return getPlanPriority(accessPlan) >= getPlanPriority(targetPlan);
}

export function isSectionIncludedInEssentials(sectionId: string) {
  return ESSENTIALS_SECTION_SET.has(sectionId);
}

export function isSectionUnlockedForPlan({
  accessPlan,
  isPremium,
  sectionId,
}: {
  accessPlan: ReportAccessPlan;
  isPremium: boolean;
  sectionId: string;
}) {
  if (!isPremium) return true;
  if (!accessPlan) return false;
  if (accessPlan === "full_report" || accessPlan === "all_reports") return true;
  return isSectionIncludedInEssentials(sectionId);
}

export function getUnlockedPremiumSectionIdsForPlan(accessPlan: ReportAccessPlan) {
  if (!accessPlan) return [];

  if (accessPlan === "full_report" || accessPlan === "all_reports") {
    return reportSections.filter((section) => section.isPremium).map((section) => section.id);
  }

  return [...ESSENTIALS_SECTION_IDS];
}
