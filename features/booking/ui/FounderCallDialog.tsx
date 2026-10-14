"use client";

import { useEffect, useRef, type FC } from "react";
import type { LeaveDismissSource } from "@features/report/logic/leaveIntent";
import { lockBodyScroll, unlockBodyScroll } from "@shared/ui/body-scroll-lock";
import "@features/report/ui/paygate.css";
import "./founderCallDialog.css";

interface Props {
  open: boolean;
  /** The founders' Google Calendar booking page (`getFounderCallUrl`). */
  bookingUrl: string;
  onDismiss: (source: LeaveDismissSource) => void;
  onBook: () => void;
}

const TITLE_ID = "report-leave-offer-title";
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The leave offer's dialog: an unpaid reader's full report, free for a 20-minute
 * video call with Mark and Marcus. Every promise here is what the admin's "Grant 100%
 * coupon" delivers after the call: a one-time code for the full report, emailed,
 * valid 14 days. No price and no discount framing (LoveIQ Sync 12.10).
 *
 * Built like the share and plans windows: always mounted while the offer can show,
 * styled open with `is-visible`, and a dialog to assistive tech only while open.
 * The page keeps everything behind it inert and handles the back button.
 */
const FounderCallDialog: FC<Props> = ({ open, bookingUrl, onDismiss, onBook }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const didOpenRef = useRef(false);

  useEffect(() => {
    if (open) {
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      didOpenRef.current = true;
      dialogRef.current?.focus({ preventScroll: true });
      return;
    }
    if (didOpenRef.current) {
      didOpenRef.current = false;
      restoreFocusRef.current?.focus?.({ preventScroll: true });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Cancels the close request too, so it closes once, as "escape".
        event.preventDefault();
        onDismiss("escape");
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      unlockBodyScroll();
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onDismiss]);

  return (
    <div
      className={`report-leave-offer ${open ? "is-visible" : "is-hidden"}`}
      data-state={open ? "open" : "closed"}
      aria-hidden={!open}
    >
      <div
        className="report-leave-offer__backdrop"
        aria-hidden="true"
        onClick={() => onDismiss("backdrop")}
      />
      <div className="report-leave-offer__viewport">
        <div
          ref={dialogRef}
          role={open ? "dialog" : undefined}
          aria-modal={open ? "true" : undefined}
          aria-labelledby={open ? TITLE_ID : undefined}
          className="report-leave-offer__dialog"
          tabIndex={-1}
          data-lenis-prevent
        >
          <button
            type="button"
            className="report-leave-offer__close"
            aria-label="Close"
            onClick={() => onDismiss("close_button")}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <p className="report-leave-offer__eyebrow">Prefer to Talk?</p>
          <h2 id={TITLE_ID} className="report-leave-offer__title">
            {"Your Full Report, "}
            <span className="rpg-gradient">Free</span>
            {" for a 20-Minute Call"}
          </h2>
          <p className="report-leave-offer__body">
            Mark and Marcus, who built LoveIQ, want to hear what your report got right and what it
            missed. Talk with them on a 20-minute video call, and your full report is on us.
          </p>

          <ol className="report-leave-offer__steps">
            <li>Pick a time. Google Calendar sends you a Google Meet link.</li>
            <li>Talk with Mark and Marcus for 20 minutes.</li>
            <li>
              After the call, we email you a one-time code that opens your full report. It works for
              14 days.
            </li>
          </ol>

          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="report-leave-offer__cta rpg-card__cta rpg-card__cta--filled"
            onClick={onBook}
          >
            Book a 20-Minute Call
            <span className="sr-only"> (opens Google Calendar in a new tab)</span>
          </a>
          <p className="report-leave-offer__note">
            Book with the email you took the test with, so your code reaches you.
          </p>
          <button
            type="button"
            className="report-leave-offer__later"
            onClick={() => onDismiss("not_now")}
          >
            No Thanks, Keep Reading
          </button>
        </div>
      </div>
    </div>
  );
};

export default FounderCallDialog;
