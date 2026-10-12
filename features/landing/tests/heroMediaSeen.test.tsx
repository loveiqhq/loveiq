// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real analytics client, so this checks the event PostHog actually receives.
const ph = vi.hoisted(() => ({ capture: vi.fn(), register: vi.fn() }));
vi.mock("posthog-js", () => ({ default: ph }));

/** An IntersectionObserver the test drives (same shape as cta-seen.test.tsx). */
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
  // next/link observes its anchors for prefetching and unobserves them on unmount.
  unobserve() {}
  takeRecords() {
    return [];
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

/** cta_seen's observers: half of the element on screen. The video's loop uses [0, 0.25]. */
const halfObservers = () => FakeObserver.all.filter((o) => o.opts?.threshold === 0.5);
const seenEvents = () => ph.capture.mock.calls.filter(([name]) => name === "cta_seen");

let WHero: typeof import("@features/landing/ui/white/WHero").default;

beforeEach(async () => {
  // A fresh useCtaSeen per test: it remembers what was seen for the life of the page.
  vi.resetModules();
  ph.capture.mockClear();
  FakeObserver.all = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  window.history.replaceState(null, "", "/");
  ({ default: WHero } = await import("@features/landing/ui/white/WHero"));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("landing hero — whether its media was seen", () => {
  it("arm A: counts question 1 once half of the card is on screen", () => {
    render(<WHero media="card" />);
    expect(halfObservers()).toHaveLength(1);
    const [io] = halfObservers();
    expect(io!.el?.textContent).toContain("QUESTION 1 OF");
    act(() => io!.show(0.3));
    expect(seenEvents()).toEqual([]);
    act(() => io!.show(0.5));
    expect(seenEvents()).toEqual([["cta_seen", { cta: "hero_card" }]]);
    act(() => io!.show(1));
    expect(seenEvents()).toHaveLength(1);
  });

  it("arm B: counts the video, and there is no card to count", () => {
    render(<WHero media="video" />);
    expect(halfObservers()).toHaveLength(1);
    const [io] = halfObservers();
    expect(io!.el).toBe(screen.getByTestId("hero-video"));
    act(() => io!.show(1));
    expect(seenEvents()).toEqual([["cta_seen", { cta: "hero_video" }]]);
  });

  it("sends nothing while the media is below the screen", () => {
    render(<WHero media="card" />);
    render(<WHero media="video" />);
    for (const io of halfObservers()) act(() => io.show(0));
    expect(seenEvents()).toEqual([]);
  });
});
