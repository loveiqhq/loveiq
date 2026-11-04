// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

const mockBrowserBack = vi.fn();
vi.mock("@features/analytics/client", () => ({
  trackInitialGateBrowserBack: (...args: unknown[]) => mockBrowserBack(...args),
}));

import { useExitCloseRequest, useGateBack } from "@features/report/ui/gate/useGateBack";
import { openExit } from "@features/report/ui/gate/exit/exitHistory";
import { OVERLAY_ENTRY_KEY, __resetOverlayHistoryForTests } from "@shared/ui/overlay-history";

/**
 * The browser's and the phone's own Back on the EUR 1.99 page opens its exit page, as "Not ready
 * to unlock yet" does (card "€1.99 page: replace the browser Back with Marcus's exit page", 04.11).
 * Before, it went back to /survey's "You've already finished", whose "Open my report" came straight
 * back here: a loop. The browsers' side is proven in e2e/report-gate-back.spec.ts; these pin the
 * hook's bookkeeping.
 */

const REPORT = "/report/rpt_abcdefghij0123456789";
/** Resolves on the next popstate: history.back() in jsdom is asynchronous. */
const traversal = () =>
  new Promise<void>((resolve) =>
    window.addEventListener("popstate", () => resolve(), { once: true })
  );
const onEntry = () => Boolean(window.history.state?.[OVERLAY_ENTRY_KEY]);
const onExitPage = () => new URLSearchParams(window.location.search).get("leave") === "pre";
const back = async () => {
  const done = traversal();
  act(() => window.history.back());
  await done;
};
const escape = () => {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  document.body.dispatchEvent(event);
  return event;
};

const watchers: Array<{ onclose: (() => void) | null; destroyed: boolean }> = [];
class FakeCloseWatcher {
  onclose: (() => void) | null = null;
  destroyed = false;
  constructor() {
    watchers.push(this);
  }
  destroy() {
    this.destroyed = true;
  }
}
const withWatcher = () => {
  (window as unknown as { CloseWatcher?: unknown }).CloseWatcher = FakeCloseWatcher;
};

beforeEach(() => {
  __resetOverlayHistoryForTests();
  watchers.length = 0;
  mockBrowserBack.mockClear();
  window.history.replaceState(null, "", REPORT);
  window.history.scrollRestoration = "auto";
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { CloseWatcher?: unknown }).CloseWatcher;
  __resetOverlayHistoryForTests();
  window.history.replaceState(null, "", "/");
});

