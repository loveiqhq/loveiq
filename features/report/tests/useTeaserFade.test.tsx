// @vitest-environment jsdom
import { useRef, type FC } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  teaserFadeSteps,
  teaserTailSteps,
  useTeaserFade,
} from "@features/report/ui/v3/useTeaserFade";

/**
 * Mark's rehaul (28.09): every closed "Try this" and "Learn more" frame greys the
 * LAST THREE LINES its teaser box shows — #7e7e7e, #b5b5b5, #e5e5e5, one colour a
 * line — wherever the paragraph gaps fall. 153:2240 breaks its paragraph above the
 * last line, 368:5450 and the practices three lines higher, 235:234 not at all, so
 * a fixed gradient lands a line off on some of them. useTeaserFade measures the
 * lines and hands CSS the three steps.
 */

/** Line centres down a 22.4px grid, with a 16px paragraph gap after `gapAfter` lines. */
const lines = (count: number, gapAfter?: number) =>
  Array.from(
    { length: count },
    (_, i) => 11.2 + i * 22.4 + (gapAfter !== undefined && i >= gapAfter ? 16 : 0)
  );

// Every frame's copy runs on past its box (a ninth line under 196, a tenth under 202):
// the greys are the last three lines the box SHOWS.
describe("teaserFadeSteps", () => {
  it("steps at the tops of the last three lines when the gap is above them (368:5450)", () => {
    // Two lines, the gap, six more shown: the greys fall on lines six to eight.
    expect(teaserFadeSteps(lines(9, 2), 196)).toEqual([128, 150.4, 172.8]);
  });

  it("follows a gap that falls between the last two lines (153:2240)", () => {
    // Seven lines, the gap, one more shown: the greys start a line higher, and the
    // last step sits in the gap.
    expect(teaserFadeSteps(lines(9, 7), 196)).toEqual([112, 134.4, 164.8]);
  });

  it("steps down a teaser with no gap at all, in its 202px box (235:234)", () => {
    expect(teaserFadeSteps(lines(10), 202)).toEqual([134.4, 156.8, 179.2]);
  });

  it("ignores lines the box clips away", () => {
    expect(teaserFadeSteps(lines(12, 2), 196)).toEqual([128, 150.4, 172.8]);
  });

  // In the wide desktop column the teaser's two blocks can end inside the box, which then
  // cuts no line: teaserFadeSteps leaves it to the phone's proportional fade, and the
  // desktop greys the copy's own last three lines instead (teaserTailSteps, below).
  it("leaves copy that ends inside its box to the proportional fade", () => {
    expect(teaserFadeSteps(lines(8, 2), 196)).toBeNull();
    expect(teaserFadeSteps(lines(4, 2), 196)).toBeNull();
  });

  it("gives up on a teaser shorter than three lines", () => {
    expect(teaserFadeSteps(lines(2), 196)).toBeNull();
  });
});

// Mark's desktop review (28.09): "Lets have the last 3 lines fade". In the desktop column
// the copy ends inside its box, so the box cuts no line; the copy's OWN last three lines
// take the same steps, which only the desktop rules read.
describe("teaserTailSteps", () => {
  it("steps above the copy's own last three lines", () => {
    expect(teaserTailSteps(lines(4, 2), 196)).toEqual([22.4, 52.8, 83.2]);
    expect(teaserTailSteps(lines(8, 2), 196)).toEqual([128, 150.4, 172.8]);
  });

  it("follows a paragraph gap between the last lines", () => {
    expect(teaserTailSteps(lines(6, 5), 196)).toEqual([67.2, 89.6, 120]);
  });

  it("leaves copy the box cuts off to teaserFadeSteps", () => {
    expect(teaserTailSteps(lines(9, 2), 196)).toBeNull();
  });

  it("gives up under four lines, which would leave no line in full black", () => {
    expect(teaserTailSteps(lines(3), 196)).toBeNull();
    expect(teaserTailSteps([], 196)).toBeNull();
  });
});

const rect = (top: number, width = 300) =>
  ({
    top,
    bottom: top + 17.6,
    left: 0,
    right: width,
    width,
    height: 17.6,
    x: 0,
    y: top,
  }) as DOMRect;

const Teaser: FC<{ enabled?: boolean }> = ({ enabled = true }) => {
  const ref = useRef<HTMLDivElement>(null);
  useTeaserFade(ref, enabled);
  return (
    <div ref={ref} className="teaser">
      <p>
        First line <strong>bold on the same line</strong>
      </p>
      <p>More copy</p>
    </div>
  );
};

