// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import V4TypicalBeliefs from "@features/report/ui/v3/V4TypicalBeliefs";
import V4ShadowBeliefs from "@features/report/ui/v3/V4ShadowBeliefs";
import V4SunBeliefs from "@features/report/ui/v3/V4SunBeliefs";
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
const LOCKED = buildTypicalBeliefs("Spark Seeker", { locked: true })!;

/** Where every row's top sits, in viewport coordinates. */
let rowTop = 9999;
/** A collapsed chapter (`display: none`) lays nothing out: every box is 0×0 at 0. */
let collapsed = false;

beforeEach(() => {
  rowTop = 9999;
  collapsed = false;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    () =>
      (collapsed
        ? { top: 0, height: 0, width: 0 }
        : { top: rowTop, height: 61, width: 329 }) as DOMRect
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

  // Figma 304:277 headed the lede with "The Spark Seeker belief map" (Mark, 28.09: "H2").
  // Sanjin's doc has no such heading (02.10), so the lede follows the intro directly.
  it("runs the lede straight after the intro, with no belief-map heading", () => {
    const { container } = render(<V4TypicalBeliefs view={VIEW} />);
    expect(container.querySelector(".rv4-prose__h.is-h2")).toBeNull();
    expect(screen.queryByText(/Belief Map/i)).toBeNull();
  });

  it("carries its headings: Common Challenges, and no subheadings under it (Sanjin's doc)", () => {
    const { container } = render(<V4TypicalBeliefs view={VIEW} />);
    expect(screen.getByText("Common Challenges")).toBeInTheDocument();
    expect(container.querySelectorAll(".rv4-prose__h:not(.is-h2)")).toHaveLength(0);
  });
});

