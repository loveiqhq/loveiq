// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

import { useCloseOnBack } from "@features/report/ui/hooks/useCloseOnBack";
import { OVERLAY_ENTRY_KEY } from "@shared/ui/overlay-history";

/**
 * Back closes the open overlay instead of leaving the report.
 *
 * Seven readers in thirty days pressed back to dismiss the pricing modal and
 * were sent out of their report to /survey. The browser behaviour is proven
 * end to end in e2e/paywall-back.spec.ts; these pin the bookkeeping that keeps
 * the history stack honest either side of it.
 */

/** history.back() in jsdom is asynchronous, like a real traversal. */
const traversal = () =>
  new Promise<void>((resolve) =>
    window.addEventListener("popstate", () => resolve(), { once: true })
  );

const onEntry = (id: string) => window.history.state?.[OVERLAY_ENTRY_KEY] === id;

afterEach(async () => {
  cleanup();
  // Leave the next test a clean stack: unwind anything a test left on top.
  while (window.history.state?.[OVERLAY_ENTRY_KEY]) {
    const done = traversal();
    window.history.back();
    await done;
  }
});

describe("useCloseOnBack — history entry (Safari, Firefox)", () => {
  it("adds one entry while open and closes when back takes it off", async () => {
    const close = vi.fn();
    const before = window.history.length;
    const { rerender } = renderHook(({ open }) => useCloseOnBack(open, close, "pricing"), {
      initialProps: { open: true },
    });
    expect(window.history.length).toBe(before + 1);
    expect(onEntry("pricing")).toBe(true);

    const done = traversal();
    act(() => window.history.back());
    await done;
    expect(close).toHaveBeenCalledTimes(1);

    // The close that back caused must not go back a second time: that would
    // take the reader off the report, which is the bug.
    const back = vi.spyOn(window.history, "back");
    rerender({ open: false });
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it("takes its entry back off when closed another way", async () => {
    const close = vi.fn();
    const { rerender } = renderHook(({ open }) => useCloseOnBack(open, close, "pricing"), {
      initialProps: { open: true },
    });
    expect(onEntry("pricing")).toBe(true);

    // The close button, the backdrop or Escape: the parent flips `open`.
    const done = traversal();
    rerender({ open: false });
    await done;
    expect(onEntry("pricing")).toBe(false);
    // It closed itself; back had nothing to do with it.
    expect(close).not.toHaveBeenCalled();
  });

  it("never goes back once another page's entry is on top", () => {
    const close = vi.fn();
    const { rerender } = renderHook(({ open }) => useCloseOnBack(open, close, "pricing"), {
      initialProps: { open: true },
    });
    // A navigation while open: the router pushes the new page's entry.
    window.history.pushState({ __NA: true }, "", "/elsewhere");
    const back = vi.spyOn(window.history, "back");
    rerender({ open: false });
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
    window.history.replaceState(null, "", "/");
  });

  it("ignores a forward press back onto its own entry", async () => {
    const close = vi.fn();
    renderHook(() => useCloseOnBack(true, close, "pricing"));
    // A second entry of ours on top, then back onto the first of ours: still ours.
    window.history.pushState({ [OVERLAY_ENTRY_KEY]: "pricing" }, "");
    const done = traversal();
    act(() => window.history.back());
    await done;
    expect(onEntry("pricing")).toBe(true);
    expect(close).not.toHaveBeenCalled();
  });

  it("closes only the overlay whose entry went", async () => {
    const closePricing = vi.fn();
    const closeShare = vi.fn();
    renderHook(() => useCloseOnBack(true, closePricing, "pricing"));
    renderHook(() => useCloseOnBack(true, closeShare, "share"));
    // share's entry is on top; back takes it off and lands on pricing's.
    const done = traversal();
    act(() => window.history.back());
    await done;
    expect(closeShare).toHaveBeenCalledTimes(1);
    expect(closePricing).not.toHaveBeenCalled();
  });

  it("does nothing while closed", () => {
    const close = vi.fn();
    const before = window.history.length;
    renderHook(() => useCloseOnBack(false, close, "pricing"));
    expect(window.history.length).toBe(before);
  });
});

/**
 * Chromium: the close request goes to a CloseWatcher, with NO history entry.
 *
 * Chrome's back button skips entries a page added before the reader interacted
 * with it, and the modal opens on scroll, which is not an interaction. A
 * history entry there would be skipped and back would still leave the report.
 */
describe("useCloseOnBack — CloseWatcher (Chromium)", () => {
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
    watchers.length = 0;
    (window as unknown as { CloseWatcher?: unknown }).CloseWatcher = FakeCloseWatcher;
  };
  afterEach(() => {
    delete (window as unknown as { CloseWatcher?: unknown }).CloseWatcher;
  });

  it("takes the close request without adding a history entry", () => {
    withWatcher();
    const close = vi.fn();
    const before = window.history.length;
    renderHook(() => useCloseOnBack(true, close, "pricing"));
    expect(watchers).toHaveLength(1);
    expect(window.history.length).toBe(before);
    act(() => watchers[0]!.onclose?.());
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("stops watching once closed, and never touches history", () => {
    withWatcher();
    const back = vi.spyOn(window.history, "back");
    const { rerender } = renderHook(({ open }) => useCloseOnBack(open, vi.fn(), "pricing"), {
      initialProps: { open: true },
    });
    rerender({ open: false });
    expect(watchers[0]!.destroyed).toBe(true);
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it("creates nothing while closed", () => {
    withWatcher();
    renderHook(() => useCloseOnBack(false, vi.fn(), "pricing"));
    expect(watchers).toHaveLength(0);
  });
});
