// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetBodyScrollLockForTests,
  lockBodyScroll,
  scrollState,
  unlockBodyScroll,
} from "@shared/ui/body-scroll-lock";

/**
 * On 2026-09-05 a reader on Android opened the report's chapter drawer, tapped
 * "Share report" inside it, and the paywall auto-opened 200ms later — three
 * overlays, three independent body-scroll locks. Each one snapshotted
 * `document.body.style` on open and wrote it back on close, so the inner ones
 * captured the outer ones' LOCKED values and restored those. The report stayed
 * pinned for the rest of the visit; PostHog logged seven `$dead_swipe` events.
 *
 * The trap: in that state the page still scrolls PROGRAMMATICALLY —
 * `window.scrollBy` works fine — so nothing short of a real touch gesture
 * notices. These tests assert the invariant directly instead: however overlays
 * nest, the last release must leave the body exactly as it was found.
 */
describe("body scroll lock", () => {
  beforeEach(() => {
    __resetBodyScrollLockForTests();
    document.documentElement.setAttribute("style", "");
    document.body.setAttribute("style", "");
    vi.stubGlobal("scrollTo", vi.fn());
    Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
  });

  afterEach(() => {
    __resetBodyScrollLockForTests();
    vi.restoreAllMocks();
  });

  const bodyStyle = () => document.body.getAttribute("style") ?? "";

  it("pins the page on the first acquire", () => {
    lockBodyScroll();
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");
  });

  it("leaves nothing behind after a single overlay closes", () => {
    lockBodyScroll();
    unlockBodyScroll();
    expect(bodyStyle()).toBe("");
    expect(document.documentElement.getAttribute("style") ?? "").toBe("");
  });

  it("keeps the page pinned while an outer overlay is still open", () => {
    lockBodyScroll(); // drawer
    lockBodyScroll(); // share modal on top
    unlockBodyScroll(); // share modal closes
    expect(
      document.body.style.position,
      "the drawer is still open — the page must stay pinned"
    ).toBe("fixed");
  });

  it("restores the original styles once the last of three overlays closes", () => {
    lockBodyScroll(); // chapter drawer
    lockBodyScroll(); // share modal
    lockBodyScroll(); // paywall auto-opens over both
    unlockBodyScroll();
    unlockBodyScroll();
    unlockBodyScroll();
    expect(bodyStyle(), "this is the leftover that made the report unscrollable").toBe("");
  });

  it("restores in any close order — overlays do not close in the order they opened", () => {
    // The real session: the drawer closed while the share modal and paywall
    // were still up, then the paywall was dismissed.
    lockBodyScroll();
    lockBodyScroll();
    lockBodyScroll();
    unlockBodyScroll();
    unlockBodyScroll();
    expect(document.body.style.position).toBe("fixed");
    unlockBodyScroll();
    expect(bodyStyle()).toBe("");
  });

  it("puts the reader back where they were, not at the top", () => {
    Object.defineProperty(window, "scrollY", { value: 2065, writable: true, configurable: true });
    lockBodyScroll();
    expect(document.body.style.top).toBe("-2065px");
    unlockBodyScroll();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 2065, left: 0, behavior: "instant" });
  });

  it("only the first acquire records the scroll position", () => {
    Object.defineProperty(window, "scrollY", { value: 900, writable: true, configurable: true });
    lockBodyScroll();
    // body is now `position: fixed`, so the browser reports scrollY 0 — a nested
    // acquire that re-snapshotted here would restore the reader to the top.
    Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
    lockBodyScroll();
    unlockBodyScroll();
    unlockBodyScroll();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 900, left: 0, behavior: "instant" });
  });

  it("preserves a genuine pre-existing inline style", () => {
    document.body.style.overflow = "auto";
    lockBodyScroll();
    unlockBodyScroll();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("ignores a release with no matching acquire", () => {
    unlockBodyScroll();
    expect(bodyStyle()).toBe("");
    lockBodyScroll();
    expect(document.body.style.position).toBe("fixed");
  });
});

/**
 * What a `$dead_swipe` carries about the page. The question it exists to answer
 * is "did WE stop that swipe", so the case that matters is a frozen page with
 * no overlay holding the lock — the chapter-menu bug fixed on 2026-09-23.
 */
describe("scrollState", () => {
  beforeEach(() => {
    __resetBodyScrollLockForTests();
    document.documentElement.setAttribute("style", "");
    document.body.setAttribute("style", "");
    vi.stubGlobal("scrollTo", vi.fn());
    Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
  });

  afterEach(() => {
    __resetBodyScrollLockForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports a free page as free", () => {
    expect(scrollState()).toMatchObject({ scroll_lock_depth: 0, page_frozen: false, zoom: 1 });
  });

  it("reports the lock while an overlay holds it", () => {
    lockBodyScroll();
    lockBodyScroll();
    expect(scrollState()).toMatchObject({ scroll_lock_depth: 2, page_frozen: true });
  });

  it("reports a page frozen by someone else as frozen with nothing holding it", () => {
    // What V1's chapter menu did: wrote the body style itself, outside this lock.
    document.body.style.position = "fixed";
    expect(scrollState()).toMatchObject({ scroll_lock_depth: 0, page_frozen: true });
  });

  it("counts a hidden vertical overflow on either element", () => {
    document.documentElement.style.overflowY = "hidden";
    expect(scrollState().page_frozen).toBe(true);
    document.documentElement.style.overflowY = "";
    document.body.style.overflowY = "clip";
    expect(scrollState().page_frozen).toBe(true);
  });

  it("is free again once the last overlay lets go", () => {
    lockBodyScroll();
    unlockBodyScroll();
    expect(scrollState()).toMatchObject({ scroll_lock_depth: 0, page_frozen: false });
  });

  it("reports pinch zoom and how much page is left", () => {
    vi.stubGlobal("visualViewport", { scale: 2.345 });
    Object.defineProperty(window, "scrollY", { value: 1200, writable: true, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    Object.defineProperty(document.documentElement, "scrollHeight", {
      value: 2000,
      configurable: true,
    });
    expect(scrollState()).toMatchObject({ zoom: 2.35, scroll_y: 1200, scroll_room_below: 0 });
  });
});
