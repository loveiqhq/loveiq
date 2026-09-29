import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Mark's CTA pass on Report 3.0, 29.09.
 *
 * - 1945260099, "We have updated the CTAs that expand elements on visuals": every
 *   "Show all" (A&B 979:567 / 979:573, the fantasy table, the gated article 979:558 /
 *   979:561 / 979:564) and the table's "Unlock all N Fantasies" (639:2099 / 639:2264 /
 *   639:2414) keep their gradient outline and set the label in solid #575757 — Marcus's
 *   "grey font … for better readability and contrast" (1944661166).
 * - 1945270164 / 1945270267 on both: "For all of these CTAs, can we please have an hover
 *   effect so that it is clear that these are clickable". Figma draws no hover state,
 *   so the effect is ours: a lift, a shadow and a darker label, only where a fine
 *   pointer can hover, and without movement under reduced motion.
 */
const CSS = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");

const rule = (selector: string) => {
  const at = CSS.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf("}", at));
};

/** The bodies of every block opened by `opener`, up to its closing brace at column 0. */
const blocks = (opener: string) =>
  CSS.split(opener)
    .slice(1)
    .map((rest) => rest.slice(0, rest.indexOf("\n}\n")));

const HOVER = "@media (hover: hover) and (pointer: fine) {";
const REDUCED = "@media (prefers-reduced-motion: reduce) {";

const PILLS = [
  ".rv4-trig__pill",
  ".rv4-fvt__pill",
  ".rv4-learn__showmore",
  ".rv4-try__open",
  ".rv4-learn__open",
] as const;

describe("the expand CTAs' labels — 1945260099", () => {
  it("sets the A&B and fantasy-table pills' label in solid #575757, not the outline's gradient", () => {
    const label = rule(".rv3 .rv4-fvt__pill-label,\n.rv3 .rv4-trig__pill-label");
    expect(label).toContain("color: #575757");
    expect(label).not.toContain("background-clip");
    expect(label).not.toContain("transparent");
  });

  it("sets the gated article's 'Show all' in the same grey", () => {
    const label = rule(".rv3 .rv4-learn__showmore-label");
    expect(label).toContain("color: #575757");
    expect(label).not.toContain("background-clip");
    expect(label).not.toContain("transparent");
  });

  it("draws the A&B and table 'Show all' 86 wide, as 979:567 does", () => {
    // The label's glyphs are 40.6 wide in the frame and here; Figma's text box carries
    // a trailing space (42), which is what makes its pill 86 rather than 84.6.
    expect(rule(".rv3 .rv4-fvt__pill,\n.rv3 .rv4-trig__pill")).toContain("min-width: 86px");
  });

  it("keeps the gradient outline on both", () => {
    expect(rule(".rv3 .rv4-fvt__pill,\n.rv3 .rv4-trig__pill")).toContain(
      "linear-gradient(to bottom right, #fb683e 14.6%, #e88c8c 51.4%, #ac88ed 85.4%) border-box"
    );
    const learn = CSS.slice(CSS.lastIndexOf(".rv3 .rv4-learn__showmore {"));
    expect(learn.slice(0, learn.indexOf("}"))).toContain(
      "linear-gradient(to bottom right, #fb683e, #e88c8c 52%, #ac88ed) border-box"
    );
  });
});

describe("the pills' hover — 1945270164 / 1945270267", () => {
  const hover = blocks(HOVER).join("\n");

  it("gives every expand and read-all pill a hover state", () => {
    for (const pill of PILLS) expect(hover, pill).toContain(`${pill}:hover`);
  });

  it("hovers only under a fine pointer, so a tap never leaves a pill stuck lifted", () => {
    for (const pill of PILLS) {
      // No top-level (unindented) hover rule for a pill anywhere in the file.
      expect(CSS, pill).not.toMatch(
        new RegExp(`^\\.rv3[^\\n{]*${pill.replace(".", "\\.")}:hover`, "m")
      );
    }
  });

  it("darkens the grey labels and lifts the pill by the translate property", () => {
    expect(hover).toContain("color: #3f3a4d");
    expect(hover).toContain("translate: 0 -1px");
    // Four of the five pills are centred with transform: translateX(-50%); a hover
    // transform would replace it and throw the pill sideways.
    expect(hover).not.toMatch(/\btransform:/);
  });

  it("drops the lift under reduced motion and on press", () => {
    const reduced = blocks(REDUCED).find((body) => body.includes(".rv4-trig__pill:hover"));
    expect(reduced, "no reduced-motion block for the pills' hover").toBeDefined();
    expect(reduced).toContain("translate: none");
    expect(reduced).toContain("transition: none");
    expect(hover).toContain(".rv4-trig__pill:active");
  });
});

