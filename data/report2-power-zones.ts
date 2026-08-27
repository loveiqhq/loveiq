/**
 * Power-orientation zone strings, keyed by `families.power_zone`.
 *
 * That family key covers all 14 archetypes across exactly three values, matching
 * the three Figma scales name-for-name:
 *   switch (10)          → BASE 9157:533 · eyebrow 8427:1953 · zone 8427:1957
 *   dominant-leaning (2) → VAR 9114:1000 · eyebrow 9125:504  · zone 9125:508
 *   low-polarity (2)     → VAR 9120:501  · eyebrow 9125:573  · zone 9125:577
 *
 * `label` is the plane's region label (rendered as "<label> ZONE") and `result`
 * is the card's top eyebrow. Both are Figma verbatim and they are NOT
 * interchangeable — the low-polarity plane reads "LOW-POLARITY ZONE" while its
 * eyebrow reads "Gentle switch — comfort-guided".
 *
 * The dot COORDINATES are not here: the frames' own footer says "one map, 14
 * unique positions… the You marker snaps to that archetype's own plotted dot",
 * and that fixed 14-position layout lives in `PowerSection`'s `PLANE`.
 */
export interface PowerZone {
  /** Plane region label; rendered uppercased as "<label> ZONE". */
  label: string;
  /** Card eyebrow — the reader's result line. */
  result: string;
}

export const POWER_ZONES: Record<string, PowerZone> = {
  switch: { label: "Devotional switch", result: "Devotional switch — presence-guided" },
  "dominant-leaning": { label: "Explicit lead", result: "Explicit lead — structure-guided" },
  "low-polarity": { label: "Low-polarity", result: "Gentle switch — comfort-guided" },
};

/**
 * Per-archetype overrides, because the three family strings above are not
 * actually per-archetype.
 *
 * `switch` covers TEN of the fourteen, so ten readers are told they are a
 * "Devotional switch — presence-guided". That is the Spiritual Lover's register:
 * the designer built one switch frame using them as the example and the family
 * map applies its wording to the other nine. For the Spark Seeker the same
 * chapter says the opposite kind of thing — "power works on you as play", and the
 * source document calls it a "freedom guided, playful switch orientation" — so
 * "devotional" and "presence-guided" read as another archetype's words.
 *
 * Only the Spark Seeker is overridden here, from the document's own phrasing. The
 * other nine `switch` archetypes still take the shared string and still need the
 * same pass; this map is where their labels go when someone does it.
 */
export const POWER_ZONE_OVERRIDES: Record<string, PowerZone> = {
  /*
   * "Playful switch - freedom-guided" was two pieces of jargon in five words:
   * "switch" is a term from kink vocabulary and "freedom-guided" explains nothing on
   * its own. The chapter does define leading and yielding, but in an expander, and
   * this is the card's first line. It now says what it means (2026-08-27).
   *
   * The plane's region label stays short, because it sits inside a chart where the
   * axes already read "yielding" and "leading".
   */
  "spark-seeker": {
    label: "Playful switch",
    result: "You lead and yield by turns, and it stays play",
  },
};

/**
 * Zone strings for a `families.power_zone` value. Unknown but non-empty values
 * fall back to the base (switch) rather than fabricating a position; absent
 * values return null so the caller can withhold the "You" highlight entirely.
 */
export function getPowerZone(zone: unknown, slug?: string | null): PowerZone | null {
  if (typeof zone !== "string" || !zone.trim()) return null;
  if (slug && POWER_ZONE_OVERRIDES[slug]) return POWER_ZONE_OVERRIDES[slug]!;
  return POWER_ZONES[zone] ?? POWER_ZONES.switch!;
}