/** Each text node's fragments, by its text — the tops as a browser would report them. */
let fragments: Record<string, DOMRect[]> = {};
let resize: (() => void) | null = null;

/** Fragments centred on `centres`, from the teaser's top at 100. */
const at8 = (centres: number[]) => centres.map((c) => rect(100 + c - 8.8));

beforeEach(() => {
  resize = null;
  // A content-area fragment sits 2.4px under its 22.4px line's top.
  const at = at8;
  fragments = {
    "First line ": at([11.2]),
    "bold on the same line": at([11.2]),
    // Six lines after the paragraph gap, and a zero-width box WebKit reports at the
    // end of the line above a wrap.
    "More copy": [rect(100 + 33.6 - 8.8, 0), ...at(lines(9, 1).slice(1))],
  };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement
  ) {
    return this.classList.contains("teaser")
      ? ({ ...rect(100), height: 196, bottom: 296 } as DOMRect)
      : rect(0);
  });
  vi.spyOn(document, "createRange").mockImplementation(() => {
    let node: Node | null = null;
    return {
      selectNodeContents: (n: Node) => {
        node = n;
      },
      getClientRects: () => (fragments[node?.textContent ?? ""] ?? []) as unknown as DOMRectList,
      detach: () => {},
    } as unknown as Range;
  });
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const steps = (container: HTMLElement) => {
  const el = container.querySelector<HTMLElement>(".teaser")!;
  return [1, 2, 3].map((i) => el.style.getPropertyValue(`--rv4-fade-${i}`));
};
const mode = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(".teaser")!.getAttribute("data-fade");
const tail = (container: HTMLElement) => {
  const el = container.querySelector<HTMLElement>(".teaser")!;
  return [1, 2, 3].map((i) => el.style.getPropertyValue(`--rv4-tail-${i}`));
};
const hasTail = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(".teaser")!.hasAttribute("data-tail");

describe("useTeaserFade", () => {
  it("sets the three steps from the lines the teaser shows", () => {
    const { container } = render(<Teaser />);
    // Lines at 11.2 (two fragments, one line), then 49.6 … 184 after the gap, and a
    // ninth under the box's foot.
    expect(steps(container)).toEqual(["128px", "150.4px", "172.8px"]);
    expect(mode(container)).toBe("lines");
  });

  it("hands copy that ends inside the box back to the proportional fade", () => {
    fragments["More copy"] = at8(lines(4, 1).slice(1));
    const { container } = render(<Teaser />);
    expect(steps(container)).toEqual(["", "", ""]);
    expect(mode(container)).toBe("short");
  });

  it("measures again when the column's width changes", () => {
    const { container } = render(<Teaser />);
    // The wider column moves the gap between the last two lines, as 153:2240 has it.
    fragments["More copy"] = lines(9, 7)
      .slice(1)
      .map((c) => rect(100 + c - 8.8));
    act(() => resize?.());
    expect(steps(container)).toEqual(["112px", "134.4px", "164.8px"]);
  });

  it("steps short copy's own last three lines for the desktop, leaving the phone's fade alone", () => {
    fragments["More copy"] = at8(lines(4, 1).slice(1));
    const { container } = render(<Teaser />);
    expect(mode(container)).toBe("short");
    expect(hasTail(container)).toBe(true);
    expect(tail(container)).toEqual(["30.4px", "60.8px", "83.2px"]);
    expect(steps(container)).toEqual(["", "", ""]);
  });

  it("sets no tail where the box cuts the copy", () => {
    const { container } = render(<Teaser />);
    expect(hasTail(container)).toBe(false);
    expect(tail(container)).toEqual(["", "", ""]);
  });

  it("drops the tail when a narrower column makes the box cut the copy", () => {
    fragments["More copy"] = at8(lines(4, 1).slice(1));
    const { container } = render(<Teaser />);
    fragments["More copy"] = at8(lines(9, 1).slice(1));
    act(() => resize?.());
    expect(mode(container)).toBe("lines");
    expect(hasTail(container)).toBe(false);
    expect(tail(container)).toEqual(["", "", ""]);
    expect(steps(container)).toEqual(["128px", "150.4px", "172.8px"]);
  });

  it("sets no tail on short copy under four lines", () => {
    fragments["More copy"] = at8(lines(3, 1).slice(1));
    const { container } = render(<Teaser />);
    expect(mode(container)).toBe("short");
    expect(hasTail(container)).toBe(false);
  });

  it("leaves the stepped CSS fallback alone while the card is open", () => {
    const { container } = render(<Teaser enabled={false} />);
    expect(steps(container)).toEqual(["", "", ""]);
    expect(mode(container)).toBeNull();
  });
});