/** The rule whose selector list names `selector`, from it to the rule's end. */
const ruleNaming = (selector: string) => {
  const at = CSS.search(new RegExp(`${selector.replace(/[.]/g, "\\.")}(,\\n| \\{)`));
  expect(at, selector).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf("}", at));
};

describe("keyboard focus on the pills that had none", () => {
  it.each([".rv4-learn__showmore", ".rv4-try__open", ".rv4-learn__open"])("%s", (pill) => {
    const ring = ruleNaming(`.rv3 ${pill}:focus-visible`);
    expect(ring).toContain("outline: 2px solid var(--rv3-violet)");
    expect(ring).toContain("outline-offset: 2px");
  });
});

/*
 * 1945259495, "We have updated the Unlock Report icons that sit on the visuals" — the
 * 88x88 tile (979:507) on every visual, and a compact 73x70 on the fantasy table's
 * categories (979:588 / 979:600 / 979:612). The 1px edge is a CSS border, so every
 * position inside is the frame's less that pixel.
 */
describe("the Unlock Report tile — 1945259495", () => {
  it("is an 88x88 white card with a #d4d4d4 edge, radius 8 and the frame's 2/2/4 shadow", () => {
    const tile = rule(".rv3 .rv4-lockbadge");
    expect(tile).toContain("width: 88px");
    expect(tile).toContain("height: 88px");
    expect(tile).toContain("background: #fff");
    expect(tile).toContain("border: 1px solid #d4d4d4");
    expect(tile).toContain("border-radius: 8px");
    expect(tile).toContain("box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2)");
    // Still centred on its visual by the transform, and placed by --rv4-lock-top.
    expect(tile).toContain("transform: translateX(-50%)");
    expect(tile).toContain("top: var(--rv4-lock-top");
  });

  it("sets the 38px gradient disc 25 in and 13 down, with its lock 10 in", () => {
    const disc = rule(".rv3 .rv4-lockbadge__disc");
    expect(disc).toContain("width: 38px");
    expect(disc).toContain("height: 38px");
    expect(disc).toContain("left: 24px");
    expect(disc).toContain("top: 12px");
    expect(disc).toContain(
      "linear-gradient(135deg, #fb683e 14.644%, #e88c8c 51.414%, #ac88ed 85.356%)"
    );
    expect(disc).toContain("box-shadow: 0 3.294px 4.941px rgba(168, 90, 76, 0.3)");
    expect(rule(".rv3 .rv4-lockbadge__disc img")).toContain("left: 10px");
  });

  it("sets 'Unlock Report' 10/12 bold #868686, 58 down and centred", () => {
    const label = rule(".rv3 .rv4-lockbadge__label");
    expect(label).toContain("font-size: 10px");
    expect(label).toContain("line-height: 12px");
    expect(label).toContain("font-weight: 700");
    expect(label).toContain("color: #868686");
    expect(label).toContain("top: 57px");
    expect(label).toContain("text-align: center");
  });

  it("draws the table's compact tile 73x70, its 28px disc 23 in and its 8px label 47 down", () => {
    const compact = rule(".rv3 .rv4-lockbadge--compact");
    expect(compact).toContain("width: 73px");
    expect(compact).toContain("height: 70px");
    const disc = rule(".rv3 .rv4-lockbadge--compact .rv4-lockbadge__disc");
    expect(disc).toContain("width: 28px");
    expect(disc).toContain("left: 22px");
    expect(disc).toContain("top: 12px");
    expect(rule(".rv3 .rv4-lockbadge--compact .rv4-lockbadge__disc img")).toContain("left: 6.59px");
    const label = rule(".rv3 .rv4-lockbadge--compact .rv4-lockbadge__label");
    expect(label).toContain("font-size: 8px");
    expect(label).toContain("top: 46px");
  });

  it("places each tile where its frame does", () => {
    // Offsets from the top of the locked rows each group wraps (348:213, 314:211).
    expect(rule(".rv3 .rv4-turn__lock")).toContain("--rv4-lock-top: 87px");
    expect(rule(".rv3 .rv4-sun__lock")).toContain("--rv4-lock-top: 122px");
    expect(rule(".rv3 .rv4-trig--brake .rv4-trig__lock")).toContain("--rv4-lock-top: 137px");
    expect(rule(".rv3 .rv4-trig--accel .rv4-trig__lock")).toContain("--rv4-lock-top: 53px");
    // 979:520: 41 above the orbit box's foot, which follows the orbit's size.
    expect(rule(".rv3 .rv4-loop .rv4-lockbadge")).toContain(
      "--rv4-lock-top: calc(clamp(180px, calc(100cqw - 169px), 224px) + 15px)"
    );
    // The map's plot (368:3495) and each category's two blurred rows: on the middle.
    expect(rule(".rv3 .rv4-fvm__lock .rv4-lockbadge")).toContain(
      "--rv4-lock-top: calc(50% - 44px)"
    );
    expect(rule(".rv3 .rv4-fvt__lockrows .rv4-lockbadge")).toContain(
      "--rv4-lock-top: calc(50% - 35px)"
    );
  });
});

