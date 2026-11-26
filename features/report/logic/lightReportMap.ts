import type { ReportNavAccess } from "@features/report/ui/ReportNavBadge";
import { isGateRevealArm, type GateRevealArm } from "@shared/experiments/gateRevealArm";
import { isGatePriceArm } from "@shared/experiments/gatePriceArm";

/**
 * How each chapter reads on a map of the EUR 1.99 Light Report offer (Mark's board F2): the
 * Core Archetype free, the welcome and the snapshot of the top archetypes in the Light Report,
 * the opening of four featured chapters with it, the rest in the full report. The survey's
 * report map (after Q59) draws it, and so do the pre-report wizard's map and the report's own
 * chapter menu for a reader whose EUR 1.99 page shows the archetype (the new page's half of the
 * test, Mark 13 Nov): one list, so the three can never tell the offer differently.
 *
 * The other half of Mark's 50/50 meets today's EUR 1.99 page, which shows no archetype, and his
 * write-up of the test (16 Nov) gives it the same map with the Core Archetype in the EUR 1.99
 * instead of free (`price`, his board "Explain · F2 · Report map legend, 1.99€ funnel copy 2").
 */
export type LightMapRowKind = "free" | "priced" | "featured" | "locked";

/** Which EUR 1.99 page the map describes: Mark's new one (`light`) or today's (`price`). */
export type LightMapOffer = "light" | "price";

/**
 * The offer the maps after the survey tell (the pre-report wizard's, the report's menu during
 * the tour), from the reader's half of Mark's 50/50: they say what the survey's sheets said.
 * With no test running (`null`, its switch off) they keep today's map, as before the test.
 */
export function offerForGateArm(arm: GateRevealArm | null | undefined): "today" | LightMapOffer {
  if (arm === "reveal") return "light";
  return arm === "control" ? "price" : "today";
}

/**
 * The report menu's offer during the tour, from the gate the report's server built: whether it
 * drew Mark's new page (`revealShown`), and the reader's half of his 50/50 (`revealArm`, absent
 * while no test runs). A new-page reader whose page could not be drawn meets today's page, so
 * the menu says today's page's offer.
 *
 * In the price test that replaced that 50/50 (`priceArm`, shared/experiments/gatePriceArm.ts),
 * today's page's half (`fixed`) is told its EUR 1.99, as its survey sheets told it; the half
 * that chooses its price is told no price (`today`), as its survey skipped those sheets.
 */
export function tourMenuOffer(
  revealShown: boolean,
  revealArm: unknown,
  priceArm?: unknown
): "today" | LightMapOffer {
  if (isGatePriceArm(priceArm)) return priceArm === "fixed" ? "price" : "today";
  if (revealShown) return "light";
  return offerForGateArm(isGateRevealArm(revealArm) ? "control" : null);
}

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

export function lightMapRowKind(id: string, offer: LightMapOffer = "light"): LightMapRowKind {
  if (id === "core_archetype") return offer === "light" ? "free" : "priced";
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
 * - `today`: no test runs, and the menu says what the page under the tour opens (30 Oct): the
 *   welcome in full, Typical Beliefs partly open, the rest locked.
 * - `light`: the gate will show the reader's archetype (Mark's new page), so the menu names
 *   that offer as the survey's report map does (Mark, 13 Nov).
 * - `price`: the reader is in today's page's half of Mark's 50/50, whose report map put the
 *   Core Archetype in the EUR 1.99 (16 Nov), so the menu says that.
 * The page under the tour opens the same chapters in all three; a locked chapter's lock still
 * leads to the gate.
 */
export function tourFirstNavAccess(id: string, offer: "today" | LightMapOffer): ReportNavAccess {
  if (offer !== "today") return LIGHT_NAV_ACCESS[lightMapRowKind(id, offer)];
  if (id === "typical_beliefs") return "unlocked";
  return TOUR_FIRST_OPEN_CHAPTER_IDS.has(id) ? "free" : "locked";
}
