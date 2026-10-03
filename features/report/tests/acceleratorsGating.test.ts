import { describe, expect, it, vi } from "vitest";
import {
  ACCELERATORS_CHALLENGES_FREE_BLOCKS,
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
 * (Fatih's rule, 2026-09-23). The practice's ramp paragraph stays real only through
 * its fade band (splitRamp); Common challenges' fades in over the whole paragraph
 * (314:284, 29.09), so it is sent as written.
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

  it("carries the intro, no lead lines, seven challenge paragraphs and seven practice paragraphs", () => {
    expect(SPARK.intro).toHaveLength(5);
    // Figma's two lead lines (311:411, 311:413) are not in Sanjin's doc, and no text sits
    // before or between the lists (Sanjin, 02.10; Fatih: "Remove, as the doc").
    expect(SPARK.brakesLead).toBeUndefined();
    expect(SPARK.acceleratorsLead).toBeUndefined();
    expect(SPARK.challengesTitle).toBe("Common Challenges");
    expect(SPARK.challenges).toHaveLength(7);
    expect(SPARK.practice).toHaveLength(7);
    expect(SPARK.practiceEyebrow).toBe("Practice time: ~12 min.");
    expect(SPARK.practiceTitle).toBe("Try This & See What Shifts");
  });

  it("keeps the frame's double space in the intro, where a browser would collapse it", () => {
    // 310:231 sets "depending on  how it is interpreted  at that moment" with two
    // spaces either side; a no-break space keeps the second one from collapsing.
    expect(textOf(SPARK.intro[2]!)).toContain("depending on \u00a0how it is interpreted \u00a0at");
  });

  it("gives the closed practice card its own teaser: the first paragraph, re-broken as 377:221", () => {
    expect(SPARK.practiceTeaser).toHaveLength(1);
    const teaser = textOf(SPARK.practiceTeaser[0]!);
    // 377:242 breaks after the lead with one line separator, no blank line.
    expect(teaser.startsWith("Notice the moment the state changes. \nInstead of judging")).toBe(
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
    // A name no copy knows, so this holds however many archetypes are written (data/report3-copy).
    expect(buildAccelerators("Not An Archetype")).toBeNull();
    expect(buildAccelerators("Not An Archetype", { locked: true })).toBeNull();
  });
});

describe("buildAccelerators — locked", () => {
  const view = buildAccelerators("Spark Seeker", { locked: true })!;

  // Row 3 ramps into the blur, sharp at its top (386:416 / 386:444), so it stays real
  // in the decoy position too — as Typical Beliefs' ramp row does. A stand-in there
  // would show its made-up label nearly sharp (final review 26.09).
  it("keeps rows 1-2 of each card real, the ramp row 3 real, and scrambles rows 4-5", () => {
    expect(ACCELERATORS_FREE_ROWS).toBe(2);
    expect(view.lockedFrom).toBe(2);
    for (const [shown, authored] of [
      [view.brakes, SPARK.brakes],
      [view.accelerators, SPARK.accelerators],
    ] as const) {
      shown.forEach((row, i) => {
        const original = authored[i]!;
        if (i <= 2) {
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

  // 314:284 (29.09) fades the blur in over the whole first gated paragraph, sharp at
  // its top, so all of it is seen through the fade and none of it only under the full
  // blur: it stays real in the decoy position too, as Typical Beliefs' ramp does. A
  // stand-in there would show its made-up words through the fade's light end.
  it("sends the challenges ramp as written: the fade runs over the whole paragraph", () => {
    expect(view.challenges.ramp).toEqual(SPARK.challenges[1]);
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
      // Rows 4-5 of both cards. Row 3 is the ramp, sent as written (see above).
      "Low-energy, passive encounters",
      "Criticism, shame or judgment",
      "Confident signals of desire",
      "Spontaneity and controlled unpredictability",
      // Common challenges past its ramp paragraph, which is sent as written (above).
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
