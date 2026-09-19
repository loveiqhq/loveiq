// SERVER-SIDE access layer for the Report 2.0 copy handoff. This module imports
// the 634KB `report2-copy.ts`, so it MUST NOT be imported from client components
// — resolve the current archetype's slots here (server code) and pass them down
// as props. For the small, client-safe per-archetype config (accent, families,
// hero, stats) import from `./report2-config` instead.
//
// Coverage (per Mark's handoff): the COPY is written for all 14 archetypes; the
// CONFIG is complete for Spiritual Lover, partial for Spark Seeker / Sensual
// Connector, and accent+name stubs for the other 11. Treat every config field as
// possibly-absent and fall back to existing data (reportTheme).
import { report2Copy, type Report2CopySlug } from "./report2-copy";
import { archetypeSlug } from "./report2-config";

export type { Report2CopySlug };
export {
  archetypeSlug,
  getReport2Config,
  type Report2ArchetypeConfig,
  type Report2Families,
  type Report2HeroConfig,
} from "./report2-config";

/** All slots for an archetype, keyed `sectionId → slotKey → text`. Null if unknown. */
export function getReport2Copy(name: string): Record<string, Record<string, string>> | null {
  return (
    (report2Copy as Record<string, Record<string, Record<string, string>>>)[archetypeSlug(name)] ??
    null
  );
}

/** One section's slots for an archetype, or an empty object. */
export function getReport2Section(name: string, sectionId: string): Record<string, string> {
  return getReport2Copy(name)?.[sectionId] ?? {};
}
