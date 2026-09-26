import { describe, expect, it, vi } from "vitest";
import {
  ACCELERATORS_CHALLENGES_FREE_BLOCKS,
  ACCELERATORS_CHALLENGES_RAMP_THROUGH,
  ACCELERATORS_FREE_ROWS,
  ACCELERATORS_PRACTICE_FREE_BLOCKS,
  ACCELERATORS_PRACTICE_RAMP_THROUGH,
  buildAccelerators,
  REPORT_V4_ACCELERATORS,
} from "@/data/report3-accelerators";
import type { Report3Block } from "@/data/report3-learn-more";

// These tests pin the switch's decoy position (lockedBlurCopy.ts): what the chapter
// sends a locked reader when nothing paid rides under the blur. The default since
// review 26.09 is the real copy — see lockedBlurCopy2609.test.ts.
vi.mock("@features/report/server/lockedBlurCopy", () => ({ LOCKED_BLUR_COPY: "decoy" }));

/**
 * What a reader RECEIVES of the Accelerator & Brakes chapter (Figma 334:521 open,
 * 314:211 paywalled). The paywalled frame blurs rows 3-5 of both cards and most of
 * "Common challenges" and the practice at full length; a CSS blur is paint only,
 * so everything only ever seen under the full blur leaves the server scrambled
 * (Fatih's rule, 2026-09-23). The ramp paragraphs stay real only through the fade
 * band (splitRamp).
 */

const textOf = (block: Report3Block): string =>
  block.kind === "heading"
    ? block.text
    : block.kind === "para"
      ? block.runs.map((r) => r.text).join("")
      : block.items.map((runs) => runs.map((r) => r.text).join("")).join(" ");

const SPARK = REPORT_V4_ACCELERATORS["Spark Seeker"]!;
const payload = (locked: boolean) => JSON.stringify(buildAccelerators("Spark Seeker", { locked }));

describe("the authored copy (read off 310:229 / 374:304 / 377:221)", () => {
  // The scales went on 25.09 (Mark, 1942039325), and their fills with them.
  it("has five rows per card, each a label and a line", () => {
    expect(SPARK.brakes.map((r) => r.label)).toEqual([
      "Sex that feels predictable or obligatory",
      "Emotional heaviness during erotic moments",
      "Control and possessiveness",
      "Low-energy, passive encounters",
      "Criticism, shame or judgment",
    ]);
    expect(SPARK.accelerators.map((r) => r.label)).toEqual([
      "Teasing and playful challenge",
      "Pursuit and being pursued",
      "Novelty and variation",
      "Confident signals of desire",
      "Spontaneity and controlled unpredictability",
    ]);
    for (const row of [...SPARK.brakes, ...SPARK.accelerators]) {
      expect(Object.keys(row).sort()).toEqual(["label", "subtext"]);
    }
  });

  it("carries the intro, both leads, seven challenge paragraphs and seven practice paragraphs", () => {
    expect(SPARK.intro).toHaveLength(5);
    expect(SPARK.brakesLead).toBe(
      "For many Spark Seekers, the brakes may sound something like this"
    );
    expect(SPARK.acceleratorsLead.trim()).toBe("The accelerators might be just as recognizable:");
    expect(SPARK.challengesTitle).toBe("Common challenges");
    expect(SPARK.challenges).toHaveLength(7);
    expect(SPARK.practice).toHaveLength(7);
    expect(SPARK.practiceEyebrow).toBe("Practice time: ~12 min.");
    expect(SPARK.practiceTitle).toBe("Try this & see what shifts");
  });

  it("keeps the frame's double space in the intro, where a browser would collapse it", () => {
    // 310:231 sets "depending on  how it is interpreted  at that moment" with two
    // spaces either side; a no-break space keeps the second one from collapsing.
    expect(textOf(SPARK.intro[2]!)).toContain("depending on \u00a0how it is interpreted \u00a0at");
  });

  it("gives the closed practice card its own teaser: the first paragraph, re-broken as 377:221", () => {
    expect(SPARK.practiceTeaser).toHaveLength(1);
    const teaser = textOf(SPARK.practiceTeaser[0]!);
    expect(teaser.startsWith("Notice the moment the state changes. \n\nInstead of judging")).toBe(
      true
    );
    expect(teaser).toContain("immediately beforehand? \nA playful message");
    // The same words as the open card's first paragraph, broken differently.
    expect(teaser.replace(/\s+/g, " ")).toBe(textOf(SPARK.practice[0]!).replace(/\s+/g, " "));
  });
});

