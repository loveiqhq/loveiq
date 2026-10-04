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

/**
 * The "Steepest drop-offs: …" summary line under the plot.
 *
 * Matched on its own style (danger red, 15px, bold) rather than on the word
 * "Steepest", so a change to the wording does not silently make this find
 * nothing and pass.
 */
function summaryIn(node: unknown): string | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = summaryIn(child);
      if (hit) return hit;
    }
    return null;
  }
  if (!node || typeof node !== "object") return null;
  const props = ((node as ReactElement<Record<string, unknown>>).props ?? {}) as Record<
    string,
    unknown
  >;
  const style = (props.style ?? {}) as Record<string, unknown>;
  if (
    String(style.color).toLowerCase() === DANGER &&
    style.fontWeight === 700 &&
    style.fontSize === 15 &&
    typeof props.children === "string"
  ) {
    return props.children;
  }
  return props.children ? summaryIn(props.children) : null;
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

/**
 * The summary ranks on the numbers it is GIVEN, so the producer's rounding
 * decides which question it names.
 *
 * The producer used to send Math.round(dropPct). On the 30 days to 2026-09-18
 * that turned Q56 (5.1%), Q3 (4.9%), Q4 (4.8%) and others all into 5, and a
 * stable sort then kept the LOWEST INDEX — so the chart named "Q2 5%" as the
 * third-steepest question when Q56 was. The top two were correct, which is
 * exactly why nobody questioned the third.
 *
 * It now sends one decimal (+117 chars on a 58-bar chart, well inside Slack's
 * 3000-char image_url cap). Display is unaffected: this line and the bar labels
 * both print Math.round().
 */
describe("digest-image: which drop-offs the summary names", () => {
  const spread = (over: Record<number, number>) =>
    Array.from({ length: 58 }, (_, i) => ({ label: `Q${i + 1}`, dropPct: over[i] ?? 1 }));

  it("ranks on the decimal, not on the rounded integer", () => {
    // Q57 and Q58 are the clear top two. The third place is a cluster that all
    // round to 5 — with an EARLIER index deliberately made the shallowest, which
    // is the case integer rounding got wrong.
    const bars = spread({ 56: 24.6, 57: 15.7, 55: 5.1, 2: 4.9, 3: 4.8, 1: 4.5 });
    const summary = summaryIn(
      renderDropoutBars({
        kind: "dropout-funnel",
        bars,
        windowLabel: "30 days",
      }).element
    );

    expect(summary, "the summary line must be found at all").toBeTruthy();
    expect(summary).toContain("Q57 25%");
    expect(summary).toContain("Q58 16%");
    // The real third-steepest.
    expect(summary).toContain("Q56 5%");
    // The one integer rounding would have picked instead: Q2, at 4.5.
    expect(summary).not.toContain("Q2 5%");
  });

  it("would have named the wrong question if the values arrived pre-rounded", () => {
    /**
     * The counterpart, so the test above cannot pass for an unrelated reason.
     * Same shape, but every value already collapsed to an integer the way the
     * old producer sent them — and the summary then names Q2.
     */
    const bars = spread({ 56: 25, 57: 16, 55: 5, 2: 5, 3: 5, 1: 5 });
    const summary = summaryIn(
      renderDropoutBars({
        kind: "dropout-funnel",
        bars,
        windowLabel: "30 days",
      }).element
    );
    expect(summary).toContain("Q2 5%");
  });
});

/** Every string drawn anywhere in the chart. */
function stringsIn(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) stringsIn(child, out);
    return out;
  }
  if (!node || typeof node !== "object") return out;
  const props = ((node as ReactElement<Record<string, unknown>>).props ?? {}) as Record<
    string,
    unknown
  >;
  if (props.children !== undefined) stringsIn(props.children, out);
  return out;
}

describe("renderDropoutBars: what the bars measure", () => {
  it("says the bars are people who left and never finished", () => {
    // Finishers are never counted, so the last screen is never a drop-off. The
    // footnote has to say so, or the old reading ("did not continue") comes back.
    const all = stringsIn(
      renderDropoutBars({
        kind: "dropout-funnel",
        bars: [
          { label: "Q1", dropPct: 5 },
          { label: "Q2", dropPct: 9 },
        ],
      }).element
    );
    expect(all.join(" ")).toContain(
      "left: % of people who reach a question and leave there without finishing · bottom: question order"
    );
    expect(all.join(" ")).not.toContain("do not continue");
  });

  it("says how many questions the survey asks, when told", () => {
    const all = stringsIn(
      renderDropoutBars({
        kind: "dropout-funnel",
        bars: [
          { label: "Q1", dropPct: 5 },
          { label: "Q2", dropPct: 9 },
        ],
        questions: 57,
      }).element
    );
    expect(all.join(" ")).toContain("bottom: all 57 questions, in the order asked today");
  });
});

