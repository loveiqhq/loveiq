// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ph = vi.hoisted(() => ({ capture: vi.fn(), register: vi.fn() }));
vi.mock("posthog-js", () => ({ default: ph }));

/** An IntersectionObserver the test drives: each one records its callback and element. */
class FakeObserver {
  static all: FakeObserver[] = [];
  el: Element | null = null;
  disconnected = false;
  constructor(
    public cb: IntersectionObserverCallback,
    public opts?: IntersectionObserverInit
  ) {
    FakeObserver.all.push(this);
  }
  observe(el: Element) {
    this.el = el;
  }
  disconnect() {
    this.disconnected = true;
  }
  /** The element is now `ratio` in view. */
  show(ratio: number) {
    if (this.disconnected) return;
    this.cb(
      [{ isIntersecting: ratio > 0, intersectionRatio: ratio, target: this.el } as never],
      this as never
    );
  }
}

let useCtaSeen: typeof import("@features/analytics/useCtaSeen").useCtaSeen;

function Card() {
  const ref = useRef<HTMLButtonElement>(null);
  useCtaSeen(ref, "locked_chapter");
  return <button ref={ref}>Unlock your report</button>;
}

const seenEvents = () => ph.capture.mock.calls.filter(([name]) => name === "cta_seen");

beforeEach(async () => {
  vi.resetModules();
  ph.capture.mockClear();
  FakeObserver.all = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  window.history.replaceState(null, "", "/report/rpt_one");
  ({ useCtaSeen } = await import("@features/analytics/useCtaSeen"));
});
afterEach(() => vi.unstubAllGlobals());

describe("cta_seen", () => {
  it("fires when half of the unlock offer is in view, and not before", () => {
    render(<Card />);
    const [io] = FakeObserver.all;
    expect(io!.opts?.threshold).toBe(0.5);
    io!.show(0.3);
    expect(seenEvents()).toHaveLength(0);
    io!.show(0.6);
    expect(seenEvents()).toEqual([["cta_seen", { cta: "locked_chapter" }]]);
  });

  it("fires once per page, however many locked chapters come into view", () => {
    render(
      <>
        <Card />
        <Card />
      </>
    );
    FakeObserver.all[0]!.show(1);
    FakeObserver.all[1]!.show(1);
    FakeObserver.all[0]!.show(1);
    expect(seenEvents()).toHaveLength(1);
  });

  it("fires again on another report", () => {
    const { unmount } = render(<Card />);
    FakeObserver.all[0]!.show(1);
    unmount();
    window.history.replaceState(null, "", "/report/rpt_two");
    render(<Card />);
    FakeObserver.all.at(-1)!.show(1);
    expect(seenEvents()).toHaveLength(2);
  });

  it("is reported by Report 3.0's locked card, locked chapter and visual tiles too", async () => {
    // Only the V1 PremiumOverlay reported it, so every V4 visit read "not seen".
    const { default: V4PremiumCard } = await import("@features/report/ui/v3/V4PremiumCard");
    const { V4ChapterLockDisc } = await import("@features/report/ui/v3/V4ChapterHead");
    const { default: V4LockBadge } = await import("@features/report/ui/v3/V4LockBadge");
    render(
      <>
        <V4PremiumCard />
        <V4ChapterLockDisc />
        <V4LockBadge />
      </>
    );
    expect(FakeObserver.all.map((io) => io.el?.className)).toEqual([
      "rv4-premium__cta",
      "rv4-chapter__lock",
      "rv4-lockbadge",
    ]);
    FakeObserver.all[1]!.show(0.6);
    expect(seenEvents()).toEqual([["cta_seen", { cta: "locked_chapter" }]]);
  });

  it("stops watching when the card goes, and does nothing without the browser's observer", () => {
    const { unmount } = render(<Card />);
    unmount();
    expect(FakeObserver.all[0]!.disconnected).toBe(true);
    vi.unstubAllGlobals();
    vi.stubGlobal("IntersectionObserver", undefined);
    expect(() => render(<Card />)).not.toThrow();
    expect(seenEvents()).toHaveLength(0);
  });
});
