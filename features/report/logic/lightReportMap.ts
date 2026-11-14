import type { ReportNavAccess } from "@features/report/ui/ReportNavBadge";

/**
 * How each chapter reads on a map of the EUR 1.99 Light Report offer (Mark's board F2): the
 * Core Archetype free, the welcome and the snapshot of the top archetypes in the Light Report,
 * the opening of four featured chapters with it, the rest in the full report. The survey's
 * report map (after Q59) draws it, and so do the pre-report wizard's map and the report's own
 * chapter menu for a reader whose EUR 1.99 page shows the archetype (the new page's half of the
 * test, Mark 13 Nov): one list, so the three can never tell the offer differently.
 */
export type LightMapRowKind = "free" | "priced" | "featured" | "locked";

const PRICED_ROWS: ReadonlySet<string> = new Set([
  "introduction",
  "what_shaped_this_report",
  "top_archetypes",
]);
const FEATURED_ROWS: ReadonlySet<string> = new Set([
  "typical_beliefs",
  "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
  "challenges_in_partnership",
  "typical_sexual_fantasy_amp_practice_tendencies",
]);

export function lightMapRowKind(id: string): LightMapRowKind {
  if (id === "core_archetype") return "free";
  if (PRICED_ROWS.has(id)) return "priced";
  if (FEATURED_ROWS.has(id)) return "featured";
  return "locked";
}

/**
 * Toured before the EUR 1.99 gate, only these chapters open: Part I's welcome, which names no
 * one, and Typical Beliefs, where the tour's stops are (its words cleared of the archetype's
 * name on the server). Everything else is locked, and its lock leads to the gate.
 */
export const TOUR_FIRST_OPEN_CHAPTER_IDS: ReadonlySet<string> = new Set([
  "introduction",
  "what_shaped_this_report",
  "typical_beliefs",
]);

const LIGHT_NAV_ACCESS: Record<LightMapRowKind, ReportNavAccess> = {
  free: "free_pill",
  priced: "price_pill",
  featured: "unlocked",
  locked: "locked",
};

/**
 * A chapter's badge in the report's menu while the tour runs before the EUR 1.99 gate.
 * - `today`: the menu says what the page under the tour opens (30 Oct): the welcome in full,
 *   Typical Beliefs partly open, the rest locked.
 * - `light`: the gate will show the reader's archetype (Mark's new page), so the menu names
 *   that offer as the survey's report map does (Mark, 13 Nov). The page under the tour opens
 *   the same chapters either way; a locked chapter's lock still leads to the gate.
 */
export function tourFirstNavAccess(id: string, offer: "today" | "light"): ReportNavAccess {
  if (offer === "light") return LIGHT_NAV_ACCESS[lightMapRowKind(id)];
  if (id === "typical_beliefs") return "unlocked";
  return TOUR_FIRST_OPEN_CHAPTER_IDS.has(id) ? "free" : "locked";
}
