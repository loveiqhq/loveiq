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
