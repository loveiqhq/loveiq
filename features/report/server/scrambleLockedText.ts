/**
 * Length- and shape-preserving scramble for copy a locked reader only ever sees
 * under a full blur.
 *
 * WHY. The paywalled Typical Beliefs frames (348:221, 381:222, 381:362, 374:258)
 * draw the rest of the chapter blurred at full length rather than cut off, so the
 * page needs text of the right shape in those places. A CSS blur is paint and
 * nothing more — the words stay in the DOM and in the API response — so sending
 * the real copy there would publish it. Scrambled copy of the same shape looks
 * identical under a 2.5px blur and gives nothing away.
 *
 * WHAT IS KEPT. Every character that is not a letter or a digit passes through
 * untouched — spaces, punctuation, curly quotes, line breaks — and each letter is
 * swapped for another of the same case and roughly the same advance width
 * (narrow for narrow, wide for wide). Word lengths and the texture of the blurred
 * block therefore match the real copy, and line breaks mostly do. A class is not a
 * glyph width, so a block that only just wraps can come out a line shorter: at
 * 393px, three of the ten scrambled blocks in Common challenges do, and the locked
 * chapter runs 70px shorter than the unlocked one.
 *
 * DETERMINISTIC. Seeded from the text itself, so a given string always scrambles
 * the same way: server renders stay stable, and identical inputs cannot be
 * averaged against each other to recover anything.
 *
 * ZERO IMPORTS, deliberately. It is called from the paid-copy data modules, and
 * anything it imported would be dragged in wherever they are.
 */

/** Every character from `from` to `to`, inclusive. */
const span = (from: string, to: string): string =>
  Array.from({ length: to.charCodeAt(0) - from.charCodeAt(0) + 1 }, (_, i) =>
    String.fromCharCode(from.charCodeAt(0) + i)
  ).join("");

const without = (all: string, ...drop: string[]): string =>
  [...all].filter((ch) => !drop.some((d) => d.includes(ch))).join("");

/** Width classes, by typical advance in Plus Jakarta Sans and Lora. */
const LOWER_NARROW = "fijlrt";
const LOWER_WIDE = "mw";
const LOWER_MEDIUM = without(span("a", "z"), LOWER_NARROW, LOWER_WIDE);
const UPPER_NARROW = "IJ";
const UPPER_WIDE = "MW";
const UPPER_MEDIUM = without(span("A", "Z"), UPPER_NARROW, UPPER_WIDE);
const DIGITS = span("0", "9");

const classFor = (ch: string): string | null => {
  if (LOWER_NARROW.includes(ch)) return LOWER_NARROW;
  if (LOWER_WIDE.includes(ch)) return LOWER_WIDE;
  if (LOWER_MEDIUM.includes(ch)) return LOWER_MEDIUM;
  if (UPPER_NARROW.includes(ch)) return UPPER_NARROW;
  if (UPPER_WIDE.includes(ch)) return UPPER_WIDE;
  if (UPPER_MEDIUM.includes(ch)) return UPPER_MEDIUM;
  if (DIGITS.includes(ch)) return DIGITS;
  return null;
};

/** FNV-1a — a stable 32-bit seed from the string. */
const seedFrom = (text: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/** mulberry32 — small, fast and good enough for texture. */
const prng = (seed: number) => {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export function scrambleLockedText(text: string): string {
  const next = prng(seedFrom(text));
  let out = "";
  for (const ch of text) {
    const pool = classFor(ch);
    if (!pool) {
      out += ch;
      continue;
    }
    // Never hand back the original letter: a scramble that leaves some letters in
    // place leaks short words through.
    let pick = ch;
    for (let tries = 0; pick === ch && tries < 4; tries++) {
      pick = pool.charAt(Math.floor(next() * pool.length));
    }
    out += pick === ch ? pool.charAt((pool.indexOf(ch) + 1) % pool.length) : pick;
  }
  return out;
}
