// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SmoothScroll from "@shared/ui/SmoothScroll";
import { getSmoothScroll } from "@shared/ui/smooth-scroll-registry";

/**
 * The page's Lenis is published for the body-scroll lock, which must stop and re-measure
 * it round every overlay (desktop review 30.09: closing the paywall "scrolls up
 * weirdly"). Lenis loads in the effect, after hydration.
 */
const instances: { destroy: ReturnType<typeof vi.fn> }[] = [];
vi.mock("lenis", () => ({
  default: class FakeLenis {
    destroy = vi.fn();
    resize = vi.fn();
    start = vi.fn();
    stop = vi.fn();
    constructor() {
      instances.push(this);
    }
  },
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/report" }));

const media = (coarse: boolean) =>
  vi.fn((query: string) => ({
    matches: coarse && query === "(pointer: coarse)",
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));

describe("SmoothScroll", () => {
  beforeEach(() => {
    instances.length = 0;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("publishes its Lenis while it runs, and withdraws it when it goes", async () => {
    vi.stubGlobal("matchMedia", media(false));
    const view = render(
      <SmoothScroll>
        <p>page</p>
      </SmoothScroll>
    );
    await waitFor(() => expect(getSmoothScroll()).not.toBeNull());
    expect(getSmoothScroll()).toBe(instances[0]);
    view.unmount();
    expect(instances[0]!.destroy).toHaveBeenCalled();
    expect(getSmoothScroll()).toBeNull();
  });

  it("publishes nothing on a touch screen, where it does not run", async () => {
    vi.stubGlobal("matchMedia", media(true));
    render(
      <SmoothScroll>
        <p>page</p>
      </SmoothScroll>
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(instances).toHaveLength(0);
    expect(getSmoothScroll()).toBeNull();
  });
});
