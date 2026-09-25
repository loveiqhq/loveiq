import { describe, expect, it } from "vitest";
import { DECOY_WORDS, scrambleLockedText } from "@features/report/server/scrambleLockedText";

/**
 * Review 25.09, item 14 — Sanjin: the blurred text "reads as gibberish". Where a ramp's
 * blur is still light, the letter scramble showed through ("Zvftak mnarbct"). Fatih's
 * call: real-word decoys. Each word becomes a plain word of the same length, with the
 * original's capitals and no letter where it had the same one; digits are scrambled as
 * before. What shows through then reads as words, and still says nothing of the copy.
 * The shape contracts (length, punctuation, case, nothing left in place, determinism)
 * are pinned in typicalBeliefsGating.test.ts and hold unchanged.
 */

const SAMPLE =
  "Being desired proves that I am still attractive and exciting. Novelty keeps the " +
  "pattern alive, and routine can quietly drain it; a 14-day pause often resets what " +
  "felt flat, because anticipation does much of the work.";
const words = (s: string) => s.match(/[A-Za-z]+/g) ?? [];

/** The scrambler's width classes: narrow, medium and wide letters. */
const width = (s: string) =>
  [...s].reduce((sum, ch) => {
    if (/[fijlrtIJ]/.test(ch)) return sum + 0.3;
    if (/[mwMW]/.test(ch)) return sum + 0.85;
    if (/[a-z]/.test(ch)) return sum + 0.56;
    if (/[A-Z]/.test(ch)) return sum + 0.68;
    return sum + 0.28;
  }, 0);

describe("scrambleLockedText — real-word decoys", () => {
  it("swaps every word of two letters or more for a listed word of the same length", () => {
    const out = scrambleLockedText(SAMPLE);
    const before = words(SAMPLE);
    const after = words(out);
    expect(after).toHaveLength(before.length);
    after.forEach((word, i) => {
      expect(word).toHaveLength(before[i]!.length);
      if (word.length >= 2) expect(DECOY_WORDS.has(word.toLowerCase()), word).toBe(true);
    });
  });

  it("carries the capitals over and leaves no letter or digit where it was", () => {
    const out = scrambleLockedText(SAMPLE);
    expect(out).toHaveLength(SAMPLE.length);
    for (let i = 0; i < SAMPLE.length; i++) {
      const ch = SAMPLE[i]!;
      if (/[a-z]/.test(ch)) expect(out[i]).toMatch(/[a-z]/);
      if (/[A-Z]/.test(ch)) expect(out[i]).toMatch(/[A-Z]/);
      if (/[0-9]/.test(ch)) expect(out[i]).toMatch(/[0-9]/);
      if (/[A-Za-z0-9]/.test(ch)) expect(out[i]).not.toBe(ch);
      else expect(out[i]).toBe(ch);
    }
  });

  it("never reaches for a charged word — decoys sit next to each other on the page", () => {
    for (const word of [
      "sex",
      "sexy",
      "love",
      "lust",
      "body",
      "kiss",
      "touch",
      "naked",
      "nude",
      "bed",
      "desire",
      "erotic",
      "fetish",
      "kink",
      "lover",
      "breast",
      "hot",
      "wet",
      "hard",
      "moan",
      "lick",
      "suck",
      "spank",
      "whip",
      "chain",
      "rope",
      "tie",
      "slave",
      "master",
      "toy",
      "sub",
      "top",
      "bottom",
      "spy",
      "spark",
      "secret",
      "hidden",
      "kill",
      "dead",
      "gun",
      "war",
      "hate",
      "drug",
      "drunk",
      "blood",
      "pain",
      "skin",
      "lips",
      "hand",
      // the second pass: double meanings, watching, minors, power, pronouns, chapters
      "bond",
      "strip",
      "ride",
      "mount",
      "rubber",
      "cream",
      "position",
      "enter",
      "inside",
      "open",
      "swap",
      "swing",
      "watch",
      "camera",
      "video",
      "window",
      "audience",
      "public",
      "caught",
      "school",
      "young",
      "family",
      "kitten",
      "puppy",
      "submit",
      "control",
      "power",
      "switch",
      "collar",
      "paddle",
      "leather",
      "you",
      "we",
      "someone",
      "style",
      "level",
      "energy",
      "reward",
      "dream",
      "imagine",
      "play",
      "game",
    ]) {
      expect(DECOY_WORDS.has(word), word).toBe(false);
    }
    for (const word of DECOY_WORDS) expect(word).toMatch(/^[a-z]{2,}$/);
  });

  it("keeps a paragraph's width within 4% of the original's, so lines break alike", () => {
    const out = scrambleLockedText(SAMPLE);
    expect(Math.abs(width(out) - width(SAMPLE)) / width(SAMPLE)).toBeLessThan(0.04);
  });

  it("falls back to the letter scramble for a word no decoy fits", () => {
    const long = "Incomprehensibilities";
    const out = scrambleLockedText(long);
    expect(out).toHaveLength(long.length);
    expect(out).toMatch(/^[A-Z][a-z]+$/);
    expect(DECOY_WORDS.has(out.toLowerCase())).toBe(false);
    for (let i = 0; i < long.length; i++) expect(out[i]).not.toBe(long[i]);
  });

  it("is deterministic, word choices included", () => {
    expect(scrambleLockedText(SAMPLE)).toBe(scrambleLockedText(SAMPLE));
  });
});
