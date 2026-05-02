"use client";

import { useEffect, useRef, useState, type FC, type FormEvent, type MutableRefObject } from "react";
import { canSharePlan } from "@/lib/report/planAccess";
import { useReportShares } from "./hooks/useReportShares";

interface Props {
  open: boolean;
  onClose: () => void;
  ownerToken: string | null;
  /**
   * Optional plan hint from the parent (e.g. /api/report response). Lets the
   * modal skip the "Loading…" flash while the share-specific GET resolves —
   * locked-vs-active state is determined synchronously on first render.
   */
  initialPlan?: "essentials" | "full_report" | "all_reports" | null;
  onUpgrade?: () => void;
  returnFocusRef?: MutableRefObject<HTMLElement | null>;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Pre-filled body for the "personal message" textarea. Owners can keep, edit, or clear it. */
export const DEFAULT_PERSONAL_MESSAGE = `I wanted to share my LoveIQ report with you. It helped me understand how I experience connection, desire, and relationships in a way I hadn't fully seen before — and parts of it really resonated with me.

I thought you might find it interesting, maybe even helpful in understanding me a little better.

P.S. I think you should also try the test on loveiq.org`;

const ShareReportModal: FC<Props> = ({
  open,
  onClose,
  ownerToken,
  initialPlan,
  onUpgrade,
  returnFocusRef,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const didOpenRef = useRef(false);
  const { plan, seatLimit, seatsUsed, loading, submitting, error, add, refresh } = useReportShares(
    open ? ownerToken : null,
    initialPlan ?? undefined
  );

  const [phase, setPhase] = useState<"form" | "sent">("form");
  const [emailInput, setEmailInput] = useState("");
  const [messageInput, setMessageInput] = useState(DEFAULT_PERSONAL_MESSAGE);
  const [lastSentEmail, setLastSentEmail] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const isLocked = !canSharePlan(plan);
  const seatsRemaining = Math.max(0, seatLimit - seatsUsed);
  const sendDisabled =
    isLocked || seatsRemaining <= 0 || submitting || !emailInput.trim().includes("@");

  useEffect(() => {
    if (open) {
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      didOpenRef.current = true;
      requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }));
      // One-shot reset when dialog opens — guarded by `open` branch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("form");

      setEmailInput("");

      setMessageInput(DEFAULT_PERSONAL_MESSAGE);

      setInlineError(null);
      void refresh();
      return;
    }
    if (didOpenRef.current) {
      (restoreFocusRef.current ?? returnFocusRef?.current)?.focus?.();
      didOpenRef.current = false;
    }
  }, [open, refresh, returnFocusRef]);

  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const restore = {
      htmlOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow,
      bodyPosition: document.body.style.position,
      bodyTop: document.body.style.top,
      bodyWidth: document.body.style.width,
    };
    document.documentElement.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);

    return () => {
      document.documentElement.style.overflow = restore.htmlOverflow;
      document.body.style.overflow = restore.bodyOverflow;
      document.body.style.position = restore.bodyPosition;
      document.body.style.top = restore.bodyTop;
      document.body.style.width = restore.bodyWidth;
      window.scrollTo(0, scrollY);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!error) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInlineError(error);
  }, [error]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedEmail = emailInput.trim();
    if (!trimmedEmail) return;
    setInlineError(null);
    const trimmedMsg = messageInput.trim();
    const result = await add(trimmedEmail, trimmedMsg.length > 0 ? trimmedMsg : null);
    if (result.ok) {
      setLastSentEmail(trimmedEmail);
      setPhase("sent");
    } else {
      setInlineError(result.error);
    }
  };

  const handleSendAnother = () => {
    setEmailInput("");
    setMessageInput(DEFAULT_PERSONAL_MESSAGE);
    setInlineError(null);
    setPhase("form");
  };

  const renderWhatHappensNext = () => (
    <div className="report-share-modal__next-card" role="note">
      <p className="report-share-modal__next-title">What happens next?</p>
      <ul className="report-share-modal__next-list">
        <li>
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="#a78bfa"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
            <path d="m2.5 4.5 5.5 4 5.5-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>They&apos;ll receive an email notification</span>
        </li>
        <li>
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="#a78bfa"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <rect x="3" y="7.5" width="10" height="6.5" rx="1.5" />
            <path d="M5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5" strokeLinecap="round" />
          </svg>
          <span>They&apos;ll need to verify their email to access</span>
        </li>
        <li>
          <svg
            viewBox="0 0 32 32"
            fill="none"
            stroke="#a78bfa"
            strokeWidth="2.66667"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M24 10.6666C26.2091 10.6666 28 8.87577 28 6.66663C28 4.45749 26.2091 2.66663 24 2.66663C21.7909 2.66663 20 4.45749 20 6.66663C20 8.87577 21.7909 10.6666 24 10.6666Z" />
            <path d="M8 20C10.2091 20 12 18.2091 12 16C12 13.7909 10.2091 12 8 12C5.79086 12 4 13.7909 4 16C4 18.2091 5.79086 20 8 20Z" />
            <path d="M24 29.3334C26.2091 29.3334 28 27.5425 28 25.3334C28 23.1242 26.2091 21.3334 24 21.3334C21.7909 21.3334 20 23.1242 20 25.3334C20 27.5425 21.7909 29.3334 24 29.3334Z" />
            <path d="M11.4534 18.0133L20.56 23.32" />
            <path d="M20.5467 8.68005L11.4534 13.9867" />
          </svg>
          <span>They&apos;ll see your complete unlocked report</span>
        </li>
      </ul>
    </div>
  );

  const renderForm = () => (
    <>
      <button
        type="button"
        className="report-share-modal__back"
        onClick={onClose}
        aria-label="Close share dialog"
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="M10 3 5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>Back</span>
      </button>

      <div className="report-share-modal__hero">
        <div className="report-share-modal__hero-icon" aria-hidden="true">
          <svg
            viewBox="0 0 32 32"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2.66667"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M24 10.6666C26.2091 10.6666 28 8.87577 28 6.66663C28 4.45749 26.2091 2.66663 24 2.66663C21.7909 2.66663 20 4.45749 20 6.66663C20 8.87577 21.7909 10.6666 24 10.6666Z" />
            <path d="M8 20C10.2091 20 12 18.2091 12 16C12 13.7909 10.2091 12 8 12C5.79086 12 4 13.7909 4 16C4 18.2091 5.79086 20 8 20Z" />
            <path d="M24 29.3334C26.2091 29.3334 28 27.5425 28 25.3334C28 23.1242 26.2091 21.3334 24 21.3334C21.7909 21.3334 20 23.1242 20 25.3334C20 27.5425 21.7909 29.3334 24 29.3334Z" />
            <path d="M11.4534 18.0133L20.56 23.32" />
            <path d="M20.5467 8.68005L11.4534 13.9867" />
          </svg>
        </div>
        <h1 id="report-share-modal-title" className="report-share-modal__title">
          Share Your Report
        </h1>
        <p className="report-share-modal__subtitle">
          Grant someone you trust access to your complete personalized report
        </p>
      </div>

      <div className="report-share-modal__privacy" role="note">
        <div className="report-share-modal__privacy-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none" stroke="#ff6467" strokeWidth="1.6">
            <circle cx="10" cy="10" r="7.5" />
            <path d="M10 6.5v4M10 13.5v.01" strokeLinecap="round" />
          </svg>
        </div>
        <div className="report-share-modal__privacy-body">
          <h3 className="report-share-modal__privacy-title">Important Privacy Notice</h3>
          <p className="report-share-modal__privacy-copy">
            Your report contains deeply personal and sensitive information about your personality,
            relationships, and intimate preferences.
          </p>
          <p className="report-share-modal__privacy-lead">Only share your report with:</p>
          <ul className="report-share-modal__privacy-list">
            <li>
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="#ff6467"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path
                  d="M8 13.5s-5-3-5-7a3 3 0 0 1 5-2.2A3 3 0 0 1 13 6.5c0 4-5 7-5 7Z"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Your intimate partner or spouse</span>
            </li>
            <li>
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="#ff6467"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path
                  d="M8 1.5 3 3.5v4c0 3 2.2 5.5 5 7 2.8-1.5 5-4 5-7v-4L8 1.5Z"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Someone you deeply trust with private information</span>
            </li>
          </ul>
          <p className="report-share-modal__privacy-warn">
            The person you share with will see everything you&rsquo;ve unlocked in your report.
          </p>
        </div>
      </div>

      <div className="report-share-modal__seat-card" aria-live="polite">
        <div className="report-share-modal__seat-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none" stroke="#a78bfa" strokeWidth="1.6">
            <rect x="4" y="9" width="12" height="8" rx="1.5" />
            <path d="M7 9V6a3 3 0 0 1 6 0v3" strokeLinecap="round" />
          </svg>
        </div>
        <div className="report-share-modal__seat-copy">
          <p className="report-share-modal__seat-title">Count of your report sharing</p>
          <p className="report-share-modal__seat-sub">This is limited by your plan</p>
        </div>
        <div className="report-share-modal__seat-count">
          <span className="report-share-modal__seat-count-num">
            {seatsUsed}/{seatLimit}
          </span>
          <span className="report-share-modal__seat-count-label">Used</span>
        </div>
      </div>

      <form className="report-share-modal__details-card" onSubmit={handleSubmit} noValidate>
        <h2 className="report-share-modal__details-title">Details for</h2>

        <div className="report-share-modal__field">
          <label className="report-share-modal__label" htmlFor="report-share-email">
            Email Address to share your report with:
          </label>
          <input
            id="report-share-email"
            name="email"
            type="email"
            className="report-share-modal__input"
            placeholder="friend@example.com"
            value={emailInput}
            onChange={(event) => setEmailInput(event.target.value)}
            disabled={submitting || isLocked}
            required
            autoComplete="email"
          />
        </div>

        <div className="report-share-modal__field">
          <label className="report-share-modal__label" htmlFor="report-share-message">
            Edit your message to the recipient
          </label>
          <textarea
            id="report-share-message"
            name="message"
            className="report-share-modal__textarea"
            value={messageInput}
            onChange={(event) => setMessageInput(event.target.value)}
            disabled={submitting || isLocked}
            maxLength={2000}
            rows={7}
          />
        </div>

        {renderWhatHappensNext()}

        {inlineError ? (
          <p className="report-share-modal__error" role="alert">
            {inlineError}
          </p>
        ) : null}

        <button type="submit" className="report-share-modal__primary" disabled={sendDisabled}>
          <svg
            viewBox="0 0 32 32"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2.66667"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M24 10.6666C26.2091 10.6666 28 8.87577 28 6.66663C28 4.45749 26.2091 2.66663 24 2.66663C21.7909 2.66663 20 4.45749 20 6.66663C20 8.87577 21.7909 10.6666 24 10.6666Z" />
            <path d="M8 20C10.2091 20 12 18.2091 12 16C12 13.7909 10.2091 12 8 12C5.79086 12 4 13.7909 4 16C4 18.2091 5.79086 20 8 20Z" />
            <path d="M24 29.3334C26.2091 29.3334 28 27.5425 28 25.3334C28 23.1242 26.2091 21.3334 24 21.3334C21.7909 21.3334 20 23.1242 20 25.3334C20 27.5425 21.7909 29.3334 24 29.3334Z" />
            <path d="M11.4534 18.0133L20.56 23.32" />
            <path d="M20.5467 8.68005L11.4534 13.9867" />
          </svg>
          <span>{submitting ? "Sending…" : "Share Report"}</span>
        </button>

        <button type="button" className="report-share-modal__secondary" onClick={onClose}>
          Cancel
        </button>
      </form>
    </>
  );

  const renderSent = () => (
    <>
      <button
        type="button"
        className="report-share-modal__close"
        aria-label="Close share dialog"
        onClick={onClose}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
        </svg>
      </button>

      <div className="report-share-modal__hero">
        <div className="report-share-modal__sent-check" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.2">
            <path d="m6 12 4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="report-share-modal__title">Report Sent!</h1>
        <p className="report-share-modal__subtitle">
          The recipient of your choosing will receive an email invitation with a unique link to view
          your personalized report on this email address :{" "}
          <strong className="report-share-modal__sent-email">{lastSentEmail}</strong>.
        </p>
      </div>

      {renderWhatHappensNext()}

      <button type="button" className="report-share-modal__primary" onClick={onClose}>
        <span>Continue to My Report</span>
        <svg viewBox="0 0 20 20" fill="none" stroke="#ffffff" strokeWidth="1.8" aria-hidden="true">
          <path d="M5 10h10M11 6l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {seatsUsed < seatLimit ? (
        <button type="button" className="report-share-modal__secondary" onClick={handleSendAnother}>
          <span>
            {seatLimit - seatsUsed === 1
              ? "Send your report to one other person"
              : "Send to another person"}
          </span>
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <circle cx="8" cy="7" r="3" />
            <path d="M3 16c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5" strokeLinecap="round" />
            <path d="M14.5 6v4M12.5 8h4" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </>
  );

  const renderLocked = () => (
    <div className="report-share-modal__locked">
      <button
        type="button"
        className="report-share-modal__close"
        aria-label="Close share dialog"
        onClick={onClose}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
        </svg>
      </button>

      <div className="report-share-modal__hero">
        <div className="report-share-modal__locked-icon" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none" stroke="#ffffff" strokeWidth="2">
            <rect x="8" y="14" width="16" height="12" rx="2" />
            <path d="M12 14v-3a4 4 0 0 1 8 0v3" strokeLinecap="round" />
          </svg>
        </div>
        <h2 id="report-share-modal-title" className="report-share-modal__title">
          Sharing is a Full Report benefit
        </h2>
        <p className="report-share-modal__subtitle">
          Unlock the Full Report to share your results with up to 2 people you trust. Revoke a seat
          anytime — you stay in control.
        </p>
      </div>

      <ul className="report-share-modal__locked-perks" aria-label="What you get with Full Report">
        <li>
          <span className="report-share-modal__locked-check" aria-hidden="true">
            <svg viewBox="0 0 14 14" fill="none" stroke="#a78bfa" strokeWidth="2">
              <path d="m3 7 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span>All 18 analysed dimensions — your complete psychometric profile</span>
        </li>
        <li>
          <span className="report-share-modal__locked-check" aria-hidden="true">
            <svg viewBox="0 0 14 14" fill="none" stroke="#a78bfa" strokeWidth="2">
              <path d="m3 7 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span>Share securely with up to 2 people — email-verified access</span>
        </li>
        <li>
          <span className="report-share-modal__locked-check" aria-hidden="true">
            <svg viewBox="0 0 14 14" fill="none" stroke="#a78bfa" strokeWidth="2">
              <path d="m3 7 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span>14-day money-back guarantee — no questions asked</span>
        </li>
      </ul>

      <div className="report-share-modal__locked-actions">
        <button
          type="button"
          className="report-share-modal__primary"
          onClick={() => {
            onClose();
            onUpgrade?.();
          }}
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="#ffffff"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M6 9V6a4 4 0 0 1 8 0" strokeLinecap="round" />
            <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
          </svg>
          <span>Unlock Full Report</span>
        </button>
        <button
          type="button"
          className="report-share-modal__secondary report-share-modal__secondary--tall"
          onClick={onClose}
        >
          Not now
        </button>
      </div>
    </div>
  );

  const renderLoading = () => (
    <div className="report-share-modal__locked" aria-busy="true">
      <h2 id="report-share-modal-title" className="report-share-modal__title">
        Share your report
      </h2>
      <p className="report-share-modal__subtitle">Loading…</p>
    </div>
  );

  const showLoading = loading && plan === null && seatLimit === 0;

  return (
    <div
      className={`report-share-modal ${open ? "is-visible" : "is-hidden"}`}
      data-state={open ? "open" : "closed"}
      aria-hidden={!open}
    >
      <div className="report-share-modal__backdrop" aria-hidden="true" onClick={onClose} />
      <div className="report-share-modal__viewport" data-lenis-prevent>
        <div
          ref={dialogRef}
          role={open ? "dialog" : undefined}
          aria-modal={open ? "true" : undefined}
          aria-labelledby={open ? "report-share-modal-title" : undefined}
          className="report-share-modal__dialog"
          tabIndex={-1}
        >
          <div className="report-share-modal__inner">
            {showLoading
              ? renderLoading()
              : isLocked
                ? renderLocked()
                : phase === "sent"
                  ? renderSent()
                  : renderForm()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareReportModal;
