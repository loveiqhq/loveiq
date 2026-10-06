import { describe, expect, it } from "vitest";
import {
  gate,
  lockedBlurIsReal,
  scrambleBlock,
  splitRamp,
  veilBlock,
  veilText,
} from "@features/report/server/gatedCopy";
import { LOCKED_BLUR_COPY } from "@features/report/server/lockedBlurCopy";
import type { Report3Block } from "@/data/report3-learn-more";

/**
 * The paywall split every V4 chapter body shares (Typical Beliefs, Accelerator &
 * Brakes): clear blocks, one ramp block the blur fades in over, and a rest that is
 * only ever seen under the full blur.
 *
 * Review 26.09 — Mark: "This should always be the unlocked content but blurred";
 * Fatih: real paid content under a stronger blur. So by default what the blur covers
 * is the copy itself (lockedBlurCopy.ts). The decoy position is gatedCopyDecoy.test.
 */

const textOf = (block: Report3Block): string =>
  block.kind === "heading"
    ? block.text
    : block.kind === "para"
      ? block.runs.map((r) => r.text).join("")
      : block.items.map((runs) => runs.map((r) => r.text).join("")).join(" ");

const para = (...runs: { text: string; weight?: 700; italic?: true }[]): Report3Block => ({
  kind: "para",
  runs,
});

const BLOCKS: readonly Report3Block[] = [
  { kind: "heading", text: "Common challenges" },
  para({ text: "Consider something ordinary." }),
  para(
    { text: "One of the strongest accelerators is " },
    { text: "anticipation", weight: 700 },
    {
      text: ". In the right form, it builds. A message on Wednesday helps.",
    }
  ),
  para({ text: "But one of the brakes is " }, { text: "predictability.", italic: true }),
  { kind: "list", items: [[{ text: "First item" }], [{ text: "Second item" }]] },
];

describe("the switch (lockedBlurCopy.ts)", () => {
  it("sends the real copy under the blur — Fatih's call of 26.09", () => {
    expect(LOCKED_BLUR_COPY).toBe("real");
    expect(lockedBlurIsReal()).toBe(true);
  });

  it("veils nothing in real mode: the text and the block come back as written", () => {
    expect(veilText("Novelty and variation")).toBe("Novelty and variation");
    expect(veilBlock(BLOCKS[3]!)).toBe(BLOCKS[3]);
  });
});

describe("gate", () => {
  it("hands an unlocked reader everything, nothing split off", () => {
    expect(gate(BLOCKS, 2, false)).toEqual({ free: BLOCKS, ramp: null, rest: [] });
  });

  it("splits a locked passage into clear blocks, the ramp, and the rest as written", () => {
    const { free, ramp, rest } = gate(BLOCKS, 2, true);
    expect(free).toEqual(BLOCKS.slice(0, 2));
    expect(ramp).toEqual(BLOCKS[2]);
    expect(rest).toEqual(BLOCKS.slice(3));
  });
});

describe("scrambleBlock", () => {
  it("keeps every run's weight, italic and length", () => {
    const scrambled = scrambleBlock(BLOCKS[3]!);
    expect(scrambled.kind).toBe("para");
    if (scrambled.kind !== "para" || BLOCKS[3]!.kind !== "para") return;
    expect(scrambled.runs.map((r) => [r.weight, r.italic, r.text.length])).toEqual(
      BLOCKS[3]!.runs.map((r) => [r.weight, r.italic, r.text.length])
    );
  });
});

describe("splitRamp", () => {
  const ramp = BLOCKS[2]!;

  it("keeps the whole ramp real, the tail past the named sentence included", () => {
    const split = splitRamp(ramp, "it builds.");
    expect(textOf(split)).toBe(textOf(ramp));
  });

  it("splits a run at the cut into two runs of the same style", () => {
    const split = splitRamp(ramp, "it builds.");
    if (split.kind !== "para") throw new Error("expected a paragraph");
    expect(split.runs).toHaveLength(4);
    expect(split.runs.slice(0, 2)).toEqual(ramp.kind === "para" ? ramp.runs.slice(0, 2) : []);
    expect(split.runs[2]!.text).toBe(". In the right form, it builds.");
    expect(split.runs[3]!.text).toBe(" A message on Wednesday helps.");
    expect(split.runs[3]!.weight).toBeUndefined();
  });

  it("marks the tail veiled, so the page can end the fade where the full blur starts", () => {
    const split = splitRamp(ramp, "it builds.");
    if (split.kind !== "para") throw new Error("expected a paragraph");
    expect(split.runs.map((r) => r.veiled === true)).toEqual([false, false, false, true]);
  });

  it("leaves the block as it is when the sentence is not in it", () => {
    expect(splitRamp(ramp, "not in this paragraph")).toEqual(ramp);
  });

  it("leaves a heading or a list as it is", () => {
    expect(splitRamp(BLOCKS[0]!, "Common")).toEqual(BLOCKS[0]);
    expect(splitRamp(BLOCKS[4]!, "First")).toEqual(BLOCKS[4]);
  });
});
