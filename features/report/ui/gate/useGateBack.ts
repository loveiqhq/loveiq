"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { trackInitialGateBrowserBack } from "@features/analytics/client";
import { useCloseOnBack } from "../hooks/useCloseOnBack";
import { openExit } from "./exit/exitHistory";
import { GATE_NOT_READY_TO } from "./gateContent";

/** Not in TypeScript's DOM library yet (see hooks/useCloseOnBack.ts). */
interface CloseWatcherLike {
  onclose: (() => void) | null;
  destroy(): void;
}
type CloseWatcherConstructor = new () => CloseWatcherLike;

/**
 * Escape on a desktop is a close request too (CloseWatcher), and neither the EUR 1.99 page nor its
 * exit page ever answered it. Cancelled here, on the window and so last, it reaches neither page's
 * watcher, which are there for Android's back. A key in an input method's composition is left alone.
 */
function useEscapeStaysPut(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);
}

/**
 * The browser's and the phone's own Back on the EUR 1.99 page opens its exit page, as "Not ready to
 * unlock yet" does (card "€1.99 page: replace the browser Back with Marcus's exit page", Eman 04.11).
 * Before, Back left for the page behind the report: after the survey, /survey's "You've already
 * finished", whose "Open my report" came straight back here. That was a loop.
 *
 * The page is caught as an overlay is (useCloseOnBack): a same-URL entry over the gate's for a
 * desktop's Back and an iPhone's swipe, and a CloseWatcher for Android's back, which is a close
 * request, not a history step. Its "close" opens the exit page on an entry of its own
 * (exit/exitHistory.ts). The exit page's Back comes back here, where the catch is taken again, so
 * Back goes between the two pages and never below the gate (Marcus, 30.10: nothing on the loop
 * leads off the report).
 *
 * - It is heard outside anything the Back unmounts: the entry by overlay-history's popstate
 *   listener, the CloseWatcher by useCloseOnBack in ReportPage. The gate stays mounted under its
 *   exit page, and a same-URL Back changes nothing Next renders.
 * - History restores no scroll from before the entry goes on. Safari puts back the scroll an entry
 *   was left at once a Back lands on it, which threw a reader far down the gate to its top.
 *   ReportPage holds that mode while the gate is up and gives it back afterwards.
 * - It is recorded once a page, as "Not ready" is: `initial_gate_browser_back`.
 *
 * Its ceiling is useCloseOnBack's: Chrome's back BUTTON skips an entry a page added without a
 * tap, and the entries this catch adds after a Back are added without one. So on a desktop, two
 * Backs in a row with no tap between them still leave (the first opens the exit page), and a gate
 * met without any tap lets the first Back leave. A phone has its CloseWatcher, and an iPhone's
 * swipe takes the entry.
 */
export function useGateBack(onScreen: boolean): void {
  // Before useCloseOnBack's entry goes on: its layout effect runs after this one.
  useLayoutEffect(() => {
    if (onScreen) window.history.scrollRestoration = "manual";
  }, [onScreen]);

  const recorded = useRef(false);
  useCloseOnBack(onScreen, () => {
    // A Forward press onto the exit page's entry reaches here too, and opens nothing: only a
    // Back that opened the page is one.
    if (!openExit("pre") || recorded.current) return;
    recorded.current = true;
    trackInitialGateBrowserBack({ to: GATE_NOT_READY_TO });
  });
  useEscapeStaysPut(onScreen);
}

/**
 * The exit page's own Back on a phone. Android's back is a close request, answered with the page's
 * own way back (`closeExit`: a script's history.back(), which no browser skips). Without it the back
 * was a history step, and Chrome's back button skips the entries a page added before any
 * interaction: a reader who met the gate without a tap went past both the gate and its catch, to
 * /survey. It adds no entry, because the exit page has its own (exit/exitHistory.ts). Escape still
 * does nothing there.
 */
export function useExitCloseRequest(onScreen: boolean, close: () => void): void {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  useEffect(() => {
    if (!onScreen) return;
    const Watcher = (window as unknown as { CloseWatcher?: CloseWatcherConstructor }).CloseWatcher;
    if (typeof Watcher !== "function") return;
    const watcher = new Watcher();
    watcher.onclose = () => closeRef.current();
    return () => watcher.destroy();
  }, [onScreen]);
  useEscapeStaysPut(onScreen);
}