describe("the tile's hover — 1945270267", () => {
  const hover = blocks(HOVER).join("\n");

  it("lifts the tile under the pointer, on the tile or anywhere on the locked visual", () => {
    for (const selector of [
      ".rv4-lockbadge:hover",
      ".rv4-tb-lock:hover .rv4-lockbadge",
      ".rv4-loop.is-locked:hover .rv4-lockbadge",
      ".rv4-fvm__lock:hover .rv4-lockbadge",
      ".rv4-fvt__lock:hover .rv4-lockbadge",
    ]) {
      expect(hover, selector).toContain(selector);
    }
    expect(hover).toContain("translate: 0 -2px");
    expect(hover).toContain("box-shadow: 0 6px 14px rgba(0, 0, 0, 0.18)");
    expect(hover).toContain("filter: brightness(1.06)");
    expect(hover).not.toMatch(/\btransform:/);
    expect(CSS).not.toMatch(/^\.rv3[^\n{]*\.rv4-lockbadge:hover/m);
  });

  it("keeps the tile still under reduced motion", () => {
    const reduced = blocks(REDUCED).find((body) => body.includes(".rv4-lockbadge:hover"));
    expect(reduced, "no reduced-motion block for the tile's hover").toBeDefined();
    expect(reduced).toContain("translate: none");
  });
});

/*
 * 1945269177, "Updated Lock icon + Text." on the locked chapter heads — the same
 * Unlock Report CTA, so the same hover: the whole head is the button.
 */
describe("the locked chapter's lock — hover and focus", () => {
  const hover = blocks(HOVER).join("\n");

  it("lifts the disc and darkens 'Unlock Report' when the head is hovered", () => {
    expect(hover).toContain(
      ".rv4-chapter.is-locked .rv4-chapter__button:hover .rv4-chapter__lock-disc"
    );
    expect(hover).toContain(
      ".rv4-chapter.is-locked .rv4-chapter__button:hover .rv4-chapter__lock-label"
    );
    expect(CSS).not.toMatch(/^\.rv3[^\n{]*\.rv4-chapter__button:hover/m);
    const reduced = blocks(REDUCED).find((body) => body.includes(".rv4-chapter__button:hover"));
    expect(reduced, "no reduced-motion block for the chapter lock's hover").toBeDefined();
    expect(reduced).toContain("translate: none");
  });

  it("rings the chapter head for the keyboard, which had no focus style", () => {
    const ring = ruleNaming(".rv3 .rv4-chapter__button:focus-visible");
    expect(ring).toContain("outline: 2px solid var(--rv3-violet)");
  });
});
