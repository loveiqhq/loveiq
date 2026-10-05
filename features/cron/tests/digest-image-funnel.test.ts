import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";

import { renderFunnelSteps } from "@/app/api/admin/digest-image/[kind]/route";

/**
 * The daily funnel picture. Asserted on what the renderer DRAWS, not on what the
 * cron puts in the payload: a producer test cannot see a renderer that ignores
 * the field it is handed (features/cron/tests/digest-image-colours.test.ts has
 * the history).
 */

const DANGER = "#b91c1c";
const NEUTRAL = "#334155";
// Landing Page V1 and V2. A funnel is not an arm, so it must draw in neither.
const ARM_COLOURS = ["#2563eb", "#e0552f"];

type Node = ReactElement<Record<string, unknown>>;

/** Every element under `node`, depth first. */
function walk(node: unknown, out: Node[] = []): Node[] {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, out);
    return out;
  }
  if (!node || typeof node !== "object") return out;
  const el = node as Node;
  out.push(el);
  const props = (el.props ?? {}) as Record<string, unknown>;
  if (props.children) walk(props.children, out);
  return out;
}

const style = (el: Node) => ((el.props ?? {}).style ?? {}) as Record<string, unknown>;
const textOf = (el: Node) => {
  const c = (el.props ?? {}).children;
  return typeof c === "string" || typeof c === "number" ? String(c) : "";
};

const payload = (extra: Record<string, unknown> = {}) => ({
  kind: "funnel-steps" as const,
  title: "The funnel",
  windowLabel: "30 days to 28 Sep",
  steps: [
    { label: "Visits", count: 12916, pct: null },
    { label: "Survey started", count: 1063, pct: 8.23 },
    { label: "Survey completed", count: 450, pct: 42.33 },
    { label: "Checkout started", count: 32, pct: 7.11 },
    { label: "Report unlocked", count: 2, pct: 6.25 },
  ],
  worst: 4,
  ...extra,
});

describe("digest-image: the funnel picture", () => {
  it("draws the named drop in red, and only that one", () => {
    const nodes = walk(renderFunnelSteps(payload()).element);
    const red = nodes.filter((n) => style(n).background === DANGER);
    expect(red, "one red bar").toHaveLength(1);
    // Its percentage is the red, bold label on the same row.
    const redLabels = nodes.filter((n) => style(n).color === DANGER);
    expect(redLabels.map(textOf)).toEqual(["6.3%"]);

    // Moving `worst` moves the red. A renderer that picked its own worst step
    // (the lowest share, 7.1% vs 6.3% here would agree by luck) cannot pass both.
    const moved = walk(renderFunnelSteps(payload({ worst: 2 })).element);
    expect(moved.filter((n) => style(n).color === DANGER).map(textOf)).toEqual(["42.3%"]);
  });

  it("draws every other bar in the neutral ink, never an arm's colour", () => {
    const nodes = walk(renderFunnelSteps(payload()).element);
    const bars = nodes.filter((n) => style(n).background === NEUTRAL);
    // Five steps, the first has no bar, one is red.
    expect(bars).toHaveLength(3);
    const all = JSON.stringify(nodes.map((n) => style(n)));
    for (const arm of ARM_COLOURS) expect(all).not.toContain(arm);
  });

  it("prints a tiny share as <0.1% and a real share over 100% as it is", () => {
    const nodes = walk(
      renderFunnelSteps(
        payload({
          steps: [
            { label: "Visits", count: 12000, pct: null },
            { label: "Checkout started", count: 5, pct: 0.04 },
            { label: "Report unlocked", count: 6, pct: 120 },
          ],
          worst: 1,
        })
      ).element
    );
    const texts = nodes.map(textOf);
    expect(texts).toContain("<0.1%");
    expect(texts).toContain("120%");
    expect(texts, "never a bare 0% beside a real count").not.toContain("0%");
    // The count is printed with thousands separators, as people read it.
    expect(texts).toContain("12,000");
  });

  it("leaves the first step without a bar or a share", () => {
    const nodes = walk(renderFunnelSteps(payload()).element);
    const texts = nodes.map(textOf);
    expect(texts).toContain("Visits");
    expect(texts).toContain("12,916");
    // Exactly one percentage per step below the first.
    expect(texts.filter((t) => /%$/.test(t))).toHaveLength(4);
  });

  it("says why it is empty instead of drawing an empty funnel", () => {
    const { element } = renderFunnelSteps(payload({ steps: [] }));
    expect(JSON.stringify(walk(element).map(textOf))).toContain("Awaiting data");
  });

  it("grows with the number of steps, so eight rows never clip", () => {
    const five = renderFunnelSteps(payload()).height;
    const eight = renderFunnelSteps(
      payload({
        steps: Array.from({ length: 8 }, (_, i) => ({
          label: `Step ${i}`,
          count: 100 - i,
          pct: i === 0 ? null : 90,
        })),
      })
    ).height;
    expect(eight).toBeGreaterThan(five);
  });
});
