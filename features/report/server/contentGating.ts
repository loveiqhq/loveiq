/**
 * Server-side premium-content filters.
 *
 * Product decision (see plan "whimsical-greeting-popcorn"): on locked
 * premium sections we ship the archetype prose so the client can render
 * it blurred behind a `PremiumOverlay` (visual tease). Practice-tendency
 * metric values stay server-stripped — the numbers are the paid value
 * and must not reach the DOM. Practice names ship in full so the locked
 * rows can show what's there.
 *
 * Inputs:
 *   - `accessPlan`: null | "essentials" | "full_report" | "core" | "all_reports"
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

export const PRACTICE_SECTION_ID = "typical_sexual_fantasy_amp_practice_tendencies";

/**
 * Withhold the "Learn:" disclosure body from a locked section.
 *
 * Every section copy carries universal educational slots. The eyebrow and the
 * one-line `edu.teaser` are the tease and stay — they're what makes the reader
 * want the section. The body paragraphs (`edu.body.*`) and the enumerated
 * structure list (`edu.struct.*`) are the paid asset.
 *
 * These used to ship whole regardless of `locked`, and the peek→expand control
 * that reveals them is client-side only — so a reader who had bought nothing
 * could open "Read the full explanation" and get all of it. Hiding the control
 * alone would not have been enough either: the prose would still sit in the
 * /api/report JSON for anyone reading the network tab. It has to come off the
 * wire, which is what this does.
 *
 * The `practical.*` sections (libido, initiation, insecurities) already gate
 * their own teaser and lines at the call site, so they need nothing here.
 */
export function stripLockedEduBody<T extends { locked?: boolean }>(copy: T): T {
  if (!copy || typeof copy !== "object" || copy.locked !== true) return copy;

  const gated: Record<string, unknown> = { ...copy };
  for (const key of Object.keys(gated)) {
    if (key.startsWith("edu.body.") || key.startsWith("edu.struct.")) {
      gated[key] = null;
    }
  }
  return gated as T;
}

/**
 * Apply {@link stripLockedEduBody} across a whole response payload.
 *
 * Section copies are top-level keys on the /api/report body, so gating here
 * covers every section at once — including any added later, which is the point:
 * a new section gets the gate for free instead of depending on whoever writes
 * it remembering to ask for one.
 */
export function stripLockedEduBodyFromPayload<T extends Record<string, unknown>>(payload: T): T {
  const out: Record<string, unknown> = { ...payload };
  for (const [key, value] of Object.entries(out)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const candidate = value as { locked?: boolean };
      if (candidate.locked === true) out[key] = stripLockedEduBody(candidate);
    }
  }
  return out as T;
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

    // Always ship archetype prose. The client renders it blurred behind
    // a PremiumOverlay when `isSectionUnlockedForPlan` is false. Whether
    // the section is locked is recomputed on the client from `accessPlan`.
    for (const archetype of unlockedSet) {
      const html = block[archetype];
      if (!html) continue;
      if (!result[section.archetypeBlockId]) {
        result[section.archetypeBlockId] = {};
      }
      // Just initialised above; the lookup is defined.
      result[section.archetypeBlockId]![archetype] = html;
    }
  }
  return result;
}

export function buildPracticeTendenciesForUser(
  accessPlan: ReportAccessPlan,
  unlockedArchetypes: string[],
  archetypeTiers: Record<string, "essentials" | "full_report"> = {}
): Record<string, PracticeTendencyContentForUser> {
  const result: Record<string, PracticeTendencyContentForUser> = {};
  const practiceSection = reportSections.find((s) => s.id === PRACTICE_SECTION_ID);
  if (!practiceSection) return result;

  for (const archetype of unlockedArchetypes) {
    const content = reportPracticeTendencies[archetype];
    if (!content) continue;

    // Gate per-archetype: the practice section is full_report-tier, so it
    // unlocks for an archetype held at full_report (core's top-3, full_report's
    // own, all_reports' everything) but stays locked at essentials tier. The
    // earlier GLOBAL check broke `core` — its plan isn't in the tier fallback,
    // so it stripped scores from the very top-3 the buyer paid to unlock.
    const sectionUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      archetypeTier: archetypeTiers[archetype] ?? null,
      isPremium: practiceSection.isPremium ?? false,
      sectionId: practiceSection.id,
    });

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