describe("buildAccelerators — unlocked", () => {
  const view = buildAccelerators("Spark Seeker")!;

  it("hands over every word, nothing split off", () => {
    expect(view.lockedFrom).toBeNull();
    expect(view.brakes).toEqual(SPARK.brakes);
    expect(view.accelerators).toEqual(SPARK.accelerators);
    expect(view.challenges).toEqual({ free: SPARK.challenges, ramp: null, rest: [] });
    expect(view.practice).toMatchObject({
      free: SPARK.practice,
      ramp: null,
      rest: [],
      locked: false,
      teaser: SPARK.practiceTeaser,
    });
  });

  it("is null for an archetype nobody has written yet, so the V2 section stays", () => {
    expect(buildAccelerators("Explorer of Edges")).toBeNull();
  });
});

describe("buildAccelerators — locked", () => {
  const view = buildAccelerators("Spark Seeker", { locked: true })!;

  it("keeps rows 1-2 of each card real and scrambles rows 3-5", () => {
    expect(ACCELERATORS_FREE_ROWS).toBe(2);
    expect(view.lockedFrom).toBe(2);
    for (const [shown, authored] of [
      [view.brakes, SPARK.brakes],
      [view.accelerators, SPARK.accelerators],
    ] as const) {
      shown.forEach((row, i) => {
        const original = authored[i]!;
        if (i < 2) {
          expect(row).toEqual(original);
        } else {
          expect(row.label).not.toBe(original.label);
          expect(row.label).toHaveLength(original.label.length);
          expect(row.subtext).not.toBe(original.subtext);
          expect(row.subtext).toHaveLength(original.subtext.length);
        }
      });
    }
  });

  it("splits Common challenges after its first paragraph (Mark, 22 Sep: the paywall goes right there)", () => {
    expect(ACCELERATORS_CHALLENGES_FREE_BLOCKS).toBe(1);
    expect(view.challenges.free).toEqual(SPARK.challenges.slice(0, 1));
    expect(view.challenges.rest).toHaveLength(SPARK.challenges.length - 2);
    view.challenges.rest.forEach((block, i) => {
      const original = SPARK.challenges[i + 2]!;
      expect(textOf(block)).toHaveLength(textOf(original).length);
      expect(textOf(block)).not.toBe(textOf(original));
    });
  });

  it("keeps the challenges ramp real only through its fade band", () => {
    const ramp = textOf(view.challenges.ramp!);
    const authored = textOf(SPARK.challenges[1]!);
    const cut = authored.indexOf(ACCELERATORS_CHALLENGES_RAMP_THROUGH);
    expect(cut).toBeGreaterThan(0);
    const end = cut + ACCELERATORS_CHALLENGES_RAMP_THROUGH.length;
    expect(ramp.slice(0, end)).toBe(authored.slice(0, end));
    expect(ramp.slice(end)).not.toBe(authored.slice(end));
    expect(ramp).toHaveLength(authored.length);
  });

  it("splits the practice the same way: one clear paragraph, the ramp, the rest scrambled", () => {
    expect(ACCELERATORS_PRACTICE_FREE_BLOCKS).toBe(1);
    expect(view.practice.locked).toBe(true);
    expect(view.practice.free).toEqual(SPARK.practice.slice(0, 1));
    const ramp = textOf(view.practice.ramp!);
    const authored = textOf(SPARK.practice[1]!);
    const end =
      authored.indexOf(ACCELERATORS_PRACTICE_RAMP_THROUGH) +
      ACCELERATORS_PRACTICE_RAMP_THROUGH.length;
    expect(end).toBeGreaterThan(ACCELERATORS_PRACTICE_RAMP_THROUGH.length);
    expect(ramp.slice(0, end)).toBe(authored.slice(0, end));
    expect(ramp.slice(end)).not.toBe(authored.slice(end));
    expect(view.practice.rest).toHaveLength(SPARK.practice.length - 2);
  });

  it("shows a locked reader the same closed teaser as everyone — it is free copy", () => {
    expect(view.practice.teaser).toEqual(SPARK.practiceTeaser);
  });

  it("puts no paid copy past the wall anywhere in the payload", () => {
    const locked = payload(true);
    const unlocked = payload(false);
    const probes = [
      // Rows 3-5 of both cards.
      "Control and possessiveness",
      "Feeling monitored, restricted or managed",
      "Low-energy, passive encounters",
      "Criticism, shame or judgment",
      "Novelty and variation",
      "Confident signals of desire",
      "Spontaneity and controlled unpredictability",
      // Common challenges past the fade band.
      "A suggestive message on Wednesday",
      "Wait until Friday",
      "common brakes is sex that feels predictable",
      "The meaning attached to the plan changed which system became louder.",
      "require any effort",
      "too much predictability",
      "what makes excitement accessible",
      // The practice past its fade band.
      "Sometimes the solution is to add an accelerator.",
      "Respect brakes that are protecting something real.",
      "Experiment with conditions, not just intensity.",
      "focused attention, freedom, play",
      "sustainable spark comes from learning",
    ];
    for (const probe of probes) {
      expect(unlocked, probe).toContain(probe);
      expect(locked, probe).not.toContain(probe);
    }
  });
});
