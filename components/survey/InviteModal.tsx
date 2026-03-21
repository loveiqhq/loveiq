"use client";

import { useState, useEffect, useRef, useCallback, type FC } from "react";
import { getCsrfToken } from "@/lib/csrf-client";
import { trackSurveyInvite } from "@/lib/analytics";

const EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */
const EnvelopeIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="2" y="4" width="16" height="12" rx="2" />
    <path d="m2 6 8 5 8-5" />
  </svg>
);

const PeopleIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14 17.5v-1.25a2.5 2.5 0 0 0-2.5-2.5h-5a2.5 2.5 0 0 0-2.5 2.5v1.25" />
    <circle cx="9" cy="7.5" r="2.5" />
    <path d="M17 17.5v-1.25a2.5 2.5 0 0 0-1.875-2.42" />
    <path d="M13.125 4.58a2.5 2.5 0 0 1 0 4.84" />
  </svg>
);

const CheckIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 13l4 4L19 7" />
  </svg>
);

const CloseIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="m5 5 10 10M15 5 5 15" />
  </svg>
);

const ArrowIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4.167 10h11.666" />
    <path d="m10 4.167 5.833 5.833-5.833 5.833" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  InviteModal                                                        */
/* ------------------------------------------------------------------ */
type ModalState = "idle" | "sending" | "success" | "error";

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  referrerEmail: string;
  referrerName: string;
}

