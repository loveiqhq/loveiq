/**
 * The V4 chapters of every archetype transcribed from Sanjin's docs, by display name (the
 * names KNOWN_ARCHETYPES uses), one file per archetype in this folder. Spark Seeker is not
 * here: it is hand-set from Figma in the chapter modules themselves, which merge these in.
 *
 * PREMIUM, as everything in this folder but runs.ts and types.ts:
 * __tests__/security/premium-content-bundle.test.ts keeps it out of client bundles.
 */
import { ANALYTICAL_SEXUALIST } from "./analytical-sexualist";
import { AUTHORITY_CONDUCTOR } from "./authority-conductor";
import { CURIOUS_APPRENTICE } from "./curious-apprentice";
import { EMOTIONAL_VOYEUR } from "./emotional-voyeur";
import { EXPLORER_OF_EDGES } from "./explorer-of-edges";
import type { Report3ArchetypeCopy } from "./types";

export const REPORT3_ARCHETYPE_COPY: Readonly<Record<string, Report3ArchetypeCopy>> = {
  "Analytical Sexualist": ANALYTICAL_SEXUALIST,
  "Authority Conductor": AUTHORITY_CONDUCTOR,
  "Curious Apprentice": CURIOUS_APPRENTICE,
  "Emotional Voyeur": EMOTIONAL_VOYEUR,
  "Explorer of Edges": EXPLORER_OF_EDGES,
};

/** One chapter of every archetype here, by display name. */
export function chapterCopy<K extends keyof Report3ArchetypeCopy>(
  chapter: K
): Record<string, Report3ArchetypeCopy[K]> {
  return Object.fromEntries(
    Object.entries(REPORT3_ARCHETYPE_COPY).map(([name, copy]) => [name, copy[chapter]])
  );
}
