import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";

import {
  renderDropoutByArm,
  renderLongitudinal,
  renderStageConversion,
} from "@/app/api/admin/digest-image/[kind]/route";

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

describe("digest-image: only experiment arms get the arm colours", () => {
  /**
   * Blue and orange MEAN Landing Page V1 and V2 — that is what binding colour to
   * the arm bought. A chart that is not about arms must not use them, or the
   * message says two different things with one colour. Raised directly on the
   * 2026-09-16 sync: "some of them are the wrong colour".
   *
   * The failure was real and shipped: renderLongitudinal alternated the two arm
   * hexes by ROW INDEX, so in one funnel-digest message orange meant V2, and
   * 5-minute engagement, and price bucket #2. renderStageConversion painted every
   * nurture-stage bar in V1's blue.
   */
  const ARM_COLOURS = ["#2563eb", "#e0552f"];
  const days = ["1 Sep", "2 Sep", "3 Sep", "4 Sep", "5 Sep", "6 Sep", "7 Sep"];

  it("draws small-multiple rows in a neutral ink, one ink for all rows", () => {
    const { element } = renderLongitudinal({
      kind: "bucket-performance",
      rate: true,
      labels: ["EUR 29", "EUR 39", "EUR 49", "EUR 59", "EUR 19"],
      series: Array.from({ length: 5 }, (_, s) => days.map((_, i) => 2 + s + (i % 3))),
      xAxis: days,
    });
    const marks = marksIn(element);
    // Five rows actually rendered, or the assertion below is vacuous.
    expect(marks.length).toBeGreaterThanOrEqual(5);
    for (const arm of ARM_COLOURS) {
      expect(marks, `a non-arm chart used the ${arm} arm colour`).not.toContain(arm);
    }
    // And every row shares the one ink, rather than cycling.
    expect(new Set(marks.filter((m) => m === "#334155")).size).toBe(1);
  });

  it("draws nurture-stage bars in a neutral ink, not V1's blue", () => {
    const { element } = renderStageConversion({
      kind: "reactivation-email",
      stages: [
        { label: "6h no view", sent: 410, purchased: 4 },
        { label: "30h no unlock", sent: 301, purchased: 12 },
      ],
    });
    const marks = marksIn(element);
    expect(marks.length).toBeGreaterThan(0);
    for (const arm of ARM_COLOURS) {
      expect(marks, `the nurture chart used the ${arm} arm colour`).not.toContain(arm);
    }
  });
});
