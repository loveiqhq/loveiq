// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WelcomeSection from "@features/report/ui/sections/WelcomeSection";

let frameTime = 0;
const GAUGE_SELECTOR = ".report-gauge__value";
const INITIAL_METRIC_REVEAL_DELAY_MS = 840;

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

  it("renders static labels and initial 0% metric values on mount", () => {
    render(
      <WelcomeSection
        feedbackWidget={null}
        generalHtml="<p>Your snapshot</p><p>Test intro.</p>"
        sectionId="welcome"
        snapshot={{
          importanceLabel: "Importance of Sex",
          importancePct: 71,
          importanceStatusLabel: "Slightly important",
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
    expect(screen.getByText("Slightly important")).toBeInTheDocument();
    expect(getMetricTexts()).toEqual(["0%", "0%"]);
  });

  it("animates metrics to their final values after the mount delay regardless of scroll", async () => {
    render(
      <WelcomeSection
        feedbackWidget={null}
        generalHtml="<p>Your snapshot</p><p>Test intro.</p>"
        sectionId="welcome"
        snapshot={{
          importanceLabel: "Importance of Sex",
          importancePct: 71,
          importanceStatusLabel: "Slightly important",
          importanceValue: 5,
          satisfactionLabel: "Current Sexual Satisfaction",
          satisfactionPct: 86,
          satisfactionStatusLabel: "Mostly satisfied",
          satisfactionValue: 6,
          stage: "Grounded / Integrated",
        }}
      />
    );

    const firstGaugeValue = document.querySelector(GAUGE_SELECTOR) as SVGPathElement | null;
    expect(firstGaugeValue).not.toBeNull();
    const initialOffset = Number(firstGaugeValue!.style.strokeDashoffset);

    // Before the reveal delay elapses, metrics still read 0%.
    await act(async () => {
      vi.advanceTimersByTime(INITIAL_METRIC_REVEAL_DELAY_MS - 1);
    });
    expect(getMetricTexts()).toEqual(["0%", "0%"]);

    // After the reveal delay and all follow-up rAFs, metrics reach their targets.
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(getMetricTexts()).toEqual(["86%", "71%"]);
    expect(Number(firstGaugeValue!.style.strokeDashoffset)).toBeLessThan(initialOffset);
  });
});

function getMetricTexts() {
  return Array.from(document.querySelectorAll(".report-card__metric-value span")).map(
    (element) => element.textContent
  );
}
