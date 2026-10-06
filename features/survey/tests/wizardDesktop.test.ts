import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { desktopChrome, mapZoom } from "@features/survey/ui/wizard/WizardReportMap";

/**
 * The pre-report wizard on a desktop (Fatih, 01.10: "we do need to scale the Wizard
 * properly for the desktop version"). No desktop frame exists for the 30.09 wizard, so
 * it takes the system of Mark's own desktop wizard frames (Figma 1:4454 / 1:4407,
 * 1440x1024): a 1120 content column, Lora 64/76.8 headings, Plus Jakarta 24/38.4 copy,
 * the 448 step bar, Back at the far left and CONTINUE at the far right, SKIP INTRO on
 * one line top right. Slides with a visual (the research tiles, the guarantee) set it
 * beside the text: under it they ran past a 900px-tall screen. Everything sits in one
 * 1024px media query, so a phone keeps the 393 design exactly.
 */
const css = readFileSync(join(__dirname, "..", "ui", "wizard", "wizard-desktop.css"), "utf8");
/** The stylesheet without its comments, its whitespace collapsed (prettier breaks lists). */
const rules = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");

/** Each rule's declarations, by its whole selector list. */
const RULES = new Map<string, string>();
for (const [, selector, body] of rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const key = selector!.trim();
  RULES.set(key, `${RULES.get(key) ?? ""} ${body!.trim()}`.trim());
}

/** The declarations of the rule whose selector list is exactly `selector`. */
const rule = (selector: string) => {
  expect([...RULES.keys()], selector).toContain(selector);
  return RULES.get(selector)!;
};

describe("the wizard's desktop stylesheet", () => {
  it("is one 1024px media query, every selector inside the wizard", () => {
    const trimmed = rules.trim();
    expect(trimmed.startsWith("@media (min-width: 1024px) {")).toBe(true);
    // The query's own closing brace ends the file: nothing outside it.
    const inner = trimmed.slice("@media (min-width: 1024px) {".length, -1);
    expect(trimmed.endsWith("}")).toBe(true);
    for (const [, selector] of inner.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      for (const part of selector!.split(",")) expect(part.trim()).toMatch(/^\.wz-root /);
    }
  });

  it("frames the slides in Mark's 1120 content column", () => {
    const frame = rule(".wz-root .wz-frame");
    expect(frame).toContain("max-width: none");
    expect(frame).toContain("width: min(1120px, 100% - 128px)");
  });

  it("sets the headings at 1:4454's Lora 64/76.8, eased down to fit a laptop's height", () => {
    const heading = rule(".wz-root .wz-heading");
    expect(heading).toContain("font-size: clamp(40px, min(4.45vw, 7vh), 64px)");
    expect(heading).toContain("line-height: 1.2");
    expect(heading).toContain("max-width: 848px");
  });

  it("sets the copy at 1:4454's 24/38.4 in its 672 measure, the phone's breaks let go", () => {
    const copy = rule(".wz-root .wz-copy");
    expect(copy).toContain("font-size: clamp(18px, min(1.67vw, 2.7vh), 24px)");
    expect(copy).toContain("line-height: 1.6");
    expect(copy).toContain("max-width: 672px");
    expect(rule(".wz-root .wz-copy br")).toContain("display: none");
    // Slide 4's second paragraph is one line down, as on the phone.
    expect(rule(".wz-root .wz-copy p + p")).toContain("margin-top: 1.6em");
  });

  it("sets a slide's visual beside its text, the text first", () => {
    const grid = rule(".wz-root .wz-text.has-extra");
    expect(grid).toContain("display: grid");
    // At 1024 the visual's column would be 235: the research cards wrapped to four lines.
    expect(grid).toContain("grid-template-columns: minmax(0, 600px) minmax(320px, 1fr)");
    expect(grid).toContain("align-items: center");
    const extra = rule(".wz-root .wz-text.has-extra > .wz-extra");
    expect(extra).toContain("grid-column: 2");
    expect(extra).toContain("padding-top: 0");
  });

  it("centres the text against a taller visual rather than spreading it", () => {
    // The visual spans every row; a spare 1fr above and below the text's three takes
    // what it adds, where spanning the three alone pulled the icon, heading and copy apart.
    expect(rule(".wz-root .wz-text.has-extra")).toContain(
      "grid-template-rows: 1fr auto auto auto 1fr"
    );
    expect(rule(".wz-root .wz-text.has-extra > .wz-extra")).toContain("grid-row: 1 / -1");
    expect(rule(".wz-root .wz-text.has-extra > .wz-icon")).toContain("grid-row: 2");
    expect(rule(".wz-root .wz-text.has-extra > .wz-heading")).toContain("grid-row: 3");
    expect(rule(".wz-root .wz-text.has-extra > .wz-body")).toContain("grid-row: 4");
  });

  it("stacks the research tiles as wide cards and widens the guarantee", () => {
    expect(rule(".wz-root .wz-proof")).toContain("grid-template-columns: minmax(0, 1fr)");
    const card = rule(".wz-root .wz-proof-card");
    expect(card).toContain("flex-direction: row");
    expect(card).toContain("text-align: left");
    expect(rule(".wz-root .wz-proof-title")).toContain("font-size: 18px");
    expect(rule(".wz-root .wz-guarantee-title")).toContain("font-size: 20px");
  });

  it("lets the icons' glow and the drawer's shadow fade before the column clips them", () => {
    // The scroll column clips sideways (overflow-x: hidden). Flush with the content it
    // cut the icon's glow (48 out, visible to 22) in a hard vertical line, and the
    // drawer's 32px shadow; 64 out each side, inside the frame's 128 of margin, it clears.
    const scroll = rule(".wz-root .wz-scroll");
    expect(scroll).toContain("margin: 0 -64px");
    expect(scroll).toContain("padding: clamp(24px, 5vh, 53px) 64px");
  });

  // A phone draws each slide at Figma's 345 x 640, scaled to fit (wizardFit) in a column
  // that never scrolls. A desktop sizes its slides itself: the slot fills the frame, the
  // scaled box steps out of the layout, and the column scrolls where a window is too short.
  it("lays the slides out at the desktop's own size, not the phone's scaled box", () => {
    const slot = rule(".wz-root .wz-slot");
    expect(slot).toContain("flex: 1 0 auto");
    expect(slot).toContain("height: auto");
    expect(slot).toContain("width: 100%");
    expect(rule(".wz-root .wz-fit-box, .wz-root .wz-fit")).toContain("display: contents");
    expect(rule(".wz-root .wz-scroll")).toContain("overflow-y: auto");
  });

  it("puts SKIP INTRO on one line top right, Back far left and CONTINUE far right", () => {
    const skip = rule(".wz-root .wz-skip");
    // The content's right edge, inside the column's 64.
    expect(skip).toContain("right: 64px");
    expect(skip).toContain("white-space: nowrap");
    expect(skip).toContain("width: auto");
    expect(rule(".wz-root .wz-nav")).toContain("justify-content: space-between");
    // Slide 1 draws no Back: CONTINUE still sits at the right, as 1:4407 has it.
    expect(rule(".wz-root .wz-nav > .wz-continue:only-child")).toContain("margin-left: auto");
  });
});

