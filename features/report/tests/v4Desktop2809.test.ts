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
  // Production's margins, and since Mark's desktop review of 30.09 ("We should define the
  // width of the page and then use it") one page width: 896, the column beside the
  // sidebar at 1920. Below it the column is what the layout leaves; above it, never more
  // (it had run to 1148 at 1279 and 917 at 1536).
  it("defines the page's width once: 896, the column at 1920", () => {
    expect(v3).toMatch(/\.rv3\.rv4 \{\s*--rv4-page: 896px;\s*\}/);
  });

  it("opens at production's margins and caps the column at the page width, in both layouts", () => {
    const cap = (pad: string) =>
      `\\.rv3\\.rv4 \\.report-content \\{\\s*--rv4-content-pad: ${pad};\\s*max-width: calc\\(var\\(--rv4-page\\) \\+ 2 \\* var\\(--rv4-content-pad\\)\\);\\s*padding-inline: var\\(--rv4-content-pad\\);`;
    // Beside the sidebar: 896 + 2 x 64 is production's own 1024 at 1920.
    expect(v3).toMatch(
      new RegExp(
        `@media \\(min-width: 1280px\\) \\{\\s*${cap("clamp\\(1\\.5rem, 3\\.5vw, 4rem\\)")}`
      )
    );
    expect(v3).toMatch(
      new RegExp(
        `@media \\(min-width: 700px\\) and \\(max-width: 1279px\\) \\{\\s*\\.rv3\\.rv4 \\.report-shell \\{\\s*padding-inline: 1\\.5rem;\\s*\\}\\s*${cap("clamp\\(1rem, 2vw, 4rem\\)")}`
      )
    );
  });

  // "Text width should go all the way to the border" (Mark, 30.09, "Text width.png": the
  // Summary stopped at production's 760 measure, short of the Archetype card's border).
  it("lets copy run the column: no 760 measure is left on it", () => {
    for (const sel of [".rv4-copy", ".rv4-summary__copy", ".rv3-method .rv3-prose"]) {
      expect(v3).not.toMatch(
        new RegExp(`\\.rv3\\.rv4 \\.report-content ${sel.replace(/\./g, "\\.")}[^{]*\\{[^}]*760px`)
      );
    }
    // Not even the Fantasy table since review 06.10: it runs the column too
    // (v4Desktop2809b), its map centred in it.
    expect(
      rules(v3)
        .filter(([, body]) => body.includes("760px"))
        .map(([selector]) => selector)
    ).toEqual([]);
  });

  it("lets every phone-width V4 block fill the column from 700px", () => {
    const block = v3.slice(v3.indexOf("Report V4 · tablet and desktop"));
    for (const sel of [".rv4-copy", ".rv4-chapter__body > *", ".rv4-top3__lede"]) {
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
