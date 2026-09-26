import { describe, expect, it, vi } from "vitest";
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

/** Every string the locked chapters send through the scrambler, as it comes out. */
const emitted = vi.hoisted(() => [] as string[]);
// These tests pin the switch's decoy position (lockedBlurCopy.ts): what the chapter
// sends a locked reader when nothing paid rides under the blur. The default since
// review 26.09 is the real copy — see lockedBlurCopy2609.test.ts.
vi.mock("@features/report/server/lockedBlurCopy", () => ({ LOCKED_BLUR_COPY: "decoy" }));
vi.mock("@features/report/server/scrambleLockedText", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@features/report/server/scrambleLockedText")>();
  return {
    ...actual,
    scrambleLockedText: (text: string) => {
      const out = actual.scrambleLockedText(text);
      emitted.push(out);
      return out;
    },
  };
});

/**
 * Words a decoy must never be. Decoys land side by side, readable through the DOM,
 * Reader mode, copy or translate, so a chance run must never read as a sentence about
 * the reader. The final review (25.09) found the second group still in the list.
 */
const DENY = new Set([
  // bodies, desire, harm — the first pass
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
  // minors, school and age
  "sixteen",
  "pupil",
  "legal",
  "age",
  "old",
  "foster",
  "ward",
  "scout",
  "chicken",
  "minor",
  "cradle",
  "crayon",
  "adopt",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "year",
  "class",
  "grade",
  "lesson",
  "homework",
  "campus",
  "college",
  "university",
  "universities",
  // sexual double meanings
  "plug",
  "peg",
  "load",
  "seed",
  "box",
  "slot",
  "nail",
  "rack",
  "tip",
  "tap",
  "eaten",
  "eating",
  "glory",
  "tripod",
  "probe",
  "inch",
  "horn",
  "rim",
  "raw",
  "bush",
  "tail",
  "wand",
  "pork",
  "plow",
  "root",
  "sack",
  "pearl",
  "spray",
  "drill",
  "mound",
  "canal",
  "colon",
  "helmet",
  "golden",
  "ebony",
  "solo",
  "trio",
  "casual",
  "length",
  "size",
  "tiny",
  "little",
  "finish",
  "rabbit",
  "ball",
  "pipe",
  "hammer",
  "jug",
  "cake",
  "loose",
  "easy",
  "fast",
  "long",
  "wide",
  "huge",
  "big",
  "giant",
  "massive",
  "enormous",
  "small",
  "swallow",
  "fluid",
  "liquid",
  "flood",
  "jewel",
  "twin",
  "group",
  "spa",
  "fur",
  "vinyl",
  "crop",
  "clip",
  "ring",
  "hood",
  // power, bdsm, sex work and role play
  "cane",
  "clamp",
  "alpha",
  "behave",
  "client",
  "worker",
  "trick",
  "cruise",
  "train",
  "customer",
  "service",
  "services",
  "firefighter",
  "secretary",
  "plumber",
  "cheerleader",
  "court",
  "judge",
  "judgment",
  "witness",
  // drugs and alcohol
  "pot",
  "joint",
  "weed",
  "high",
  "trip",
  "grass",
  "powder",
  "crystal",
  "needle",
  "brewery",
  "mushroom",
  "herb",
  "herbal",
  // animal slang
  "bear",
  "otter",
  "wolf",
  "monkey",
  "donkey",
  "mule",
  "camel",
  "oyster",
  "crab",
  "kennel",
  "carrot",
  // report, paywall and chapter words
  "premium",
  "chapter",
  "access",
  "essence",
  "unlock",
  "report",
  "insight",
  "article",
  "practice",
  "exercise",
  // archetype-name words
  "analytical",
  "sexualist",
  "authority",
  "conductor",
  "curious",
  "apprentice",
  "emotional",
  "voyeur",
  "loyal",
  "ritualist",
  "minimalist",
  "companion",
  "quiet",
  "withdrawer",
  "radiant",
  "performer",
  "relational",
  "nurturer",
  "sensual",
  "connector",
  "spark",
  "seeker",
  "spiritual",
  "lover",
  "tender",
  "devotee",
  "explorer",
  "edges",
]);

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

  it("never lists a denied word — decoys sit next to each other on the page", () => {
    expect([...DENY].filter((word) => DECOY_WORDS.has(word))).toEqual([]);
    for (const word of DECOY_WORDS) expect(word).toMatch(/^[a-z]{2,}$/);
  });

  it("emits no denied word and no age phrase from any locked chapter, for every archetype with V4 copy", async () => {
    const tb = await import("@/data/report3-typical-beliefs");
    const ab = await import("@/data/report3-accelerators");
    const cip = await import("@/data/report3-partnership");
    const fvr = await import("@/data/report3-fantasy");
    emitted.length = 0;
    for (const name of Object.keys(tb.REPORT_V4_TYPICAL_BELIEFS)) {
      tb.buildTypicalBeliefs(name, { locked: true });
    }
    for (const name of Object.keys(ab.REPORT_V4_ACCELERATORS)) {
      ab.buildAccelerators(name, { locked: true });
    }
    for (const name of Object.keys(cip.REPORT_V4_PARTNERSHIP)) {
      cip.buildPartnership(name, { locked: true });
    }
    for (const name of Object.keys(fvr.REPORT_V4_FANTASY)) {
      fvr.buildFantasy(name, { locked: true });
    }
    const out = emitted.join(" ");
    const all = words(out).map((word) => word.toLowerCase());
    expect(all.length).toBeGreaterThan(1000);
    expect([...new Set(all.filter((word) => DENY.has(word)))]).toEqual([]);
    expect(out).not.toMatch(
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\W+(years?|old|age)\b/i
    );
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
