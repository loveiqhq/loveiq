import type { ReportSection } from "@/data/report-general";
import { isSectionIncludedInEssentials } from "@features/report/server/access";
import { resolveReportNavTitle, resolveReportSectionTitle } from "@features/report/sectionTitles";

export { resolveReportNavTitle, resolveReportSectionTitle };

export type AccessTier = "free" | "essentials" | "full_report";
export type NavType = "link" | "subheading";

export interface DisplayReportSection extends ReportSection {
  displayTitle: string;
  navTitle: string;
  accessTier: AccessTier;
  navType: NavType;
}

/** Sections rendered as category subheadings in sidebar nav */
const SUBHEADING_SECTIONS = new Set([
  "core_archetype",
  "core_motivation",
  "core_insecurities_the_hidden_fears_that_shape_desire_protection_and_erotic_expression",
]);

function resolveAccessTier(section: ReportSection): AccessTier {
  if (!section.isPremium) return "free";
  if (isSectionIncludedInEssentials(section.id)) return "essentials";
  return "full_report";
}

function resolveNavType(section: ReportSection): NavType {
  return SUBHEADING_SECTIONS.has(section.id) ? "subheading" : "link";
}

export function resolveReportSections(
  sections: ReportSection[],
  primaryArchetype: string
): DisplayReportSection[] {
  return sections.map((section) => ({
    ...section,
    displayTitle: resolveReportSectionTitle(section, primaryArchetype),
    navTitle: resolveReportNavTitle(section, primaryArchetype),
    accessTier: resolveAccessTier(section),
    navType: resolveNavType(section),
  }));
}
