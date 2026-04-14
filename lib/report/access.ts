import { reportSections } from "@/data/report-general";
import type { ReportPurchasePlanId } from "@/lib/checkout/reportPurchase";

export const ESSENTIALS_SECTION_IDS = [
  "probability_of_other_archetypes",
  "core_motivation",
  "sexual_stage",
  "confidence_level_how_secure_a_person_feels_in_their_sexual_self",
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
