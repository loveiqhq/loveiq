import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The team's last asks before the V4 report goes to production (WhatsApp 04.10–05.10),
 * held where only the stylesheet can show them.
 */
const V3_CSS = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");
const css = V3_CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/** The body of the first rule whose selector list ends with `selector`. */
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
};
const px = (body: string, prop: string) =>
  Number(body.match(new RegExp(`(?:^|[\\s;{])${prop}:\\s*([\\d.]+)px`))?.[1]);

/** The `@media (min-width: 700px)` block that sets the V4 headings' desktop sizes. */
const desktopHeadings = () => {
  const start = css.lastIndexOf(
    "@media (min-width: 700px) {",
    css.indexOf(".rv3.rv4 .rv4-top3__heading {")
  );
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("\n}", start));
};

describe("Other Archetypes' headline is an H2 under its H1 (Marcus, 04.10)", () => {
  it("sets 'You're a Constellation, Not a Type' as V4's in-chapter H2", () => {
    const body = rule(".rv3.rv4 .report-constellation__heading");
    expect(px(body, "font-size")).toBe(18);
    expect(px(body, "line-height")).toBe(21.6);
    expect(body).toContain("font-weight: 700");
    // The Report 2.0 heading was 28px on phones and 40px on desktop, over a 24px / 32px
    // chapter title. Set outside any media query, it stays under the title at every width.
    expect(px(body, "font-size")).toBeLessThan(px(rule(".rv3 .rv4-chapter__title"), "font-size"));
  });
});

describe("Core Archetype matches '3 Highest Scoring Archetypes' (Marcus, 04.10)", () => {
  it("shares the top three heading's phone size", () => {
    const core = rule(".rv3 .rv4-corehead__title");
    const top3 = rule(".rv3 .rv4-top3__heading");
    for (const prop of ["font-size", "line-height"]) expect(px(core, prop)).toBe(px(top3, prop));
  });

  it("grows with it from 700px", () => {
    expect(desktopHeadings()).toMatch(
      /\.rv3\.rv4 \.rv4-corehead__title,\s*\.rv3\.rv4 \.rv4-top3__heading \{\s*font-size: 28px;/
    );
  });
});

describe("the phone drawer over the sticky footer (Mark, 04.10)", () => {
  it("puts the footer under the drawer and the Refer a friend modal", () => {
    const body = rule(
      [
        "body:has(.rv3.rv4 .report-chapter-drawer-root) .report-sticky-unlock",
        "body:has(.rv3.rv4 [data-invite-modal]) .report-sticky-unlock",
      ].join(",\n")
    );
    expect(body).toContain("visibility: hidden;");
  });

  it("opens the panel near the top, rising from the floating pill's place", () => {
    const panel = rule(".rv3.rv4 .report-chapter-panel");
    expect(panel).toContain("top: calc(env(safe-area-inset-top, 0px) + 16px);");
    expect(panel).toContain("animation-name: rv4-panel-rise;");
    expect(rule(".rv3.rv4 .report-chapter-panel--closing")).toContain(
      "animation-name: rv4-panel-sink;"
    );
    // The pill sat 80px down; the panel now starts 16px down, so it rises the 64px between.
    expect(css).toMatch(/@keyframes rv4-panel-rise \{\s*from \{[^}]*translate3d\(-50%, 64px, 0\)/);
    expect(css).toMatch(
      /@keyframes rv4-panel-sink \{[\s\S]*?to \{[^}]*translate3d\(-50%, 64px, 0\)/
    );
  });
});