describe("useGateBack — the EUR 1.99 page's own Back", () => {
  it("opens the exit page on the toolbar's Back or an iPhone's swipe, and records it", async () => {
    renderHook(() => useGateBack(true));
    expect(onEntry(), "a same-URL entry for the Back to take").toBe(true);
    expect(window.location.pathname).toBe(REPORT);

    await back();
    expect(onExitPage()).toBe(true);
    expect(mockBrowserBack).toHaveBeenCalledTimes(1);
    expect(mockBrowserBack).toHaveBeenCalledWith({ to: "exit_page" });
  });

  it("opens it on Android's back, a close request, too", () => {
    withWatcher();
    renderHook(() => useGateBack(true));
    expect(watchers).toHaveLength(1);

    act(() => watchers[0]!.onclose?.());
    expect(onExitPage()).toBe(true);
    expect(mockBrowserBack).toHaveBeenCalledWith({ to: "exit_page" });
  });

  it("records the Back once a page, however often the reader comes round again", async () => {
    const { rerender } = renderHook(({ on }) => useGateBack(on), { initialProps: { on: true } });
    await back();
    expect(onExitPage()).toBe(true);
    // The exit page is up, then its Back finds the gate, where the catch is taken again.
    rerender({ on: false });
    await back();
    expect(onExitPage()).toBe(false);
    rerender({ on: true });
    await act(async () => {});
    expect(onEntry()).toBe(true);

    await back();
    expect(onExitPage()).toBe(true);
    expect(mockBrowserBack).toHaveBeenCalledTimes(1);
  });

  // "Not ready to unlock yet" opens the exit page over the catch's entry, and its "Maybe later"
  // steps back onto that entry: the catch takes it over, so the reader's next Back is caught at
  // once, not a dead press on a second entry.
  it("after “Not ready” and the way back, catches the reader's first Back", async () => {
    const { rerender } = renderHook(({ on }) => useGateBack(on), { initialProps: { on: true } });
    act(() => {
      openExit("pre");
    });
    rerender({ on: false });
    await act(async () => {});
    await back();
    expect(onExitPage()).toBe(false);
    rerender({ on: true });
    await act(async () => {});

    await back();
    expect(onExitPage()).toBe(true);
    expect(mockBrowserBack).toHaveBeenCalledTimes(1);
  });

  // Forward from the gate onto the exit page's entry reads, to the catch, like leaving its own
  // entry. It opens nothing (the page is already there), and it is no Back.
  it("records no Back for a Forward press onto the exit page", async () => {
    const { rerender } = renderHook(({ on }) => useGateBack(on), { initialProps: { on: true } });
    act(() => {
      openExit("pre");
    });
    rerender({ on: false });
    await act(async () => {});
    await back();
    rerender({ on: true });
    await act(async () => {});

    const done = traversal();
    act(() => window.history.forward());
    await done;
    expect(onExitPage()).toBe(true);
    expect(mockBrowserBack).not.toHaveBeenCalled();
  });

  // A desktop's Escape is a close request too (CloseWatcher), and the gate never did anything
  // with it: it must not open the exit page, nor be counted as a Back.
  it("keeps Escape from becoming a close request while the page is up", () => {
    withWatcher();
    const { rerender } = renderHook(({ on }) => useGateBack(on), { initialProps: { on: true } });
    expect(escape().defaultPrevented).toBe(true);
    rerender({ on: false });
    expect(escape().defaultPrevented).toBe(false);
  });

  // Safari puts back the scroll an entry was left at once a Back lands on it: the entry under
  // the catch must say "manual" before the catch goes on, or a reader far down the page is
  // thrown to its top, and the exit page's way back finds the gate there.
  it("holds history's scroll before its entry goes on", () => {
    const modes: string[] = [];
    const push = vi.spyOn(window.history, "pushState").mockImplementation(function (
      this: History,
      ...args: Parameters<History["pushState"]>
    ) {
      modes.push(window.history.scrollRestoration);
      return History.prototype.pushState.apply(this, args);
    });
    try {
      renderHook(() => useGateBack(true));
      expect(modes).toEqual(["manual"]);
    } finally {
      push.mockRestore();
    }
  });

  it("does nothing while the exit page is up", () => {
    withWatcher();
    const before = window.history.length;
    renderHook(() => useGateBack(false));
    expect(window.history.length).toBe(before);
    expect(watchers).toHaveLength(0);
    expect(window.history.scrollRestoration).toBe("auto");
  });
});

/**
 * The exit page's own Back on a phone. A reader who met the gate without a tap has no entry the
 * page added that Chrome will step back onto (its back button skips them), so Android's back on
 * the exit page went past the gate to /survey. A close request answered by the page's own way back
 * (a script's history.back(), which is never skipped) finds the gate.
 */
describe("useExitCloseRequest — the exit page's Back on a phone", () => {
  it("answers a close request with the page's own way back, and adds no entry", () => {
    withWatcher();
    const close = vi.fn();
    const before = window.history.length;
    renderHook(() => useExitCloseRequest(true, close));
    expect(window.history.length).toBe(before);
    expect(watchers).toHaveLength(1);

    act(() => watchers[0]!.onclose?.());
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("leaves Escape alone on the exit page too, and lets the watcher go when the page does", () => {
    withWatcher();
    const close = vi.fn();
    const { unmount } = renderHook(() => useExitCloseRequest(true, close));
    expect(escape().defaultPrevented).toBe(true);
    unmount();
    expect(watchers[0]!.destroyed).toBe(true);
    expect(escape().defaultPrevented).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });

  it("creates nothing where there is no CloseWatcher", () => {
    const close = vi.fn();
    renderHook(() => useExitCloseRequest(true, close));
    expect(watchers).toHaveLength(0);
  });
});
