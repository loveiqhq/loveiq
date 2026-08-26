/**
 * Chapter 13's "Core Energy Level Varieties Across Archetypes".
 *
 * Five named energy levels, each with an "(e.g. …)" line naming the archetypes it
 * covers. Mark asked on 2026-08-26 for the reader's own level to be shown here the
 * way the curiosity and arousal styles are: name and description, from the
 * document, unrewritten.
 *
 * The Spark Seeker is named under "High energy". The document's pre-V9 archetype
 * names in the "(e.g. …)" lists are left verbatim, as everywhere else in this pass.
 *
 * This is the DOCUMENT's classification, and it is not the same axis as
 * `families.energy` (wave / spike / steady / conditional), which drives the curve.
 * They agree for the Spark Seeker — "High · fast-activating" against "High energy"
 * — but they are two different vocabularies and neither is derived from the other.
 */

export interface Report2EnergyLevel {
  name: string;
  description: string;
}

/** In document order, low to high. */
export const ENERGY_LEVELS: Report2EnergyLevel[] = [
  {
    name: "Low energy",
    description:
      "Sexuality is calm, gentle, and slow-moving. Desire builds quietly and can be easily overwhelmed by stress, pressure, or intensity. (e.g. Minimalist Companion, Quiet Withdrawer, Emotional Voyeur)",
  },
  {
    name: "Moderate energy",
    description:
      "Desire is present and stable, but needs the right conditions to activate fully. These archetypes warm up gradually and prefer rhythm over spikes. (e.g. Sensual Connector, Relational Nurturer, Curious Apprentice, Loyal Ritualist)",
  },
  {
    name: "High energy",
    description:
      "Sexuality is vivid, expressive, and fast-activating. Desire often arrives already “on” and seeks movement, intensity, or stimulation. (e.g. Spark Seeker, Exhibitionist Performer, Power Orchestrator)",
  },
  {
    name: "Very high / peak-seeking energy",
    description:
      "Desire is driven by extremes, adrenaline, and strong nervous-system activation. Calm or subtle experiences can feel flat or deadening. (e.g. Explorer of Edges)",
  },
  {
    name: "Controlled or instrumental energy",
    description:
      "Energy is high but regulated and directed,often toward power, structure, influence, or outcomes rather than sensation itself. (e.g. Power Orchestrator, Analytical Sexualist)",
  },
];

/** Level per archetype, read off the document's own "(e.g. …)" lists. */
export const ENERGY_LEVEL_BY_ARCHETYPE: Record<string, string> = {
  "spark-seeker": "High energy",
};

/** The reader's level entry, or null when the document names none. */
export function getEnergyLevel(slug: string): Report2EnergyLevel | null {
  const name = ENERGY_LEVEL_BY_ARCHETYPE[slug];
  if (!name) return null;
  return ENERGY_LEVELS.find((l) => l.name === name) ?? null;
}
