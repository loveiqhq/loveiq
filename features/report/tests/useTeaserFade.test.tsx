// @vitest-environment jsdom
import { useRef, type FC } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { teaserFadeSteps, useTeaserFade } from "@features/report/ui/v3/useTeaserFade";

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

describe("teaserFadeSteps", () => {
  it("steps at the tops of the last three lines when the gap is above them (368:5450)", () => {
    // Two lines, the gap, six more: the greys fall on lines six to eight.
    expect(teaserFadeSteps(lines(8, 2), 196)).toEqual([128, 150.4, 172.8]);
  });

  it("follows a gap that falls between the last two lines (153:2240)", () => {
    // Seven lines, the gap, one more: the greys start a line higher, and the last
    // step sits in the gap.
    expect(teaserFadeSteps(lines(8, 7), 196)).toEqual([112, 134.4, 164.8]);
  });

  it("steps down a teaser with no gap at all, in its 202px box (235:234)", () => {
    expect(teaserFadeSteps(lines(9), 202)).toEqual([134.4, 156.8, 179.2]);
  });

  it("ignores lines the box clips away", () => {
    // Line nine's centre is under the 196px foot: it is not one of the three.
    expect(teaserFadeSteps(lines(10, 2), 196)).toEqual([128, 150.4, 172.8]);
  });

  it("gives up on a teaser shorter than three lines", () => {
    expect(teaserFadeSteps(lines(2), 196)).toBeNull();
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

beforeEach(() => {
  resize = null;
  // A content-area fragment sits 2.4px under its 22.4px line's top.
  const at = (centres: number[]) => centres.map((c) => rect(100 + c - 8.8));
  fragments = {
    "First line ": at([11.2]),
    "bold on the same line": at([11.2]),
    // Six lines after the paragraph gap, and a zero-width box WebKit reports at the
    // end of the line above a wrap.
    "More copy": [rect(100 + 33.6 - 8.8, 0), ...at(lines(8, 1).slice(1))],
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

describe("useTeaserFade", () => {
  it("sets the three steps from the lines the teaser shows", () => {
    const { container } = render(<Teaser />);
    // Lines at 11.2 (two fragments, one line), then 49.6 … 184 after the gap.
    expect(steps(container)).toEqual(["128px", "150.4px", "172.8px"]);
  });

  it("measures again when the column's width changes", () => {
    const { container } = render(<Teaser />);
    // The wider column moves the gap between the last two lines, as 153:2240 has it.
    fragments["More copy"] = lines(8, 7)
      .slice(1)
      .map((c) => rect(100 + c - 8.8));
    act(() => resize?.());
    expect(steps(container)).toEqual(["112px", "134.4px", "164.8px"]);
  });

  it("leaves the CSS fallback in place when there are fewer than three lines", () => {
    fragments["More copy"] = [];
    const { container } = render(<Teaser />);
    expect(steps(container)).toEqual(["", "", ""]);
  });

  it("does nothing while the card is open", () => {
    const { container } = render(<Teaser enabled={false} />);
    expect(steps(container)).toEqual(["", "", ""]);
  });
});