/** Every absolutely placed box in the chart: where it starts, how wide, what it says. */
function boxesIn(
  node: unknown,
  out: Array<{ key: string; left: number; width: number; text?: string }> = []
): Array<{ key: string; left: number; width: number; text?: string }> {
  if (Array.isArray(node)) {
    for (const child of node) boxesIn(child, out);
    return out;
  }
  if (!node || typeof node !== "object") return out;
  const el = node as ReactElement<Record<string, unknown>> & { key?: string | null };
  const props = (el.props ?? {}) as Record<string, unknown>;
  const style = (props.style ?? {}) as Record<string, unknown>;
  if (style.position === "absolute" && typeof style.left === "number") {
    out.push({
      key: String(el.key ?? ""),
      left: style.left,
      width: Number(style.width),
      text: typeof props.children === "string" ? props.children : undefined,
    });
  }
  if (props.children) boxesIn(props.children, out);
  return out;
}

describe("renderDropoutBars: each label sits under its own bar", () => {
  it("puts the last question's label under the last bar, not the one before it", () => {
    // The 2026-10-04 render: 57 questions, the tallest (red) bar second to last,
    // the last one near zero. "Q57" stood under the red bar, so the near-zero
    // bar after it read as a 58th question.
    const bars = Array.from({ length: 57 }, (_, i) => ({
      label: `Q${i + 1}`,
      dropPct: i === 55 ? 11 : i === 56 ? 0 : 1 + (i % 5),
    }));
    const boxes = boxesIn(renderDropoutBars({ kind: "dropout-funnel", bars }).element);
    const centre = (b: { left: number; width: number }) => b.left + b.width / 2;
    const label = boxes.find((b) => b.text === "Q57" && b.key.startsWith("x-"))!;
    const last = boxes.find((b) => b.key === "bar-Q57-56")!;
    const beforeIt = boxes.find((b) => b.key === "bar-Q56-55")!;
    expect(label).toBeDefined();
    const slot = centre(last) - centre(beforeIt);
    expect(Math.abs(centre(label) - centre(last))).toBeLessThan(slot / 2);
    // And the first label sits under the first bar.
    const first = boxes.find((b) => b.text === "Q1" && b.key.startsWith("x-"))!;
    const firstBar = boxes.find((b) => b.key === "bar-Q1-0")!;
    expect(Math.abs(centre(first) - centre(firstBar))).toBeLessThan(slot / 2);
  });
});

describe("renderDropoutBars: which bar is which question", () => {
  // The real shape on 2026-10-04: 57 questions, Q1 and Q2 both 6%, Q56 the
  // steepest at 11%, Q57 near zero.
  const bars = Array.from({ length: 57 }, (_, i) => ({
    label: `Q${i + 1}`,
    dropPct: i === 55 ? 11 : i <= 1 ? 6 : i === 56 ? 0.1 : 1 + (i % 4),
  }));
  const boxes = () => boxesIn(renderDropoutBars({ kind: "dropout-funnel", bars }).element);
  const centre = (b: { left: number; width: number }) => b.left + b.width / 2;

  it("numbers Q1, every fifth question and the last", () => {
    const labels = boxes()
      .filter((b) => b.key.startsWith("x-"))
      .map((b) => b.text);
    // Q55 gives way to Q57: two bars apart, the two would touch.
    expect(labels).toEqual([
      "Q1",
      ...Array.from({ length: 10 }, (_, k) => `Q${(k + 1) * 5}`),
      "Q57",
    ]);
  });

  it("draws a tick under every bar", () => {
    const ticks: string[] = [];
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      const el = node as ReactElement<Record<string, unknown>> & { key?: string | null };
      if (String(el.key ?? "").startsWith("tick-")) ticks.push(String(el.key));
      const props = (el.props ?? {}) as Record<string, unknown>;
      if (props.children) walk(props.children);
    };
    walk(renderDropoutBars({ kind: "dropout-funnel", bars }).element);
    expect(ticks).toHaveLength(57);
  });

  it("names each red bar's question on the bar, touching equal ones together", () => {
    const all = boxes();
    const names = all.filter((b) => b.key.startsWith("q-"));
    expect(names.map((b) => b.text)).toEqual(["Q1, Q2", "Q56"]);
    // Each name sits over its own bar(s): nearer them than any other bar.
    const bar = (i: number) => all.find((b) => b.key === `bar-Q${i + 1}-${i}`)!;
    const slot = centre(bar(1)) - centre(bar(0));
    const q56 = names.find((b) => b.text === "Q56")!;
    expect(Math.abs(centre(q56) - centre(bar(55)))).toBeLessThan(slot / 2);
    const pair = names.find((b) => b.text === "Q1, Q2")!;
    expect(Math.abs(centre(pair) - (centre(bar(0)) + centre(bar(1))) / 2)).toBeLessThan(slot / 2);
  });

  it("keeps separate names for touching red bars that differ", () => {
    // A cliff: Q4 at 11%, Q5 at 24%. One shared "11-24%" would hide the
    // steepest number, so these stay separate and the steepest keeps its name.
    const cliff = Array.from({ length: 20 }, (_, i) => ({
      label: `Q${i + 1}`,
      dropPct: i === 3 ? 11 : i === 4 ? 24 : 2,
    }));
    const names = boxesIn(renderDropoutBars({ kind: "dropout-funnel", bars: cliff }).element)
      .filter((b) => b.key.startsWith("q-"))
      .map((b) => b.text);
    expect(names).toContain("Q5");
    expect(names).not.toContain("Q4, Q5");
  });
});
