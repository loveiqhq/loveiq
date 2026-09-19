import { describe, expect, it } from "vitest";

import { renderLongitudinal } from "@/app/api/admin/digest-image/[kind]/route";

/**
 * The readout column must hold the string it is given.
 *
 * It shipped clipped. `READOUT_W` was 120, sized for the `Math.round` readout it
 * used to carry ("now 13% · max 45%"). `computeRate` rounds to ONE DECIMAL and
 * `fmtAxis` prints it, so the common string became "now 66.7% · max 86.7%" —
 * and because the column is `justify-content: flex-end` with `overflow: hidden`,
 * the overflow is clipped at the START. The live weekly message went out with
 * rows reading "ow 66.7% · max 86.7%".
 *
 * Nothing caught it: every other test on this renderer asserts colour, geometry
 * or the signed payload, and none of them looks at whether the text fits.
 */

type Node = { type?: unknown; props?: Record<string, unknown> };

/** Every element in the tree, depth-first. */
function walk(node: unknown, out: Node[] = []): Node[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const c of node) walk(c, out);
    return out;
  }
  const n = node as Node;
  out.push(n);
  walk((n.props as { children?: unknown } | undefined)?.children, out);
  return out;
}

/**
 * Conservative width of a string at 12px in the chart's sans stack.
 *
 * 6.2px per character. Measured against the shipped renders the average for
 * this digit/letter mix is ~5.9px, so this errs toward demanding MORE room than
 * the text needs — the direction that keeps a clipped readout from passing.
 */
const CHAR_PX = 6.2;

/**
 * A rate series whose readout is the longest string this renderer can emit.
 *
 * `computeRate` yields 0..100 at one decimal and `fmtAxis` strips trailing
 * zeros, so 100 prints as "100" and the WIDEST value is a four-character
 * decimal like "45.3". Both slots full gives "now 12.7% · max 45.3%" — 21
 * characters, and exactly the string the shipped chart clipped.
 */
function longestReadoutChart() {
  return renderLongitudinal({
    kind: "cvr-completion-engagement",
    windowLabel: "30-day trends ending 2026-09-17",
    labels: ["Within 1 min", "Within 5 min", "Within 10 min"],
    series: [
      [45.3, 12.7],
      [86.7, 66.7],
      [1.2, 0.4],
    ],
    rate: true,
    xAxis: ["2026-09-16", "2026-09-17"],
  });
}

describe("longitudinal readout column", () => {
  it("is wide enough for every readout it renders", () => {
    const { element } = longestReadoutChart();
    const readouts = walk(element).filter((n) => {
      const st = n.props?.style as Record<string, unknown> | undefined;
      const kids = n.props?.children;
      return (
        st?.whiteSpace === "nowrap" &&
        st?.justifyContent === "flex-end" &&
        typeof kids === "string" &&
        kids.includes("now ")
      );
    });

    // If this is zero the test is measuring nothing — the exact way a guard
    // like this goes quietly vacuous when the renderer is restructured.
    expect(readouts.length, "no readout nodes found; the selector has gone stale").toBe(3);

    for (const r of readouts) {
      const text = r.props!.children as string;
      const width = (r.props!.style as { width?: number }).width ?? 0;
      expect(
        width,
        `"${text}" needs about ${Math.ceil(text.length * CHAR_PX)}px and the column is ${width}px`
      ).toBeGreaterThanOrEqual(text.length * CHAR_PX);
    }
  });

  it("keeps the decimal that made the string longer", () => {
    /**
     * Ties the guard to the FORMATTER, not to a character count. The column was
     * sized for `Math.round` output; the readout switched to `fmtAxis`
     * (deliberately — "a 12.7% rate was published as 13%") and nothing resized
     * the column. If the decimal ever goes away this test fails and the width
     * guard above can be relaxed; if a second decimal appears, the width guard
     * fails first.
     */
    const { element } = longestReadoutChart();
    const texts = walk(element)
      .map((n) => n.props?.children)
      .filter((c): c is string => typeof c === "string" && c.startsWith("now "));
    expect(texts).toContain("now 12.7% · max 45.3%");
    expect(texts).toContain("now 66.7% · max 86.7%");
    expect(texts.join(" "), "rounding to whole percents is what this replaced").not.toMatch(
      /now 13%|max 45%/
    );
  });

  it("keeps the three columns inside the canvas", () => {
    // label | plot | readout must fit WIDTH minus the shell's 28px padding, or
    // widening the readout silently pushes the plot off the right edge.
    const { element } = longestReadoutChart();
    const widths = walk(element)
      .map((n) => (n.props?.style as { width?: unknown } | undefined)?.width)
      .filter((w): w is number => typeof w === "number");
    const label = widths.find((w) => w === 150);
    const readout = widths.find((w) => w > 120 && w < 200);
    expect(label, "label column").toBeDefined();
    expect(readout, "readout column").toBeDefined();
    // 800 canvas − 2×28 padding = 744 of content.
    expect(label! + readout! + 440).toBeLessThanOrEqual(744);
  });
});
