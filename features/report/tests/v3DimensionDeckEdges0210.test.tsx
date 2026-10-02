// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import V3DimensionDeck from "@features/report/ui/v3/V3DimensionDeck";
import { report3ArchetypeCard } from "@/data/report3-archetype-card";

/**
 * Mark, review 02.10 (Notion, desktop locked, hidden.png): "Same as the What shaped this
 * report. Can we have the arrow and make the hidden one clickable?" The deck takes the
 * science gallery's two mouse shortcuts: a white disc at the cards' middle on either side
 * that steps the pager (shown only where there is a step to take), and a card the viewport
 * cuts that glides into view when clicked. Both stay out of the tab order and the
 * accessibility tree; the pager row under the cards is the keyboard path.
 */

const V3_CSS = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");
const DIMENSIONS = report3ArchetypeCard["Spark Seeker"]!.dimensions;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The deck `width` wide (708 at a 1280 window, 853 at 1440), as v3DimensionDeck0110:
 * slots 280 apart and 266 wide from a 22px inset, Power ending at 1128, the track 22 after. */
const setup = (width: number) => {
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
  Object.defineProperty(viewport, "scrollWidth", { value: 1150, configurable: true });
  viewport.style.scrollPaddingInlineStart = "22px";
  viewport.getBoundingClientRect = () => ({ left: 0, width, right: width }) as DOMRect;
  const slots = Array.from(view.container.querySelectorAll<HTMLElement>(".rv3-deck__slot"));
  slots.forEach((slot, i) => {
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
  const edges = () =>
    Array.from(view.container.querySelectorAll<HTMLElement>(".rv3-deck__edge"), (e) =>
      e.classList.contains("is-prev") ? "prev" : "next"
    );
  const edge = (side: "prev" | "next") =>
    view.container.querySelector<HTMLElement>(`.rv3-deck__edge.is-${side}`)!;
  return { container: view.container, viewport, slots, glides, scrollTo, edges, edge };
};

describe("the dimension deck's arrow, as the science gallery's (review 02.10)", () => {
  it("draws Next alone at the start and Previous alone at the end", () => {
    const deck = setup(708);
    deck.scrollTo(0);
    expect(deck.edges()).toEqual(["next"]);
    deck.scrollTo(1150 - 708);
    expect(deck.edges()).toEqual(["prev"]);
  });

  it("steps the pager the way the pager's own arrows do", () => {
    const deck = setup(708);
    deck.scrollTo(0);
    fireEvent.click(deck.edge("next"));
    expect(deck.glides.at(-1)).toBe(280);
  });

  it("keeps the arrows out of the tab order, the accessibility tree and the pager group", () => {
    const deck = setup(708);
    deck.scrollTo(0);
    const next = deck.edge("next");
    expect(next.getAttribute("aria-hidden")).toBe("true");
    expect(next.tabIndex).toBe(-1);
    const group = screen.getByRole("group", { name: "Dimension cards" });
    expect(group.contains(next)).toBe(false);
    // The pager row keeps only its own buttons: Previous, a bar a stop (three at 708), Next.
    const bars = deck.container.querySelectorAll(".rv3-deck__dot").length;
    expect(bars).toBe(3);
    expect(within(group).getAllByRole("button")).toHaveLength(2 + bars);
  });

  it("draws none where every card already shows", () => {
    const deck = setup(1200);
    deck.scrollTo(0);
    expect(deck.edges()).toEqual([]);
  });
});

describe("the dimension deck's hidden card glides into view when clicked (review 02.10)", () => {
  it("brings a cut card to the nearest stop that shows it whole", () => {
    const deck = setup(708);
    deck.scrollTo(0);
    // At 708 the third card (582–848) is cut; it is whole from 140 to 582, so the 280 stop.
    expect(deck.slots[2]!.classList.contains("is-peeking")).toBe(true);
    fireEvent.click(deck.slots[2]!);
    expect(deck.glides.at(-1)).toBe(280);
  });

  it("leaves a card in full view where it is", () => {
    const deck = setup(708);
    deck.scrollTo(0);
    fireEvent.click(deck.slots[1]!);
    expect(deck.glides).toEqual([]);
  });

  it("gives the cut card no tab stop or role: the pager is the keyboard path", () => {
    const deck = setup(708);
    deck.scrollTo(0);
    expect(deck.slots[2]!.hasAttribute("tabindex")).toBe(false);
    expect(deck.slots[2]!.getAttribute("role")).toBeNull();
  });
});

describe("the arrow's look: the gallery's disc at the cards' middle, from 700px only", () => {
  const css = V3_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  it("is hidden below 700px and on the 393 preview", () => {
    expect(css).toMatch(/\.rv3 \.rv3-deck__edge \{\s*display: none;\s*\}/);
  });

  it("is a 40px white disc 156px down the deck (the cards' middle), 10px in", () => {
    const at = css.lastIndexOf(".rv3.rv4 .rv3-deck__edge {");
    expect(at).toBeGreaterThan(css.indexOf("@media (min-width: 700px)"));
    const r = css.slice(at, css.indexOf("}", at));
    expect(r).toMatch(/width:\s*40px/);
    expect(r).toMatch(/height:\s*40px/);
    expect(r).toMatch(/top:\s*156px/);
    expect(r).toMatch(/background:\s*#fff/);
    expect(css).toMatch(/\.rv3\.rv4 \.rv3-deck__edge\.is-prev \{\s*left: 10px;/);
    expect(css).toMatch(/\.rv3\.rv4 \.rv3-deck__edge\.is-next \{\s*right: 10px;/);
    expect(css).toMatch(/\.rv3\.rv4 \.rv3-deck__slot\.is-peeking \{\s*cursor: pointer;/);
  });
});
