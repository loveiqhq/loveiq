// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetGuidedTourForTests, setGuidedTourActive } from "@shared/ui/guided-tour-state";

const tracked = vi.hoisted(() => ({
  dead: vi.fn(),
  rage: vi.fn(),
  scroll: vi.fn(),
  tabH: vi.fn(),
  tabV: vi.fn(),
}));
vi.mock("@features/analytics/client", () => ({
  hasCookieYesConsent: () => true,
  trackDeadClick: tracked.dead,
  trackRageClick: tracked.rage,
  trackScrollDepth: tracked.scroll,
  trackTabHidden: tracked.tabH,
  trackTabVisible: tracked.tabV,
}));

/**
 * The report's guided tour scrolls the page to its stops while the reader watches, and
 * dims the page so nothing under it answers a tap. Neither is the reader's own doing: the
 * tour's trip must not count as scroll depth, and a tap on the dim must not be reported as
 * a dead control. Its bubble is a dialog, and taps there are watched as ever.
 *
 * Installed once for the file, as in production (see uxSignals.deadControls.test.ts).
 */
describe("ux signals while the guided tour runs", () => {
  let reset: () => void;

  beforeAll(async () => {
    delete (window as unknown as Record<string, unknown>).__loveiqUxSignalsInstalled;
    delete (window as unknown as Record<string, unknown>).__loveiqUxSignalsState;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    const mod = await import("@shared/observability/uxSignals");
    reset = mod.resetUxSignalsForPageview;
    mod.installUxSignals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
    reset();
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    Object.defineProperty(document.documentElement, "scrollHeight", {
      value: 4800,
      configurable: true,
    });
  });

  afterEach(() => {
    __resetGuidedTourForTests();
    document.body.innerHTML = "";
  });

  const scrollTo = (y: number) => {
    Object.defineProperty(window, "scrollY", { value: y, configurable: true });
    window.dispatchEvent(new Event("scroll"));
  };
  const tap = (el: Element) =>
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));

  it("leaves the tour's trip down the page out of scroll depth", () => {
    setGuidedTourActive(true);
    scrollTo(4000);
    expect(tracked.scroll).not.toHaveBeenCalled();
    setGuidedTourActive(false);
    scrollTo(0);
    scrollTo(1000);
    expect(tracked.scroll.mock.calls.map(([bucket]) => bucket)).toEqual([25]);
  });

  it("does not report a tap on the dimmed page as a dead control", () => {
    document.body.innerHTML = `<button class="report-next" disabled>Next</button>`;
    setGuidedTourActive(true);
    tap(document.querySelector("button")!);
    expect(tracked.dead).not.toHaveBeenCalled();
    setGuidedTourActive(false);
    tap(document.querySelector("button")!);
    expect(tracked.dead).toHaveBeenCalledTimes(1);
  });

  it("still watches the tour's own bubble", () => {
    document.body.innerHTML = `<div role="dialog"><button class="tour-next" disabled>Next</button></div>`;
    setGuidedTourActive(true);
    tap(document.querySelector("button")!);
    expect(tracked.dead).toHaveBeenCalledTimes(1);
  });
});
