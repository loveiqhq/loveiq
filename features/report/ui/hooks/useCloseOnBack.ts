"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

import { OVERLAY_ENTRY_KEY } from "@shared/ui/overlay-history";

/** Not in TypeScript's DOM library yet. Chromium 126+ and current Firefox; not Safari. */
interface CloseWatcherLike {
  onclose: (() => void) | null;
  destroy(): void;
}
type CloseWatcherConstructor = new () => CloseWatcherLike;

/**
 * The back button closes an open overlay instead of leaving the page.
 *
 * The pricing modal opens on its own as the reader scrolls, and on a phone back
 * is how you dismiss something. It did not handle back, so pressing it left
 * the report entirely — to /survey, the entry behind it, because finishing the
 * survey is what navigated here. In the 30 days to 2026-09-23, 7 of the 170
 * readers who saw the modal left their report that way (6 on Android), instead
 * of the 131 who closed it with the close button.
 *
 * TWO MECHANISMS, because a history entry alone does not work where it matters.
 *
 * Chrome skips, on the back BUTTON, history entries a page added before the
 * reader interacted with it — its defence against back-button hijacking. The
 * modal opens on scroll, and scrolling is not an interaction, so for a reader
 * who has not tapped anything yet the entry would be skipped and back would
 * leave exactly as before. (Playwright's goBack() jumps to the previous entry
 * directly and cannot see this, so a history-only fix passes every test.)
 *
 * So where CloseWatcher exists (Chrome, Edge, Samsung Internet, Firefox) it
 * takes the close request — Android's back gesture and button — before any
 * navigation, with no history entry at all. A page gets one without needing an
 * interaction first. Escape on desktop is a close request too, but the modal's
 * own handler cancels it, so it still closes once, as "escape".
 *
 * Everywhere else (Safari) one same-URL history entry sits on top
 * while open, so back consumes it: the browser fires `popstate` and we close.
 * Closed any other way, the entry is taken back off, so the next back press
 * leaves the report as it always did. Same URL on purpose: Next's router copies
 * its own state into the entry, so the traversal is a same-page restore rather
 * than a reload, and PostHog records a `$pageview` only when the path changes.
 *
 * Neither runs on the way to Stripe: checkout leaves with the modal still open,
 * so no close happens and nothing competes with that navigation. On Safari the
 * hand-off REPLACES the modal's entry with Stripe instead of pushing on top of
 * it (startReportCheckout), because the report is served no-store and a
 * leftover duplicate would cost an extra back press after an abandoned
 * checkout.
 */
export function useCloseOnBack(open: boolean, close: () => void, id: string): void {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  /**
   * A LAYOUT effect, so it runs before the modal's own passive effect locks the
   * body. The lock pins the page with `position: fixed`, which reads as scroll
   * position 0, and the browser records the scroll of the entry being left at
   * the moment of pushState. Pushed after the lock, Safari restored 0 on back
   * and threw the reader to the top of their report — caught by
   * e2e/paywall-back.spec.ts at 6,399px -> 0.
   */
  useLayoutEffect(() => {
    if (!open) return;

    const Watcher = (window as unknown as { CloseWatcher?: CloseWatcherConstructor }).CloseWatcher;
    if (typeof Watcher === "function") {
      const watcher = new Watcher();
      watcher.onclose = () => closeRef.current();
      return () => watcher.destroy();
    }

    window.history.pushState({ [OVERLAY_ENTRY_KEY]: id }, "");
    const onPopState = () => {
      // Still on our entry — a forward press, or another overlay's entry going.
      if (window.history.state?.[OVERLAY_ENTRY_KEY] === id) return;
      closeRef.current();
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      // Only our own entry, and only while it is on top. After back it is
      // already gone; after a navigation the top entry belongs to the new page,
      // and going back from there would undo the reader's navigation instead of
      // tidying up after the overlay.
      if (window.history.state?.[OVERLAY_ENTRY_KEY] === id) {
        window.history.back();
      }
    };
  }, [open, id]);
}
