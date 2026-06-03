/**
 * Server-side premium-content filters.
 *
 * [Audit M1] Locked premium sections previously shipped the FULL archetype prose
 * and relied on a CSS blur (`PremiumOverlay`) to hide it — which meant any
 * unpaid token holder could read the entire paid analysis straight from the API
 * response / DOM. Now locked premium sections ship only a SHORT TEASER (first
 * sentence) so the client still renders a blurred preview, while the full paid
 * prose never leaves the server. Unlocked sections (free sections, or premium
 * sections the user's plan covers) ship in full — paying users are unaffected.
 * Practice-tendency metric values stay server-stripped on locked rows; practice
 * names ship in full so the locked rows can show what's there.
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
import { reportPracticeTendencies } from "@/data/report-practice-tendencies";
import { reportSections } from "@/data/report-general";
import { isSectionUnlockedForPlan, type ReportAccessPlan } from "@features/report/server/access";
import { escapeHtml } from "@shared/format/html-escape";

export const PRACTICE_SECTION_ID = "typical_sexual_fantasy_amp_practice_tendencies";

/** Max teaser length (plain-text chars) shipped for a locked premium section. */
const TEASER_MAX_CHARS = 160;

/**
 * Reduce full archetype prose to a short, safe teaser for a LOCKED premium
 * section: strip tags to plain text, take the first sentence (or a hard cap),
 * HTML-escape, and re-wrap in a single <p>. Keeps a blurred preview on the
 * client while the full paid prose stays server-side. [Audit M1]
 */
function htmlToTeaser(html: string): string {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  let teaser = text.slice(0, TEASER_MAX_CHARS);
  const sentenceEnd = teaser.search(/[.!?]\s/);
  if (sentenceEnd >= 40) {
    teaser = teaser.slice(0, sentenceEnd + 1);
  } else if (text.length > TEASER_MAX_CHARS) {
    teaser = teaser.replace(/\s+\S*$/, "") + "…";
  }
  return `<p>${escapeHtml(teaser)}</p>`;
}

export interface PracticeTendencyRowForUser {
  practice: string;
  fantasyPull: number | null;
  actualPleasure: number | null;
  description: string | null;
}

export interface PracticeTendencyGroupForUser {
  title: string;
  rows: PracticeTendencyRowForUser[];
  // Original group row count. Kept on the wire so the client can render
  // the right number of locked placeholder cells if a future change ships
  // fewer rows than the data file holds.
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

    // [Audit M1] Gate prose by plan, mirroring the same check the client uses to
    // decide the blur. Unlocked sections (free, or premium the plan covers) ship
    // full prose; locked premium sections ship only a teaser so the full paid
    // analysis never reaches the client.
    const sectionUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      isPremium: section.isPremium ?? false,
      sectionId: section.id,
    });

    for (const archetype of unlockedSet) {
      const html = block[archetype];
      if (!html) continue;
      if (!result[section.archetypeBlockId]) {
        result[section.archetypeBlockId] = {};
      }
      // Just initialised above; the lookup is defined.
      result[section.archetypeBlockId]![archetype] = sectionUnlocked ? html : htmlToTeaser(html);
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
          rows: g.rows.map((row) => ({ ...row })),
          totalRowCount: g.rows.length,
        })),
      };
    } else {
      // Locked — keep practice names and the free-preview row's numbers,
      // null out scores on every other row so cells render "--" with the
      // existing CSS blur. Names tease what's behind the paywall; metric
      // numbers are the paid value and must stay out of the DOM.
      result[archetype] = {
        introBlocks: content.introBlocks,
        groups: content.groups.map((g) => ({
          title: g.title,
          rows: g.rows.map((row, i) =>
            i === 0 ? { ...row } : { ...row, fantasyPull: null, actualPleasure: null }
          ),
          totalRowCount: g.rows.length,
        })),
      };
    }
  }
  return result;
}
