"use client";

import { useEffect, useRef, type FC } from "react";
import { createPortal } from "react-dom";

interface SurveyPauseModalProps {
  open: boolean;
  email: string;
  onResume: () => void;
  onExit: () => void;
}

const PauseGlyph: FC = () => (
  <svg
    aria-hidden
    viewBox="0 0 32 32"
    className="h-8 w-8"
    fill="none"
    stroke="#a78bfa"
    strokeWidth="3"
    strokeLinecap="round"
  >
    <line x1="11" y1="7" x2="11" y2="25" />
    <line x1="21" y1="7" x2="21" y2="25" />
  </svg>
);

const CloseGlyph: FC = () => (
  <svg
    aria-hidden
    viewBox="0 0 20 20"
    className="h-full w-full"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
  >
    <line x1="5" y1="5" x2="15" y2="15" />
    <line x1="15" y1="5" x2="5" y2="15" />
  </svg>
);

const MailGlyph: FC = () => (
  <svg
    aria-hidden
    viewBox="0 0 16 16"
    className="h-4 w-4 shrink-0 text-[#a78bfa]"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
    <path d="M2.5 4.5l5.5 4 5.5-4" />
  </svg>
);

const ClockGlyph: FC = () => (
  <svg
    aria-hidden
    viewBox="0 0 16 16"
    className="h-4 w-4 shrink-0 text-[#a78bfa]"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="8" cy="8" r="6.2" />
    <path d="M8 4.5V8l2.4 1.5" />
  </svg>
);

const ArrowRightGlyph: FC = () => (
  <svg
    aria-hidden
    viewBox="0 0 20 20"
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="4" y1="10" x2="16" y2="10" />
    <polyline points="11 5 16 10 11 15" />
  </svg>
);

const ArrowLeftGlyph: FC = () => (
  <svg
    aria-hidden
    viewBox="0 0 20 20"
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="16" y1="10" x2="4" y2="10" />
    <polyline points="9 5 4 10 9 15" />
  </svg>
);

const SurveyPauseModal: FC<SurveyPauseModalProps> = ({ open, email, onResume, onExit }) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const primaryCtaRef = useRef<HTMLButtonElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const secondaryCtaRef = useRef<HTMLButtonElement | null>(null);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // ESC dismiss + focus trap
  useEffect(() => {
    if (!open) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onResume();
        return;
      }
      if (e.key !== "Tab") return;

      const focusables: HTMLButtonElement[] = [
        closeBtnRef.current,
        primaryCtaRef.current,
        secondaryCtaRef.current,
      ].filter((el): el is HTMLButtonElement => el !== null);

      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !cardRef.current?.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onResume]);

  // Auto-focus primary CTA when modal opens
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      primaryCtaRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const displayEmail = email && email.trim().length > 0 ? email.trim() : "the email you provide";

  return createPortal(
    <div
      className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain"
      data-lenis-prevent
      style={{ animation: "survey-fade-in 0.2s ease-out both" }}
    >
      <button
        type="button"
        aria-label="Resume survey"
        onClick={onResume}
        className="fixed inset-0 cursor-default bg-[rgba(10,5,16,0.55)] backdrop-blur-[3.75px]"
        tabIndex={-1}
      />

      <div className="relative flex min-h-full items-start justify-center px-4 pb-6 pt-[4vh] sm:items-center sm:py-10">
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="survey-pause-title"
          aria-describedby="survey-pause-desc"
          className="relative z-10 flex w-full max-w-[351px] flex-col items-center gap-[24px] rounded-[24px] border border-[#130b1c] bg-[#130b1c] px-[33px] py-[40px] shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.45)] sm:max-w-[744px] sm:gap-[39px] sm:px-[33px] sm:py-[49px]"
          style={{ animation: "survey-scale-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both" }}
        >
          <button
            ref={closeBtnRef}
            type="button"
            aria-label="Close pause dialog"
            onClick={onResume}
            className="absolute right-5 top-5 flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(255,255,255,0.05)] p-1 text-white/70 transition hover:bg-[rgba(255,255,255,0.1)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#130b1c] sm:right-[22px] sm:top-[22px] sm:h-9 sm:w-9 sm:p-2"
          >
            <CloseGlyph />
          </button>

          <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full border border-[rgba(168,85,247,0.2)] bg-[rgba(168,85,247,0.1)]">
            <PauseGlyph />
          </div>

          <div className="flex flex-col items-center gap-4">
            <h2
              id="survey-pause-title"
              className="text-center font-serif font-medium text-white text-[30px] leading-[38px] tracking-[-0.75px] sm:text-[49px] sm:leading-[49px] sm:tracking-[-1.2252px]"
            >
              You&rsquo;ve paused the test
            </h2>
            <p
              id="survey-pause-desc"
              className="text-center font-sans font-light text-[rgba(255,255,255,0.7)] text-[14px] leading-[22px] max-w-[293px] sm:text-[20px] sm:leading-[31px] sm:max-w-[576px]"
            >
              No worries &mdash; <strong className="font-bold">your progress is saved</strong>.
              We&apos;ll send reminders to{" "}
              <strong className="break-all font-bold">{displayEmail}</strong> so you can{" "}
              <strong className="font-bold">pick up right where you left off.</strong>
            </p>
          </div>

          <div className="w-full rounded-[14px] bg-[rgba(255,255,255,0.03)] p-4 sm:w-[606px] sm:px-4 sm:pt-4 sm:pb-5">
            <p className="font-sans font-medium uppercase tracking-[0.05em] text-[#a78bfa] text-[11px] sm:text-[13px]">
              What happens next?
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              <li className="flex items-start gap-2">
                <span className="mt-0.5">
                  <MailGlyph />
                </span>
                <span className="font-sans font-light text-[rgba(255,255,255,0.7)] text-[11px] leading-[15px] sm:text-[13px] sm:leading-[20px]">
                  You&apos;ll get a reminder email with a link to jump back in &mdash; no login
                  needed.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5">
                  <ClockGlyph />
                </span>
                <span className="font-sans font-light text-[rgba(255,255,255,0.7)] text-[11px] leading-[15px] sm:text-[13px] sm:leading-[20px]">
                  <span>Resume any time. </span>
                  <span>Click the link in your email to continue exactly where you stopped.</span>
                </span>
              </li>
            </ul>
          </div>

          <div className="flex w-full flex-col items-center gap-3 sm:gap-4">
            <button
              ref={primaryCtaRef}
              type="button"
              onClick={onResume}
              className="flex h-[44px] w-[193px] items-center justify-center gap-2 rounded-full bg-[#fe6839] font-sans text-[12px] font-medium text-white shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-4px_rgba(0,0,0,0.1)] transition hover:bg-[#ff7a4f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fe6839]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#130b1c] sm:h-[56px] sm:w-full sm:text-[16px]"
            >
              <span>Continue where I left off</span>
              <ArrowRightGlyph />
            </button>
            <button
              ref={secondaryCtaRef}
              type="button"
              onClick={onExit}
              className="flex h-[44px] w-[193px] items-center justify-center gap-2 rounded-full border border-[rgba(239,239,239,0.5)] bg-[#221e27] font-sans text-[12px] font-medium text-white transition hover:border-white/70 hover:bg-[#2a2530] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#130b1c] sm:h-[56px] sm:w-full sm:text-[16px]"
            >
              <ArrowLeftGlyph />
              <span>Go back to main page</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SurveyPauseModal;
