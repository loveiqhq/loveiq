// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import V4TypicalBeliefs from "@features/report/ui/v3/V4TypicalBeliefs";
import V4ShadowBeliefs from "@features/report/ui/v3/V4ShadowBeliefs";
import { buildTypicalBeliefs, REPORT_V4_TYPICAL_BELIEFS } from "@/data/report3-typical-beliefs";

/**
 * "Expanded Chapter — Typical Beliefs" — Figma 304:256, with its coral turn panel
 * (368:5482) and green sun panel (368:5623).
 *
 * Follows V4LearnMore.test.tsx: assert the rendered DOM, plus the CSS contracts
 * the DOM cannot show, read off disk.
 */

const V3_CSS = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");
const VIEW = buildTypicalBeliefs("Spark Seeker")!;

/** Where every row's top sits, in viewport coordinates. */
let rowTop = 9999;

beforeEach(() => {
  rowTop = 9999;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ top: rowTop, height: 61, width: 329 }) as DOMRect
  );
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("innerHeight", 800);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the chapter body — 304:256", () => {
  it("runs prose, both panels and the H2 in the frame's order", () => {
    const { container } = render(<V4TypicalBeliefs view={VIEW} />);
    const order = [...container.querySelectorAll(".rv4-prose__p, .rv4-turn, .rv4-sun, .rv4-tb__h2")]
      .map((el) => el.className.split(" ")[0])
      .filter((c, i, all) => c !== all[i - 1]);
    expect(order).toEqual([
      "rv4-prose__p", // the four intro paragraphs and the belief-map lede
      "rv4-turn",
      "rv4-sun",
      "rv4-tb__h2",
      "rv4-prose__p", // the two worked examples
    ]);
  });

  it("carries the frame's headings", () => {
    render(<V4TypicalBeliefs view={VIEW} />);
    expect(screen.getByText("The Spark Seeker belief map")).toBeInTheDocument();
    expect(screen.getByText("Common challenges")).toBeInTheDocument();
    expect(screen.getByText("When spontaneity becomes proof of desire")).toBeInTheDocument();
    expect(screen.getByText("When being wanted becomes evidence of worth")).toBeInTheDocument();
  });
});

describe("the belief panels", () => {
  it("draws ten rows in each", () => {
    const { container } = render(<V4TypicalBeliefs view={VIEW} />);
    expect(container.querySelectorAll(".rv4-turn__row")).toHaveLength(10);
    expect(container.querySelectorAll(".rv4-sun__row")).toHaveLength(10);
  });

  it("lands every turn on one of the ten sun beliefs", () => {
    // The authored chapter writes a bespoke shift under each shadow belief; Mark
    // replaced all ten with the sun beliefs, so the panels read as one set seen
    // twice. If a future copy pass breaks that, this is where it shows.
    const { turns, sun } = REPORT_V4_TYPICAL_BELIEFS["Spark Seeker"]!;
    expect(turns).toHaveLength(10);
    expect(new Set(sun)).toHaveLength(10);
    for (const turn of turns) expect(sun).toContain(turn.shift);
  });
});

describe("the turn — 368:5482", () => {
  const rows = (c: HTMLElement) => c.querySelectorAll(".rv4-turn__row");

  it("delivers every row at rest, as krow/6 to krow/10 are drawn", () => {
    const { container } = render(<V4ShadowBeliefs turns={VIEW.panels.turns} />);
    expect(container.querySelectorAll(".rv4-turn__row.is-turned")).toHaveLength(0);
  });

  it("turns a row once its top passes the middle of the viewport", () => {
    const { container } = render(<V4ShadowBeliefs turns={VIEW.panels.turns} />);
    // innerHeight 800, so the line is 400 and the margin puts the trigger at 388.
    rowTop = 395;
    fireEvent.scroll(window);
    expect(container.querySelectorAll(".rv4-turn__row.is-turned")).toHaveLength(0);

    rowTop = 380;
    fireEvent.scroll(window);
    expect(rows(container)).toHaveLength(10);
    expect(container.querySelectorAll(".rv4-turn__row.is-turned")).toHaveLength(10);
  });

  it("keeps every shift in the DOM even at rest, so it is still read aloud", () => {
    const { container } = render(<V4ShadowBeliefs turns={VIEW.panels.turns} />);
    expect(container.querySelectorAll(".rv4-turn__row.is-turned")).toHaveLength(0);
    expect(container.querySelectorAll(".rv4-turn__shift-text")).toHaveLength(10);
    expect(screen.getByText(VIEW.panels.turns[9]!.shift)).toBeInTheDocument();
  });

  it("stops animating past animatedCount — the paywalled frame turns three", () => {
    const { container } = render(<V4ShadowBeliefs turns={VIEW.panels.turns} animatedCount={3} />);
    rowTop = 100;
    fireEvent.scroll(window);
    expect(container.querySelectorAll(".rv4-turn__row.is-turned")).toHaveLength(3);
  });
});

describe("reportV3.css — belief panel contracts", () => {
  /**
   * EVERY block a selector opens, joined — not just the first.
   * `.rv3 .rv4-sun {` also closes the shared `.rv4-turn, .rv4-sun` rule, and
   * `.rv3 .rv4-turn__shift {` appears again inside the reduced-motion block. Taking
   * one occurrence reads whichever happened to come first and quietly asserts
   * nothing.
   */
  const block = (selector: string) => {
    const found: string[] = [];
    for (let at = V3_CSS.indexOf(selector); at !== -1; at = V3_CSS.indexOf(selector, at + 1)) {
      found.push(V3_CSS.slice(at, V3_CSS.indexOf("}", at)));
    }
    expect(found.length).toBeGreaterThan(0);
    return found.join("\n");
  };

  it("gives the two panels the frame's coral and green, at the same opacities", () => {
    expect(block(".rv3 .rv4-turn {")).toContain("rgba(194, 84, 47, 0.26)");
    expect(block(".rv3 .rv4-sun {")).toContain("rgba(46, 125, 91, 0.26)");
    // Both shadows are the hue at 34%, offset 6, blur 14, spread -8.
    expect(block(".rv3 .rv4-turn {")).toContain("0 6px 14px -8px rgba(194, 84, 47, 0.34)");
    expect(block(".rv3 .rv4-sun {")).toContain("0 6px 14px -8px rgba(46, 125, 91, 0.34)");
  });

  it("collapses the shift with 0fr, not a max-height guess", () => {
    // Rows land on the frame's 126px whether their shift wraps to one line or two,
    // which a fixed max-height cannot do.
    expect(block(".rv3 .rv4-turn__shift {")).toContain("grid-template-rows: 0fr");
    expect(block(".rv3 .rv4-turn__row.is-turned .rv4-turn__shift {")).toContain(
      "grid-template-rows: 1fr"
    );
  });

  it("fades the strike in by colour, since a line-through cannot be part-drawn", () => {
    const css = block(".rv3 .rv4-turn__text {");
    expect(css).toContain("text-decoration-line: line-through");
    expect(css).toContain("text-decoration-color: transparent");
    expect(block(".rv3 .rv4-turn__row.is-turned .rv4-turn__text {")).toContain(
      "text-decoration-color: currentColor"
    );
  });

  it("puts the row's 9px gap inside the collapsing box, so a resting row is 61px", () => {
    expect(block(".rv3 .rv4-turn__shift-inner {")).toContain("padding-top: 9px");
  });
});
