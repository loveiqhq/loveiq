import { act } from "@testing-library/react";
import { vi } from "vitest";

/**
 * Test kit for the V4 entrances (useV4Reveal): an IntersectionObserver stand-in whose
 * callback the test fires by hand, a synchronous requestAnimationFrame, and a
 * getBoundingClientRect mock — the three things a reveal reads.
 */
export class RevealObserver implements IntersectionObserver {
  static instances: RevealObserver[] = [];

  readonly root = null;
  readonly rootMargin: string;
  readonly thresholds: readonly number[];
  readonly callback: IntersectionObserverCallback;
  readonly elements = new Set<Element>();
  disconnected = false;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.rootMargin = options?.rootMargin ?? "0px";
    const threshold = options?.threshold ?? 0;
    this.thresholds = Array.isArray(threshold) ? threshold : [threshold];
    RevealObserver.instances.push(this);
  }

  observe(element: Element) {
    this.elements.add(element);
  }

  unobserve(element: Element) {
    this.elements.delete(element);
  }

  disconnect() {
    this.elements.clear();
    this.disconnected = true;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Reports every element it watches as on (or off) screen. */
  fire(isIntersecting = true) {
    const entries = [...this.elements].map(
      (target) =>
        ({
          isIntersecting,
          target,
          intersectionRatio: isIntersecting ? 1 : 0,
        }) as unknown as IntersectionObserverEntry
    );
    act(() => this.callback(entries, this));
  }
}

/** Installs the observer stand-in and a synchronous requestAnimationFrame. */
export function installRevealObserver() {
  RevealObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", RevealObserver as unknown as typeof IntersectionObserver);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
}

/** The observer watching `element`, if any. */
export const observerOf = (element: Element) =>
  RevealObserver.instances.find((observer) => observer.elements.has(element));

/** Every element measures this box (jsdom lays nothing out). */
export function mockRect({ top = 0, width = 329, height = 61 } = {}) {
  return vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    top,
    bottom: top + height,
    left: 0,
    right: width,
    width,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect);
}
