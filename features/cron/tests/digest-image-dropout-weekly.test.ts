import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { renderDropoutWeekly, weeklyFigure } from "@/app/api/admin/digest-image/[kind]/route";
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

  it("leaves a week empty when too few people (or nobody) reached the question, never 0%", () => {
    const rows = walk(renderDropoutWeekly(payload()).element).filter(
      (el) => style(el).height === 16 && Array.isArray((el.props ?? {}).children)
    );
    const added = rows.find((r) => walk(r).map(text).includes("Added on 6 Oct"))!;
    const cells = walk(added)
      .filter((el) => style(el).width === 46 - 2)
      .map(text);
    expect(cells).toEqual(["", "", "1%"]);
  });

  it("shows whole percentages, the way people read them", () => {
    const all = walk(renderDropoutWeekly(payload()).element).map(text);
    expect(all).toContain("15%");
    expect(all).toContain("4%");
    expect(weeklyFigure(0)).toBe("0%");
    expect(weeklyFigure(0.4)).toBe("<1%");
  });

  it("draws one bar per question with exactly the worst three in red, named in plain words", () => {
    const els = walk(renderDropoutWeekly(payload()).element);
    expect(els.filter((el) => style(el).background === DANGER)).toHaveLength(3);
    expect(els.map(text)).toContain("15% left at Q5: What is your email?");
  });

  it("marks the week in progress and grows with the question list", () => {
    const { element, height } = renderDropoutWeekly(payload());
    expect(walk(element).map(text)).toContain("5 Oct*");
    expect(renderDropoutWeekly(payload({ rows: payload().rows.slice(0, 2) })).height).toBe(
      height - 4 * 16
    );
  });

  it("keeps every cell's figure legible: at least 4.5:1 against its colour", () => {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const [r, g, b] = c.map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    };
    const rates = [0, 0.4, 1.9, 2, 4.9, 5, 6.8, 7, 9.9, 10, 15, 40];
    const els = walk(
      renderDropoutWeekly(payload({ rows: [{ n: 1, q: "q", r: rates }], weeks: rates.map(String) }))
        .element
    );
    const cells = els.filter(
      (el) => typeof style(el).background === "string" && text(el).endsWith("%")
    );
    expect(cells).toHaveLength(rates.length);
    for (const el of cells) {
      const { background, color } = style(el) as { background: string; color: string };
      expect(ratio(background, color), `${text(el)} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
