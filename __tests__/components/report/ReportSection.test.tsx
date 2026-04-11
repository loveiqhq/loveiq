// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReportSection from "@/components/report/ReportSection";

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

describe("ReportSection", () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];

    vi.stubGlobal(
      "IntersectionObserver",
      MockIntersectionObserver as unknown as typeof IntersectionObserver
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    window.history.replaceState({}, "", "/report");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/report");
  });

  it("reveals the current hash-targeted section without waiting for observer intersection", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      createRect({ top: 1400, bottom: 3200, height: 1800 })
    );

    render(
      <ReportSection sectionId="fantasy_and_practice" title="Fantasy & Practice">
        <p>Premium preview</p>
      </ReportSection>
    );

    const section = document.getElementById("fantasy_and_practice");
    expect(section).not.toHaveClass("is-visible");

    act(() => {
      window.history.replaceState({}, "", "/report#fantasy_and_practice");
      window.dispatchEvent(new Event("hashchange"));
    });

    expect(section).toHaveClass("report-section", "is-visible");
  });

  it("keeps the observer-driven reveal for sections that enter the viewport later", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      createRect({ top: 1400, bottom: 3200, height: 1800 })
    );

    render(
      <ReportSection sectionId="core_motivation" title="Core Motivation">
        <p>Deferred section</p>
      </ReportSection>
    );

    const section = document.getElementById("core_motivation");

    expect(section).not.toHaveClass("is-visible");
    expect(MockIntersectionObserver.instances).toHaveLength(1);

    act(() => {
      triggerIntersection(section!, 0.02);
    });

    expect(section).toHaveClass("report-section", "is-visible");
  });
});

function createRect({ bottom, height, top }: { bottom: number; height: number; top: number }) {
  return {
    x: 0,
    y: top,
    top,
    bottom,
    left: 0,
    right: 320,
    width: 320,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

function triggerIntersection(element: Element, intersectionRatio: number) {
  const rect = createRect({ top: 24, bottom: 360, height: 336 });

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
          time: 0,
        } as IntersectionObserverEntry,
      ],
      observer as unknown as IntersectionObserver
    );
  }
}
