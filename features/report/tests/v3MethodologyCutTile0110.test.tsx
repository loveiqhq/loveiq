// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import V3Methodology from "@features/report/ui/v3/V3Methodology";

/**
 * Mark, desktop review 01.10 (HiddenClickable.png): "Much better. Can we make the hidden
 * tile clickable so that it moves into view?" A tile the frame cuts is a button-like
 * target: one click glides the deck to the nearest stop that shows it whole. A tile
 * already in full view does nothing, and the pager stays the keyboard path.
 */

/** A 917px desktop column: 265px tiles 12 apart, the track at x=40 (as the gallery test). */
const TILE = 265;
const GAP = 12;
const layOut = (container: HTMLElement, width = 917) => {
  const track = container.querySelector<HTMLElement>(".rv3-sci__track")!;
  const cards = Array.from(track.querySelectorAll<HTMLElement>(".rv3-sci__card"));
  Object.defineProperty(track, "clientWidth", { configurable: true, value: width });
  Object.defineProperty(track, "scrollWidth", {
    configurable: true,
    value: cards.length * TILE + (cards.length - 1) * GAP,
  });
  track.getBoundingClientRect = () => ({ left: 40, top: 0, width, height: 322 }) as DOMRect;
  cards.forEach((card, i) => {
    card.getBoundingClientRect = () =>
      ({
        left: 40 + i * (TILE + GAP) - track.scrollLeft,
        right: 40 + i * (TILE + GAP) - track.scrollLeft + TILE,
        top: 6,
        width: TILE,
        height: 310,
      }) as DOMRect;
  });
  track.scrollTo = vi.fn() as unknown as typeof track.scrollTo;
  return { track, cards };
};

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the science gallery — the cut tile moves into view (desktop review 01.10)", () => {
  it("marks the tiles the frame cuts, and only those", () => {
    const { container } = render(<V3Methodology chrome="deck" />);
    const { track, cards } = layOut(container);
    fireEvent.scroll(track);
    // 917 wide: three tiles whole (0-265, 277-542, 554-819), the fourth cut at 917.
    expect(cards.map((c) => c.classList.contains("is-cut"))).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
      true,
    ]);
  });

  it("glides a cut tile to the nearest stop that shows it whole", () => {
    const { container } = render(<V3Methodology chrome="deck" />);
    const { track, cards } = layOut(container);
    fireEvent.scroll(track);
    // Tile 4 spans 831-1096: whole from scrollLeft 179 to 831, and 277 is the nearest stop.
    fireEvent.click(cards[3]!);
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 277, behavior: "smooth" });
  });

  it("leaves a tile in full view where it is", () => {
    const { container } = render(<V3Methodology chrome="deck" />);
    const { track, cards } = layOut(container);
    fireEvent.scroll(track);
    fireEvent.click(cards[1]!);
    expect(track.scrollTo).not.toHaveBeenCalled();
  });

  it("brings a tile cut on the left back the same way", () => {
    const { container } = render(<V3Methodology chrome="deck" />);
    const { track, cards } = layOut(container);
    Object.defineProperty(track, "scrollLeft", { configurable: true, writable: true, value: 554 });
    fireEvent.scroll(track);
    // At 554, tile 2 (277-542) is out to the left; 277 is the nearest stop showing it.
    expect(cards[1]!.classList.contains("is-cut")).toBe(true);
    fireEvent.click(cards[1]!);
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 277, behavior: "smooth" });
  });

  it("keeps the tiles out of the tab order: the pager is the keyboard path", () => {
    const { container } = render(<V3Methodology chrome="deck" />);
    layOut(container);
    for (const card of container.querySelectorAll(".rv3-sci__card")) {
      expect(card.hasAttribute("tabindex")).toBe(false);
      expect(card.getAttribute("role")).toBeNull();
    }
  });

  it("leaves V3's own deck without it", () => {
    const { container } = render(<V3Methodology />);
    const { track, cards } = layOut(container);
    fireEvent.scroll(track);
    expect(cards.some((c) => c.classList.contains("is-cut"))).toBe(false);
    fireEvent.click(cards[3]!);
    expect(track.scrollTo).not.toHaveBeenCalled();
  });
});

describe("reportV3.css — the cut tile says it can be clicked (01.10)", () => {
  it("takes the pointer from 700px, and lifts 2px under a mouse where motion is allowed", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const css = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");
    const block = css.slice(css.indexOf("/* ══ The science gallery's cut tile"));
    expect(block).toContain(
      ".rv3.rv4 .rv3-method.is-v4 .rv3-sci__card.is-cut {\n    cursor: pointer;"
    );
    expect(block).toContain(
      "@media (min-width: 700px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {"
    );
    expect(block).toContain("translate: 0 -2px;");
  });
});

/**
 * The same review's other half: "Or if easier, have the arrows also in the middle height
 * of the hidden tile? So that it is clear that you can navigate through that." At some
 * widths (1440, measured) the next tile sits wholly past the frame, so there is no sliver
 * to click; an arrow at the tiles' mid-height says there is more at every width. Mouse
 * shortcuts like the tile: the pager row below is the keyboard path.
 */
describe("the science gallery — arrows at the tiles' mid-height (desktop review 01.10)", () => {
  const edge = (container: HTMLElement, side: "prev" | "next") =>
    container.querySelector<HTMLButtonElement>(`.rv3-sci__edge.is-${side}`);

  it("offers Next at the start, no Previous, both out of the tab order", () => {
    const { container } = render(<V3Methodology chrome="deck" />);
    const { track } = layOut(container);
    fireEvent.scroll(track);
    expect(edge(container, "prev")).toBeNull();
    const next = edge(container, "next")!;
    expect(next.getAttribute("tabindex")).toBe("-1");
    expect(next.getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(next);
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 277, behavior: "smooth" });
  });

  it("offers Previous once scrolled, and no Next at the end", () => {
    const { container } = render(<V3Methodology chrome="deck" />);
    const { track } = layOut(container);
    Object.defineProperty(track, "scrollLeft", { configurable: true, writable: true, value: 1010 });
    fireEvent.scroll(track);
    expect(edge(container, "next")).toBeNull();
    fireEvent.click(edge(container, "prev")!);
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 831, behavior: "smooth" });
  });

  it("draws them from 700px only, a white disc centred on the tiles", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const css = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");
    expect(css).toContain(".rv3 .rv3-method.is-v4 .rv3-sci__edge {\n  display: none;\n}");
    const block = css.slice(css.indexOf("/* ══ The science gallery's cut tile"));
    expect(block).toContain(".rv3.rv4 .rv3-method.is-v4 .rv3-sci__edge {");
    // The tiles stand 22px down the frame and 310 tall: their middle is 177, the 40px
    // disc's top 157.
    expect(block).toContain("top: 157px;");
  });
});
