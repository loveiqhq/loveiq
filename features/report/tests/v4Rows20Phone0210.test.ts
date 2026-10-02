import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Review 02.10, Mark (Notion, mobile unlocked): "Left is what is live right now. The right
 * shows how Report 2.0 looked like on mobile. Please adapt", and "Same goes for Love
 * Languages. And both Mobile and Desktop". Report 2.0's phone rows (Figma 8632:1457, and
 * 8632:1833 for Love Language) stack the index, the name, its line, a full-width slider
 * and the word under the slider. V2's own phone grid (report.css, up to 768px) put the
 * index left and the word right of the name. From 700px the live page keeps 2.0's desktop
 * columns, so the 700–768 band gets those back from V2's tablet grid. Fonts stay V4's.
 */
const v3 = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");

const PHONE = "Review 02.10 — Report 2.0's rows on the phone";
const DESK = "Review 02.10 — Report 2.0's rows from 700px";
const TOUCH_UP = "Desktop touch-up — 28.09 (c)";

/** A block's CSS from its heading comment to the next heading, comments dropped. */
const block = (mark: string) => {
  const at = v3.indexOf(mark);
  expect(at, mark).toBeGreaterThan(-1);
  const start = v3.lastIndexOf("/*", at);
  const next = v3.indexOf("/* ══", at);
  return v3.slice(start, next < 0 ? undefined : next).replace(/\/\*[\s\S]*?\*\//g, "");
};

/** The declarations of the rule whose selector list holds `selector`. */
const rule = (css: string, selector: string) => {
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1]!.split(",").map((s) => s.trim());
    if (selectors.includes(selector)) return m[2]!;
  }
  throw new Error(`no rule for ${selector}`);
};

describe("Report 2.0's rows on the phone (Reward, Love Language)", () => {
  it("sits with the phone's rules, above the desktop touch-up, below the frozen lines", () => {
    const at = v3.indexOf(PHONE);
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(v3.indexOf(TOUCH_UP));
    expect(v3.slice(0, at).split("\n").length).toBeGreaterThan(1884);
    expect(block(PHONE).trimStart().startsWith("@media (max-width: 699px) {")).toBe(true);
  });

  it("stacks index, name, slider and word in one column (8632:1457)", () => {
    const css = block(PHONE);
    for (const row of [".rv3.rv4 .report-reward__row", ".rv3.rv4 .report-lovelang__row"]) {
      const r = rule(css, row);
      expect(r).toMatch(/display:\s*grid/);
      expect(r).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
      expect(r).toMatch(/grid-template-areas:\s*"rank"\s*"main"\s*"meter"\s*"word"/);
      expect(r).toMatch(/padding:\s*15\.65px 2\.02px 14\.13px/);
    }
    expect(rule(css, ".rv3.rv4 .report-reward__rank")).toMatch(/text-align:\s*left/);
    expect(rule(css, ".rv3.rv4 .report-lovelang__rank")).toMatch(/grid-area:\s*rank/);
    expect(rule(css, ".rv3.rv4 .report-reward__role-label")).toMatch(/grid-area:\s*word/);
    expect(rule(css, ".rv3.rv4 .report-lovelang__intensity")).toMatch(/text-align:\s*left/);
  });

  it("draws 2.0's phone slider: a full-width 6.06 track and a 7.07 dot", () => {
    const css = block(PHONE);
    expect(rule(css, ".rv3.rv4 .report-reward__meter")).toMatch(/width:\s*100%/);
    expect(rule(css, ".rv3.rv4 .report-lovelang__meter")).toMatch(/height:\s*6\.06px/);
    expect(rule(css, ".rv3.rv4 .report-reward__meter-fill")).toMatch(/height:\s*6\.06px/);
    expect(rule(css, ".rv3.rv4 .report-lovelang__meter-track")).toMatch(/border-radius:\s*2\.02px/);
    expect(rule(css, ".rv3.rv4 .report-reward__meter-dot")).toMatch(/width:\s*7\.07px/);
  });

  it("sets 2.0's phone type: index 13.12, name 15.14, line 10.09, word 11.1", () => {
    const css = block(PHONE);
    expect(rule(css, ".rv3.rv4 .report-lovelang__rank")).toMatch(/font-size:\s*13\.12px/);
    expect(rule(css, ".rv3.rv4 .report-reward__chem")).toMatch(/font-size:\s*15\.14px/);
    expect(rule(css, ".rv3.rv4 .report-lovelang__blurb")).toMatch(/font-size:\s*10\.09px/);
    expect(rule(css, ".rv3.rv4 .report-reward__role-label")).toMatch(/font-size:\s*11\.1px/);
  });
});

