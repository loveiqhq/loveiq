// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Tile } from "@features/admin/server/ap/common";
import { linearFit, quarterTop, sparkGeometry } from "@features/admin/server/ap/format";
import { xTicks } from "@features/admin/ui/ap/ApFocus";
import {
  bucketTitles,
  gapSpans,
  IndexHover,
  isCutShort,
  nearestIndex,
  periodTitle,
  placeTip,
  PointHover,
  tipText,
  type Tip,
  useRowTip,
} from "@features/admin/ui/ap/hover";
import { KpiTileV2, Spark } from "@features/admin/ui/ap/kit";

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
    // A point 832px in, in a box scrolled sideways on a 390px phone: still inside the window.
    const at = placeTip({ x: 832, y: 300 }, { w: 300, h: 100 }, { w: 390, h: 800 });
    expect(at.left).toBeGreaterThanOrEqual(8);
    expect(at.left + 300).toBeLessThanOrEqual(382);
  });

  it("tops an axis where every quarter line is a figure it writes exactly", () => {
    // 8, 16, 24, 32: not 25, whose lines 6.25, 12.5 and 18.75 would read "6", "13", "19".
    expect(quarterTop(24.2)).toBe(32);
    expect(quarterTop(100)).toBe(100);
    expect(quarterTop(44)).toBe(48);
    expect(quarterTop(3)).toBe(4);
    expect(quarterTop(0)).toBe(4);
    expect(quarterTop(Number.NaN)).toBe(4);
    expect(quarterTop(2.2, 0.1)).toBeCloseTo(2.4);
    expect(quarterTop(2.86, 0.01)).toBeCloseTo(3);
    expect(quarterTop(0.055, 0.001)).toBeCloseTo(0.06);
    // Whatever the figures: over them, at most double, each quarter whole in the axis's unit.
    for (const unit of [1, 0.1, 0.01, 0.001]) {
      for (let v = unit / 3; v < 5e5 * unit; v *= 1.37) {
        const t = quarterTop(v, unit);
        expect(t).toBeGreaterThanOrEqual(v - 1e-9);
        expect(t).toBeLessThanOrEqual(Math.max(4 * unit, v * 2.01));
        const q = t / 4 / unit;
        expect(Math.abs(q - Math.round(q))).toBeLessThan(1e-6);
      }
    }
  });

  it("titles a tile's points, one cut short by the range marked so", () => {
    // 30 Sep (Wed) to 14 Oct (Wed): weekly, with one whole week between two cut short.
    expect(bucketTitles("2026-09-30", "2026-10-14")).toEqual([
      "30 Sep – 4 Oct 2026 (part)",
      "5 Oct – 11 Oct 2026",
      "12 Oct – 14 Oct 2026 (part)",
    ]);
  });

  it("spaces the date labels by the row's real width: never touching, the last always", () => {
    const days = Array.from({ length: 138 }, (_, i) => `${(i % 28) + 1} Sep`);
    const weeks = Array.from({ length: 20 }, (_, i) => `Wk ${(i % 28) + 1} Sep`);
    for (const labels of [days, days.slice(0, 30), weeks, ["1 Oct"], ["1 Oct", "2 Oct"]]) {
      const n = labels.length;
      for (const width of [120, 240, 300, 372, 420, 640, 900, 1200]) {
        const t = xTicks(labels, width);
        expect(t.at(-1)).toBe(n - 1);
        // Each label as drawn: the first from its x, the last up to it, the others centred.
        const span = (i: number) => {
          const w = labels[i]!.length * 6.6;
          const x = n > 1 ? (i / (n - 1)) * width : width / 2;
          if (n === 1) return [x - w / 2, x + w / 2];
          return i === 0 ? [x, x + w] : i === n - 1 ? [x - w, x] : [x - w / 2, x + w / 2];
        };
        for (let k = 1; k < t.length; k++)
          expect(span(t[k]!)[0]!).toBeGreaterThanOrEqual(span(t[k - 1]!)[1]! + 8 - 1e-9);
      }
    }
    // Room to spare: every day of a week.
    const week = ["1 Oct", "2 Oct", "3 Oct", "4 Oct", "5 Oct", "6 Oct", "7 Oct"];
    expect(xTicks(week, 420)).toEqual([0, 1, 2, 3, 4, 5, 6]);
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

  it("hides its card while the point is out of the window", () => {
    render(<IndexHover xs={[0, 50, 100]} label="Test chart" tip={tip} />);
    // The chart has scrolled up out of the window.
    vi.spyOn(box(), "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: -400,
      right: 200,
      bottom: -300,
      width: 200,
      height: 100,
      x: 0,
      y: -400,
      toJSON: () => ({}),
    } as DOMRect);
    fireEvent.focus(box());
    expect(card()).toHaveTextContent("Point 2");
    expect(card()!.style.visibility).toBe("hidden");
  });

  it("a key brings its point into view (a box that scrolls sideways may hide it)", () => {
    const into = vi.fn();
    // jsdom has no scrollIntoView.
    Object.defineProperty(Element.prototype, "scrollIntoView", { value: into, configurable: true });
    try {
      render(<IndexHover xs={[0, 50, 100]} label="Test chart" tip={tip} />);
      sized(box());
      fireEvent.focus(box());
      fireEvent.keyDown(box(), { key: "Home" });
      expect(into).toHaveBeenLastCalledWith({ block: "nearest", inline: "nearest" });
      // The pointer needs none: its point is under it.
      into.mockClear();
      fireEvent.pointerMove(box(), { clientX: 100, clientY: 50, ...mouse });
      expect(card()).toHaveTextContent("Point 1");
      expect(into).not.toHaveBeenCalled();
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it("new figures with fewer points close the card rather than read a point that is gone", () => {
    const { rerender } = render(<IndexHover xs={[0, 50, 100]} label="Test chart" tip={tip} />);
    sized(box());
    fireEvent.pointerMove(box(), { clientX: 199, clientY: 50, ...mouse });
    expect(card()).toHaveTextContent("Point 2");
    const gone = (i: number): Tip => {
      if (i > 1) throw new Error(`asked for point ${i}`);
      return tip(i);
    };
    rerender(<IndexHover xs={[0, 100]} label="Test chart" tip={gone} />);
    expect(card()).toBeNull();
  });

  it("lets a finger pinch-zoom from a chart, and swipe a sideways box it sits in", () => {
    // jsdom applies no CSS: this pins the rule's words. The phone check (a real pinch and a
    // sideways swipe on each chart) is what proves them.
    render(
      <>
        <IndexHover xs={[0, 100]} label="Test chart" tip={tip} />
        <PointHover points={[{ x: 50, y: 50, size: 10 }]} tip={tip} label="Bubbles" />
      </>
    );
    for (const layer of document.querySelectorAll("[data-ap-hover]")) {
      const words = layer.className.split(" ");
      expect(words).toEqual(
        expect.arrayContaining([
          "touch-pan-y",
          "touch-pinch-zoom",
          "[.overflow-x-auto_&]:touch-manipulation",
        ])
      );
    }
    expect(document.querySelectorAll("[data-ap-hover]")).toHaveLength(2);
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

  it("a tap that misses every bubble opens nothing, though the box takes focus after it", () => {
    render(<PointHover points={points} tip={tip} label="Bubbles" />);
    sized(box());
    fireEvent.pointerDown(box(), { clientX: 100, clientY: 5, pointerType: "touch" });
    fireEvent.pointerUp(box(), { pointerType: "touch" });
    // A phone moves focus once the finger lifts.
    fireEvent.focus(box());
    expect(card()).toBeNull();
    expect(box().querySelector("[aria-live]")).toHaveTextContent("");
  });

  it("new figures with fewer bubbles close the card", () => {
    const { rerender } = render(<PointHover points={points} tip={tip} label="Bubbles" />);
    sized(box());
    fireEvent.pointerMove(box(), { clientX: 165, clientY: 42, ...mouse });
    expect(card()).toHaveTextContent("Campaign 1");
    rerender(<PointHover points={[points[0]!]} tip={tip} label="Bubbles" />);
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

function Rows() {
  const t = useRowTip();
  return (
    <div>
      {t.card}
      <div
        data-testid="row"
        {...t.bind(() => ({ title: "Row", rows: [{ label: "A", value: "1" }] }))}
      >
        Row
      </div>
    </div>
  );
}

describe("useRowTip", () => {
  it("a row's card goes when the finger's touch turns into a scroll", () => {
    render(<Rows />);
    const row = screen.getByTestId("row");
    fireEvent.pointerDown(row, { pointerType: "touch" });
    expect(card()).toHaveTextContent("RowA1");
    fireEvent.pointerCancel(row, { pointerType: "touch" });
    expect(card()).toBeNull();
  });
});

describe("Spark", () => {
  it("writes a point as its tile does, the suffix too, but never a small one as nothing", () => {
    render(
      <Spark values={[0.004, 0.25]} name="Open rate" unit="pct" digits={0} titles={["A", "B"]} />
    );
    sized(box());
    fireEvent.pointerMove(box(), { clientX: 1, clientY: 20, ...mouse });
    expect(card()).toHaveTextContent("Open rate0.40%");
    fireEvent.pointerMove(box(), { clientX: 199, clientY: 20, ...mouse });
    expect(card()).toHaveTextContent("Open rate25%");
    cleanup();
    render(
      <Spark
        values={[0.02, 0.03]}
        name="ROAS"
        unit="ratio"
        digits={2}
        suffix="×"
        titles={["A", "B"]}
      />
    );
    sized(box());
    fireEvent.pointerMove(box(), { clientX: 1, clientY: 20, ...mouse });
    expect(card()).toHaveTextContent("ROAS0.02×");
  });

  it("a tile's line is read out by what it draws, and with the tile's suffix", () => {
    const tile: Tile = {
      key: "cac",
      label: "CAC (paid)",
      unit: "eur",
      value: 40,
      prev: null,
      goodWhen: "down",
      spark: [2, 3],
      foot: "",
      blocked: null,
      trend: "",
      line: "Ad spend per submission",
    };
    render(<KpiTileV2 tile={tile} titles={["A", "B"]} suffix="!" />);
    sized(box());
    fireEvent.pointerMove(box(), { clientX: 199, clientY: 20, ...mouse });
    expect(card()).toHaveTextContent("Ad spend per submission€3!");
    expect(card()).not.toHaveTextContent("CAC");
  });

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
    expect(card()).toHaveTextContent("No figure for this period.");
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
