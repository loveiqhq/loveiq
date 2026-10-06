import { getReport2Section } from "@/data/report2";
import { getFantasyMapDots } from "./fantasyMap";

/**
 * Report 2.0 Fantasy ("Fantasy vs. Reality") section copy — a Part III,
 * FULL_REPORT-tier PREMIUM section (section 27,
 * `typical_sexual_fantasy_amp_practice_tendencies`; NOT in ESSENTIALS_SECTION_IDS,
 * so it unlocks only at the full_report tier). UNLIKE the sibling sections EVERY
 * fantasy copy slot is universal (all 12 are `universal: true` in
 * report2-sections-schema.json — hook, edu.*, the two chart-notes, learn.*), so
 * there is nothing per-archetype to withhold: all slots are always shipped and
 * frame the section for locked clients too. `locked` only drives whether the client
 * blurs the map behind the overlay.
 *
 * The map's per-archetype dots are DERIVED from the practice-tendency scores
 * (fantasy pull × lived pleasure) rather than hand-authored — see fantasyMap.ts.
 * Withheld when locked: the client then falls back to the universal illustrative
 * layout behind the blur, so no per-archetype placement leaks to an unpaid reader.
 *
 * One builder for /api/report and the staging preview route, so a locked preview is
 * the same honest picture of a locked report. Both callers still pass their whole
 * payload through contentGating's edu-body strip, which clips `edu.body.*` for a
 * locked reader.
 */
export function buildFantasyCopy(contentArchetype: string, unlocked: boolean) {
  const section = getReport2Section(contentArchetype, "fantasy");
  return {
    fantasyDots: unlocked ? getFantasyMapDots(contentArchetype) : null,
    fantasyCopy: {
      "edu.eyebrow": section["edu.eyebrow"] ?? null,
      "edu.teaser": section["edu.teaser"] ?? null,
      "edu.body.p1": section["edu.body.p1"] ?? null,
      "edu.body.p2": section["edu.body.p2"] ?? null,
      "edu.body.p3": section["edu.body.p3"] ?? null,
      "edu.body.p4": section["edu.body.p4"] ?? null,
      chartnote1: section.chartnote1 ?? null,
      chartnote2: section.chartnote2 ?? null,
      "learn.eyebrow": section["learn.eyebrow"] ?? null,
      "learn.body": section["learn.body"] ?? null,
      locked: !unlocked,
    },
  };
}