describe("Report 2.0's rows from 700px", () => {
  it("gives the 700–768 band 2.0's desktop columns back from V2's tablet grid", () => {
    const at = v3.indexOf(DESK);
    expect(at).toBeGreaterThan(v3.indexOf(TOUCH_UP));
    const css = block(DESK);
    expect(css.trimStart().startsWith("@media (min-width: 700px) and (max-width: 768px) {")).toBe(
      true
    );
    for (const [, sel] of css.matchAll(/\n\s*([^@{}\n][^{}]*)\{/g)) {
      for (const part of sel!.split(",")) expect(part.trim()).toMatch(/^\.rv3\.rv4 /);
    }
    expect(rule(css, ".rv3.rv4 .report-reward__row")).toMatch(
      /grid-template-columns:\s*36px minmax\(0, 1fr\) 169px 95px/
    );
    expect(rule(css, ".rv3.rv4 .report-lovelang__row")).toMatch(/flex-wrap:\s*nowrap/);
    expect(rule(css, ".rv3.rv4 .report-lovelang__meter")).toMatch(/width:\s*169\.27px/);
  });
});

describe("Report 2.0's phone stat card under the Reward rows (8632:1501)", () => {
  it("is white with a lavender hairline and 2.0's radius, padding and shadow", () => {
    const r = rule(block(PHONE), ".rv3.rv4 .report-reward__stat");
    expect(r).toMatch(/background:\s*#ffffff/);
    expect(r).toMatch(/border:\s*1\.01px solid rgba\(157, 138, 215, 0\.35\)/);
    expect(r).toMatch(/border-radius:\s*24\.23px/);
    expect(r).toMatch(/padding:\s*18\.17px 19\.18px 27\.25px/);
    expect(r).toMatch(/box-shadow:\s*0 20\.19px 50\.47px rgba\(22, 16, 33, 0\.06\)/);
  });

  it("carries 2.0's gradient bar along its top, 15.14 in from each side", () => {
    const r = rule(block(PHONE), ".rv3.rv4 .report-reward__stat::before");
    expect(r).toMatch(/left:\s*15\.14px/);
    expect(r).toMatch(/right:\s*15\.14px/);
    expect(r).toMatch(/height:\s*2\.52px/);
    expect(r).toMatch(/linear-gradient\(90deg, #e9d5ff 0%, #9d8ad7 55%, #795fc8 100%\)/);
  });

  it("draws the phone's 14.13 dots and 11.1 lines", () => {
    const css = block(PHONE);
    expect(rule(css, ".rv3.rv4 .report-reward__stat-dots")).toMatch(/height:\s*14\.13px/);
    expect(rule(css, ".rv3.rv4 .report-reward__stat-num")).toMatch(/font-size:\s*11\.1px/);
    expect(rule(css, ".rv3.rv4 .report-reward__stat-caption")).toMatch(/line-height:\s*14\.99px/);
  });
});

describe("Report 2.0's phone Love Language type (8632:1839, 8632:1897)", () => {
  it("sets the caption and the closing line at 14.5 / 1.65, the caption Regular", () => {
    const css = block(PHONE);
    const caption = rule(css, ".rv3.rv4 .report-lovelang__caption");
    expect(caption).toMatch(/font-weight:\s*400/);
    expect(caption).toMatch(/font-size:\s*14\.5px/);
    expect(caption).toMatch(/line-height:\s*1\.65/);
    const line = rule(css, ".rv3.rv4 .report-lovelang__catch");
    expect(line).toMatch(/font-size:\s*14\.5px/);
    expect(line).toMatch(/line-height:\s*1\.65/);
  });
});
