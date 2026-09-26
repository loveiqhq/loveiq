import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";

import { renderDropoutByArm } from "@/app/api/admin/digest-image/[kind]/route";

/** Every string the picture will print. */
function textsIn(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) textsIn(child, out);
    return out;
  }
  if (!node || typeof node !== "object") return out;
  const props = ((node as ReactElement<Record<string, unknown>>).props ?? {}) as Record<
    string,
    unknown
  >;
  if (props.children !== undefined) textsIn(props.children, out);
  return out;
}

const payload = (extra: Record<string, unknown> = {}) => ({
  kind: "metric-trend" as const,
  labels: ["1 Sep", "2 Sep", "3 Sep", "4 Sep"],
  first: [120, 180, 150, 240],
  title: "Visitors (our own count)",
  footnote: "daily, UTC",
  ...extra,
});
/** Values the renderer prints: axis ticks, end labels and the default headline. */
const valueTexts = (texts: string[]) => texts.filter((t) => /^\d[\d.]*%?$|^Latest/.test(t));

describe("digest-image: the unit a value wears", () => {
  it("prints a percent sign by default, so the digest's charts are unchanged", () => {
    const values = valueTexts(textsIn(renderDropoutByArm(payload()).element));
    expect(values.length).toBeGreaterThan(3);
    for (const v of values) expect(v, v).toMatch(/%/);
  });

  it("prints counts bare when the payload says unit ''", () => {
    const texts = textsIn(renderDropoutByArm(payload({ unit: "" })).element);
    const values = valueTexts(texts);
    // The end label of the last reading, and the axis, both read as plain numbers.
    expect(values).toContain("240");
    expect(values.length).toBeGreaterThan(3);
    for (const t of texts) expect(t, t).not.toMatch(/%/);
  });

  it("honours only '' and falls back to percent for anything else", () => {
    const values = valueTexts(textsIn(renderDropoutByArm(payload({ unit: "px" })).element));
    expect(values.length).toBeGreaterThan(3);
    for (const v of values) expect(v, v).toMatch(/%/);
  });
});
