// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CountUpOnView from "@features/landing/ui/CountUpOnView";

/**
 * Landing page v2's numbers roll up (Marcus, 15 Nov; Hana's board "animated pain-point
 * section", 16 Nov): from 0 to the value over 1.6s, easing out, once 40% of the number is on
 * screen; 150ms apart where the four share a row (from lg); never under reduced motion.
 */

type Report = (entries: { isIntersecting: boolean; target: Element }[]) => void;
let report: Report = () => {};
let options: IntersectionObserverInit | undefined;
let observers = 0;
/** Whether anything is still watched: a real observer reports nothing after disconnect(). */
let watching = false;

class StubObserver {
  constructor(cb: Report, opts?: IntersectionObserverInit) {
    report = cb;
    options = opts;
    observers += 1;
  }
  observe() {
    watching = true;
  }
  unobserve() {
    watching = false;
  }
  disconnect() {
    watching = false;
  }
}

const media = (matches: { reduce?: boolean; lg?: boolean }) =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce") ? !!matches.reduce : query.includes("1024px") && !!matches.lg,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));

const digits = (container: HTMLElement) => container.querySelector("[data-count-up]")!.textContent;
const enter = (container: HTMLElement) =>
  act(() => {
    if (watching) report([{ isIntersecting: true, target: container.firstElementChild! }]);
  });
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
/** Mid-count: past 0 and short of the value. */
const counting = (container: HTMLElement, value: number) => {
  const n = Number(digits(container)!.replace("%", ""));
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(value);
};

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "performance",
    ],
  });
  observers = 0;
  watching = false;
  options = undefined;
  vi.stubGlobal("IntersectionObserver", StubObserver);
  media({});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CountUpOnView", () => {
  it("gives screen readers the final value only, never the counting digits", () => {
    const { container } = render(<CountUpOnView value={47} suffix="%" />);
    expect(container.querySelector(".sr-only")?.textContent).toBe("47%");
    expect(container.querySelector("[data-count-up]")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("waits at 0 until 40% of it is on screen, then counts up to the value in 1.6s", () => {
    const { container } = render(<CountUpOnView value={47} suffix="%" />);
    expect(options?.threshold).toBe(0.4);
    expect(digits(container)).toBe("0%");

    enter(container);
    wait(800);
    const mid = Number(digits(container)!.replace("%", ""));
    // Easing out: past half the value at half the time, short of the value.
    expect(mid).toBeGreaterThan(24);
    expect(mid).toBeLessThan(47);
    wait(900);
    expect(digits(container)).toBe("47%");
  });

  it("counts only once, even when it comes back into view", () => {
    const { container } = render(<CountUpOnView value={56} suffix="%" />);
    enter(container);
    wait(400);
    counting(container, 56);
    wait(1300);
    expect(digits(container)).toBe("56%");
    enter(container);
    wait(100);
    expect(digits(container)).toBe("56%");
  });

  it("starts 150ms per place after the first where the row shares a line (from lg)", () => {
    media({ lg: true });
    const { container } = render(<CountUpOnView value={42} suffix="%" index={2} />);
    enter(container);
    wait(290);
    expect(digits(container)).toBe("0%");
    wait(400);
    counting(container, 42);
  });

  it("starts at once on a phone, where each card comes into view on its own", () => {
    const { container } = render(<CountUpOnView value={77} suffix="%" index={3} />);
    expect(digits(container)).toBe("0%");
    enter(container);
    wait(120);
    counting(container, 77);
  });

  it("shows the value and watches nothing under reduced motion", () => {
    media({ reduce: true });
    const { container } = render(<CountUpOnView value={47} suffix="%" />);
    expect(digits(container)).toBe("47%");
    expect(observers).toBe(0);
  });

  it("shows the value where there is no IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { container } = render(<CountUpOnView value={47} suffix="%" />);
    expect(digits(container)).toBe("47%");
  });

  it("leaves the final value when it unmounts mid-count", () => {
    const { container, unmount } = render(<CountUpOnView value={47} suffix="%" />);
    const counter = container.querySelector("[data-count-up]")!;
    enter(container);
    wait(400);
    counting(container, 47);
    unmount();
    expect(counter.textContent).toBe("47%");
  });
});
