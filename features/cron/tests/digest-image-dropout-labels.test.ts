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
function textIn(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const child of node) textIn(child, out);
    return out;
  }
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (!node || typeof node !== "object") return out;
  const props = ((node as ReactElement<Record<string, unknown>>).props ?? {}) as Record<
    string,
    unknown
  >;
  if (props.children) textIn(props.children, out);
  return out;
}

/** The value labels printed on the plot, e.g. ["24%", "11%"]. */
function barLabels(bars: Array<{ label: string; dropPct: number }>): string[] {
  const { element } = renderDropoutBars({ kind: "dropout-funnel", bars, windowLabel: "30 days" });
  const summaryMarker = "Steepest drop-offs:";
  const all = textIn(element);
  // Everything before the summary line is plot furniture; the summary names every
  // worst bar anyway, so counting it would make this test unable to fail.
  const cut = all.findIndex((t) => t.includes(summaryMarker));
  return (cut === -1 ? all : all.slice(0, cut)).filter((t) => /^\d+(\.\d+)?%$/.test(t));
}

describe("digest-image: drop-out bar labels", () => {
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
