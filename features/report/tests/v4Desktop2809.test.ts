import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Sync 28.09 — "scale the mobile version of the report for desktop". V4 was drawn at
 * 393 only; on a wide screen its blocks sat at the phone's 356/361 inside a wider
 * column, and the V2 chapters it opens onto broke in the 580px measure V3 left them.
 * Review 28.09: it now opens at production's width and margins.
 */
const ui = join(__dirname, "..", "ui");
const v3 = readFileSync(join(ui, "v3", "reportV3.css"), "utf8");
const v2 = readFileSync(join(ui, "report.css"), "utf8");

/** Innermost rules as [selector, body]; a @media's own brace never matches. */
const rules = (css: string) =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
    (m) => [m[1]!.trim(), m[2]!] as const
  );

describe("V4 on tablet and desktop", () => {
  it("opens at production's column: the full track beside the sidebar, full width on a tablet", () => {
    expect(v3).toMatch(
      /@media \(min-width: 1280px\) \{\s*\.rv3\.rv4 \.report-content \{\s*max-width: 1024px;\s*padding-inline: clamp\(1\.5rem, 3\.5vw, 4rem\);/
    );
    expect(v3).toMatch(
      /@media \(min-width: 700px\) and \(max-width: 1279px\) \{\s*\.rv3\.rv4 \.report-shell \{\s*padding-inline: 1\.5rem;\s*\}\s*\.rv3\.rv4 \.report-content \{\s*max-width: none;/
    );
  });

  it("keeps copy at production's 760 measure, heavier than the narrow-phone :is() rule", () => {
    expect(v3).toMatch(/\.rv3\.rv4 \.report-content \.rv4-copy,[\s\S]{0,400}max-width: 760px;/);
  });

  it("lets every phone-width V4 block fill the column from 700px", () => {
    const block = v3.slice(v3.indexOf("Report V4 · tablet and desktop"));
    for (const sel of [
      ".rv4-copy",
      ".rv4-chapter__body > *",
      ".rv4-top3__lede",
      ".rv4-part__intro",
    ]) {
      expect(block).toContain(`.rv3.rv4 ${sel}`);
    }
  });

  it("centres the portalled unlock bar through the page, not inside .rv4", () => {
    expect(v3).toContain("body:has(.rv3.rv4) .report-sticky-unlock--desktop");
  });
});

describe("the Imbalance Loop's cards keep their centring under reduced motion", () => {
  // The cards are placed by `transform: translate(-50%, …)`. A reset to
  // `transform: none` on them slid the 4-o'clock card half its width off the panel.
  it("no rule sets transform: none on an orbit card", () => {
    const offenders = rules(v2).filter(
      ([sel, body]) =>
        /\.report-partnership__orbit-step(?![-\w])(?!:hover)/.test(sel) &&
        /(^|;|\s)transform:\s*none/.test(body) &&
        // The phone layout un-positions them (<=760px), where none is right.
        !/position:\s*static/.test(body)
    );
    expect(offenders.map(([sel]) => sel)).toEqual([]);
  });
});
