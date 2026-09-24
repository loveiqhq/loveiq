import { describe, expect, it } from "vitest";
import { gate, scrambleBlock, splitRamp } from "@features/report/server/gatedCopy";
import type { Report3Block } from "@/data/report3-learn-more";

/**
 * The paywall split every V4 chapter body shares (Typical Beliefs, Accelerator &
 * Brakes): clear blocks, one ramp block the blur fades in over, and a rest that is
 * only ever seen under the full blur — so it leaves the server scrambled.
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

describe("gate", () => {
  it("hands an unlocked reader everything, nothing split off", () => {
    expect(gate(BLOCKS, 2, false)).toEqual({ free: BLOCKS, ramp: null, rest: [] });
  });

  it("splits a locked passage into clear blocks, the ramp, and a scrambled rest", () => {
    const { free, ramp, rest } = gate(BLOCKS, 2, true);
    expect(free).toEqual(BLOCKS.slice(0, 2));
    expect(ramp).toEqual(BLOCKS[2]);
    expect(rest).toHaveLength(2);
    rest.forEach((block, i) => {
      const original = BLOCKS[3 + i]!;
      expect(block.kind).toBe(original.kind);
      expect(textOf(block)).toHaveLength(textOf(original).length);
      expect(textOf(block)).not.toBe(textOf(original));
    });
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

  it("keeps the ramp real through the named sentence and scrambles the rest of it", () => {
    const split = splitRamp(ramp, "it builds.");
    const full = textOf(ramp);
    const cut = full.indexOf("it builds.") + "it builds.".length;
    expect(textOf(split)).toHaveLength(full.length);
    expect(textOf(split).slice(0, cut)).toBe(full.slice(0, cut));
    expect(textOf(split).slice(cut)).not.toBe(full.slice(cut));
    // The tail keeps its spaces and punctuation, so it still wraps like the real copy.
    expect(
      textOf(split)
        .slice(cut)
        .replace(/[A-Za-z0-9]/g, "")
    ).toBe(full.slice(cut).replace(/[A-Za-z0-9]/g, ""));
  });

  it("splits a run at the cut into two runs of the same style", () => {
    const split = splitRamp(ramp, "it builds.");
    if (split.kind !== "para") throw new Error("expected a paragraph");
    expect(split.runs).toHaveLength(4);
    expect(split.runs.slice(0, 2)).toEqual(ramp.kind === "para" ? ramp.runs.slice(0, 2) : []);
    expect(split.runs[2]!.text).toBe(". In the right form, it builds.");
    expect(split.runs[3]!.text).toHaveLength(" A message on Wednesday helps.".length);
    expect(split.runs[3]!.weight).toBeUndefined();
  });

  it("leaves the block as it is when the sentence is not in it", () => {
    expect(splitRamp(ramp, "not in this paragraph")).toEqual(ramp);
  });

  it("leaves a heading or a list as it is", () => {
    expect(splitRamp(BLOCKS[0]!, "Common")).toEqual(BLOCKS[0]);
    expect(splitRamp(BLOCKS[4]!, "First")).toEqual(BLOCKS[4]);
  });
});
