// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import V3Methodology from "@features/report/ui/v3/V3Methodology";
import { nearestSciStop, sciStops } from "@features/report/ui/v3/useSciPager";

/**
 * Mark's desktop review (Notion, 28.09): "Should also be a tile gallery that you can click
 * through. Maybe make them bigger so that you only see 2,5 similarly to the archetype card"
 * (his full sentence, via Fatih, 30.09). From 700px the seven science tiles run in one row
 * sized so two and a half are in view, never under 1.25x the phone's, the third cut by the
 * column's edge, with Previous / Next and a dot per stop under them. The phone keeps its
 * swipe deck and its dot row, which only reports.
 *
 * A stop is a scrollLeft the deck can rest on: a tile's snap position, clamped to the end.
 * With two and a half tiles in view the last two can only reach the end, so they share its
 * stop; seven per-tile dots would include one that could never light up. The helpers below
 * lay 29.09's fixed 265px tiles out, which exercise the same rules at other counts.
 */

const V4_TITLES = [
  "Neuroscience",
  "Psychology",
  "Relationship research",
  "Sexology",
  "Behavioral science",
  "Attachment research",
  "Therapy rooms",
];

describe("sciStops", () => {
  it("clamps each tile's start to the end, and the tiles that share it share its stop", () => {
    expect(sciStops([0, 277, 554, 831, 1108, 1385, 1662], 1010)).toEqual([
      { left: 0, card: 0 },
      { left: 277, card: 1 },
      { left: 554, card: 2 },
      { left: 831, card: 3 },
      { left: 1010, card: 6 },
    ]);
  });

  it("folds only a stop within the tile's own padding of the next, so no step is a nudge", () => {
    // 7px short of the end: only the last tile's padding is cut, so they are one stop.
    expect(sciStops([0, 277, 554, 831, 1108, 1385, 1662], 1115).map((s) => s.left)).toEqual([
      0, 277, 554, 831, 1115,
    ]);
  });

  it("keeps a stop that still leaves the last tile cut, so the pager never claims the end early", () => {
    // 31px short of the end (as a 1366 laptop's column parks it): the last tile's words
    // are still cut there, so the end is a stop of its own.
    expect(sciStops([0, 277, 554, 831, 1108, 1385, 1662], 1139).map((s) => s.left)).toEqual([
      0, 277, 554, 831, 1108, 1139,
    ]);
  });

  it("gives the gallery's two and a half tiles six stops, the last two tiles sharing the end", () => {
    // 1536: 357px tiles 12 apart in the 917 column, half of the third one in view.
    expect(sciStops([0, 369, 738, 1107, 1476, 1845, 2214], 1654)).toEqual([
      { left: 0, card: 0 },
      { left: 369, card: 1 },
      { left: 738, card: 2 },
      { left: 1107, card: 3 },
      { left: 1476, card: 4 },
      { left: 1654, card: 6 },
    ]);
  });

  it("gives the phone's geometry a stop a tile, as its dots have", () => {
    expect(sciStops([0, 222, 444, 666, 888, 1110, 1332], 1201)).toHaveLength(7);
  });

  it("picks the nearest stop", () => {
    const stops = sciStops([0, 277, 554], 554);
    expect(nearestSciStop(stops, 130)).toBe(0);
    expect(nearestSciStop(stops, 150)).toBe(1);
    expect(nearestSciStop(stops, 554)).toBe(2);
  });
});

/** The deck at a desktop column `width` wide: 265px tiles, 12 apart, the track at x=40. */
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
        top: 6,
        width: TILE,
        height: 310,
      }) as DOMRect;
  });
  track.scrollTo = vi.fn() as unknown as typeof track.scrollTo;
  return track;
};

let resize: (() => void) | null = null;

beforeEach(() => {
  resize = null;
  // Frames run at once, so a scroll is read before the assertion.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: () => void) {
        resize = cb;
      }
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

const nav = (container: HTMLElement) => container.querySelector<HTMLElement>(".rv3-sci__nav");
const pips = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>(".rv3-sci__pip"));
const arrow = (container: HTMLElement, label: "Previous card" | "Next card") =>
  container.querySelector<HTMLButtonElement>(`.rv3-sci__arrow[aria-label="${label}"]`)!;
const current = (container: HTMLElement) =>
  pips(container).findIndex((p) => p.getAttribute("aria-current") === "true");