// The map (slide 2). Its phone canvas is one 345 x 640 illustration: the drawer with the
// pitch or the tiles beside it. Scaled as one piece it could not grow on a laptop, the
// drawer's height being most of a window's, so on a desktop its parts take a grid: the
// drawer (like the report's own sidebar) at the left, zoomed to the height the chrome
// leaves, and beside it the pitch in the slides' desktop type or the tiles zoomed to fit.
describe("the map on a desktop", () => {
  it("lays the drawer and its panel out as a grid, the pitch and the tiles in one cell", () => {
    const canvas = rule(".wz-root .wz-canvas");
    for (const declaration of [
      "display: grid",
      "grid-template-columns: auto minmax(0, 1fr)",
      "position: relative",
      "height: auto",
      "width: 100%",
    ]) {
      expect(canvas).toContain(declaration);
    }
    const drawer = rule(".wz-root .wz-drawer");
    expect(drawer).toContain("position: relative");
    expect(drawer).toContain("zoom: var(--wz-drawer-zoom, 1)");
    const panel = rule(".wz-root .wz-pitch, .wz-root .wz-tiles");
    expect(panel).toContain("grid-column: 2");
    expect(panel).toContain("grid-row: 1");
    expect(panel).toContain("position: relative");
    expect(rule(".wz-root .wz-tiles")).toContain("zoom: var(--wz-tiles-zoom, 1)");
  });

  it("sets the pitch in the slides' desktop type", () => {
    expect(rule(".wz-root .wz-pitch-big")).toContain(
      "font-size: clamp(40px, min(4.45vw, 7vh), 64px)"
    );
    expect(rule(".wz-root .wz-pitch-copy")).toContain(
      "font-size: clamp(18px, min(1.67vw, 2.7vh), 24px)"
    );
    expect(rule(".wz-root .wz-pitch")).toContain("height: auto");
    // The items' gaps grow with it. The phone's come from a var: an inline style would win.
    expect(rule(".wz-root .wz-pitch-item")).toContain("padding-top: clamp(20px, 3vh, 32px)");
  });

  it("reserves for the chrome what the stylesheet gives it", () => {
    // desktopChrome mirrors the paddings: the frame's twice and the footer's. Since Mark's
    // 01.10 round the buttons come first and the bar sits 24 under them, as on the phone
    // (1049:1161), so the nav keeps the phone's 24 below it and takes no gap above.
    expect(rule(".wz-root .wz-scroll")).toContain("padding: clamp(24px, 5vh, 53px) 64px");
    expect(rule(".wz-root .wz-footer")).toContain("padding-top: clamp(24px, 4.5vh, 48px)");
    expect(rule(".wz-root .wz-nav")).not.toContain("padding-top");
    // At 900: 2 x 45 + 40.5, then the 48 buttons, 24, the 3.2 bar and the 24 counter.
    expect(desktopChrome(900)).toBeCloseTo(229.7);
    expect(desktopChrome(1080)).toBeCloseTo(2 * 53 + 48 + 99.2);
    expect(desktopChrome(600)).toBeCloseTo(2 * 30 + 27 + 99.2);
  });
});

describe("mapZoom", () => {
  it("zooms the drawer and the tiles to what the window's height leaves", () => {
    // 900 leaves 670.3: the drawer is 597 tall, the tiles block with its controls 541.
    const at900 = mapZoom(900);
    expect(at900.drawer).toBeCloseTo(670.3 / 597);
    expect(at900.tiles).toBeCloseTo(670.3 / 541);
    // A tall window caps them: 1.35 and 1.5.
    expect(mapZoom(1440)).toEqual({ drawer: 1.35, tiles: 1.5 });
    // A laptop's window is short (720 leaves 528.2, a 1366 x 768 screen's ~657 tall window
    // 471), so they shrink below the phone's size rather than push CONTINUE off it...
    const at720 = mapZoom(720);
    expect(at720.drawer).toBeCloseTo((720 - desktopChrome(720)) / 597);
    expect(at720.drawer).toBeLessThan(1);
    expect(720 - desktopChrome(720) - 597 * at720.drawer).toBeCloseTo(0);
    // ...down to 0.65, under which the window scrolls instead.
    expect(mapZoom(500)).toEqual({ drawer: 0.65, tiles: 0.65 });
  });
});
