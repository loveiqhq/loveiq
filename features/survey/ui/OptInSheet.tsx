"use client";

import { useCallback, useEffect, useId, useRef, type FC, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { lockBodyScroll, unlockBodyScroll } from "@shared/ui/body-scroll-lock";
import {
  OPT_IN_SHEET_COPY,
  shouldDismissOnDrag,
  type OptInSheetDismissVia,
} from "@features/survey/optInSheet";

interface OptInSheetProps {
  open: boolean;
  /** "Yes, I want to keep learning": SurveyEngine switches the answer to Yes and submits. */
  onAccept: () => void;
  /** "Not now": SurveyEngine submits the No. */
  onDecline: () => void;
  /** Closed without a choice (outside, Esc, a swipe down): the reader stays on the question. */
  onDismiss: (via: OptInSheetDismissVia) => void;
}

/**
 * Taps this soon after the sheet opens are ignored. It opens under the reader's thumb (Next
 * sits where its buttons land), so a double tap on Next, or Enter held down, must never
 * give consent.
 */
export const OPEN_GUARD_MS = 400;
/** The slide back down when the reader closes it without choosing. */
export const CLOSE_MS = 220;

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const CheckIcon: FC = () => (
  <svg
    className="mt-[2px] flex-none"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#2e7d5b"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/**
 * The "Sure you want to miss out?" sheet over the marketing opt-in (Q16015), Mark's board
 * "Opt-in · B · Sample email sheet on Next" (Claude Design NGyoLVAex5vSW4voVs7Tcc, 10 Nov
 * 2026). Every value below is the board's, drawn at 390 x 844: a scrim over the whole
 * survey and a sheet on the bottom edge, with a 1.5px brand-gradient border and no bottom
 * edge. From 640px it stays a bottom sheet, at most 480px wide (Mark drew phones only;
 * Fatih's call, 10 Nov). Copy and its reasons: features/survey/optInSheet.ts.
 */
const OptInSheet: FC<OptInSheetProps> = ({ open, onAccept, onDecline, onDismiss }) => {
  const titleId = useId();
  const listId = useId();
  const fineId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const scrimRef = useRef<HTMLButtonElement | null>(null);
  const acceptRef = useRef<HTMLButtonElement | null>(null);
  const declineRef = useRef<HTMLButtonElement | null>(null);
  const openedAt = useRef(0);
  /** Set once the reader has chosen or started closing it: nothing else may land. */
  const closing = useRef(false);
  const closeTimer = useRef<number | null>(null);
  const drag = useRef<{ id: number; y: number; t: number; dy: number } | null>(null);

  // While open: the page under it holds still, and focus goes to the sheet itself. Never to
  // a button: Yes is the first one, and the Enter that moved the reader on may still be
  // held. On close, focus returns where it was (Next, or the answer), unless the survey
  // moved on and that is gone.
  useEffect(() => {
    if (!open) return;
    openedAt.current = Date.now();
    closing.current = false;
    lockBodyScroll();
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => panelRef.current?.focus({ preventScroll: true }), 0);
    return () => {
      window.clearTimeout(focusTimer);
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      drag.current = null;
      unlockBodyScroll();
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, [open]);

  /** Closed without a choice: it slides back down, then the reader is on the question. */
  const closeWith = useCallback(
    (via: OptInSheetDismissVia) => {
      if (closing.current) return;
      closing.current = true;
      const panel = panelRef.current;
      if (!panel || prefersReducedMotion()) {
        onDismiss(via);
        return;
      }
      panel.style.transition = `transform ${CLOSE_MS}ms cubic-bezier(0.4, 0, 1, 1)`;
      panel.style.transform = "translateY(100%)";
      const scrim = scrimRef.current;
      if (scrim) {
        scrim.style.transition = `opacity ${CLOSE_MS}ms ease-in`;
        scrim.style.opacity = "0";
      }
      closeTimer.current = window.setTimeout(() => {
        closeTimer.current = null;
        onDismiss(via);
      }, CLOSE_MS);
    },
    [onDismiss]
  );

  /** A choice counts once the sheet has been up long enough to be read. */
  const choose = (pick: () => void) => {
    if (closing.current || Date.now() - openedAt.current < OPEN_GUARD_MS) return;
    closing.current = true;
    pick();
  };

  // Esc closes it; Tab stays inside it (its two buttons) while it is open.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeWith("escape");
        return;
      }
      if (e.key !== "Tab") return;
      const first = acceptRef.current;
      const last = declineRef.current;
      const panel = panelRef.current;
      if (!first || !last || !panel) return;
      const active = document.activeElement;
      const inside = panel.contains(active);
      if (e.shiftKey) {
        if (!inside || active === first || active === panel) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, closeWith]);

  // A swipe down closes it, as the grabber promises. Never one that starts on a button: the
  // button moves with the finger, so lifting it there would press it.
  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (closing.current || (e.target as Element).closest("button")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { id: e.pointerId, y: e.clientY, t: Date.now(), dy: 0 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.style.transition = "none";
  };
  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    d.dy = Math.max(0, e.clientY - d.y);
    e.currentTarget.style.transform = d.dy > 0 ? `translateY(${d.dy}px)` : "";
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!cancelled && shouldDismissOnDrag(d.dy, Date.now() - d.t)) {
      closeWith("swipe");
      return;
    }
    e.currentTarget.style.transition = "transform 200ms cubic-bezier(0.16, 1, 0.3, 1)";
    e.currentTarget.style.transform = "";
  };

  if (!open || typeof document === "undefined") return null;

  const copy = OPT_IN_SHEET_COPY;
  return createPortal(
    <div className="fixed inset-0 z-[60]" data-no-swipe data-lenis-prevent data-optin-sheet>
      <button
        ref={scrimRef}
        type="button"
        tabIndex={-1}
        aria-label="Back to the question"
        onClick={() => closeWith("backdrop")}
        className="absolute inset-0 h-full w-full cursor-default bg-[rgba(22,16,33,0.38)] motion-safe:animate-[survey-fade-in_0.2s_ease-out_backwards]"
      />
      {/* Fill `backwards`, not `both`: a held end state would override the drag's transform. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${listId} ${fineId}`}
        tabIndex={-1}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => endDrag(e, false)}
        onPointerCancel={(e) => endDrag(e, true)}
        className="absolute inset-x-0 bottom-[var(--liq-consent-h,0px)] mx-auto flex w-full select-none flex-col gap-[14px] rounded-t-[24px] border-[1.5px] border-b-0 border-solid border-transparent px-5 pt-[10px] text-[#161021] shadow-[0_-10px_40px_-10px_rgba(22,16,33,0.35)] outline-none [touch-action:none] motion-safe:animate-[survey-sheet-up_0.45s_cubic-bezier(0.16,1,0.3,1)_backwards] sm:max-w-[480px]"
        style={{
          background:
            "linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(135deg, #fe6839 0%, #bf66d9 50%, #958ef6 100%) border-box",
          // The board's 28px, or more where a phone's home bar would sit on "Not now".
          paddingBottom: "max(28px, calc(env(safe-area-inset-bottom, 0px) + 12px))",
        }}
      >
        <div aria-hidden className="h-1 w-10 flex-none self-center rounded-full bg-[#dcd8e3]" />
        <h2
          id={titleId}
          className="font-serif text-[20px] font-medium leading-[24px] tracking-[-0.2px] text-[#161021]"
        >
          {copy.titleLead}
          {/* The padding, given back by the margin, keeps the italic t inside the gradient. */}
          <span
            className="-mr-[0.06em] pr-[0.06em] font-semibold italic text-transparent"
            style={{
              backgroundImage: "linear-gradient(105deg, #fe6839 0%, #bf66d9 55%, #958ef6 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
            }}
          >
            {copy.titleEmphasis}
          </span>
          {copy.titleEnd}
        </h2>
        <ul id={listId} className="flex flex-col gap-2">
          {copy.benefits.map((benefit) => (
            <li
              key={benefit}
              className="flex items-start gap-[10px] font-sans text-[14px] leading-5 text-[#161021]"
            >
              <CheckIcon />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
        <p id={fineId} className="font-sans text-[11px] leading-[15px] text-[#6b6678]">
          {copy.finePrintLead}
          <b className="font-bold">{copy.finePrintFigure}</b>
          {copy.finePrintEnd}
        </p>
        <button
          ref={acceptRef}
          type="button"
          onClick={() => choose(onAccept)}
          className="flex h-12 w-full items-center justify-center rounded-full font-sans text-[15px] font-bold leading-[normal] text-white shadow-[0_10px_26px_-12px_rgba(191,102,217,0.75)] outline-none focus-visible:ring-2 focus-visible:ring-[#6b5b95]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          style={{
            backgroundImage: "linear-gradient(135deg, #fe6839 0%, #bf66d9 43%, #958ef6 100%)",
          }}
        >
          {copy.accept}
        </button>
        {/* A text link on the board (underlined, no box). The padding, given back by the
            margins, makes it easier to tap without moving anything. */}
        <button
          ref={declineRef}
          type="button"
          onClick={() => choose(onDecline)}
          className="-mx-3 -my-1.5 self-center rounded-full px-3 py-1.5 font-sans text-[14px] font-semibold leading-[normal] text-[#4a4558] underline outline-none focus-visible:ring-2 focus-visible:ring-[#6b5b95]/60"
        >
          {copy.decline}
        </button>
      </div>
    </div>,
    document.body
  );
};

export default OptInSheet;