const InviteModal: FC<InviteModalProps> = ({ open, onClose, referrerEmail, referrerName }) => {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<ModalState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset modal state on open/close — intentional cascading render
  // to trigger entering CSS transition on open.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setState("idle");
      setEmail("");
      setErrorMsg("");
      // Delay to trigger CSS transition
      requestAnimationFrame(() => setIsVisible(true));
      // Focus input after animation
      setTimeout(() => inputRef.current?.focus(), 300);
    } else {
      setIsVisible(false);
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state !== "sending") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose, state]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = email.trim().toLowerCase();
      if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        setErrorMsg("Please enter a valid email address.");
        return;
      }

      setState("sending");
      setErrorMsg("");
      trackSurveyInvite();

      try {
        const res = await fetch("/api/invite", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": getCsrfToken(),
          },
          body: JSON.stringify({
            recipientEmail: trimmed,
            referrerEmail: referrerEmail.trim().toLowerCase() || undefined,
            referrerName: referrerName.trim() || undefined,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setErrorMsg(body.error || "Something went wrong. Please try again.");
          setState("error");
          return;
        }

        setState("success");
        setTimeout(() => {
          onClose();
        }, 2200);
      } catch {
        setErrorMsg("Unable to send. Please check your connection.");
        setState("error");
      }
    },
    [email, referrerEmail, referrerName, onClose]
  );

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        style={{
          opacity: isVisible ? 1 : 0,
          transition: `opacity 300ms ${EASING}`,
        }}
        aria-hidden="true"
        onClick={state !== "sending" ? onClose : undefined}
      />

      {/* Dialog container — bottom-sheet on mobile, centered on desktop */}
      <div className="fixed inset-0 z-50 flex items-end justify-center px-0 sm:items-center sm:px-5 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Invite a friend"
          className="pointer-events-auto w-full max-w-none overflow-hidden rounded-t-2xl border-t border-x border-white/[0.08] shadow-[0_-8px_40px_rgba(0,0,0,0.4)] sm:max-w-[420px] sm:rounded-2xl sm:border sm:shadow-[0_32px_80px_rgba(0,0,0,0.6)]"
          style={{
            background: "linear-gradient(180deg, rgba(18,12,30,0.98) 0%, rgba(10,5,16,0.99) 100%)",
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "translateY(0)" : "translateY(24px)",
            transition: `all 400ms ${EASING}`,
          }}
        >
          {/* Content */}
          <div
            className="relative px-5 pb-8 pt-6 sm:px-7 sm:pb-7"
            style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom, 0px))" }}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              disabled={state === "sending"}
              className="absolute right-4 top-4 rounded-full p-1.5 text-white/30 transition hover:bg-white/5 hover:text-white/60 disabled:opacity-30"
              aria-label="Close"
            >
              <CloseIcon className="h-4 w-4" />
            </button>

            {state === "success" ? (
              /* ---- Success State ---- */
              <div className="flex flex-col items-center py-6">
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(254,104,57,0.15) 0%, rgba(167,139,250,0.15) 100%)",
                    animation: `survey-scale-in 500ms ${EASING} both`,
                  }}
                >
                  <CheckIcon className="h-8 w-8 text-[#ff795b]" />
                </div>
                <h2
                  className="mt-5 font-serif text-[22px] font-medium text-white"
                  style={{ animation: `survey-fade-up 400ms ${EASING} 200ms both` }}
                >
                  Invite sent!
                </h2>
                <p
                  className="mt-2 text-center font-sans text-[14px] text-white/50"
                  style={{ animation: `survey-fade-up 400ms ${EASING} 350ms both` }}
                >
                  We&rsquo;ve sent a beautifully designed email to{" "}
                  <span className="text-[#c084fc]">{email.trim()}</span>
                </p>
              </div>
            ) : (
              /* ---- Form State ---- */
              <>
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(254,104,57,0.12) 0%, rgba(167,139,250,0.12) 100%)",
                    }}
                  >
                    <PeopleIcon className="h-5 w-5 text-[#ff795b]" />
                  </div>
                  <div>
                    <h2 className="font-serif text-[20px] font-medium leading-tight text-white">
                      Invite a friend
                    </h2>
                  </div>
                </div>

                <p className="mt-3 font-sans text-[14px] leading-[22px] text-white/50">
                  Share LoveIQ with someone you care about. We&rsquo;ll send them a beautifully
                  designed email with a link to try the assessment.
                </p>

                {/* Form */}
                <form onSubmit={handleSubmit} className="mt-6">
                  <div className="relative">
                    <EnvelopeIcon className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-white/25" />
                    <input
                      ref={inputRef}
                      type="email"
                      placeholder="Enter their email address"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (errorMsg) setErrorMsg("");
                      }}
                      disabled={state === "sending"}
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-3.5 pl-11 pr-4 font-sans text-[15px] text-white placeholder-white/25 outline-none transition focus:border-[#ff795b]/40 focus:bg-white/[0.06] focus:ring-1 focus:ring-[#ff795b]/20 disabled:opacity-50"
                    />
                  </div>

                  {/* Error message */}
                  {errorMsg && (
                    <p className="mt-2.5 font-sans text-[13px] text-[#f87171]">{errorMsg}</p>
                  )}

                  {/* Submit button */}
                  <button
                    type="submit"
                    disabled={state === "sending"}
                    className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-full px-6 py-3.5 font-sans text-[16px] font-bold text-white shadow-[0_10px_25px_-5px_rgba(254,104,57,0.25)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-5px_rgba(254,104,57,0.35)] disabled:translate-y-0 disabled:opacity-60 disabled:shadow-none"
                    style={{
                      background:
                        state === "sending"
                          ? "rgba(255,121,91,0.4)"
                          : "linear-gradient(120deg, #fe6839 0%, #ff7f3e 40%, #ff9450 70%, #c36ddf 100%)",
                    }}
                  >
                    {state === "sending" ? (
                      "Sending..."
                    ) : (
                      <>
                        Send Invite
                        <ArrowIcon className="h-5 w-5" />
                      </>
                    )}
                  </button>

                  {/* Cancel link */}
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={state === "sending"}
                    className="mt-3 w-full py-1 text-center font-sans text-[13px] text-white/30 transition hover:text-white/50 disabled:opacity-30"
                  >
                    Cancel
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default InviteModal;
