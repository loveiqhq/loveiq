import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { renderDropoutWeekly } from "@/app/api/admin/digest-image/[kind]/route";
import type { DropoffWeeklyPayload } from "@features/admin/server/dropoff-weekly";

/** The Notion KPI chart. Asserted on what the renderer DRAWS, as the other chart tests do. */
const DANGER = "#b91c1c";

type Node = ReactElement<Record<string, unknown>>;
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
const text = (el: Node) => {
  const c = (el.props ?? {}).children;
  return typeof c === "string" || typeof c === "number" ? String(c) : "";
};

const payload = (over: Partial<DropoffWeeklyPayload> = {}): DropoffWeeklyPayload => ({
  kind: "dropout-weekly",
  weeks: ["21 Sep", "28 Sep", "5 Oct"],
  partialLast: true,
  rows: [
    { n: 1, q: "What is your name?", r: [4.8, 11.6, 7.7] },
    { n: 2, q: "Right now, I feel satisfied", r: [4.8, 11, 4.2] },
    { n: 3, q: "I want more variety", r: [5.6, 5.4, 4.9] },
    { n: 4, q: "A question that spikes this week", r: [0.5, 0.4, 30] },
    { n: 5, q: "What is your email?", r: [9.4, 15.4, 4.3] },
    { n: 6, q: "Added on 6 Oct", r: [null, null, 1] },
  ],
  floor: 20,
  updated: "11 Oct",
  ...over,
});

const redLabels = (p: DropoffWeeklyPayload) =>
  walk(renderDropoutWeekly(p).element)
    .filter((el) => style(el).color === DANGER && style(el).width === 330)
    .map(text);

describe("renderDropoutWeekly", () => {
  it("names the worst three of the last COMPLETE week, not of the week in progress", () => {
    // Q4's 30% is three days of data; the full week of 28 Sep says email, name, satisfaction.
    expect(redLabels(payload()).sort()).toEqual(
      ["Right now, I feel satisfied", "What is your email?", "What is your name?"].sort()
    );
  });

  it("ranks on the last column once that week is complete", () => {
    expect(redLabels(payload({ partialLast: false }))).toContain(
      "A question that spikes this week"
    );
  });

  it("draws a week under the floor as a blank, never as 0", () => {
    const cells = walk(renderDropoutWeekly(payload()).element).map(text);
    expect(cells.filter((t) => t === "·")).toHaveLength(2);
    expect(cells).toContain("15");
    expect(cells).toContain("4.3");
  });

  it("marks the week in progress and grows with the question list", () => {
    const { element, height } = renderDropoutWeekly(payload());
    expect(walk(element).map(text)).toContain("5 Oct*");
    expect(renderDropoutWeekly(payload({ rows: payload().rows.slice(0, 2) })).height).toBe(
      height - 4 * 16
    );
  });
});
