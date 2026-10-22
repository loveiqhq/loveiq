// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const analytics = vi.hoisted(() => ({
  trackTourStarted: vi.fn(),
  trackTourStepViewed: vi.fn(),
  trackTourBack: vi.fn(),
  trackTourSkipped: vi.fn(),
  trackTourCompleted: vi.fn(),
  trackTourLeft: vi.fn(),
}));
vi.mock("@features/analytics/client", () => analytics);

import V4GuidedTour, { TOUR_GESTURE_ATTR } from "@features/report/ui/v3/V4GuidedTour";
import { __resetOverlayHistoryForTests } from "@shared/ui/overlay-history";
import { __resetGuidedTourForTests, isGuidedTourActive } from "@shared/ui/guided-tour-state";
import { setSmoothScroll } from "@shared/ui/smooth-scroll-registry";

/**
 * The guided tour on the report's first open (Figma 1713:1071 › 1755:1275; Mark's prototype,
 * tab "Guided tour"), on a page reduced to the five controls it points at. Positions are
 * given per element, against the window's scroll, as the browser would report them.
 */

const VIEW_W = 393;
const VIEW_H = 852;
const PAGE_H = 8_000;

/** Where each control sits: in the page (scrolls) or on the screen (fixed). */
const boxes = new Map<
  Element,
  { top: number; left: number; w: number; h: number; fixed?: boolean }
>();

function place(
  el: Element | null,
  box: { top: number; left: number; w: number; h: number; fixed?: boolean }
) {
  if (!el) throw new Error("no element to place");
  boxes.set(el, box);
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => {
      const b = boxes.get(el)!;
      const top = b.fixed ? b.top : b.top - window.scrollY;
      return {
        top,
        left: b.left,
        width: b.w,
        height: b.h,
        right: b.left + b.w,
        bottom: top + b.h,
        x: b.left,
        y: top,
      };
    },
  });
}

function buildPage({ foldPill = true, locked = true } = {}) {
  document.body.innerHTML = `
    <div class="report-chapter-pill"><button class="report-chapter-pill__btn" type="button">Introduction<span class="report-chapter-pill__chevron"><svg></svg></span></button></div>
    <main class="report-content">
      <section id="typical_beliefs" class="rv4-chapter is-open">
        <button class="rv4-chapter__button" type="button"><span class="rv4-chapter__chev"><svg></svg></span></button>
        <div class="rv4-fold">${foldPill ? '<button class="rv4-fold__pill" type="button">Show all</button>' : ""}</div>
        <section class="rv4-try"><button class="rv4-try__button" type="button"><span class="rv4-try__label">Try This &amp; See What Shifts</span></button></section>
      </section>
      ${locked ? '<section id="power_orientation" class="rv4-chapter is-locked"><button type="button"><span class="rv4-chapter__lock">Unlock Report</span></button></section>' : ""}
    </main>`;
  place(document.querySelector(".report-chapter-pill__btn"), {
    top: 80,
    left: 51,
    w: 291,
    h: 56,
    fixed: true,
  });
  place(document.querySelector(".rv4-chapter__chev"), { top: 2_000, left: 343, w: 34, h: 34 });
  if (foldPill)
    place(document.querySelector(".rv4-fold__pill"), { top: 2_400, left: 140, w: 112, h: 34 });
  place(document.querySelector(".rv4-try__label"), { top: 3_200, left: 24, w: 300, h: 32 });
  if (locked)
    place(document.querySelector(".rv4-chapter__lock"), { top: 3_900, left: 300, w: 77, h: 56 });
}

const scrollTo = vi.fn((arg: ScrollToOptions | number, y?: number) => {
  const top = typeof arg === "object" ? (arg.top ?? 0) : (y ?? 0);
  Object.defineProperty(window, "scrollY", { value: top, configurable: true, writable: true });
});

