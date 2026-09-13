// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
 * The dead-click listener recorded taps on decoration and discarded taps on
 * controls — because `isInteractive` matched `closest("button")` with no
 * regard for whether that button was DISABLED. So the one case worth an alert
 * (a control that looks live and does nothing) was the one case it dropped:
 * readers tapped a disabled survey "Next" 1,347 times in production without a
 * single row landing here.
 */
describe("dead-click detection on controls that look live", () => {
  let install: () => void;
  let reset: () => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    document.body.innerHTML = "";
    delete (window as unknown as Record<string, unknown>).__loveiqUxSignalsInstalled;
    delete (window as unknown as Record<string, unknown>).__loveiqUxSignalsState;
    const mod = await import("@shared/observability/uxSignals");
    install = mod.installUxSignals;
    reset = mod.resetUxSignalsForPageview;
    install();
    reset();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  const tap = (el: Element) =>
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));

  const selectors = () => tracked.dead.mock.calls.map(([p]) => p.target_selector as string);

  it("reports a tap on a DISABLED button", () => {
    document.body.innerHTML = `<button class="survey-next" disabled><span class="chev">›</span>Next</button>`;
    tap(document.querySelector("button")!);
    expect(tracked.dead).toHaveBeenCalledTimes(1);
    expect(selectors()[0]).toContain("button");
  });

  it("reports a tap on the ICON inside a disabled button, not just the button", () => {
    // Readers hit the chevron, and PostHog attributes clicks to it — so the
    // child has to resolve to a dead click too.
    document.body.innerHTML = `<button class="survey-next" disabled><span class="chev">›</span></button>`;
    tap(document.querySelector(".chev")!);
    expect(tracked.dead).toHaveBeenCalledTimes(1);
  });

  it("reports aria-disabled controls, which stay focusable and never set .disabled", () => {
    document.body.innerHTML = `<div role="button" aria-disabled="true" class="fake-cta">Next</div>`;
    tap(document.querySelector(".fake-cta")!);
    expect(tracked.dead).toHaveBeenCalledTimes(1);
  });

  it("stays silent on a live button — the whole point of the filter", () => {
    document.body.innerHTML = `<button class="live">Next</button>`;
    tap(document.querySelector("button")!);
    expect(tracked.dead).not.toHaveBeenCalled();
  });

  it("stays silent on a live anchor", () => {
    document.body.innerHTML = `<a class="live" href="#x">Go</a>`;
    tap(document.querySelector("a")!);
    expect(tracked.dead).not.toHaveBeenCalled();
  });

  it("a disabled control does NOT escape via a cursor:pointer ancestor", () => {
    // The old code fell through to a 3-level `cursor: pointer` walk, which
    // would have re-classified the tap as interactive and dropped it again.
    document.body.innerHTML = `<div class="wrap"><button class="survey-next" disabled>Next</button></div>`;
    const wrap = document.querySelector(".wrap") as HTMLElement;
    wrap.style.cursor = "pointer";
    tap(document.querySelector("button")!);
    expect(tracked.dead).toHaveBeenCalledTimes(1);
  });

  it("still reports plain decoration, so nothing regressed", () => {
    document.body.innerHTML = `<p class="copy">Some report copy</p>`;
    tap(document.querySelector("p")!);
    expect(tracked.dead).toHaveBeenCalledTimes(1);
  });

  it("dedupes per selector per pageview and reopens after a reset", () => {
    document.body.innerHTML = `<button class="survey-next" disabled>Next</button>`;
    const btn = document.querySelector("button")!;
    tap(btn);
    tap(btn);
    tap(btn);
    expect(tracked.dead).toHaveBeenCalledTimes(1);
    reset();
    tap(btn);
    expect(tracked.dead).toHaveBeenCalledTimes(2);
  });
});
