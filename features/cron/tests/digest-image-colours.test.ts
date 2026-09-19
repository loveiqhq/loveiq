import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";

import { renderDropoutByArm } from "@/app/api/admin/digest-image/[kind]/route";

/**
 * The producer sending the right colour proves nothing about the picture using it.
 *
 * A mutation run on 2026-09-19 confirmed the gap: reverting this renderer to
 * hardcoded positional colours — the exact bug the 2026-09-16 sync reported —
 * left all 65 conversion-digest tests green. Every other guard in that change was
 * caught by its own test; this path had none, because every test asserted what the
 * cron PUT IN the signed URL and none asserted what the renderer did with it.
 */
function marksIn(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const child of node) marksIn(child, out);
    return out;
  }
  if (!node || typeof node !== "object") return out;
  const el = node as ReactElement<Record<string, unknown>>;
  const props = (el.props ?? {}) as Record<string, unknown>;
  for (const key of ["stroke", "fill", "background"]) {
    const v = props[key];
    if (typeof v === "string" && v.startsWith("#")) out.push(v.toLowerCase());
  }
  const style = props.style as Record<string, unknown> | undefined;
  if (style && typeof style.background === "string" && style.background.startsWith("#")) {
    out.push(style.background.toLowerCase());
  }
  if (props.children) marksIn(props.children, out);
  return out;
}

const payload = (extra: Record<string, unknown> = {}) => ({
  kind: "conversion-by-arm" as const,
  labels: ["1 Sep", "2 Sep", "3 Sep", "4 Sep"],
  first: [10, 12, 11, 13],
  last: [4, 5, 6, 5],
  legendFirst: "Landing Page V1 (First Design)",
  legendLast: "Landing Page V2 (Survey in Hero)",
  ...extra,
});

describe("digest-image: colour comes from the payload", () => {
  it("paints each series in the colour it was handed", () => {
    const { element } = renderDropoutByArm(
      payload({ colorFirst: "#112233", colorLast: "#445566" })
    );
    const marks = marksIn(element);
    expect(marks).toContain("#112233");
    expect(marks).toContain("#445566");
    // And NOT the built-in pair, which is what a renderer that ignored the
    // payload would draw. Without this half the test passes on a renderer that
    // paints every colour it can think of.
    expect(marks).not.toContain("#2563eb");
    expect(marks).not.toContain("#e0552f");
  });

  it("swapping the payload's colours swaps them on the marks", () => {
    /**
     * The asymmetric version of the test above. A renderer returning a fixed
     * palette could satisfy "contains both colours" by luck if a fixture happened
     * to match it; this one cannot be satisfied without reading the fields.
     */
    const a = marksIn(renderDropoutByArm(payload({ colorFirst: "#aa0000" })).element);
    const b = marksIn(renderDropoutByArm(payload({ colorLast: "#aa0000" })).element);
    expect(a).toContain("#aa0000");
    expect(b).toContain("#aa0000");
    expect(a).not.toEqual(b);
  });

  it("falls back to the built-in pair when the payload names no colour", () => {
    // The armless kinds (price buckets, per-question drop-off) send no colours and
    // must render exactly as they did before the field existed.
    const marks = marksIn(renderDropoutByArm(payload()).element);
    expect(marks).toContain("#2563eb");
    expect(marks).toContain("#e0552f");
  });

  it("ignores anything that is not a plain hex colour", () => {
    /**
     * The payload is signed, so a value here cannot be forged today — but it is
     * interpolated straight into an SVG `stroke`, and a renderer that paints
     * whatever string it is handed is one signing-key mistake from being an
     * injection point.
     */
    for (const hostile of ["url(#x)", "red; fill:url(javascript:0)", "", "#12", "#gggggg"]) {
      const marks = marksIn(renderDropoutByArm(payload({ colorFirst: hostile })).element);
      expect(marks, `should have fallen back, given: ${hostile}`).toContain("#2563eb");
      expect(marks.join(" "), `leaked into a mark: ${hostile}`).not.toContain("url(");
    }
  });
});
