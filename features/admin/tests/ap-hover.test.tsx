// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { linearFit, sparkGeometry } from "@features/admin/server/ap/format";
import {
  gapSpans,
  IndexHover,
  isCutShort,
  nearestIndex,
  periodTitle,
  placeTip,
  PointHover,
  tipText,
  type Tip,
} from "@features/admin/ui/ap/hover";
import { Spark } from "@features/admin/ui/ap/kit";

/** jsdom lays nothing out: the hover box gets a 200 × 100 plot at the window's corner. */
function sized(el: Element, width = 200, height = 100) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

const box = () => document.querySelector("[data-ap-hover]") as HTMLElement;
const card = () => document.querySelector("[data-ap-tip]") as HTMLElement | null;
const mouse = { pointerType: "mouse" } as const;

beforeEach(() => {
  // A pointer event that carries its pointerType and position, as a browser's does.
  if (!("PointerEvent" in window)) {
    class PE extends MouseEvent {
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? "mouse";
      }
    }
    vi.stubGlobal("PointerEvent", PE);
  }
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the read-out's arithmetic", () => {
  it("picks the nearest point, at the ends and between", () => {
    const xs = [0, 25, 50, 75, 100];
    expect(nearestIndex(xs, -5)).toBe(0);
    expect(nearestIndex(xs, 12)).toBe(0);
    expect(nearestIndex(xs, 13)).toBe(1);
    expect(nearestIndex(xs, 62.6)).toBe(3);
    expect(nearestIndex(xs, 140)).toBe(4);
    expect(nearestIndex([], 50)).toBe(-1);
    expect(nearestIndex([50], 3)).toBe(0);
  });

  it("puts the card beside the point, left of it near the right edge, over it on a phone", () => {
    const view = { w: 1000, h: 800 };
    const size = { w: 200, h: 100 };
    expect(placeTip({ x: 100, y: 300 }, size, view)).toEqual({ left: 114, top: 250 });
    expect(placeTip({ x: 900, y: 300 }, size, view)).toEqual({ left: 686, top: 250 });
    // Too near the top: kept 8px inside the window.
    expect(placeTip({ x: 100, y: 10 }, size, view).top).toBe(8);
    // A 300px phone: neither side fits, so it sits over the point, inside the window.
    expect(placeTip({ x: 150, y: 400 }, { w: 260, h: 90 }, { w: 300, h: 800 })).toEqual({
      left: 20,
      top: 296,
    });
    // "above" with no room above goes under the point.
    expect(placeTip({ x: 500, y: 40 }, size, view, "above")).toEqual({ left: 400, top: 54 });
  });

  it("finds the stretches with no figure: both ends, and inside ones of three or more", () => {
    const xs = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const labels = xs.map((_, i) => `D${i}`);
    const a = [null, null, 3, 4, null, 6, null, null, null, 10, null];
    const b = [null, null, null, 1, null, null, null, null, null, 2, null];
    expect(gapSpans([a, b], xs, labels)).toEqual([
      { left: 0, width: 15, label: "No figures before D2" },
      { left: 55, width: 30, label: "No figures" },
      { left: 95, width: 5, label: "No figures after D9" },
    ]);
    // A lone missing day only breaks the line; nothing at all, nothing to shade.
    expect(gapSpans([[1, null, 3]], [0, 50, 100], ["a", "b", "c"])).toEqual([]);
    expect(gapSpans([[null, null]], [0, 100], ["a", "b"])).toEqual([]);
  });

  it("names a day with its weekday, a span with its ends, and a cut-short one", () => {
    expect(periodTitle({ from: "2026-10-07", to: "2026-10-07" })).toBe("Wed 7 Oct 2026");
    expect(periodTitle({ from: "2026-10-05", to: "2026-10-11" })).toBe("5 Oct – 11 Oct 2026");
    expect(periodTitle({ from: "2026-09-28", to: "2026-10-02" }, true)).toBe(
      "28 Sep – 2 Oct 2026 (part)"
    );
    expect(isCutShort({ from: "2026-10-05", to: "2026-10-11" }, "week")).toBe(false);
    expect(isCutShort({ from: "2026-10-05", to: "2026-10-08" }, "week")).toBe(true);
    expect(isCutShort({ from: "2026-09-01", to: "2026-09-30" }, "month")).toBe(false);
    expect(isCutShort({ from: "2026-10-01", to: "2026-10-15" }, "month")).toBe(true);
    expect(isCutShort({ from: "2026-10-01", to: "2026-10-01" }, "day")).toBe(false);
  });

  it("reads a card as one line", () => {
    const t: Tip = {
      title: "Wed 7 Oct 2026",
      rows: [
        { label: "A", value: "1" },
        { label: "B", value: "—", muted: true },
      ],
      note: "Why",
    };
    expect(tipText(t)).toBe("Wed 7 Oct 2026. A: 1. B: —. Why");
  });

  it("fits the trend over the points that have a figure, not across the empty days", () => {
    // y = 10 + 2i on the points that exist (i = 3..6); the range starts three days earlier.
    const f = linearFit([null, null, null, 16, 18, 20, 22])!;
    expect(f.i0).toBe(3);
    expect(f.i1).toBe(6);
    expect(f.from).toBeCloseTo(16);
    expect(f.to).toBeCloseTo(22);
    expect(linearFit([null, 4, null])).toBeNull();
  });

  it("breaks a sparkline at a gap instead of bridging it", () => {
    const g = sparkGeometry([1, 2, null, null, 4, 5, null, 7])!;
    expect(g.runs).toHaveLength(3);
    expect(g.runs[2]).toBe(
      `${g.x(7).toFixed(1)},${g.y(7).toFixed(1)} ${g.x(7).toFixed(1)},${g.y(7).toFixed(1)}`
    );
    expect(sparkGeometry([null, null])).toBeNull();
  });
});