describe("the desktop gallery's pager", () => {
  it("draws Previous, a dot a tile before layout, and Next, in V4's deck only", () => {
    const { container } = render(<V3Methodology chrome="deck" />);
    const group = nav(container)!;
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe("Science cards");
    expect(arrow(container, "Previous card").getAttribute("aria-disabled")).toBe("true");
    expect(arrow(container, "Next card").hasAttribute("aria-disabled")).toBe(false);
    expect(pips(container).map((p) => p.getAttribute("aria-label"))).toEqual(
      V4_TITLES.map((t) => `Show ${t}`)
    );
    expect(current(container)).toBe(0);
    const track = container.querySelector(".rv3-sci__track")!;
    for (const button of group.querySelectorAll("button")) {
      expect(button.getAttribute("aria-controls")).toBe(track.id);
    }
    expect(track.id).not.toBe("");

    cleanup();
    const v3 = render(<V3Methodology />);
    expect(nav(v3.container)).toBeNull();
  });

  it("keeps the phone's dot row as it was: seven, hidden from assistive tech", () => {
    const { container } = render(<V3Methodology chrome="deck" />);
    const dots = container.querySelector(".rv3-sci__dots")!;
    expect(dots.getAttribute("aria-hidden")).toBe("true");
    expect(Array.from(dots.children, (d) => d.tagName)).toEqual(Array(7).fill("SPAN"));
  });

  it("lays a dot per stop once the deck is laid out, the end stop naming the last tile", () => {
    const { container } = render(<V3Methodology chrome="deck" />);
    const track = layOut(container);
    fireEvent.scroll(track);
    expect(pips(container).map((p) => p.getAttribute("aria-label"))).toEqual([
      "Show Neuroscience",
      "Show Psychology",
      "Show Relationship research",
      "Show Sexology",
      "Show Therapy rooms",
    ]);
  });

  it("glides to a dot's stop, and marks it at once", () => {
    const { container } = render(<V3Methodology chrome="deck" />);
    const track = layOut(container);
    fireEvent.scroll(track);
    fireEvent.click(pips(container)[2]!);
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 554, behavior: "smooth" });
    expect(current(container)).toBe(2);
  });

  it("jumps instead of gliding under reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) => ({ matches: query.includes("reduce") }) as MediaQueryList
    );
    const { container } = render(<V3Methodology chrome="deck" />);
    const track = layOut(container);
    fireEvent.scroll(track);
    fireEvent.click(pips(container)[4]!);
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 1010, behavior: "auto" });
  });

  it("holds a click's stop while the deck glides, and steps on from it", () => {
    const { container } = render(<V3Methodology chrome="deck" />);
    const track = layOut(container);
    fireEvent.scroll(track);
    fireEvent.click(arrow(container, "Next card"));
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 277, behavior: "smooth" });
    // Mid-glide the deck reads 100, nearer the first stop: the dot stays on the target,
    // and a second click goes on from it rather than from where the deck still is.
    track.scrollLeft = 100;
    fireEvent.scroll(track);
    expect(current(container)).toBe(1);
    fireEvent.click(arrow(container, "Next card"));
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 554, behavior: "smooth" });
    fireEvent.click(arrow(container, "Previous card"));
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 277, behavior: "smooth" });
  });

  it.each([
    ["the glide ending", (track: HTMLElement) => fireEvent(track, new Event("scrollend"))],
    ["the reader's wheel", (track: HTMLElement) => fireEvent.wheel(track)],
  ])("lets go of a click's stop on %s, and follows the deck again", (_, letGo) => {
    const { container } = render(<V3Methodology chrome="deck" />);
    const track = layOut(container);
    fireEvent.scroll(track);
    fireEvent.click(arrow(container, "Next card"));
    track.scrollLeft = 100;
    letGo(track);
    fireEvent.scroll(track);
    expect(current(container)).toBe(0);
    fireEvent.click(arrow(container, "Next card"));
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 277, behavior: "smooth" });
  });

  it("does not claim the end while the last tile is still cut", () => {
    // A 1366 laptop's column: the deck can rest 31px short of the end, the last tile's
    // words still cut there; Next must still reach them.
    const { container } = render(<V3Methodology chrome="deck" />);
    const track = layOut(container, 788);
    track.scrollLeft = 1108;
    fireEvent.scroll(track);
    expect(pips(container)).toHaveLength(6);
    expect(current(container)).toBe(4);
    const next = arrow(container, "Next card");
    expect(next.hasAttribute("aria-disabled")).toBe(false);
    fireEvent.click(next);
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 1139, behavior: "smooth" });
  });

  it("follows the deck when the reader scrolls it, and stops at its ends", () => {
    const { container } = render(<V3Methodology chrome="deck" />);
    const track = layOut(container);
    track.scrollLeft = 560;
    fireEvent.scroll(track);
    expect(current(container)).toBe(2);
    track.scrollLeft = 1010;
    fireEvent.scroll(track);
    expect(current(container)).toBe(4);
    const next = arrow(container, "Next card");
    expect(next.getAttribute("aria-disabled")).toBe("true");
    // aria-disabled, not disabled: a keyboard's focus stays on it at the end.
    expect(next.disabled).toBe(false);
    vi.mocked(track.scrollTo).mockClear();
    fireEvent.click(next);
    expect(track.scrollTo).not.toHaveBeenCalled();
  });

  it("measures again when the column changes width", () => {
    const { container } = render(<V3Methodology chrome="deck" />);
    const track = layOut(container);
    fireEvent.scroll(track);
    expect(pips(container)).toHaveLength(5);
    layOut(container, 620);
    act(() => resize?.());
    expect(pips(container)).toHaveLength(6);
    // The 620 column's end stop, 1307, brings in the last tile.
    expect(pips(container).at(-1)!.getAttribute("aria-label")).toBe("Show Therapy rooms");
    fireEvent.click(pips(container).at(-1)!);
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 1307, behavior: "smooth" });
  });

  it("reads a scroll before layout without failing", () => {
    const { container } = render(<V3Methodology chrome="deck" />);
    fireEvent.scroll(container.querySelector(".rv3-sci__track")!);
    expect(pips(container)).toHaveLength(7);
  });
});
