/**
 * Server-side premium-content filters.
 *
 * SECURITY-CRITICAL: these decide what archetype prose + practice scores
 * land in the JSON response a client receives. The client cannot reveal
 * paid content via DevTools, React state mutation, or network inspection
 * BECAUSE the bytes were never sent in the first place. Any regression
 * here re-opens the paywall — see `__tests__/lib/report/contentGating.test.ts`
 * for the regression suite.
 *
 * Inputs:
 *   - `accessPlan`: null | "essentials" | "full_report" | "all_reports"
 *   - `unlockedArchetypes`: every archetype this user can read for the
 *     sections their plan covers (always includes the primary archetype)
 *
 * Outputs are keyed by:
 *   - archetypeContent: { blockId: { archetypeName: html } }
 *   - practiceTendencies: { archetypeName: { introBlocks, groups[] } }
 */

import { archetypeContent } from "@/data/report-archetypes";
import {
  reportPracticeTendencies,
  type ReportPracticeTendencyRow,
} from "@/data/report-practice-tendencies";
import { reportSections } from "@/data/report-general";
import { isSectionUnlockedForPlan, type ReportAccessPlan } from "@/lib/report/access";

export const PRACTICE_SECTION_ID = "typical_sexual_fantasy_amp_practice_tendencies";

export interface PracticeTendencyGroupForUser {
  title: string;
  rows: ReportPracticeTendencyRow[];
  // Original group row count. When the section is locked we ship only
  // [rows[0]] for the free-preview row; the client uses
  // (totalRowCount - rows.length) to render placeholder cells.
  totalRowCount: number;
}

export interface PracticeTendencyContentForUser {
  introBlocks: string[];
  groups: PracticeTendencyGroupForUser[];
}

export function buildArchetypeContentForUser(
  accessPlan: ReportAccessPlan,
  unlockedArchetypes: string[]
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  const unlockedSet = new Set(unlockedArchetypes);

  for (const section of reportSections) {
    if (!section.archetypeBlockId) continue;
    const block = archetypeContent[section.archetypeBlockId];
    if (!block) continue;

    const sectionUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      isPremium: section.isPremium ?? false,
      sectionId: section.id,
    });
    if (!sectionUnlocked) continue;

    for (const archetype of unlockedSet) {
      const html = block[archetype];
      if (!html) continue;
      if (!result[section.archetypeBlockId]) {
        result[section.archetypeBlockId] = {};
      }
      result[section.archetypeBlockId][archetype] = html;
    }
  }
  return result;
}

export function buildPracticeTendenciesForUser(
  accessPlan: ReportAccessPlan,
  unlockedArchetypes: string[]
): Record<string, PracticeTendencyContentForUser> {
  const result: Record<string, PracticeTendencyContentForUser> = {};
  const practiceSection = reportSections.find((s) => s.id === PRACTICE_SECTION_ID);
  if (!practiceSection) return result;

  const sectionUnlocked = isSectionUnlockedForPlan({
    accessPlan,
    isPremium: practiceSection.isPremium ?? false,
    sectionId: practiceSection.id,
  });

  for (const archetype of unlockedArchetypes) {
    const content = reportPracticeTendencies[archetype];
    if (!content) continue;

    if (sectionUnlocked) {
      result[archetype] = {
        introBlocks: content.introBlocks,
        groups: content.groups.map((g) => ({
          title: g.title,
          rows: g.rows,
          totalRowCount: g.rows.length,
        })),
      };
    } else {
      // Locked — ship only the free-preview row and the original row count.
      // Client renders placeholder cells for (totalRowCount - rows.length).
      result[archetype] = {
        introBlocks: content.introBlocks,
        groups: content.groups.map((g) => ({
          title: g.title,
          rows: g.rows.length > 0 ? [g.rows[0]] : [],
          totalRowCount: g.rows.length,
        })),
      };
    }
  }
  return result;
}
