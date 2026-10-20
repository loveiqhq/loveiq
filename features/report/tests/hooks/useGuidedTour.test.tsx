// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const analytics = vi.hoisted(() => ({ trackTourReplayed: vi.fn() }));
vi.mock("@features/analytics/client", () => analytics);

const openChapter = vi.hoisted(() => vi.fn());
vi.mock("@features/report/ui/v3/v4OpenChapter", () => ({ openV4Chapter: openChapter }));

import { GUIDED_TOUR_KEY, guidedTourKey } from "@features/report/logic/guidedTour";
import { useGuidedTour, type UseGuidedTourArgs } from "@features/report/ui/hooks/useGuidedTour";

/**
 * When the guided tour starts by itself (spec card 1755:1276: "Starts on first open,
 * straight at step 1") and when it waits. The page lends it its controls: a pill and
 * Typical Beliefs' three, each with a box.
 */

function buildPage({ foldPill = true } = {}) {
  document.body.innerHTML = `
    <div class="report-chapter-pill"><button class="report-chapter-pill__btn"></button></div>
    <section id="typical_beliefs">
      <button class="rv4-chapter__button" aria-expanded="true"><span class="rv4-chapter__chev"></span></button>
      ${foldPill ? '<button class="rv4-fold__pill"></button>' : ""}
      <span class="rv4-try__label"></span>
    </section>`;
  for (const el of document.querySelectorAll("button, span")) {
    Object.defineProperty(el, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: 100, left: 0, width: 80, height: 30, right: 80, bottom: 130 }),
    });
  }
}