describe("the belief panels", () => {
  it("draws ten rows in each", () => {
    const { container } = render(<V4TypicalBeliefs view={VIEW} />);
    expect(container.querySelectorAll(".rv4-turn__row")).toHaveLength(10);
    expect(container.querySelectorAll(".rv4-sun__row")).toHaveLength(10);
  });

  it("turns each shadow belief into its own shift, apart from the ten sun beliefs", () => {
    // Since 2026-09-24 (comment 1940014480) the frame follows the authored chapter:
    // a bespoke shift under each shadow belief, and a sun panel of its own. They used
    // to be one set seen twice.
    const { turns, sun } = REPORT_V4_TYPICAL_BELIEFS["Spark Seeker"]!;
    expect(turns).toHaveLength(10);
    expect(new Set(turns.map((t) => t.shift))).toHaveLength(10);
    expect(new Set(sun)).toHaveLength(10);
    for (const turn of turns) expect(sun).not.toContain(turn.shift);
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

  // Review 27.09, Fatih: the coral panel's turn is its crossing out, and the checkmark
  // animation is the sun panel's alone. A turned row keeps its pink minus.
  it("keeps the pink minus on a turned row: the crossing out is the turn", () => {
    const { container } = render(<V4ShadowBeliefs turns={VIEW.panels.turns} />);
    rowTop = 380;
    fireEvent.scroll(window);
    const turned = container.querySelectorAll(".rv4-turn__row.is-turned");
    expect(turned).toHaveLength(10);
    for (const row of turned) {
      const disc = row.querySelector(".rv4-turn__tick")!;
      expect(disc.querySelector(".rv4-turn__minus")).not.toBeNull();
      expect(disc.querySelector("svg")).toBeNull();
    }
  });

  // A designed chapter closes with display:none, where every row measures 0×0 at top 0,
  // which reads as "past the line": every row turned while nobody could see them.
  it("keeps its rows as they were while the chapter is collapsed", () => {
    const { container } = render(<V4ShadowBeliefs turns={VIEW.panels.turns} />);
    const turnedRows = () => container.querySelectorAll(".rv4-turn__row.is-turned");

    collapsed = true;
    fireEvent.scroll(window);
    expect(turnedRows()).toHaveLength(0);

    collapsed = false;
    rowTop = 380;
    fireEvent.scroll(window);
    expect(turnedRows()).toHaveLength(10);

    collapsed = true;
    fireEvent.scroll(window);
    expect(turnedRows()).toHaveLength(10);

    collapsed = false;
    rowTop = 395;
    fireEvent.scroll(window);
    expect(turnedRows()).toHaveLength(0);
  });

  it("turns nothing past the wall, however far the reader scrolls", () => {
    const { container } = render(
      <V4ShadowBeliefs turns={LOCKED.panels.turns} lockedFrom={LOCKED.lockedFrom} />
    );
    rowTop = 100;
    fireEvent.scroll(window);
    expect(container.querySelectorAll(".rv4-turn__row.is-turned")).toHaveLength(3);
  });
});

// Review 27.09, Mark: "maybe similarly as above with the scroll. When element is at the
// scroll line place the round green circle and then draw the tick into the circle."
describe("the sun ticks — 368:5623, drawn at the coral panel's scroll line", () => {
  const drawnRows = (c: HTMLElement) => c.querySelectorAll(".rv4-sun__row.is-drawn");

  it("delivers every free row without its circle or tick", () => {
    const { container } = render(<V4SunBeliefs sun={VIEW.panels.sun} />);
    expect(drawnRows(container)).toHaveLength(0);
  });

  it("draws a row's tick once its top passes the middle, as the coral rows turn", () => {
    const { container } = render(<V4SunBeliefs sun={VIEW.panels.sun} />);
    rowTop = 395;
    fireEvent.scroll(window);
    expect(drawnRows(container)).toHaveLength(0);

    rowTop = 380;
    fireEvent.scroll(window);
    expect(drawnRows(container)).toHaveLength(10);
  });

  it("takes the tick back once the row is below the line again, as the coral rows unturn", () => {
    const { container } = render(<V4SunBeliefs sun={VIEW.panels.sun} />);
    rowTop = 380;
    fireEvent.scroll(window);
    rowTop = 395;
    fireEvent.scroll(window);
    expect(drawnRows(container)).toHaveLength(0);
  });

  // Fatih, 27.09: in the paywalled chapter the locked rows' ticks sat under the blur from
  // the start — "make those added one by one while you're scrolling". They now draw at
  // the same line as the clear rows, and leave again below it.
  it("draws the locked rows' ticks at the line too, under the blur", () => {
    const { container } = render(
      <V4SunBeliefs sun={LOCKED.panels.sun} lockedFrom={LOCKED.lockedFrom} />
    );
    const lockedDrawn = () =>
      container.querySelectorAll(".rv4-sun__list.is-locked .rv4-sun__row.is-drawn");
    expect(drawnRows(container)).toHaveLength(0);

    rowTop = 380;
    fireEvent.scroll(window);
    expect(drawnRows(container)).toHaveLength(10);
    expect(lockedDrawn()).toHaveLength(7);

    rowTop = 395;
    fireEvent.scroll(window);
    expect(drawnRows(container)).toHaveLength(0);
  });
});

describe("the paywalled chapter — 348:213", () => {
  it("turns the first three rows and locks the other seven", () => {
    // 381:222: krow/1-3 are "turned (p=1)", krow/4-10 "at rest (p=0) · LOCKED".
    const { container } = render(<V4TypicalBeliefs view={LOCKED} />);
    expect(container.querySelectorAll(".rv4-turn__row")).toHaveLength(10);
    expect(container.querySelectorAll(".rv4-turn__row.is-locked")).toHaveLength(7);
    const locked = [...container.querySelectorAll(".rv4-turn__row")].map((el) =>
      el.classList.contains("is-locked")
    );
    expect(locked).toEqual([false, false, false, true, true, true, true, true, true, true]);
  });

  it("locks the sun panel at the same row, as 381:362 draws it", () => {
    const { container } = render(<V4TypicalBeliefs view={LOCKED} />);
    expect(container.querySelectorAll(".rv4-sun__row")).toHaveLength(10);
    expect(container.querySelectorAll(".rv4-sun__row.is-locked")).toHaveLength(7);
  });

  it("withholds the shift on every locked row of the coral panel", () => {
    const { container } = render(<V4TypicalBeliefs view={LOCKED} />);
    // Three shifts survive, one per turned row. The other seven never left the
    // server: a locked row cannot turn, so its shift had no visual job and would
    // have been pure leak.
    expect(container.querySelectorAll(".rv4-turn__shift-text")).toHaveLength(3);
    const coral = container.querySelector(".rv4-turn")!;
    for (const turn of VIEW.panels.turns.slice(3)) {
      expect(coral.textContent).not.toContain(turn.shift);
    }
  });

  it("draws every row as written, the ones under the full blur included", () => {
    // 381:362 draws its locked rows blurred at full length. From 23.09 the server
    // scrambled every row only ever seen under the full blur; since review 26.09
    // ("the unlocked content but blurred", Fatih's call) it sends them as written
    // (lockedBlurCopy.ts), and the blur is what hides them. Row 4 is the ramp.
    const { container } = render(<V4TypicalBeliefs view={LOCKED} />);
    const green = container.querySelector(".rv4-sun")!;
    VIEW.panels.sun.forEach((belief) => expect(green.textContent).toContain(belief));
    const coral = container.querySelector(".rv4-turn")!;
    VIEW.panels.turns.forEach((turn) => expect(coral.textContent).toContain(turn.shadow));
  });

  it("puts the gradient lock on both panels, and only when locked", () => {
    // Figma comments, 2026-09-22: the lock sits on top of VISUALS only — the two
    // belief panels, never the blurred prose.
    const locked = render(<V4TypicalBeliefs view={LOCKED} />);
    expect(locked.container.querySelectorAll(".rv4-lockbadge")).toHaveLength(2);
    expect(locked.container.querySelectorAll(".rv4-tb__gate .rv4-lockbadge")).toHaveLength(0);
    cleanup();
    const open = render(<V4TypicalBeliefs view={VIEW} />);
    expect(open.container.querySelectorAll(".rv4-lockbadge")).toHaveLength(0);
  });

  it("keeps the locked rows out of reach and the lock itself reachable", () => {
    const { container } = render(<V4TypicalBeliefs view={LOCKED} />);
    for (const list of container.querySelectorAll(
      ".rv4-turn__list.is-locked, .rv4-sun__list.is-locked"
    )) {
      expect(list.getAttribute("aria-hidden")).toBe("true");
      expect(list.hasAttribute("inert")).toBe(true);
    }
    // The click owner is NOT inert — an inert element takes no pointer events.
    for (const group of container.querySelectorAll(".rv4-tb-lock")) {
      expect(group.hasAttribute("inert")).toBe(false);
    }
    // The two tiles, and the paywall card's "Unlock Report →" pill (29.09) under the gate.
    expect(container.querySelectorAll("button.rv4-lockbadge")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Unlock Report" })).toHaveLength(3);
  });

  it("opens the paywall once from every locked surface", () => {
    const onUnlock = vi.fn();
    const { container } = render(<V4TypicalBeliefs view={LOCKED} onUnlock={onUnlock} />);
    // The tiles and the paywall card's pill all read "Unlock Report" since 29.09.
    const targets = [
      ...screen.getAllByRole("button", { name: "Unlock Report" }),
      container.querySelector(".rv4-turn__lock")!,
      container.querySelector(".rv4-sun__lock")!,
      container.querySelector(".rv4-tb__gate")!,
    ];
    expect(targets).toContain(container.querySelector(".rv4-tb__gate .rv4-premium__cta"));
    for (const target of targets) {
      onUnlock.mockClear();
      fireEvent.click(target);
      expect(onUnlock).toHaveBeenCalledTimes(1);
    }
  });

  it("keeps both panels at full height, so the wall costs no room", () => {
    const { container } = render(<V4TypicalBeliefs view={LOCKED} />);
    expect(container.querySelectorAll(".rv4-turn__row")).toHaveLength(10);
    expect(container.querySelectorAll(".rv4-sun__row")).toHaveLength(10);
  });

  it("holds Common challenges open for three blocks, then ramps into the blur", () => {
    const { container } = render(<V4TypicalBeliefs view={LOCKED} />);
    // 348:221 and Mark's Paywall on the doc keep three paragraphs sharp; the next block is
    // the ramp and everything after it sits under the full blur, with the card on it.
    expect(screen.getByText("But the belief changes its meaning.")).toBeInTheDocument();
    const gated = container.querySelector(".rv4-tb__gated");
    expect(gated).not.toBeNull();
    expect(gated!.getAttribute("aria-hidden")).toBe("true");
    expect(gated!.hasAttribute("inert")).toBe(true);
    // The ramp, then the rest under the full blur: since review 26.09 the copy under the blur is the real one (lockedBlurCopy.ts).
    expect(container.querySelector(".rv4-tb__ramp")!.textContent).toContain(
      "For the Spark Seeker, planning may begin to feel like evidence"
    );
    expect(container.querySelector(".rv4-tb__blurred")!.textContent).toContain("Now consider");
    expect(container.querySelectorAll(".rv4-tb__gate .rv4-premium")).toHaveLength(1);
  });

  it("blurs nothing at all for a reader who has paid", () => {
    const { container } = render(<V4TypicalBeliefs view={VIEW} />);
    expect(container.querySelectorAll(".is-locked")).toHaveLength(0);
    expect(container.querySelector(".rv4-tb__gated")).toBeNull();
    expect(container.querySelector(".rv4-premium")).toBeNull();
    expect(container.querySelectorAll(".rv4-turn__shift-text")).toHaveLength(10);
    expect(container.querySelector(".rv4-tb__gate")).toBeNull();
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

  // Mark, 28.09 (1944062651): "We decrease the background color intensity". 368:5482
  // washes 0.10 to 0.01 of its coral now, 368:5623 0.08 to 0.01 of its green (both were
  // 0.11 to 0.03).
  it("washes both panels as lightly as the frame now does", () => {
    const turn = block(".rv3 .rv4-turn {");
    expect(turn).toContain(
      "linear-gradient(180deg, rgba(194, 84, 47, 0.1) 0%, rgba(194, 84, 47, 0.01) 100%), #fff"
    );
    const sun = block(".rv3 .rv4-sun {");
    expect(sun).toContain(
      "linear-gradient(180deg, rgba(46, 125, 91, 0.08) 0%, rgba(46, 125, 91, 0.01) 100%), #fff"
    );
    // No V4 panel rule keeps the old wash (V3's own panel, frozen at line 1514, does).
    expect(turn).not.toContain("0.03)");
    expect(sun).not.toContain("0.03)");
  });

  // Mark, 28.09 (1944065364): "We changed the font color to black." 368:5633 and its
  // siblings are #161021, the report's ink; the coral panel's shift stays green.
  it("sets the sun beliefs in the report's ink, and leaves the shift green", () => {
    const sunText = block(".rv3 .rv4-sun__text {");
    expect(sunText).toContain("color: var(--rv3-ink)");
    expect(sunText).not.toContain("#1d3a2f");
    expect(block(".rv3 .rv4-turn__shift-text {")).toContain("color: #2e7d5b");
  });

  it("collapses the shift with 0fr, not a max-height guess", () => {
    // Rows land on the frame's 126px whether their shift wraps to one line or two,
    // which a fixed max-height cannot do.
    expect(block(".rv3 .rv4-turn__shift {")).toContain("grid-template-rows: 0fr");
    expect(block(".rv3 .rv4-turn__row.is-turned .rv4-turn__shift {")).toContain(
      "grid-template-rows: 1fr"
    );
  });

  it("leaves the coral disc alone on a turn: no rule swaps its minus for a check", () => {
    // Review 27.09: the checkmark is the sun panel's animation, not the coral turn's.
    expect(V3_CSS).not.toMatch(/\.rv4-turn__row\.is-turned \.rv4-turn__(tick|minus|check)\b/);
    expect(V3_CSS).not.toContain(".rv4-turn__check");
    expect(block(".rv3 .rv4-turn__tick {")).toContain("background: rgba(194, 84, 47, 0.16)");
  });

  it("fades the strike in by colour, since a line-through cannot be part-drawn", () => {
    const css = block(".rv3 .rv4-turn__text {");
    expect(css).toContain("text-decoration-line: line-through");
    expect(css).toContain("text-decoration-color: transparent");
    expect(block(".rv3 .rv4-turn__row.is-turned .rv4-turn__text {")).toContain(
      "text-decoration-color: currentColor"
    );
  });

  it("puts the row's 9px gap inside the clipped content, so a resting row is 61px", () => {
    // As padding on the collapsing box itself it never collapsed — a 0fr track still
    // holds its item's padding — so resting rows measured 70.4. The last word on the
    // inner box is padding 0, and the 9px is the label's margin, inside the clip.
    const inner = block(".rv3 .rv4-turn__shift-inner {");
    expect(inner.lastIndexOf("padding-top: 0")).toBeGreaterThan(
      inner.lastIndexOf("padding-top: 9px")
    );
    expect(block(".rv3 .rv4-turn__shift-label {")).toContain("margin-top: 9px");
  });

  it("blurs locked rows at Figma's radius 5 (CSS 2.5px), with the ramp row left to the overlay", () => {
    expect(block(".rv3 .rv4-turn__row.is-locked.is-blurred,")).toContain(
      "filter: blur(var(--rv4-veil, 5px))"
    );
    // The old uniform 5px is switched off for every locked row first.
    const locked = block(".rv3 .rv4-turn__row.is-locked,");
    expect(locked).toContain("filter: none");
    expect(block(".rv3 .rv4-turn__ramp {")).toContain("--rv4-band: 50.8%");
    expect(block(".rv3 .rv4-sun__ramp {")).toContain("--rv4-band: 65.6%");
  });

  it("stacks the progressive blur to the veil, sigmas in quadrature", () => {
    // 2.5px until review 26.09, 5px since (v4Veil2609.test.ts).
    const factors = [1, 2, 3].map((n) =>
      parseFloat(
        block(`.rv3 .rv4-pblur > span:nth-child(${n}) {`).match(
          /--rv4-pb:\s*calc\(var\(--rv4-veil, 5px\) \* ([\d.]+)\)/
        )![1]!
      )
    );
    expect(Math.sqrt(factors.reduce((sum, k) => sum + k * k, 0))).toBeCloseTo(1, 2);
  });

  /**
   * Figma draws these panels 361 wide because the 393 frame has 16px gutters. Read
   * as a WIDTH rather than a ceiling, that number puts the panel past the viewport
   * on any narrower phone and scrolls the whole page sideways — which is what Mark
   * reported from his phone against the staging build. 361 is a maximum here.
   */
  it("treats the frame's 361 as a ceiling, not a width", () => {
    // (The Snapshot's panel shared this rule until the chapter nudges replaced it;
    // the nudges run full bleed, as 663:1089 draws them.)
    for (const selector of [".rv3 .rv4-turn,"]) {
      const css = block(selector);
      expect(css).toContain("max-width: 361px");
      expect(css).toContain("width: 100%");
      expect(css).not.toContain("  width: 361px;");
    }
    // Inside the chapter the panels fill the column on tablet and desktop, like the
    // prose around them — Figma has no desktop frames to hold them at 361.
    expect(block(".rv3 .rv4-tb .rv4-turn,")).toContain("max-width: none");
  });

  it("anchors the blob to the panel edge, so the crescent survives a narrow phone", () => {
    // 368:5483 is drawn at left 251 in a 361 panel, overhanging the right edge by
    // 22. Pinned to `left`, a narrower panel would slide it into the middle.
    const css = block(".rv3 .rv4-turn__blob {");
    expect(css).toContain("right: -22px");
    expect(css).not.toContain("left:");
  });

  // Mark, 29.09 (1945265889, in Marcus's thread on the top-right gradient): "Decreased the
  // gradient strength. Please adapt". Both blobs were at 34% of their hue on 28.09;
  // 368:5483 now fills at 10% and 368:5624 at 15%. The layer's 62% and the 34 blur stay.
  it("washes the two blobs as faintly as the frame now does", () => {
    const coral = block(".rv3 .rv4-turn__blob {");
    expect(coral).toContain("background: rgba(194, 84, 47, 0.1);");
    const green = block(".rv3 .rv4-sun__blob {");
    expect(green).toContain("background: rgba(46, 125, 91, 0.15);");
    for (const css of [coral, green]) {
      expect(css).toContain("opacity: 0.62");
      expect(css).toContain("filter: blur(34px)");
      expect(css).not.toContain("0.34)");
    }
  });
});

describe("reportV3.css — the sun tick draws in two steps (review 27.09)", () => {
  const ruleOf = (selector: string) => {
    const at = V3_CSS.indexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThan(0);
    return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
  };
  const REST = ".rv3 .rv4-sun__row .rv4-sun__tick";
  const DRAWN = ".rv3 .rv4-sun__row.is-drawn .rv4-sun__tick";

  it("rests with no circle and the tick's stroke fully offset", () => {
    const circle = ruleOf(REST);
    expect(circle).toMatch(/opacity:\s*0;/);
    expect(circle).toMatch(/transform:\s*scale\(0\);/);
    // The check is 9.28 units long: a 10-unit dash pushed 11 along leaves no round cap
    // showing at the path's start.
    const path = ruleOf(`${REST} path`);
    expect(path).toMatch(/stroke-dasharray:\s*10 20;/);
    expect(path).toMatch(/stroke-dashoffset:\s*11;/);
  });

  it("places the circle first, then draws the tick into it", () => {
    const circle = ruleOf(DRAWN);
    expect(circle).toMatch(/opacity:\s*1;/);
    expect(circle).toMatch(/transform:\s*none;/);
    const path = ruleOf(`${DRAWN} path`);
    expect(path).toMatch(/stroke-dashoffset:\s*0;/);
    expect(path).toMatch(/stroke-dashoffset 360ms [a-z-]+ 220ms/);
  });

  it("takes the tick away before the circle, in reverse", () => {
    expect(ruleOf(REST)).toMatch(/transform 220ms [a-z-]+ 140ms/);
    expect(ruleOf(`${REST} path`)).toMatch(/stroke-dashoffset 200ms [a-z-]+;/);
  });

  it("shows the finished tick under reduced motion", () => {
    const at = V3_CSS.indexOf(`@media (prefers-reduced-motion: reduce) {\n  ${REST},`);
    expect(at).toBeGreaterThan(0);
    const media = V3_CSS.slice(at, V3_CSS.indexOf("\n}\n", at));
    expect(media).toMatch(/opacity:\s*1;/);
    expect(media).toMatch(/transform:\s*none;/);
    expect(media).toMatch(/stroke-dashoffset:\s*0;/);
    expect(media.match(/transition:\s*none;/g)).toHaveLength(2);
  });

  it("sits below the frozen region", () => {
    expect(V3_CSS.slice(0, V3_CSS.indexOf(`${REST} {`)).split("\n").length).toBeGreaterThan(1884);
  });
});
