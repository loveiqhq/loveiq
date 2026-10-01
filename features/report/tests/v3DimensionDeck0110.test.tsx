// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import V3DimensionDeck from "@features/report/ui/v3/V3DimensionDeck";
import { sciStops } from "@features/report/ui/v3/useSciPager";
import { report3ArchetypeCard } from "@/data/report3-archetype-card";

/**
 * Mark, desktop review 01.10 (out of view tile beige.png, white space.png): "Lets only
 * have the tile that is no in view be beiged out. Also, lets not have this white space
 * next to the last tile when you click through. Once it is clearly visible next to the
 * others, it is good. So essentially, one click to the right is already okay."
 *
 * From 700px the deck ends 22px after Power (its start inset), so the scroll stops where
 * Power is whole. A stop at which the last card already shows whole IS the end, so where
 * three cards fit one click goes there. Only a card the viewport cuts is beige; a card in
 * full view keeps the white design, the glow staying on the focused one. The phone keeps
 * a stop a card.
 */

const V3_CSS = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");
const DIMENSIONS = report3ArchetypeCard["Spark Seeker"]!.dimensions;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("sciStops — the end is where the last card shows whole", () => {
  // The deck at 853: cards 280 apart from a 22px inset, Power ending at 1128, and the
  // track 22 after it, so the scroll ends at 1150 - 853 = 297. Power is whole from 275.
  it("folds every stop at which the last card is already whole into the end", () => {
    // Without that measure the 280 stop stands, and the end is a 17px nudge after it.
    expect(sciStops([0, 280, 560, 840], 297).map((s) => s.left)).toEqual([0, 280, 297]);
    expect(sciStops([0, 280, 560, 840], 297, 1128 - 853)).toEqual([
      { left: 0, card: 0 },
      { left: 297, card: 3 },
    ]);
    // At 618 two cards fit (the end 532, Power whole from 510): the second click ends it.
    expect(sciStops([0, 280, 560, 840], 532, 1128 - 618)).toEqual([
      { left: 0, card: 0 },
      { left: 280, card: 1 },
      { left: 532, card: 3 },
    ]);
  });

  it("leaves the phone a stop a card", () => {
    expect(sciStops([0, 280, 560, 840], 840, 1128 - 361).map((s) => s.left)).toEqual([
      0, 280, 560, 840,
    ]);
  });

  // Final review, 01.10: a deck all but wide enough for every card (the end measure at
  // or under 1) folded the first stop into the end too, and the start was unreachable.
  it("never folds the first stop into the end", () => {
    expect(sciStops([0, 280, 560, 840], 10, 0)).toEqual([
      { left: 0, card: 0 },
      { left: 10, card: 3 },
    ]);
  });

  it("changes nothing without the end's measure (the science gallery)", () => {
    expect(sciStops([0, 277, 554, 831, 1108, 1385, 1662], 1010)).toHaveLength(5);
  });
});

/** The deck `width` wide, ending `trailing` after Power: slots 280 apart and 266 wide
 * from a 22px inset, snapping 22 in (the scroll padding), Power ending at 1128. */
const setup = (width: number, trailing: number) => {
  let inFrame = false;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    if (inFrame) return 1;
    inFrame = true;
    try {
      cb(0);
    } finally {
      inFrame = false;
    }
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const view = render(<V3DimensionDeck dimensions={DIMENSIONS} accent="#ff6a3d" />);
  const viewport = view.container.querySelector<HTMLElement>(".rv3-deck__viewport")!;
  Object.defineProperty(viewport, "clientWidth", { value: width, configurable: true });
  Object.defineProperty(viewport, "scrollWidth", { value: 1128 + trailing, configurable: true });
  viewport.style.scrollPaddingInlineStart = "22px";
  viewport.getBoundingClientRect = () => ({ left: 0, width, right: width }) as DOMRect;
  view.container.querySelectorAll<HTMLElement>(".rv3-deck__slot").forEach((slot, i) => {
    slot.getBoundingClientRect = () =>
      ({
        left: 22 + 280 * i - viewport.scrollLeft,
        right: 22 + 280 * i - viewport.scrollLeft + 266,
        width: 266,
      }) as DOMRect;
  });
  const glides: number[] = [];
  viewport.scrollTo = ((options: ScrollToOptions) => {
    glides.push(options.left ?? Number.NaN);
  }) as typeof viewport.scrollTo;
  const scrollTo = (left: number) => {
    viewport.scrollLeft = left;
    fireEvent.scroll(viewport);
  };
  const states = () =>
    Array.from(view.container.querySelectorAll(".rv3-deck__slot"), (slot) =>
      slot.classList.contains("is-focused")
        ? "focused"
        : slot.classList.contains("is-visible")
          ? "visible"
          : "peeking"
    );
  const dots = () => Array.from(view.container.querySelectorAll(".rv3-deck__dot"));
  const next = () => screen.getByRole("button", { name: "Next dimension" });
  const previous = () => screen.getByRole("button", { name: "Previous dimension" });
  return { viewport, glides, scrollTo, states, dots, next, previous };
};

