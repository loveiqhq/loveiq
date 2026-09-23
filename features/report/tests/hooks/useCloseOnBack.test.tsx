// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

import { useCloseOnBack } from "@features/report/ui/hooks/useCloseOnBack";
import {
  OVERLAY_ENTRY_KEY,
  __resetOverlayHistoryForTests,
  afterOverlayEntryGone,
} from "@shared/ui/overlay-history";

/**
 * Back closes the open overlay instead of leaving the report.
 *
 * Seven readers in thirty days pressed back to dismiss the pricing modal and
 * were sent out of their report to /survey. The browser behaviour is proven
 * end to end in e2e/paywall-back.spec.ts; these pin the bookkeeping that keeps
 * the history stack honest either side of it.
 */

/** Resolves on the next popstate — history.back() in jsdom is asynchronous. */
const traversal = () =>
  new Promise<void>((resolve) =>
    window.addEventListener("popstate", () => resolve(), { once: true })
  );
/** Lets the deferred release (a microtask) run. */
const settle = () => act(async () => {});
const onEntry = () => Boolean(window.history.state?.[OVERLAY_ENTRY_KEY]);

beforeEach(() => __resetOverlayHistoryForTests());
afterEach(async () => {
  cleanup();
  // A spy left behind by a failed assertion would count the next test's calls.
  vi.restoreAllMocks();
  __resetOverlayHistoryForTests();
  // Leave the next test a clean stack.
  while (onEntry()) {
    const done = traversal();
    window.history.back();
    await done;
  }
});

describe("useCloseOnBack — the shared history entry (Safari)", () => {
  it("adds one entry while open and closes when back takes it off", async () => {
    const close = vi.fn();
    const before = window.history.length;
    const { rerender } = renderHook(({ open }) => useCloseOnBack(open, close), {
      initialProps: { open: true },
    });
    expect(window.history.length).toBe(before + 1);
    expect(onEntry()).toBe(true);

    const done = traversal();
    act(() => window.history.back());
    await done;
    expect(close).toHaveBeenCalledTimes(1);

    // The close that back caused must not go back again: that would take the
    // reader off the report, which is the bug.
    const back = vi.spyOn(window.history, "back");
    rerender({ open: false });
    await settle();
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it("takes the entry back off when closed another way, without closing anything", async () => {
    const close = vi.fn();
    const { rerender } = renderHook(({ open }) => useCloseOnBack(open, close), {
      initialProps: { open: true },
    });
    const done = traversal();
    rerender({ open: false });
    await settle();
    await done;
    expect(onEntry()).toBe(false);
    // Its own history.back() landing is not the reader pressing back.
    expect(close).not.toHaveBeenCalled();
  });

  it("never goes back once another page's entry is on top", async () => {
    const { rerender } = renderHook(({ open }) => useCloseOnBack(open, vi.fn()), {
      initialProps: { open: true },
    });
    window.history.pushState({ __NA: true }, "", "/elsewhere");
    const back = vi.spyOn(window.history, "back");
    rerender({ open: false });
    await settle();
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
    window.history.replaceState(null, "", "/");
  });

  /**
   * "Share report" in the chapter menu closes the menu and opens the share
   * modal in one tap. The entry must change hands, not be popped and pushed:
   * an asynchronous pop landing after the new push closed the new overlay.
   */
  it("hands the entry from one overlay to the next in the same tap", async () => {
    const closeMenu = vi.fn();
    const closeShare = vi.fn();
    const before = window.history.length;
    const { rerender } = renderHook(
      ({ menu, share }) => {
        useCloseOnBack(menu, closeMenu);
        useCloseOnBack(share, closeShare);
      },
      { initialProps: { menu: true, share: false } }
    );
    const back = vi.spyOn(window.history, "back");
    rerender({ menu: false, share: true });
    await settle();
    expect(back, "no pop for a hand-off").not.toHaveBeenCalled();
    expect(window.history.length, "and no second entry").toBe(before + 1);
    back.mockRestore();

    const done = traversal();
    act(() => window.history.back());
    await done;
    expect(closeShare).toHaveBeenCalledTimes(1);
    expect(closeMenu).not.toHaveBeenCalled();
  });

  /**
   * A chapter link in the menu: the fragment navigation must REPLACE the
   * menu's entry. Pushed on top it left a dead back press behind; racing the
   * menu's release it undid the jump.
   */
  it("lets a navigation take the entry's place instead of stacking on it", async () => {
    const { rerender } = renderHook(({ open }) => useCloseOnBack(open, vi.fn()), {
      initialProps: { open: true },
    });
    const lengthWithEntry = window.history.length;
    const done = traversal();
    afterOverlayEntryGone(() => {
      window.location.hash = "attachment_style";
    });
    rerender({ open: false });
    await settle();
    await done;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(window.location.hash).toBe("#attachment_style");
    expect(onEntry()).toBe(false);
    // Back from the chapter returns to the entry beneath the menu's: no dead press.
    expect(window.history.length).toBe(lengthWithEntry);
    window.history.replaceState(null, "", "/");
  });

  it("runs a navigation straight away when there is no entry to step around", () => {
    const navigate = vi.fn();
    afterOverlayEntryGone(navigate);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("ignores a forward press back onto the entry", async () => {
    const close = vi.fn();
    renderHook(() => useCloseOnBack(true, close));
    // Another entry of ours on top, then back onto the first: still ours.
    window.history.pushState({ [OVERLAY_ENTRY_KEY]: true }, "");
    const done = traversal();
    act(() => window.history.back());
    await done;
    expect(onEntry()).toBe(true);
    expect(close).not.toHaveBeenCalled();
  });

  it("does nothing while closed", () => {
    const before = window.history.length;
    renderHook(() => useCloseOnBack(false, vi.fn()));
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
describe("useCloseOnBack — CloseWatcher (Chromium, Firefox)", () => {
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
    renderHook(() => useCloseOnBack(true, close));
    expect(watchers).toHaveLength(1);
    expect(window.history.length).toBe(before);
    act(() => watchers[0]!.onclose?.());
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("stops watching once closed, and never touches history", () => {
    withWatcher();
    const back = vi.spyOn(window.history, "back");
    const { rerender } = renderHook(({ open }) => useCloseOnBack(open, vi.fn()), {
      initialProps: { open: true },
    });
    rerender({ open: false });
    expect(watchers[0]!.destroyed).toBe(true);
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it("creates nothing while closed", () => {
    withWatcher();
    renderHook(() => useCloseOnBack(false, vi.fn()));
    expect(watchers).toHaveLength(0);
  });
});
