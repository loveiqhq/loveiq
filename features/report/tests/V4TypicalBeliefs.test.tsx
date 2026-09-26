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
const LOCKED = buildTypicalBeliefs("Spark Seeker", { locked: true })!;

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

  it("turns nothing past the wall, however far the reader scrolls", () => {
    const { container } = render(
      <V4ShadowBeliefs turns={LOCKED.panels.turns} lockedFrom={LOCKED.lockedFrom} />
    );
    rowTop = 100;
    fireEvent.scroll(window);
    expect(container.querySelectorAll(".rv4-turn__row.is-turned")).toHaveLength(3);
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
    expect(screen.getAllByRole("button", { name: "Unlock the full report" })).toHaveLength(2);
  });

  it("opens the paywall once from every locked surface", () => {
    const onUnlock = vi.fn();
    const { container } = render(<V4TypicalBeliefs view={LOCKED} onUnlock={onUnlock} />);
    const targets = [
      ...screen.getAllByRole("button", { name: "Unlock the full report" }),
      container.querySelector(".rv4-turn__lock")!,
      container.querySelector(".rv4-sun__lock")!,
      container.querySelector(".rv4-tb__gate")!,
      screen.getByRole("button", { name: "Unlock full report" }),
    ];
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

  it("holds Common challenges open for four blocks, then ramps into the blur", () => {
    const { container } = render(<V4TypicalBeliefs view={LOCKED} />);
    // 348:221 draws the subheading and three paragraphs sharp; the next block is the
    // ramp and everything after it sits under the full blur, with the card on it.
    expect(screen.getByText("When spontaneity becomes proof of desire")).toBeInTheDocument();
    expect(screen.getByText("But the belief changes its meaning.")).toBeInTheDocument();
    const gated = container.querySelector(".rv4-tb__gated");
    expect(gated).not.toBeNull();
    expect(gated!.getAttribute("aria-hidden")).toBe("true");
    expect(gated!.hasAttribute("inert")).toBe(true);
    // The ramp, then the rest under the full blur: since review 26.09 the copy under the blur is the real one (lockedBlurCopy.ts).
    expect(container.querySelector(".rv4-tb__ramp")!.textContent).toContain(
      "For the Spark Seeker, planning may begin to feel like evidence"
    );
    expect(container.querySelector(".rv4-tb__blurred")!.textContent).toContain(
      "When being wanted becomes evidence of worth"
    );
    expect(container.querySelectorAll(".rv4-tb__gate .rv4-premium")).toHaveLength(1);
  });

  it("blurs nothing at all for a reader who has paid", () => {
    const { container } = render(<V4TypicalBeliefs view={VIEW} />);
    expect(container.querySelectorAll(".is-locked")).toHaveLength(0);
    expect(container.querySelector(".rv4-tb__gated")).toBeNull();
    expect(container.querySelector(".rv4-premium")).toBeNull();
    expect(container.querySelectorAll(".rv4-turn__shift-text")).toHaveLength(10);
    expect(screen.getByText("When being wanted becomes evidence of worth")).toBeInTheDocument();
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
});