describe("V3DimensionDeck — the desktop deck (desktop review 01.10)", () => {
  it("beiges only the card the deck cuts", () => {
    const { scrollTo, states } = setup(853, 22);
    scrollTo(0);
    expect(states()).toEqual(["focused", "visible", "visible", "peeking"]);
  });

  it("goes to the end in one click where three cards fit, Power focused, nothing blank after it", () => {
    const { glides, scrollTo, states, dots, next, previous } = setup(853, 22);
    scrollTo(0);
    expect(dots()).toHaveLength(2);
    fireEvent.click(next());
    expect(glides).toEqual([297]);
    scrollTo(297);
    // Communication is cut at the left now; the three others are whole.
    expect(states()).toEqual(["peeking", "visible", "visible", "focused"]);
    expect(next().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(previous());
    expect(glides).toEqual([297, 0]);
  });

  // Final review, 01.10: a trackpad swipe can rest on the 280 snap point, 17px short of
  // the end, where Power already shows whole: the pager stood on its end dot, Next was
  // off, and the glow stayed on Initiation.
  it("focuses Power wherever it shows whole, a swipe resting short of the end", () => {
    const deck = setup(853, 22);
    deck.scrollTo(280);
    expect(deck.states()).toEqual(["peeking", "visible", "visible", "focused"]);
    expect(deck.next()).toHaveAttribute("aria-disabled", "true");
  });

  it("takes two clicks where two cards fit", () => {
    const { glides, scrollTo, next } = setup(618, 22);
    scrollTo(0);
    fireEvent.click(next());
    scrollTo(280);
    fireEvent.click(next());
    expect(glides).toEqual([280, 532]);
  });

  it("names each dot for the card its stop brings in", () => {
    const { scrollTo, dots } = setup(853, 22);
    scrollTo(0);
    expect(dots().map((d) => d.textContent)).toEqual(["Show Communication", "Show Power"]);
  });

  it("keeps the phone's stop a card", () => {
    // 361: the phone's trailing space (max(69px, 100% - 288px) = 73) lets every card
    // reach the snap edge, 840.
    const { glides, scrollTo, dots, next } = setup(361, 73);
    scrollTo(0);
    expect(dots()).toHaveLength(4);
    fireEvent.click(next());
    expect(glides).toEqual([280]);
  });
});

describe("reportV3.css — the desktop deck (01.10)", () => {
  const block = () => V3_CSS.slice(V3_CSS.indexOf("/* ══ The dimension deck from 700px"));

  it("ends the track 22px after Power from 700px, as it starts", () => {
    expect(block().startsWith("/* ══ The dimension deck from 700px")).toBe(true);
    expect(block()).toContain(".rv3.rv4 .rv3-deck__track {\n    padding-right: 22px;");
  });

  it("shows a whole card that is not focused in the white design, without the glow", () => {
    expect(V3_CSS).toContain(".rv3 .rv3-deck__slot.is-visible > .rv3-deck__card.is-peeking");
    // Wherever two cards fit, so above the 28.09 (c) touch-up, which is 700px and up only.
    const at = V3_CSS.indexOf(
      ".rv3:is(.rv4, .rv4-doc) .rv3-deck__slot.is-visible > .rv3-deck__card.is-focused .rv3-deck__inner {"
    );
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(V3_CSS.indexOf("Desktop touch-up — 28.09 (c)"));
    expect(V3_CSS.slice(at, V3_CSS.indexOf("}", at))).toContain(
      "box-shadow: 0 2px 6px 0 rgba(22, 16, 33, 0.06);"
    );
  });
});
