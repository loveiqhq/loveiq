"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  trackLeaveOfferClicked,
  trackLeaveOfferDismissed,
  trackLeaveOfferShown,
} from "@features/analytics/client";
import {
  FIRST_PAYWALL_SELECTOR,
  LOCKED_CHAPTER_SELECTOR,
  PHONE_IDLE_MS,
  PLANS_CLOSE_BEAT_MS,
  chooseLeaveOffer,
  findOpenOverlay,
  isExitIntent,
  isInsidePopupWindow,
  leaveOfferKey,
  leaveSignalSet,
  popupPointKey,
  type LeaveDismissSource,
  type LeaveMode,
  type LeaveOffer,
  type LeaveTrigger,
} from "@features/report/logic/leaveIntent";
import { plansOfferedKey } from "@features/report/logic/plansOffer";

export interface UseLeaveIntentArgs {
  /** From `leaveMode`: off, wait for a leave signal, or open at once (preview switch). */
  mode: LeaveMode;
  /** Keys the once-only record and the pay test's point; null in a preview. */
  submissionId: number | null;
  /** A window the page holds in state is open: plans, share, or the Stripe hand-off. */
  overlayOpen: boolean;
  /** The plans window in particular: opening it over the offer closes the offer. */
  plansOpen: boolean;
  /** The pay pop-up test's arm, recorded with the offer so its readout can split on it. */
  popupArm: string | null;
}

export interface LeaveIntent {
  open: boolean;
  variant: LeaveOffer;
  trigger: LeaveTrigger | null;
  /** Call when a plans window the READER opened closes (never the automatic pop-up). */
  notifyPlansClosed: () => void;
  dismiss: (source: LeaveDismissSource) => void;
  /** The reader opened the booking page. */
  book: () => void;
}

type Phase = "waiting" | "armed" | "open" | "done";

/** The card counts as reached once its top is above this share of the window's height. */
const REACHED_AT = 0.75;
const ACTIVITY_EVENTS = ["wheel", "touchstart", "touchmove", "pointerdown", "keydown"] as const;

function firstPaywall(): Element | null {
  return (
    document.querySelector(FIRST_PAYWALL_SELECTOR) ??
    document.querySelector(LOCKED_CHAPTER_SELECTOR)
  );
}

function signalSet(): "pointer" | "touch" {
  if (typeof window.matchMedia !== "function") return "touch";
  return leaveSignalSet({
    wide: window.matchMedia("(min-width: 700px)").matches,
    finePointer: window.matchMedia("(hover: hover) and (pointer: fine)").matches,
  });
}

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

/** False when neither storage takes it: then "once" cannot be kept, so it never shows. */
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
 * When this tab reached the pay pop-up test's point, stamped the first time its claim
 * is seen. A reload that finds the claim but no stamp stamps "now": it delays the offer
 * rather than risk it landing inside the test's window.
 */
function popupPointAt(submissionId: number | null, now: number): number | null {
  if (submissionId === null) return null;
  try {
    const stamped = sessionStorage.getItem(popupPointKey(submissionId));
    if (stamped !== null) {
      const at = Number(stamped);
      return Number.isFinite(at) ? at : now;
    }
    if (sessionStorage.getItem(plansOfferedKey(submissionId)) === null) return null;
    sessionStorage.setItem(popupPointKey(submissionId), String(now));
    return now;
  } catch {
    return null;
  }
}

/**
 * Watches for the moment an unpaid reader is about to leave and opens the leave offer
 * once (see features/report/logic/leaveIntent.ts for the rules). The page renders the
 * dialog from `open`, and tells the hook when a reader-opened plans window closes.
 */
