import { describe, expect, it } from "vitest";
import { scrambleLockedText } from "@features/report/server/scrambleLockedText";
import {
  buildTypicalBeliefs,
  REPORT_V4_TYPICAL_BELIEFS,
  TYPICAL_BELIEFS_CHALLENGES,
  TYPICAL_BELIEFS_CHALLENGES_FREE_BLOCKS,
  TYPICAL_BELIEFS_PRACTICE,
  TYPICAL_BELIEFS_PRACTICE_FREE_BLOCKS,
} from "@/data/report3-typical-beliefs";
import type { Report3Block } from "@/data/report3-learn-more";

/**
 * What a locked reader RECEIVES of the Typical Beliefs chapter — the security half
 * of 348:213. The frames blur the rest of the chapter at full length, and a CSS blur
 * is paint only, so everything that is only ever seen under the full blur leaves
 * the server scrambled (Fatih's call, 2026-09-23).
 */

const textOf = (block: Report3Block): string =>
  block.kind === "heading"
    ? block.text
    : block.kind === "para"
      ? block.runs.map((r) => r.text).join("")
      : block.items.map((runs) => runs.map((r) => r.text).join("")).join(" ");

const payload = (locked: boolean) =>
  JSON.stringify(buildTypicalBeliefs("Spark Seeker", { locked }));

describe("scrambleLockedText", () => {
  const sample =
    "“Being desired proves that I am still attractive and exciting.”\nNext line, 14-day!";

  it("keeps the length, every space, punctuation mark, quote and line break", () => {
    const out = scrambleLockedText(sample);
    expect(out).toHaveLength(sample.length);
    for (let i = 0; i < sample.length; i++) {
      const ch = sample[i]!;
      if (!/[A-Za-z0-9]/.test(ch)) expect(out[i]).toBe(ch);
    }
  });

  it("keeps case and never leaves a letter in place", () => {
    const out = scrambleLockedText(sample);
    for (let i = 0; i < sample.length; i++) {
      const ch = sample[i]!;
      if (/[a-z]/.test(ch)) expect(out[i]).toMatch(/[a-z]/);
      if (/[A-Z]/.test(ch)) expect(out[i]).toMatch(/[A-Z]/);
      if (/[A-Za-z0-9]/.test(ch)) expect(out[i]).not.toBe(ch);
    }
  });

  it("is deterministic, so a server render is stable", () => {
    expect(scrambleLockedText(sample)).toBe(scrambleLockedText(sample));
  });
});

describe("buildTypicalBeliefs — unlocked", () => {
  it("hands over every word, nothing split off", () => {
    const view = buildTypicalBeliefs("Spark Seeker")!;
    expect(view.lockedFrom).toBeNull();
    expect(view.challenges).toEqual({ free: TYPICAL_BELIEFS_CHALLENGES, ramp: null, rest: [] });
    expect(view.practice).toMatchObject({
      free: TYPICAL_BELIEFS_PRACTICE,
      ramp: null,
      rest: [],
      locked: false,
    });
    const panels = REPORT_V4_TYPICAL_BELIEFS["Spark Seeker"]!;
    expect(view.panels.sun).toEqual(panels.sun);
    expect(view.panels.turns.map((t) => t.shift)).toEqual(panels.turns.map((t) => t.shift));
  });
});

describe("buildTypicalBeliefs — locked", () => {
  const view = buildTypicalBeliefs("Spark Seeker", { locked: true })!;
  const panels = REPORT_V4_TYPICAL_BELIEFS["Spark Seeker"]!;

  it("splits Common challenges on the server: four clear, one ramp, the rest scrambled", () => {
    expect(view.challenges.free).toEqual(
      TYPICAL_BELIEFS_CHALLENGES.slice(0, TYPICAL_BELIEFS_CHALLENGES_FREE_BLOCKS)
    );
    expect(view.challenges.ramp).toEqual(
      TYPICAL_BELIEFS_CHALLENGES[TYPICAL_BELIEFS_CHALLENGES_FREE_BLOCKS]
    );
    const originals = TYPICAL_BELIEFS_CHALLENGES.slice(TYPICAL_BELIEFS_CHALLENGES_FREE_BLOCKS + 1);
    expect(view.challenges.rest).toHaveLength(originals.length);
    view.challenges.rest.forEach((block, i) => {
      const original = originals[i]!;
      expect(block.kind).toBe(original.kind);
      // Same shape — so the blurred block wraps like the real one — none of the words.
      expect(textOf(block)).toHaveLength(textOf(original).length);
      expect(textOf(block)).not.toBe(textOf(original));
      if (block.kind === "para" && original.kind === "para") {
        expect(block.runs.map((r) => [r.weight, r.italic, r.text.length])).toEqual(
          original.runs.map((r) => [r.weight, r.italic, r.text.length])
        );
      }
    });
  });

  it("splits the practice the same way: two clear, the third as the ramp, the rest scrambled", () => {
    expect(view.practice.locked).toBe(true);
    expect(view.practice.free).toEqual(
      TYPICAL_BELIEFS_PRACTICE.slice(0, TYPICAL_BELIEFS_PRACTICE_FREE_BLOCKS)
    );
    expect(view.practice.ramp).toEqual(
      TYPICAL_BELIEFS_PRACTICE[TYPICAL_BELIEFS_PRACTICE_FREE_BLOCKS]
    );
    expect(view.practice.rest).toHaveLength(TYPICAL_BELIEFS_PRACTICE.length - 3);
  });

  it("keeps rows 1-4 real, scrambles rows 5-10, and withholds every locked shift", () => {
    view.panels.turns.forEach((turn, i) => {
      expect(turn.shift).toBe(i < 3 ? panels.turns[i]!.shift : null);
      if (i <= 3) expect(turn.shadow).toBe(panels.turns[i]!.shadow);
      else {
        expect(turn.shadow).not.toBe(panels.turns[i]!.shadow);
        expect(turn.shadow).toHaveLength(panels.turns[i]!.shadow.length);
      }
    });
    view.panels.sun.forEach((belief, i) => {
      if (i <= 3) expect(belief).toBe(panels.sun[i]);
      else expect(belief).not.toBe(panels.sun[i]);
    });
  });

  it("puts no paid copy past the ramp anywhere in the payload", () => {
    const locked = payload(true);
    const unlocked = payload(false);
    const probes = [
      // Common challenges, after the ramp block.
      "That interpretation can influence behavior.",
      "When being wanted becomes evidence of worth",
      "The shadow appears when their absence takes on too much meaning.",
      // The practice, after its ramp paragraph.
      "Name the rule underneath it.",
      "Rewrite the belief without erasing the preference.",
      "stop treating its presence or absence as a verdict",
      // Panel rows 5-10 and the shifts of rows 4-10.
      "I need novelty to stay sexually interested.",
      "Being desired feels good, but it does not determine my worth or attractiveness.",
      "Safety and excitement can coexist, especially when we keep creating room",
      "Sex can stay alive when I treat excitement as something I can participate in",
    ];
    for (const probe of probes) {
      expect(unlocked, probe).toContain(probe);
      expect(locked, probe).not.toContain(probe);
    }
  });
});
