import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";

import { renderDropoutBars } from "@/app/api/admin/digest-image/[kind]/route";

/**
 * Which drop-out bars get a number printed on them.
 *
 * Labels that would overlap are dropped — two 36px labels on two ~11px slots
 * render as a smudge. The question is WHICH one goes. It used to be decided
 * left-to-right, keeping the first, and that dropped the steepest bar whenever a
 * shallower one sat immediately to its left. That is not a corner case: elevated
 * drop-off on the question before a cliff is what a cliff looks like.
 *
 * Caught by rendering the chart and looking at it, not by a test — the tallest,
 * reddest bar, the one the summary line called the steepest, was the only one
 * with no number on it.
 */
/** The red 13px/700 value label drawn on a worst bar — and nothing else. */
const DANGER = "#b91c1c";

/**
 * Collect ONLY the bar value labels.
 *
 * A first version of this matched every `/^\d+(\.\d+)?%$/` string in the tree,
 * which also swept up the Y-AXIS TICKS. It passed only because `niceAxis` lands
 * ticks on multiples of 5 and the fixtures happened to use 24, 23 and 11: a
 * fixture value of 25 would have made `toContain("25%")` unfalsifiable and broken
 * the `toHaveLength(1)` count outright. Filtering on the value label's own style
 * — red, 13px, bold — is structural rather than coincidental.
 */
function valueLabelsIn(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const child of node) valueLabelsIn(child, out);
    return out;
  }
  if (!node || typeof node !== "object") return out;
  const props = ((node as ReactElement<Record<string, unknown>>).props ?? {}) as Record<
    string,
    unknown
  >;
  const style = (props.style ?? {}) as Record<string, unknown>;
  const isValueLabel =
    String(style.color).toLowerCase() === DANGER &&
    style.fontWeight === 700 &&
    style.fontSize === 13;
  if (isValueLabel && typeof props.children === "string") {
    out.push(props.children);
    return out;
  }
  if (props.children) valueLabelsIn(props.children, out);
  return out;
}

/** The value labels printed on the plot, e.g. ["24%", "11%"]. */
function barLabels(bars: Array<{ label: string; dropPct: number }>): string[] {
  const { element } = renderDropoutBars({ kind: "dropout-funnel", bars, windowLabel: "30 days" });
  return valueLabelsIn(element);
}

describe("digest-image: drop-out bar labels", () => {
  it("collects bar labels only — not the y-axis ticks", () => {
    /**
     * The guard on the guard. Every bar here is 7%, so the only worst-bar label is
     * "7%" — but the y-axis certainly carries ticks like 5% and 10%. If those leak
     * in, every assertion in this file becomes satisfiable by the axis alone.
     */
    const bars = Array.from({ length: 22 }, (_, i) => ({ label: `Q${i + 1}`, dropPct: 7 }));
    const labels = barLabels(bars);
    expect(
      labels.every((l) => l === "7%"),
      `axis ticks leaked in: ${labels.join(",")}`
    ).toBe(true);
    expect(labels.length).toBeGreaterThan(0);
  });

  it("keeps the steepest bar's number when a shallower neighbour collides", () => {
    // 22 bars over an 800px plot is ~31px a slot; a label needs ~38px, so direct
    // neighbours always collide. Q5 is the cliff, Q4 the elevated question before it.
    const bars = Array.from({ length: 22 }, (_, i) => ({
      label: `Q${i + 1}`,
      dropPct: i === 4 ? 24 : i === 3 ? 11 : i === 16 ? 11 : 4,
    }));
    const labels = barLabels(bars);
    // The assertion that was false before the fix.
    expect(labels).toContain("24%");
    // And the neighbour it beat is the one that went.
    expect(labels.filter((l) => l === "11%")).toHaveLength(1);
  });

  it("still drops a colliding label rather than smudging two together", () => {
    // Without this the test above passes on a renderer that labels everything.
    const bars = Array.from({ length: 22 }, (_, i) => ({
      label: `Q${i + 1}`,
      dropPct: i === 4 ? 24 : i === 3 ? 23 : 4,
    }));
    const labels = barLabels(bars);
    expect(labels).toContain("24%");
    expect(labels).not.toContain("23%");
  });

  it("labels both when they are far enough apart to fit", () => {
    // The guard is a collision rule, not a one-label rule.
    const bars = Array.from({ length: 22 }, (_, i) => ({
      label: `Q${i + 1}`,
      dropPct: i === 2 ? 24 : i === 18 ? 23 : 4,
    }));
    const labels = barLabels(bars);
    expect(labels).toContain("24%");
    expect(labels).toContain("23%");
  });
});
