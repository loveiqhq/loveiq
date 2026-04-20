"use client";

import { useState, useEffect, useCallback, type FC } from "react";
import Link from "next/link";
import InviteModal from "./InviteModal";

const EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

/* ------------------------------------------------------------------ */
/*  Inline SVG Icons                                                   */
/* ------------------------------------------------------------------ */
const CheckCircleIcon: FC = () => (
  <svg
    className="h-4 w-4 shrink-0"
    viewBox="0 0 16 16"
    fill="none"
    stroke="#a78bfa"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="8" cy="8" r="6.5" />
    <path d="m5.5 8 1.75 1.75L10.5 6" />
  </svg>
);

const ArrowRightIcon: FC = () => (
  <svg
    className="h-5 w-5"
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

const PeopleIcon: FC = () => (
  <svg
    className="h-[18px] w-[18px] shrink-0"
    viewBox="0 0 18 18"
    fill="none"
    stroke="#d1d5db"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12.75 15.75v-1.5a3 3 0 0 0-3-3h-4.5a3 3 0 0 0-3 3v1.5" />
    <circle cx="8" cy="5.25" r="3" />
    <path d="M15.75 15.75v-1.5a3 3 0 0 0-2.25-2.9" />
    <path d="M12 2.35a3 3 0 0 1 0 5.81" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Animation helpers                                                  */
/* ------------------------------------------------------------------ */
const fadeUp = (delayMs: number, durationMs = 600) =>
  ({
    style: {
      opacity: 0,
      animation: `survey-fade-up ${durationMs}ms ${EASING} ${delayMs}ms both`,
    },
  }) as const;

const scaleIn = (delayMs: number, durationMs = 500) =>
  ({
    style: {
      opacity: 0,
      animation: `survey-scale-in ${durationMs}ms ${EASING} ${delayMs}ms both`,
    },
  }) as const;

/* ------------------------------------------------------------------ */
/*  Background                                                         */
/* ------------------------------------------------------------------ */
const BackgroundOrbs: FC = () => (
  <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
    <div
      className="absolute h-[400px] w-[400px] rounded-full blur-[120px]"
      style={{ background: "rgba(167,139,250,0.08)", left: "10%", top: "10%" }}
    />
    <div
      className="absolute h-[300px] w-[300px] rounded-full blur-[100px]"
      style={{ background: "rgba(254,104,57,0.06)", right: "5%", bottom: "15%" }}
    />
  </div>
);

/* ------------------------------------------------------------------ */
/*  ReportReady                                                        */
/* ------------------------------------------------------------------ */
interface ReportReadyProps {
  name: string;
  email: string;
  onContinue: () => void;
}

const ReportReady: FC<ReportReadyProps> = ({ name, email, onContinue }) => {
  const [hasEntered, setHasEntered] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setHasEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleContinue = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    setTimeout(onContinue, 600);
  }, [onContinue, isExiting]);

  const displayName = name.trim() || "Your";
  const heading =
    displayName === "Your" ? "Your report is ready" : `${displayName}, your report is ready`;

  const maskedEmail = email.trim() || "your email";

  return (
    <main
      className="relative flex min-h-dvh flex-col items-center justify-between overflow-hidden bg-[#0b0710]"
      style={{
        opacity: isExiting ? 0 : hasEntered ? 1 : 0,
        transition: isExiting ? `opacity 600ms ${EASING}` : `opacity 800ms ${EASING}`,
      }}
    >
      <BackgroundOrbs />

      {/* Main content */}
      <div className="relative z-10 flex w-full max-w-[672px] flex-1 flex-col items-center px-6 pb-10 pt-20 sm:pt-[80px]">
        {/* Assessment Complete pill */}
        <div {...fadeUp(100, 500)}>
          <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(58,37,89,0.6)] bg-[rgba(21,10,34,0.6)] px-[13px] py-[7px] shadow-[0_0_20px_0_rgba(168,85,247,0.05)]">
            <CheckCircleIcon />
            <span className="font-sans text-[12px] font-medium uppercase tracking-[1.2px] text-[#a78bfa]">
              Assessment Complete
            </span>
          </div>
        </div>

        {/* Heading */}
        <h1
          className="mt-8 text-center font-serif text-[32px] font-normal leading-[1] tracking-[-1.2px] text-white sm:text-[48px]"
          {...fadeUp(300)}
        >
          {heading}
        </h1>

        {/* Subtitle */}
        <p
          className="mt-6 max-w-[512px] text-center font-sans text-[16px] font-light leading-[28px] text-[#9ca3af] sm:text-[18px]"
          {...fadeUp(500)}
        >
          Well done, you&rsquo;ve just invested in your own growth. That puts you ahead of where you
          were yesterday.
        </p>

        {/* Instructions card */}
        <div className="mt-10 w-full max-w-[448px]" {...scaleIn(700)}>
          <div className="flex flex-col gap-8 rounded-2xl border border-[rgba(58,37,89,0.6)] bg-[rgba(21,10,34,0.8)] p-8 shadow-[0_0_30px_0_rgba(168,85,247,0.03)] backdrop-blur-[2px]">
            {/* Section 1: Click below */}
            <div className="flex flex-col gap-1">
              <h2 className="font-serif text-[18px] font-medium leading-[28px] text-white">
                Click below to see your report now
              </h2>
              <p className="font-sans text-[16px] font-light leading-[23px] text-[#9ca3af]">
                Your personalized report is compiled and ready. Click the button below to review
                your results immediately.
              </p>
            </div>

            {/* Section 2: Check inbox */}
            <div className="flex flex-col gap-1">
              <h2 className="font-serif text-[18px] font-medium leading-[28px] text-white">
                Check your inbox for <span className="text-[#c084fc]">{maskedEmail}</span>
              </h2>
              <p className="font-sans text-[16px] font-light leading-[23px] text-[#9ca3af]">
                We&rsquo;ve emailed a secure report link to your address.
                <br />
                You can return to your full report at any time.
              </p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-12 flex w-full max-w-[448px] flex-col gap-4" {...fadeUp(1000)}>
          {/* Primary CTA */}
          <button
            type="button"
            onClick={handleContinue}
            className="flex w-full items-center justify-center gap-3 rounded-full bg-[#ff795b] px-6 py-4 font-sans text-[18px] font-extrabold text-white shadow-[0_10px_15px_-3px_rgba(255,121,91,0.2),0_4px_6px_-4px_rgba(255,121,91,0.2)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_20px_-3px_rgba(255,121,91,0.28)] focus-visible-ring"
          >
            View your free report
            <ArrowRightIcon />
          </button>

          {/* Secondary — opens refer-a-friend modal */}
          <button
            type="button"
            onClick={() => setShowInvite(true)}
            className="flex h-16 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-[17px] font-sans text-[14px] font-medium text-[#d1d5db] shadow-[0_10px_15px_-3px_rgba(0,0,0,0.2),0_4px_6px_-4px_rgba(0,0,0,0.2)] transition-all duration-300 hover:bg-white/10 focus-visible-ring"
          >
            <PeopleIcon />
            Refer a Friend
          </button>
        </div>
      </div>

      {/* Invite modal */}
      <InviteModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        referrerEmail={email}
        referrerName={name}
      />

      {/* Footer */}
      <footer
        className="relative z-10 flex flex-col items-center gap-4 pb-8"
        {...fadeUp(1200, 400)}
      >
        <div className="flex items-center gap-3 font-sans text-[14px] font-light text-[#6b7280]">
          <Link href="/privacy-policy" className="transition hover:text-white/50">
            Privacy Policy
          </Link>
          <span aria-hidden="true">&middot;</span>
          <Link href="/terms-of-use" className="transition hover:text-white/50">
            Terms of Use
          </Link>
          <span aria-hidden="true">&middot;</span>
          <Link href="/medical-disclaimer" className="transition hover:text-white/50">
            Medical Disclaimer
          </Link>
        </div>
        <span className="font-sans text-[12px] font-light uppercase tracking-[1.2px] text-[#374151]">
          Created by LoveIQ
        </span>
      </footer>
    </main>
  );
};

export default ReportReady;
