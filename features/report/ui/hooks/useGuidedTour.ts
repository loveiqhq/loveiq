"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trackTourReplayed } from "@features/analytics/client";
import {
  ANCHOR_WAIT_MS,
  AUTO_START_DELAY_MS,
  GUIDED_TOUR_KEY,
  consentSettled,
  tourRuledOut,
  tourSteps,
  tourTooLate,
  tourWaitingOn,
  type TourOutcome,
  type TourReplaySource,
  type TourTrigger,
} from "@features/report/logic/guidedTour";
import { findOpenOverlay } from "@features/report/logic/leaveIntent";
import { findTourAnchor } from "@features/report/ui/v3/guidedTourAnchors";
import { openV4Chapter } from "@features/report/ui/v3/v4OpenChapter";
import { isProbeRequest } from "@shared/http/probe-cookie";

export interface GuidedTourRun {
  /** A new one per run, so a replay mounts a fresh tour. */
  id: number;
  trigger: TourTrigger;
}

export interface UseGuidedTourArgs {
  /** A loaded V4 report, read by its owner or in a preview, showing the archetype its copy is for. */
  enabled: boolean;
  /** The page may start it by itself: not a probe, not a return from checkout. */
  autoStart: boolean;
  /** Something the page holds in state is open: the plans, share, or the Stripe hand-off. */
  blocked: boolean;
}

export interface GuidedTour {
  run: GuidedTourRun | null;
  /** On screen now: the page holds still, the paywall prompts wait, the report is inert. */
  running: boolean;
  /** "Replay the Tour" in the chapter menu. Focus goes back to `returnTo` when it ends. */
  replay: (source: TourReplaySource, returnTo: HTMLElement | null) => void;
  /** The tour ended (V4GuidedTour's `onDone`). */
  done: (outcome: TourOutcome) => void;
}

/** How often a waiting start looks again (an overlay, the cookie banner, a hidden tab). */
const RETRY_MS = 250;
/** A replay into a Typical Beliefs the reader had closed waits for it to open and measure. */
const REOPEN_SETTLE_MS = 300;

function readRecord(key: string): string | null {
  for (const store of [() => localStorage, () => sessionStorage]) {
    try {
      const value = store().getItem(key);
      if (value !== null) return value;
    } catch {
      // Storage refused (private mode, some in-app browsers): try the other.
    }
  }
  return null;
}

/** False when neither storage takes it: then "once" cannot be kept, so it never starts. */
function writeRecord(key: string, value: string): boolean {
  for (const store of [() => localStorage, () => sessionStorage]) {
    try {
      store().setItem(key, value);
      return true;
    } catch {
      // Refused: try the other.
    }
  }
  return false;
}

/**
 * Every stop's control is on the page, or the wait is over and the menu at least is there
 * (the tour drops a stop it cannot find). The folds draw "Show All" only once they have
 * measured themselves, after the fonts, so it can lag the rest by a moment.
 */
function anchorsReady(waitedMs: number): boolean {
  const missing = tourSteps({ includeUnlock: false }).filter((id) => !findTourAnchor(id));
  if (missing.length === 0) return true;
  return waitedMs >= ANCHOR_WAIT_MS && !missing.includes("chapter_menu");
}

let runIds = 0;

/**
 * When the guided tour runs (features/report/logic/guidedTour.ts has the rules): once, by
 * itself, the first time a reader opens their report on this browser (spec card 1755:1276:
 * "Starts on first open, straight at step 1"), and again whenever they ask for it from the
 * chapter menu. The page renders V4GuidedTour from `run`.
 *
 * Remembered as soon as it starts, like the leave offer's record: a reader who reloads in
 * the middle of it has seen it, and can replay it. Never started over something else that
 * is open, before the cookie question is settled, in a hidden tab, or for a reader who has
 * already begun to scroll (they are reading; it waits for their next visit).
 */
export function useGuidedTour({ enabled, autoStart, blocked }: UseGuidedTourArgs): GuidedTour {
  const [run, setRun] = useState<GuidedTourRun | null>(null);
  const blockedRef = useRef(blocked);
  const settledRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    blockedRef.current = blocked;
  }, [blocked]);

  useEffect(() => {
    if (settledRef.current) return;
    const ruledOut = tourRuledOut({
      enabled,
      autoStart,
      seen: enabled && autoStart && readRecord(GUIDED_TOUR_KEY) !== null,
    });
    // Not yet: the report is still loading or showing another archetype's copy.
    if (ruledOut === "disabled") return;
    if (ruledOut) {
      settledRef.current = true;
      return;
    }

    let cancelled = false;
    let timer = 0;
    let firstLook = 0;
    const check = () => {
      if (cancelled) return;
      const now = performance.now();
      if (!firstLook) firstLook = now;
      const waiting = blockedRef.current
        ? "overlay"
        : tourWaitingOn({
            overlay: findOpenOverlay(document),
            hidden: document.visibilityState === "hidden",
            consentSettled: consentSettled({ cookieHeader: document.cookie, sinceLoadMs: now }),
            anchorsReady: anchorsReady(now - firstLook),
          });
      if (waiting) {
        timer = window.setTimeout(check, RETRY_MS);
        return;
      }
      settledRef.current = true;
      // The page reads the probe cookie only after hydration; ask again as it starts.
      if (isProbeRequest(document.cookie) || tourTooLate(window.scrollY)) return;
      if (!writeRecord(GUIDED_TOUR_KEY, new Date().toISOString())) return;
      runIds += 1;
      setRun({ id: runIds, trigger: "auto" });
    };
    const begin = () => {
      if (!cancelled) timer = window.setTimeout(check, AUTO_START_DELAY_MS);
    };
    // The page's own face first, so the controls have their final size when measured.
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (fonts?.ready) void fonts.ready.then(begin, begin);
    else begin();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, autoStart]);

  // A report that goes away (another archetype, a refetch) takes its tour with it, for good.
  useEffect(() => {
    if (enabled || run === null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the run belongs to the report on screen; it must not resume on the next one
    setRun(null);
  }, [enabled, run]);

  // Once the page is interactive again, focus goes back to what replayed the tour.
  useEffect(() => {
    if (run !== null) return;
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (target?.isConnected) target.focus({ preventScroll: true });
  }, [run]);

  const replay = useCallback(
    (source: TourReplaySource, returnTo: HTMLElement | null) => {
      if (!enabled) return;
      trackTourReplayed({ source });
      returnFocusRef.current = returnTo;
      // The page goes inert under the tour: nothing in it may keep focus.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      // Its stops are in Typical Beliefs: a reader who closed it gets it opened again.
      const closed =
        document
          .querySelector("#typical_beliefs .rv4-chapter__button")
          ?.getAttribute("aria-expanded") === "false";
      if (closed) openV4Chapter("typical_beliefs");
      window.setTimeout(
        () => {
          runIds += 1;
          setRun({ id: runIds, trigger: "replay" });
        },
        closed ? REOPEN_SETTLE_MS : 0
      );
    },
    [enabled]
  );

  const done = useCallback(() => {
    setRun(null);
  }, []);

  return { run, running: enabled && run !== null, replay, done };
}