const ready: UseGuidedTourArgs = {
  enabled: true,
  autoStart: true,
  blocked: false,
  submissionId: 3011,
};
/** This report's record. */
const KEY = guidedTourKey(3011);
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "Date"],
  });
  // CookieYes has recorded an answer; the page is at the top and in front.
  document.cookie = "cookieyes-consent=consent:yes,action:yes; path=/";
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  analytics.trackTourReplayed.mockClear();
  openChapter.mockClear();
  buildPage();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("style");
  document.cookie = "cookieyes-consent=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  document.cookie = "loveiq_probe=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("useGuidedTour", () => {
  it("starts once, a beat after the page is ready, and remembers it at once", () => {
    const { result } = renderHook(() => useGuidedTour(ready));
    expect(result.current.run).toBeNull();
    advance(500);
    expect(result.current.run).toMatchObject({ trigger: "auto" });
    expect(result.current.running).toBe(true);
    expect(window.localStorage.getItem(KEY)).not.toBeNull();
  });

  it("does not start again on a report that has shown it", () => {
    window.localStorage.setItem(KEY, "2026-10-17T09:00:00.000Z");
    const { result } = renderHook(() => useGuidedTour(ready));
    advance(5_000);
    expect(result.current.run).toBeNull();
  });

  it("starts on each new report, on a browser that has seen it on another", () => {
    // Marcus, 20.10: it never met a reader's next report, nor the one after the survey.
    window.localStorage.setItem(guidedTourKey(2063), "2026-10-17T09:00:00.000Z");
    // The record from when it was once per browser no longer counts.
    window.localStorage.setItem(GUIDED_TOUR_KEY, "2026-10-17T09:00:00.000Z");
    const { result } = renderHook(() => useGuidedTour(ready));
    advance(500);
    expect(result.current.run).toMatchObject({ trigger: "auto" });
    expect(window.localStorage.getItem(KEY)).not.toBeNull();
  });

  it("remembers a preview for the tab only, so the next preview link starts it again", () => {
    const preview = { ...ready, submissionId: null };
    const first = renderHook(() => useGuidedTour(preview));
    advance(500);
    expect(first.result.current.run).toMatchObject({ trigger: "auto" });
    expect(window.sessionStorage.getItem(guidedTourKey(null))).not.toBeNull();
    expect(window.localStorage.getItem(guidedTourKey(null))).toBeNull();
    first.unmount();

    // A reload in the same tab.
    const again = renderHook(() => useGuidedTour(preview));
    advance(5_000);
    expect(again.result.current.run).toBeNull();
  });

  it("waits while the report is loading, then starts", () => {
    const { result, rerender } = renderHook((args: UseGuidedTourArgs) => useGuidedTour(args), {
      initialProps: { ...ready, enabled: false },
    });
    advance(5_000);
    expect(result.current.run).toBeNull();
    rerender(ready);
    advance(500);
    expect(result.current.run).not.toBeNull();
  });

  it("never starts where the page says not to (a probe's cookie, a shared view, a checkout return)", () => {
    const { result } = renderHook(() => useGuidedTour({ ...ready, autoStart: false }));
    advance(5_000);
    expect(result.current.run).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("reads the probe cookie again as it starts, since the page reads it late", () => {
    document.cookie = "loveiq_probe=1; path=/";
    const { result } = renderHook(() => useGuidedTour(ready));
    advance(5_000);
    expect(result.current.run).toBeNull();
  });

  it("waits for a window the page holds open, and starts once it closes", () => {
    const { result, rerender } = renderHook((args: UseGuidedTourArgs) => useGuidedTour(args), {
      initialProps: { ...ready, blocked: true },
    });
    advance(5_000);
    expect(result.current.run).toBeNull();
    rerender(ready);
    advance(300);
    expect(result.current.run).not.toBeNull();
  });

  it("waits for any dialog, and for the cookie banner", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("aria-modal", "true");
    document.body.appendChild(dialog);
    const { result } = renderHook(() => useGuidedTour(ready));
    advance(5_000);
    expect(result.current.run, "a dialog is open").toBeNull();
    dialog.remove();
    document.documentElement.style.setProperty("--liq-consent-h", "316px");
    advance(5_000);
    expect(result.current.run, "the cookie banner is up").toBeNull();
    document.documentElement.style.setProperty("--liq-consent-h", "0px");
    advance(300);
    expect(result.current.run).not.toBeNull();
  });

  it("gives CookieYes its chance to show the banner when no answer is stored", () => {
    document.cookie = "cookieyes-consent=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    const { result } = renderHook(() => useGuidedTour(ready));
    advance(2_000);
    expect(result.current.run).toBeNull();
    advance(1_500);
    expect(result.current.run).not.toBeNull();
  });

  it("waits for Show All to measure itself, then goes without it", () => {
    buildPage({ foldPill: false });
    const { result } = renderHook(() => useGuidedTour(ready));
    advance(2_000);
    expect(result.current.run).toBeNull();
    advance(2_000);
    expect(result.current.run).not.toBeNull();
  });

  it("gives way to a reader who has started scrolling, and tries again on their next open", () => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 400 });
    const { result } = renderHook(() => useGuidedTour(ready));
    advance(5_000);
    expect(result.current.run).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("does not start where neither storage can remember it", () => {
    const refuse = () => {
      throw new Error("refused");
    };
    vi.spyOn(localStorage, "setItem").mockImplementation(refuse);
    vi.spyOn(sessionStorage, "setItem").mockImplementation(refuse);
    const { result } = renderHook(() => useGuidedTour(ready));
    advance(5_000);
    expect(result.current.run).toBeNull();
  });

  it("replays on request, whatever it remembers, and ends on done", () => {
    window.localStorage.setItem(KEY, "seen");
    const { result } = renderHook(() => useGuidedTour(ready));
    advance(5_000);
    act(() => result.current.replay("drawer", null));
    advance(10);
    expect(result.current.run).toMatchObject({ trigger: "replay" });
    expect(analytics.trackTourReplayed).toHaveBeenCalledWith({ source: "drawer" });
    act(() => result.current.done("completed"));
    expect(result.current.run).toBeNull();
  });

  it("opens Typical Beliefs again for a replay when the reader had closed it", () => {
    window.localStorage.setItem(KEY, "seen");
    document
      .querySelector("#typical_beliefs .rv4-chapter__button")!
      .setAttribute("aria-expanded", "false");
    const { result } = renderHook(() => useGuidedTour(ready));
    act(() => result.current.replay("sidebar", null));
    expect(openChapter).toHaveBeenCalledWith("typical_beliefs");
    advance(100);
    expect(result.current.run, "it waits for the chapter to open").toBeNull();
    advance(300);
    expect(result.current.run).toMatchObject({ trigger: "replay" });
  });

  it("puts focus back on what replayed it once it ends", () => {
    window.localStorage.setItem(KEY, "seen");
    const origin = document.querySelector<HTMLButtonElement>(".report-chapter-pill__btn")!;
    const { result } = renderHook(() => useGuidedTour(ready));
    act(() => result.current.replay("drawer", origin));
    advance(10);
    act(() => result.current.done("skipped"));
    expect(document.activeElement).toBe(origin);
  });

  it("drops its run with the report it was for", () => {
    const { result, rerender } = renderHook((args: UseGuidedTourArgs) => useGuidedTour(args), {
      initialProps: ready,
    });
    advance(500);
    expect(result.current.running).toBe(true);
    rerender({ ...ready, enabled: false });
    expect(result.current.running).toBe(false);
    expect(result.current.run).toBeNull();
  });
});