describe("IndexHover", () => {
  const tip = (i: number): Tip => ({
    title: `Point ${i}`,
    rows: [{ label: "Value", value: `${i * 10}` }],
  });

  it("follows the pointer to the nearest point, with a guide and a dot, and leaves with it", () => {
    render(
      <div className="relative">
        <IndexHover
          xs={[0, 50, 100]}
          label="Test chart"
          tip={tip}
          markers={() => [{ y: 40, color: "#795fc8" }]}
        />
      </div>
    );
    sized(box());
    fireEvent.pointerMove(box(), { clientX: 120, clientY: 50, ...mouse });
    expect(card()).toHaveTextContent("Point 1");
    expect(card()).toHaveTextContent("Value10");
    // The guide at the point's x and its dot.
    const spans = box().querySelectorAll("span[style]");
    expect([...spans].some((s) => (s as HTMLElement).style.left === "50%")).toBe(true);
    fireEvent.pointerMove(box(), { clientX: 190, clientY: 50, ...mouse });
    expect(card()).toHaveTextContent("Point 2");
    fireEvent.pointerLeave(box(), mouse);
    expect(card()).toBeNull();
  });

  it("a tap shows it on a phone, and the next tap elsewhere closes it", () => {
    render(
      <div>
        <p>Outside</p>
        <IndexHover xs={[0, 50, 100]} label="Test chart" tip={tip} />
      </div>
    );
    sized(box());
    fireEvent.pointerDown(box(), { clientX: 10, clientY: 50, pointerType: "touch" });
    fireEvent.pointerUp(box(), { pointerType: "touch" });
    expect(card()).toHaveTextContent("Point 0");
    // A touch never sends "leave": it stays until the next tap lands elsewhere.
    fireEvent.pointerLeave(box(), { pointerType: "touch" });
    expect(card()).toHaveTextContent("Point 0");
    act(() => {
      screen.getByText("Outside").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(card()).toBeNull();
  });

  it("the arrow keys step through the points and a screen reader hears each one", () => {
    render(<IndexHover xs={[0, 50, 100]} label="Test chart" tip={tip} />);
    sized(box());
    expect(box()).toHaveAttribute("role", "group");
    expect(box()).toHaveAccessibleName(
      "Test chart. Use the left and right arrow keys to read each point."
    );
    fireEvent.focus(box());
    const live = box().querySelector("[aria-live]")!;
    expect(live).toHaveTextContent("Point 2. Value: 20");
    fireEvent.keyDown(box(), { key: "ArrowLeft" });
    expect(live).toHaveTextContent("Point 1. Value: 10");
    fireEvent.keyDown(box(), { key: "Home" });
    expect(live).toHaveTextContent("Point 0. Value: 0");
    fireEvent.keyDown(box(), { key: "ArrowLeft" });
    expect(live).toHaveTextContent("Point 0. Value: 0");
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(card()).toBeNull();
  });

  it("a click focusing it keeps the point under the pointer, and picks it", () => {
    const pick = vi.fn();
    render(<IndexHover xs={[0, 50, 100]} label="Test chart" tip={tip} onPick={pick} />);
    sized(box());
    fireEvent.pointerDown(box(), { clientX: 5, clientY: 50, ...mouse });
    fireEvent.focus(box());
    fireEvent.pointerUp(box(), mouse);
    fireEvent.click(box());
    expect(card()).toHaveTextContent("Point 0");
    expect(pick).toHaveBeenCalledWith(0);
  });

  it("is left out of the tab order inside a link, and hidden from the tree there", () => {
    render(
      <a href="/x">
        <IndexHover xs={[0, 100]} label="Test chart" tip={tip} focusable={false} />
      </a>
    );
    expect(box()).not.toHaveAttribute("tabindex");
    expect(box()).toHaveAttribute("aria-hidden", "true");
  });
});

describe("PointHover", () => {
  const points = [
    { x: 20, y: 20, size: 20 },
    { x: 80, y: 60, size: 30 },
  ];
  const tip = (i: number): Tip => ({ title: `Campaign ${i}`, rows: [] });

  it("rings the bubble under the pointer, and nothing beyond its reach", () => {
    render(<PointHover points={points} tip={tip} label="Bubbles" />);
    sized(box(), 200, 100);
    // Campaign 1 sits at (160, 40).
    fireEvent.pointerMove(box(), { clientX: 165, clientY: 42, ...mouse });
    expect(card()).toHaveTextContent("Campaign 1");
    fireEvent.pointerMove(box(), { clientX: 100, clientY: 5, ...mouse });
    expect(card()).toBeNull();
  });

  it("steps left to right with the arrow keys", () => {
    render(<PointHover points={[points[1]!, points[0]!]} tip={tip} label="Bubbles" />);
    sized(box());
    fireEvent.focus(box());
    const live = box().querySelector("[aria-live]")!;
    // The leftmost first, whatever their order in the data.
    expect(live).toHaveTextContent("Campaign 1");
    fireEvent.keyDown(box(), { key: "ArrowRight" });
    expect(live).toHaveTextContent("Campaign 0");
  });
});

describe("Spark", () => {
  it("reads out a point only when it knows the points' periods", () => {
    const { rerender } = render(<Spark values={[1, null, 3]} name="Revenue" unit="eur" />);
    expect(box()).toBeNull();
    rerender(
      <Spark
        values={[1, null, 3]}
        name="Revenue"
        unit="eur"
        titles={["Week 1", "Week 2", "Week 3"]}
      />
    );
    sized(box());
    fireEvent.pointerMove(box(), { clientX: 100, clientY: 20, ...mouse });
    expect(card()).toHaveTextContent("Week 2");
    expect(card()).toHaveTextContent("No figure for this point.");
    fireEvent.pointerMove(box(), { clientX: 199, clientY: 20, ...mouse });
    expect(card()).toHaveTextContent("Revenue€3");
    // The line breaks at the gap: two runs, the second a lone dot.
    expect(document.querySelectorAll("polyline")).toHaveLength(2);
  });

  it("never reads out a wrong period: titles that don't match the points are ignored", () => {
    render(<Spark values={[1, 2, 3]} titles={["a", "b"]} />);
    expect(box()).toBeNull();
  });
});
