/**
 * Per-archetype `relationship_fit` — the 0..3 score behind each row of the
 * "Fit by relationship form" table (Figma 8427:2013…8427:2075, three pill
 * segments per row: `#9d8ad7` full, `#e2a48f` half, `#f0eef4` empty).
 *
 * `report2-archetype-config.json` carries `relationship_fit` for Spiritual Lover
 * ONLY, so 13 of 14 archetypes rendered the table with NO segments at all. The
 * `spiritualLover` entry below reproduces that one real config EXACTLY, which is
 * what makes the other 13 trustworthy (asserted in
 * `features/report/tests/relationshipFit.test.ts`).
 *
 * The nine forms are ordered most-intentional → least-intentional, and each
 * archetype's score curve decays along that order at a rate set by its OWN
 * curiosity copy (`getReport2Section(name, "curiosity").body.p3`, which states
 * in prose exactly how much openness that archetype can hold). The quoted clause
 * on each entry is the sentence the numbers were read from — no score here is
 * invented independently of the copy the reader is shown.
 *
 * Scores use the half-steps the dot logic already supports: 0.5 · 1 · 1.5 · 2 ·
 * 2.5 · 3. 0.5 is the floor (a visible "not your shape"), never 0, matching the
 * existing config where the five low-fit forms all sit at 0.5.
 */

/** The nine form slugs, in the fixed display order of the Figma table. */
export const RELATIONSHIP_FIT_SLUGS = [
  "monogamy",
  "deep_monogamy",
  "structured_openness",
  "monogamish",
  "open_no_priority",
  "polyamory_no_priority",
  "dadt",
  "casual",
  "anarchy",
] as const;

export type RelationshipFitSlug = (typeof RELATIONSHIP_FIT_SLUGS)[number];
export type RelationshipFit = Record<RelationshipFitSlug, number>;

/** Build a fit map from scores given in `RELATIONSHIP_FIT_SLUGS` order. */
function fit(...scores: number[]): RelationshipFit {
  return Object.fromEntries(
    RELATIONSHIP_FIT_SLUGS.map((slug, i) => [slug, scores[i]!])
  ) as RelationshipFit;
}

export const RELATIONSHIP_FIT_BY_SLUG: Record<string, RelationshipFit> = {
  // "Some Spiritual Lovers can hold limited openness, but only after deep bond
  // is established and devotion stays unmistakable."
  // VALIDATION ANCHOR — must stay identical to the real config.
  "spiritual-lover": fit(3, 3, 2, 1.5, 0.5, 0.5, 0.5, 0.5, 0.5),

  // "Plenty of Spark Seekers thrive in deep monogamy, provided novelty, play,
  // and independence stay protected, and commitment keeps reading as a choice
  // renewed rather than a sentence served." — the most openness-tolerant of the
  // committed archetypes; still needs the bond to be actively chosen.
  "spark-seeker": fit(2.5, 3, 2.5, 2.5, 1, 1, 0.5, 1.5, 1),

  // "A few Sensual Connectors do open their relationships eventually, and it
  // works only on top of years of proven steadiness, with their first place
  // never in doubt."
  "sensual-connector": fit(3, 3, 1.5, 1, 0.5, 0.5, 0.5, 0.5, 0.5),

  // "Some Relational Nurturers do open a relationship and thrive, but only when
  // reassurance stays constant, care stays shared, and they are never left
  // holding the emotional weight alone."
  "relational-nurturer": fit(3, 3, 1.5, 1, 0.5, 0.5, 0.5, 0.5, 0.5),

  // "Plenty of Radiant Performers thrive in committed monogamy, as long as
  // wanting keeps getting said out loud, and being chosen stays something you
  // can see." — reception can come from dating, but priority must be visible.
  "radiant-performer": fit(3, 3, 1.5, 1, 0.5, 0.5, 0.5, 1, 0.5),

  // "Plenty of Explorers of Edges thrive in deep monogamy, but only where
  // experimentation stays alive and no desire gets moralized or minimized.
  // Ambiguity you can tolerate. Being policed you cannot." — tolerates loose
  // shapes; `dadt` stays low because concealment is the shame it cannot hold.
  "explorer-of-edges": fit(2.5, 3, 2.5, 2.5, 1.5, 1.5, 0.5, 1.5, 1.5),

  // "Plenty of Curious Apprentices thrive in committed, exclusive partnerships,
  // and some enjoy open ones too, but only where agreements are clear,
  // reassurance is steady, and exploring stays a shared thing."
  "curious-apprentice": fit(3, 3, 2.5, 2, 1, 1, 0.5, 1, 0.5),

  // "Plenty of Minimalist Companions build rich, lasting intimacy in committed
  // partnership, and some hold gentle openness too, but only once real
  // stability is in place and the emotional weather stays calm." — "soul-bond"
  // intensity is less its shape than plain steady partnership.
  "minimalist-companion": fit(3, 2.5, 1.5, 1.5, 0.5, 0.5, 0.5, 0.5, 0.5),

  // "Plenty of Emotional Voyeurs thrive in committed, private partnerships, and
  // a few can hold carefully bounded openness, but only where your pace is
  // respected, your inner world stays yours." — privacy-first, so withheld
  // detail sits slightly higher here than for any other archetype.
  "emotional-voyeur": fit(3, 2.5, 1.5, 1.5, 0.5, 0.5, 1, 0.5, 0.5),

  // "Plenty of Authority Conductors thrive in committed monogamy, and some do
  // well in structured open arrangements too, but only where agreements stay
  // explicit, respect stays constant, and nobody keeps testing the frame."
  "authority-conductor": fit(3, 2.5, 2.5, 2, 1, 1, 0.5, 1, 0.5),

  // "Plenty of Loyal Ritualists thrive in committed, monogamous relationships,
  // and a few can handle gentle openness once deep security is established, but
  // only where commitment stays unmistakable and change comes slowly."
  "loyal-ritualist": fit(3, 3, 1.5, 1, 0.5, 0.5, 0.5, 0.5, 0.5),

  // "A number of Tender Devotees open a relationship and do well in it, though
  // only where kindness never wavers, being wanted is said plainly, and
  // comparison [never enters]." — openness is reachable, on guaranteed warmth.
  "tender-devotee": fit(3, 3, 2, 1.5, 0.5, 0.5, 0.5, 0.5, 0.5),

  // "Plenty of Analytical Sexualists thrive in committed monogamy, and some in
  // open arrangements too, but only where the rules are spelled out, the plans
  // are predictable, and nothing that matters is left to guessing." — so
  // `dadt` and `anarchy` (unspoken / unscripted) stay at the floor.
  "analytical-sexualist": fit(3, 2.5, 2.5, 2, 1, 1, 0.5, 0.5, 0.5),

  // "Plenty of Quiet Withdrawers are happiest in calm, clearly committed
  // partnerships… A few enjoy gentle novelty once deep safety is built, but
  // only where the exits stay open."
  "quiet-withdrawer": fit(3, 2.5, 1.5, 1, 0.5, 0.5, 0.5, 0.5, 0.5),
};

/** Fit map for an archetype slug, or null when the slug is unknown. */
export function getRelationshipFit(slug: string | null | undefined): RelationshipFit | null {
  return (slug && RELATIONSHIP_FIT_BY_SLUG[slug]) || null;
}
