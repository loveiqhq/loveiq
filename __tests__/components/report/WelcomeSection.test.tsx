// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WelcomeSection from "@/components/report/sections/WelcomeSection";

let frameTime = 0;

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

  it("animates the gauge and percentage only after the metric card becomes visible", async () => {
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
          satisfactionValue: 6,
          stage: "Grounded / Integrated",
        }}
      />
    );

    expect(getMetricTexts()).toEqual(["0%", "0%"]);

    const gaugeWraps = Array.from(document.querySelectorAll(".report-gauge-wrap"));
    expect(gaugeWraps).toHaveLength(2);
    expect(MockIntersectionObserver.instances).toHaveLength(3);

    const firstGaugeValue = document.querySelector(".report-gauge__value") as SVGPathElement | null;
    expect(firstGaugeValue).not.toBeNull();
    const initialOffset = Number(firstGaugeValue!.style.strokeDashoffset);

    act(() => {
      gaugeWraps.forEach((element) => {
        triggerIntersection(element, 1);
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(120);
    });

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(getMetricTexts()).toEqual(["86%", "71%"]);
    expect(Number(firstGaugeValue!.style.strokeDashoffset)).toBeLessThan(initialOffset);
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
