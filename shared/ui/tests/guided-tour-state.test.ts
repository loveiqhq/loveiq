import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __resetGuidedTourForTests,
  isGuidedTourActive,
  setGuidedTourActive,
  subscribeGuidedTour,
} from "@shared/ui/guided-tour-state";

/**
 * The report's guided tour scrolls the page itself; this flag is how the page's
 * scroll-driven signals (reach, cta_seen, scroll depth, the paywall offers) know the
 * scrolling is the tour's, not the reader's.
 */
describe("guided tour state", () => {
  afterEach(() => {
    __resetGuidedTourForTests();
  });

  it("is off until the tour sets it", () => {
    expect(isGuidedTourActive()).toBe(false);
    setGuidedTourActive(true);
    expect(isGuidedTourActive()).toBe(true);
    setGuidedTourActive(false);
    expect(isGuidedTourActive()).toBe(false);
  });

  it("tells subscribers when it changes, and only then", () => {
    const heard = vi.fn();
    subscribeGuidedTour(heard);
    setGuidedTourActive(true);
    setGuidedTourActive(true);
    setGuidedTourActive(false);
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("stops telling a subscriber that unsubscribed", () => {
    const heard = vi.fn();
    const unsubscribe = subscribeGuidedTour(heard);
    unsubscribe();
    setGuidedTourActive(true);
    expect(heard).not.toHaveBeenCalled();
  });

  it("lets a subscriber unsubscribe while it is being told", () => {
    const later = vi.fn();
    const unsubscribe = subscribeGuidedTour(() => unsubscribe());
    subscribeGuidedTour(later);
    setGuidedTourActive(true);
    expect(later).toHaveBeenCalledTimes(1);
  });
});
