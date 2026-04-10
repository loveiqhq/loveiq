// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WelcomeSection from "@/components/report/sections/WelcomeSection";

let frameTime = 0;
const SECTION_SELECTOR = 'section[data-report-section="true"]';
const GRID_SELECTOR = ".report-welcome-grid";
const GAUGE_SELECTOR = ".report-gauge__value";
const INITIAL_METRIC_REVEAL_DELAY_MS = 840;
const LATE_METRIC_REVEAL_DELAY_MS = 120;

class MockIntersectionObserver implements IntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0];
  readonly callback: IntersectionObserverCallback;
  readonly elements = new Set<Element>();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  disconnect() {
    this.elements.clear();
  }

  observe(element: Element) {
    this.elements.add(element);
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  unobserve(element: Element) {
    this.elements.delete(element);
  }
}

describe("WelcomeSection", () => {
  const rafTimers = new Map<number, ReturnType<typeof setTimeout>>();
  let rafId = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    MockIntersectionObserver.instances = [];
    rafTimers.clear();
    rafId = 0;
    frameTime = 0;

    vi.spyOn(performance, "now").mockImplementation(() => frameTime);

    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      rafId += 1;
      const id = rafId;
      const timer = setTimeout(() => {
        rafTimers.delete(id);
        frameTime += 100;
        callback(frameTime);
      }, 0);
      rafTimers.set(id, timer);
      return id;
    });

    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      const timer = rafTimers.get(id);
      if (timer !== undefined) {
        clearTimeout(timer);
        rafTimers.delete(id);
      }
    });

    vi.stubGlobal(
      "IntersectionObserver",
      MockIntersectionObserver as unknown as typeof IntersectionObserver
    );

    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
  });

  afterEach(() => {
    rafTimers.forEach((timer) => clearTimeout(timer));
    rafTimers.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cleanup();
  });

  it("delays the above-the-fold metric animation until after the welcome section settles", async () => {
    render(
      <WelcomeSection
        feedbackWidget={null}
        generalHtml="<p>Your snapshot</p><p>Test intro.</p>"
        sectionId="welcome"
        snapshot={{
          importanceLabel: "Importance of Sex",
          importancePct: 71,
          importanceValue: 5,
          satisfactionLabel: "Current Sexual Satisfaction",
          satisfactionPct: 86,
          satisfactionStatusLabel: "Mostly satisfied",
          satisfactionValue: 6,
          stage: "Grounded / Integrated",
        }}
      />
    );

    expect(screen.getByText("Mostly satisfied")).toBeInTheDocument();

    expect(getMetricTexts()).toEqual(["0%", "0%"]);
    expect(MockIntersectionObserver.instances).toHaveLength(1);

    const section = document.querySelector(SECTION_SELECTOR) as HTMLElement | null;
    const grid = document.querySelector(GRID_SELECTOR) as HTMLDivElement | null;
    expect(section).not.toBeNull();
    expect(grid).not.toBeNull();
    mockElementRect(grid!, { top: 160, bottom: 520, height: 360 });

    const firstGaugeValue = document.querySelector(GAUGE_SELECTOR) as SVGPathElement | null;
    expect(firstGaugeValue).not.toBeNull();
    const initialOffset = Number(firstGaugeValue!.style.strokeDashoffset);

    act(() => {
      triggerIntersection(section!, 1);
    });

    await act(async () => {
      vi.advanceTimersByTime(INITIAL_METRIC_REVEAL_DELAY_MS - 1);
    });

    expect(getMetricTexts()).toEqual(["0%", "0%"]);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(getMetricTexts()).toEqual(["86%", "71%"]);
    expect(Number(firstGaugeValue!.style.strokeDashoffset)).toBeLessThan(initialOffset);
  });

  it("animates after later intersection when the welcome metrics are not initially visible", async () => {
    render(
      <WelcomeSection
        feedbackWidget={null}
        generalHtml="<p>Your snapshot</p><p>Test intro.</p>"
        sectionId="welcome"
        snapshot={{
          importanceLabel: "Importance of Sex",
          importancePct: 71,
          importanceValue: 5,
          satisfactionLabel: "Current Sexual Satisfaction",
          satisfactionPct: 86,
          satisfactionStatusLabel: "Mostly satisfied",
          satisfactionValue: 6,
          stage: "Grounded / Integrated",
        }}
      />
    );

    const section = document.querySelector(SECTION_SELECTOR) as HTMLElement | null;
    const grid = document.querySelector(GRID_SELECTOR) as HTMLDivElement | null;
    expect(section).not.toBeNull();
    expect(grid).not.toBeNull();

    mockElementRect(grid!, { top: 920, bottom: 1280, height: 360 });

    act(() => {
      triggerIntersection(section!, 1);
    });

    expect(getMetricTexts()).toEqual(["0%", "0%"]);
    expect(MockIntersectionObserver.instances).toHaveLength(2);

    mockElementRect(grid!, { top: 220, bottom: 580, height: 360 });

    act(() => {
      triggerIntersection(grid!, 1);
    });

    await act(async () => {
      vi.advanceTimersByTime(LATE_METRIC_REVEAL_DELAY_MS);
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(getMetricTexts()).toEqual(["86%", "71%"]);
  });
});

function triggerIntersection(element: Element, intersectionRatio: number) {
  const rect = new DOMRect(0, 0, 208, 114);

  for (const observer of MockIntersectionObserver.instances) {
    if (!observer.elements.has(element)) continue;

    observer.callback(
      [
        {
          boundingClientRect: rect,
          intersectionRatio,
          intersectionRect: rect,
          isIntersecting: intersectionRatio > 0,
          rootBounds: null,
          target: element,
          time: frameTime,
        } as IntersectionObserverEntry,
      ],
      observer as unknown as IntersectionObserver
    );
  }
}

function getMetricTexts() {
  return Array.from(document.querySelectorAll(".report-card__metric-value span")).map(
    (element) => element.textContent
  );
}

function mockElementRect(
  element: Element,
  { top, bottom, height }: { top: number; bottom: number; height: number }
) {
  const width = 320;
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: top,
    top,
    bottom,
    left: 0,
    right: width,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect);
}