export function useLeaveIntent({
  mode,
  submissionId,
  overlayOpen,
  plansOpen,
  popupArm,
}: UseLeaveIntentArgs): LeaveIntent {
  const variant = chooseLeaveOffer();
  const [shown, setShown] = useState<LeaveTrigger | null>(null);
  const phaseRef = useRef<Phase>("waiting");
  const armedAtRef = useRef(0);
  const lastActivityRef = useRef(0);
  const openedAtRef = useRef(0);
  const triggerRef = useRef<LeaveTrigger | null>(null);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayOpenRef = useRef(overlayOpen);
  const popupArmRef = useRef(popupArm);
  const submissionIdRef = useRef(submissionId);
  const modeRef = useRef(mode);

  useEffect(() => {
    overlayOpenRef.current = overlayOpen;
    popupArmRef.current = popupArm;
    submissionIdRef.current = submissionId;
    modeRef.current = mode;
  });

  const blocked = useCallback(
    () =>
      document.visibilityState !== "visible" ||
      overlayOpenRef.current ||
      findOpenOverlay(document) !== null,
    []
  );

  const openNow = useCallback(
    (trigger: LeaveTrigger, now: number) => {
      phaseRef.current = "open";
      openedAtRef.current = now;
      triggerRef.current = trigger;
      trackLeaveOfferShown({
        variant,
        trigger,
        popup_arm: popupArmRef.current,
        armed_ms: trigger === "forced" ? 0 : now - armedAtRef.current,
      });
      setShown(trigger);
    },
    [variant]
  );

  const attempt = useCallback(
    (trigger: LeaveTrigger) => {
      // Only while the page still wants the offer: a purchase that lands mid-session
      // turns it off, and with it the dialog this would open.
      if (modeRef.current !== "trigger") return;
      if (phaseRef.current !== "armed" || blocked()) return;
      const now = Date.now();
      const id = submissionIdRef.current;
      if (isInsidePopupWindow(popupPointAt(id, now), now)) return;
      if (id !== null && !writeRecord(leaveOfferKey(id), String(now))) {
        phaseRef.current = "done";
        return;
      }
      openNow(trigger, now);
    },
    [blocked, openNow]
  );

  useEffect(() => {
    if (mode === "off") {
      if (pendingRef.current) {
        clearTimeout(pendingRef.current);
        pendingRef.current = null;
      }
      // Armed is not kept across an "off": if the page turns the offer back on, it arms
      // again from the paywall card.
      if (phaseRef.current === "armed") phaseRef.current = "waiting";
      if (phaseRef.current === "open") {
        phaseRef.current = "done";
        // eslint-disable-next-line react-hooks/set-state-in-effect -- the page turned the offer off while it was open (a purchase, another archetype): close it
        setShown(null);
      }
      return;
    }
    if (mode === "show") {
      if (phaseRef.current === "waiting" || phaseRef.current === "armed") {
        openNow("forced", Date.now());
      }
      return;
    }
    if (phaseRef.current === "open" || phaseRef.current === "done") return;
    if (submissionId !== null && readRecord(leaveOfferKey(submissionId)) !== null) {
      phaseRef.current = "done";
      return;
    }

    lastActivityRef.current = Date.now();
    const tryArm = () => {
      if (phaseRef.current !== "waiting") return;
      const card = firstPaywall();
      if (!card || card.getBoundingClientRect().top > window.innerHeight * REACHED_AT) return;
      phaseRef.current = "armed";
      armedAtRef.current = Date.now();
      lastActivityRef.current = armedAtRef.current;
    };
    const onActivity = () => {
      lastActivityRef.current = Date.now();
    };
    const onScroll = () => {
      onActivity();
      tryArm();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") onActivity();
    };
    const onMouseOut = (event: MouseEvent) => {
      if (phaseRef.current !== "armed" || signalSet() !== "pointer") return;
      if (isExitIntent(event)) attempt("exit_intent");
    };
    const ticker = setInterval(() => {
      if (phaseRef.current === "waiting") tryArm();
      if (phaseRef.current !== "armed") return;
      const now = Date.now();
      // Stamp the pay test's point as soon as it appears, so its window is timed
      // from the moment it was reached, not from the next leave signal.
      popupPointAt(submissionIdRef.current, now);
      if (blocked()) {
        // Idle counts from when the reader is back on the page with nothing open.
        lastActivityRef.current = now;
        return;
      }
      if (signalSet() === "touch" && now - lastActivityRef.current >= PHONE_IDLE_MS) {
        attempt("idle");
      }
    }, 1000);

    tryArm();
    window.addEventListener("scroll", onScroll, { passive: true });
    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("mouseout", onMouseOut);
    return () => {
      clearInterval(ticker);
      window.removeEventListener("scroll", onScroll);
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("mouseout", onMouseOut);
      if (pendingRef.current) {
        clearTimeout(pendingRef.current);
        pendingRef.current = null;
      }
    };
  }, [mode, submissionId, attempt, blocked, openNow]);

  const notifyPlansClosed = useCallback(() => {
    // A window closing is the reader acting: idle counts from here.
    lastActivityRef.current = Date.now();
    if (modeRef.current !== "trigger" || phaseRef.current !== "armed") return;
    if (pendingRef.current) clearTimeout(pendingRef.current);
    pendingRef.current = setTimeout(() => {
      pendingRef.current = null;
      if (signalSet() === "touch") attempt("plans_closed");
    }, PLANS_CLOSE_BEAT_MS);
  }, [attempt]);

  const dismiss = useCallback(
    (source: LeaveDismissSource) => {
      if (phaseRef.current !== "open") return;
      phaseRef.current = "done";
      trackLeaveOfferDismissed({
        variant,
        trigger: triggerRef.current ?? "forced",
        source,
        view_duration_ms: Date.now() - openedAtRef.current,
      });
      setShown(null);
    },
    [variant]
  );

  const book = useCallback(() => {
    if (phaseRef.current !== "open") return;
    phaseRef.current = "done";
    trackLeaveOfferClicked({
      variant,
      trigger: triggerRef.current ?? "forced",
      view_duration_ms: Date.now() - openedAtRef.current,
    });
    setShown(null);
  }, [variant]);

  // The page never opens the plans window over the offer, but if anything does, the
  // offer gives way rather than stack two dialogs on one history entry.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the plans window opened over the offer: the offer gives way
    if (plansOpen) dismiss("superseded");
  }, [plansOpen, dismiss]);

  // Never "open" while the page has the offer off: the dialog is not mounted then, and an
  // open offer blurs and freezes the page behind it.
  return {
    open: shown !== null && mode !== "off",
    variant,
    trigger: shown,
    notifyPlansClosed,
    dismiss,
    book,
  };
}
