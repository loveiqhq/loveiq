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
 * Zone strings for a `families.power_zone` value. Unknown but non-empty values
 * fall back to the base (switch) rather than fabricating a position; absent
 * values return null so the caller can withhold the "You" highlight entirely.
 */
export function getPowerZone(zone: unknown): PowerZone | null {
  if (typeof zone !== "string" || !zone.trim()) return null;
  return POWER_ZONES[zone] ?? POWER_ZONES.switch!;
}