const lenis = { stop: vi.fn(), start: vi.fn(), resize: vi.fn() };
const run = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
/** Long enough for any stop to scroll in, settle and have its spotlight arrive. */
const arrive = () => run(2_000);
const stepLabel = () => document.querySelector(".rv4-tour__step")?.textContent;
const button = (name: string) => screen.queryByRole("button", { name });

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "performance",
      "Date",
    ],
  });
  Object.defineProperty(window, "innerWidth", { value: VIEW_W, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: VIEW_H, configurable: true });
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true, writable: true });
  Object.defineProperty(document.documentElement, "scrollHeight", {
    value: PAGE_H,
    configurable: true,
  });
  vi.stubGlobal("scrollTo", scrollTo);
  scrollTo.mockClear();
  Object.values(analytics).forEach((fn) => fn.mockClear());
  Object.values(lenis).forEach((fn) => fn.mockClear());
  setSmoothScroll(lenis);
  boxes.clear();
  buildPage();
});

afterEach(() => {
  cleanup();
  setSmoothScroll(null);
  __resetGuidedTourForTests();
  __resetOverlayHistoryForTests();
  document.documentElement.removeAttribute("style");
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the guided tour", () => {
  it("starts at the chapter menu: step 1 of 5, Skip Tour and Next, no Back", () => {
    render(<V4GuidedTour trigger="auto" includeUnlock onDone={vi.fn()} />);
    arrive();
    expect(screen.getByRole("dialog", { name: "Easily Navigate Your Report" })).toBeTruthy();
    expect(stepLabel()).toBe("Step 1 of 5");
    expect(button("Skip Tour")).toBeTruthy();
    expect(button("Next")).toBeTruthy();
    expect(button("Back")).toBeNull();
    expect(analytics.trackTourStarted).toHaveBeenCalledWith({
      trigger: "auto",
      audience: "free",
      steps: 5,
    });
    expect(analytics.trackTourStepViewed).toHaveBeenCalledWith({
      trigger: "auto",
      n: 1,
      id: "chapter_menu",
      steps: 5,
    });
    expect(document.activeElement).toBe(button("Next"));
  });

  it("walks every stop in order and ends on Finish, with Back from the second and no Skip on the last", () => {
    render(<V4GuidedTour trigger="auto" includeUnlock onDone={vi.fn()} />);
    arrive();
    const titles: string[] = [];
    for (let n = 1; n <= 5; n += 1) {
      titles.push(document.querySelector(".rv4-tour__title")?.textContent ?? "");
      expect(stepLabel()).toBe(`Step ${n} of 5`);
      expect(Boolean(button("Back")), `Back on stop ${n}`).toBe(n > 1);
      expect(Boolean(button("Skip Tour")), `Skip on stop ${n}`).toBe(n < 5);
      if (n < 5) {
        fireEvent.click(button("Next")!);
        arrive();
      }
    }
    expect(titles).toEqual([
      "Easily Navigate Your Report",
      "Read the Full Text",
      "Show or Hide Chapters",
      "Put Your Insights Into Practice",
      "Discover the Full Report",
    ]);
    expect(button("Finish")).toBeTruthy();
  });

  it("scrolls every stop's control to 42% of the screen, the menu to the very top", () => {
    render(<V4GuidedTour trigger="auto" includeUnlock onDone={vi.fn()} />);
    arrive();
    expect(window.scrollY).toBe(0);
    fireEvent.click(button("Next")!);
    arrive();
    // Show All: its centre at 2417 in the page, 0.42 × 852 down the screen.
    expect(window.scrollY).toBe(Math.round(2_400 + 17 - VIEW_H * 0.42));
    // Every scroll is the tour's own animation: never left to the stylesheet's smooth one.
    for (const [arg] of scrollTo.mock.calls) {
      expect(arg).toMatchObject({ behavior: "instant" });
    }
  });

  it("gives a reader who has paid four stops, ending on Try This with Finish", () => {
    render(<V4GuidedTour trigger="auto" includeUnlock={false} onDone={vi.fn()} />);
    arrive();
    expect(stepLabel()).toBe("Step 1 of 4");
    expect(analytics.trackTourStarted).toHaveBeenCalledWith({
      trigger: "auto",
      audience: "paid",
      steps: 4,
    });
    for (let n = 1; n < 4; n += 1) {
      fireEvent.click(button("Next")!);
      arrive();
    }
    expect(document.querySelector(".rv4-tour__title")?.textContent).toBe(
      "Put Your Insights Into Practice"
    );
    expect(button("Finish")).toBeTruthy();
    expect(button("Skip Tour")).toBeNull();
  });

  it("drops a stop whose control is not on the page, and counts without it", () => {
    document.body.innerHTML = "";
    buildPage({ foldPill: false });
    render(<V4GuidedTour trigger="auto" includeUnlock onDone={vi.fn()} />);
    arrive();
    expect(stepLabel()).toBe("Step 1 of 4");
    // Four stops, and still a free reader's tour: whose it is comes from the unlock stop.
    expect(analytics.trackTourStarted).toHaveBeenCalledWith({
      trigger: "auto",
      audience: "free",
      steps: 4,
    });
    fireEvent.click(button("Next")!);
    arrive();
    expect(document.querySelector(".rv4-tour__title")?.textContent).toBe("Show or Hide Chapters");
  });

  it("goes back a stop with Back and the left arrow, forward with the right arrow", () => {
    render(<V4GuidedTour trigger="auto" includeUnlock onDone={vi.fn()} />);
    arrive();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    arrive();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    arrive();
    expect(stepLabel()).toBe("Step 3 of 5");
    fireEvent.click(button("Back")!);
    arrive();
    expect(stepLabel()).toBe("Step 2 of 5");
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    arrive();
    expect(stepLabel()).toBe("Step 1 of 5");
    expect(analytics.trackTourBack.mock.calls.map(([p]) => p.to)).toEqual([2, 1]);
  });

  it("ends on Escape at any stop, back at the top, and says where", () => {
    const onDone = vi.fn();
    render(<V4GuidedTour trigger="auto" includeUnlock onDone={onDone} />);
    arrive();
    fireEvent.click(button("Next")!);
    arrive();
    fireEvent.click(button("Next")!);
    arrive();
    const escape = new KeyboardEvent("keydown", { key: "Escape", cancelable: true, bubbles: true });
    document.dispatchEvent(escape);
    expect(escape.defaultPrevented, "the close request ends it once").toBe(true);
    expect(onDone).toHaveBeenCalledWith("skipped");
    expect(window.scrollY).toBe(0);
    expect(analytics.trackTourSkipped).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: "auto",
        audience: "free",
        at: 3,
        id: "chapter_toggle",
        steps: 5,
        source: "escape",
        stops: [
          { id: "chapter_menu", ms: expect.any(Number), back: 0 },
          { id: "show_all", ms: expect.any(Number), back: 0 },
          { id: "chapter_toggle", ms: expect.any(Number), back: 0 },
        ],
      })
    );
  });

  it("gives each stop reached its time on screen, over every visit, and its Back presses", () => {
    render(<V4GuidedTour trigger="auto" includeUnlock onDone={vi.fn()} />);
    arrive();
    run(3_000);
    // Five seconds in, Next: the menu's bubble came up a few frames after the start.
    fireEvent.click(button("Next")!);
    arrive();
    fireEvent.click(button("Next")!);
    arrive();
    fireEvent.click(button("Back")!);
    arrive();
    fireEvent.click(button("Back")!);
    arrive();
    fireEvent.click(button("Next")!);
    arrive();
    fireEvent.click(button("Skip Tour")!);
    const [skipped] = analytics.trackTourSkipped.mock.calls[0]!;
    expect(skipped).toMatchObject({ at: 2, id: "show_all", steps: 5 });
    expect(skipped.stops.map(({ id, back }: { id: string; back: number }) => [id, back])).toEqual([
      ["chapter_menu", 0],
      ["show_all", 1],
      ["chapter_toggle", 1],
    ]);
    // The menu was up twice: just under five seconds, then again after the two Backs. The
    // scrolling and the spotlight's travel between stops are the tour's, not the reader's.
    const [menu, showAll, toggle] = skipped.stops as Array<{ ms: number }>;
    expect(menu!.ms).toBeGreaterThan(5_000);
    expect(menu!.ms).toBeLessThan(7_000);
    for (const stop of [showAll!, toggle!]) expect(stop.ms).toBeGreaterThan(0);
  });

  it("ends from its Skip Tour link", () => {
    const onDone = vi.fn();
    render(<V4GuidedTour trigger="auto" includeUnlock onDone={onDone} />);
    arrive();
    fireEvent.click(button("Skip Tour")!);
    expect(onDone).toHaveBeenCalledWith("skipped");
    expect(analytics.trackTourSkipped).toHaveBeenCalledWith(
      expect.objectContaining({ at: 1, source: "skip_button" })
    );
  });

  it("finishes by fading the dim while the page goes back to the top", () => {
    const onDone = vi.fn();
    render(<V4GuidedTour trigger="auto" includeUnlock onDone={onDone} />);
    arrive();
    for (let n = 1; n < 5; n += 1) {
      fireEvent.click(button("Next")!);
      arrive();
    }
    expect(window.scrollY).toBeGreaterThan(0);
    fireEvent.click(button("Finish")!);
    expect(document.querySelector(".rv4-tour")?.hasAttribute("data-finishing")).toBe(true);
    expect(onDone).not.toHaveBeenCalled();
    run(1_500);
    expect(window.scrollY).toBe(0);
    expect(onDone).toHaveBeenCalledWith("completed");
    expect(analytics.trackTourCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: "auto", audience: "free", steps: 5 })
    );
    const [completed] = analytics.trackTourCompleted.mock.calls[0]!;
    expect(completed.stops.map(({ id }: { id: string }) => id)).toEqual([
      "chapter_menu",
      "show_all",
      "chapter_toggle",
      "try_this",
      "unlock",
    ]);
    for (const stop of completed.stops) expect(stop).toMatchObject({ back: 0 });
    for (const stop of completed.stops) expect(stop.ms).toBeGreaterThan(0);
  });

  it("tells the reader left when the page goes with the tour up: once, at the stop on screen", () => {
    render(<V4GuidedTour trigger="auto" includeUnlock onDone={vi.fn()} />);
    arrive();
    fireEvent.click(button("Next")!);
    arrive();
    // A tab switched away and back has not left: the tour is still there on return.
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    // Kept in the back-forward cache, the page may come back with the tour up: not yet.
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    expect(analytics.trackTourLeft).not.toHaveBeenCalled();

    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
    expect(analytics.trackTourLeft).toHaveBeenCalledTimes(1);
    expect(analytics.trackTourLeft).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: "auto",
        audience: "free",
        at: 2,
        id: "show_all",
        steps: 5,
        stops: [
          { id: "chapter_menu", ms: expect.any(Number), back: 0 },
          { id: "show_all", ms: expect.any(Number), back: 0 },
        ],
      })
    );
    const [left] = analytics.trackTourLeft.mock.calls[0]!;
    // The stop on screen counts up to the moment the page went.
    expect(left.stops[1].ms).toBeGreaterThan(0);
  });

  it("never tells a run left before it starts, or once it was skipped or seen through", () => {
    const hide = () =>
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
    const first = render(<V4GuidedTour trigger="auto" includeUnlock onDone={vi.fn()} />);
    // Before its first frame: no stop yet, and no start told.
    hide();
    arrive();
    fireEvent.click(button("Skip Tour")!);
    hide();
    first.unmount();

    render(<V4GuidedTour trigger="auto" includeUnlock={false} onDone={vi.fn()} />);
    arrive();
    for (let n = 1; n < 4; n += 1) {
      fireEvent.click(button("Next")!);
      arrive();
    }
    fireEvent.click(button("Finish")!);
    // The dim is still fading out, and the run is over all the same.
    hide();
    expect(analytics.trackTourLeft).not.toHaveBeenCalled();
  });

  it("holds the page while it runs and lets go of all of it when it unmounts", () => {
    const { unmount } = render(<V4GuidedTour trigger="auto" includeUnlock onDone={vi.fn()} />);
    expect(isGuidedTourActive()).toBe(true);
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(lenis.stop).toHaveBeenCalled();
    arrive();
    fireEvent.click(button("Next")!);
    arrive();
    fireEvent.click(button("Next")!);
    arrive();
    const chevron = document.querySelector(".rv4-chapter__chev")!;
    expect(chevron.getAttribute(TOUR_GESTURE_ATTR)).toBe("turn");
    unmount();
    expect(isGuidedTourActive()).toBe(false);
    expect(document.documentElement.style.overflow).toBe("");
    expect(lenis.start).toHaveBeenCalled();
    expect(lenis.resize).toHaveBeenCalled();
    expect(chevron.hasAttribute(TOUR_GESTURE_ATTR), "no move left on the page").toBe(false);
  });

  it("stops each control's move when it leaves that stop", () => {
    render(<V4GuidedTour trigger="auto" includeUnlock onDone={vi.fn()} />);
    arrive();
    const pill = document.querySelector(".report-chapter-pill__btn")!;
    expect(pill.getAttribute(TOUR_GESTURE_ATTR)).toBe("nudge");
    fireEvent.click(button("Next")!);
    arrive();
    expect(pill.hasAttribute(TOUR_GESTURE_ATTR)).toBe(false);
  });

  it("keeps the reader's swipes, wheel and scroll keys from the page", () => {
    render(<V4GuidedTour trigger="auto" includeUnlock onDone={vi.fn()} />);
    arrive();
    const blocker = document.querySelector(".rv4-tour__blocker")!;
    const wheel = new Event("wheel", { cancelable: true, bubbles: true });
    blocker.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    const swipe = new Event("touchmove", { cancelable: true, bubbles: true });
    blocker.dispatchEvent(swipe);
    expect(swipe.defaultPrevented).toBe(true);
    const down = new KeyboardEvent("keydown", { key: "PageDown", cancelable: true, bubbles: true });
    document.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    // Space on the bubble's own button still presses it.
    const space = new KeyboardEvent("keydown", { key: " ", cancelable: true, bubbles: true });
    button("Next")!.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(false);
  });

  it("lets the cookie banner, above the tour, still be scrolled and answered", () => {
    render(<V4GuidedTour trigger="auto" includeUnlock onDone={vi.fn()} />);
    arrive();
    const banner = document.createElement("div");
    banner.className = "cky-consent-container";
    document.body.appendChild(banner);
    const swipe = new Event("touchmove", { cancelable: true, bubbles: true });
    banner.dispatchEvent(swipe);
    expect(swipe.defaultPrevented).toBe(false);
  });

  it("rings the focused button only once the reader uses the keyboard", () => {
    // Each stop focuses Next; a browser rings a button the page focuses before any input,
    // and Figma draws none (guidedTour.css shows it under data-keys).
    render(<V4GuidedTour trigger="auto" includeUnlock onDone={vi.fn()} />);
    arrive();
    const layer = document.querySelector(".rv4-tour")!;
    expect(layer.hasAttribute("data-keys")).toBe(false);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(layer.hasAttribute("data-keys")).toBe(true);
  });

  it("keeps Tab going round the bubble's buttons", () => {
    render(<V4GuidedTour trigger="auto" includeUnlock onDone={vi.fn()} />);
    arrive();
    fireEvent.click(button("Next")!);
    arrive();
    expect(document.activeElement).toBe(button("Next"));
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(document.activeElement).toBe(button("Skip Tour"));
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(button("Next"));
  });

  it("only fades under reduced motion: no pulse, no moves", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({ matches: query.includes("reduce"), media: query }))
    );
    render(<V4GuidedTour trigger="auto" includeUnlock onDone={vi.fn()} />);
    arrive();
    expect(document.querySelector(".rv4-tour__edge")?.hasAttribute("data-pulse")).toBe(false);
    expect(
      document.querySelector(".report-chapter-pill__btn")?.hasAttribute(TOUR_GESTURE_ATTR)
    ).toBe(false);
    fireEvent.click(button("Next")!);
    // A jump, not a glide: one frame is enough.
    run(100);
    expect(window.scrollY).toBe(Math.round(2_400 + 17 - VIEW_H * 0.42));
  });

  it("logs a replay's run as a replay", () => {
    render(<V4GuidedTour trigger="replay" includeUnlock={false} onDone={vi.fn()} />);
    arrive();
    expect(analytics.trackTourStarted).toHaveBeenCalledWith({
      trigger: "replay",
      audience: "paid",
      steps: 4,
    });
  });

  it("does not start at all when none of its controls is on the page", () => {
    document.body.innerHTML = "";
    const onDone = vi.fn();
    render(<V4GuidedTour trigger="auto" includeUnlock onDone={onDone} />);
    arrive();
    expect(onDone).toHaveBeenCalledWith("skipped");
    expect(analytics.trackTourStarted).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
