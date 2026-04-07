"use client";

import { useState, useCallback, useEffect, useRef, type FC, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import SurveyEngine from "./SurveyEngine";
import {
  ANSWERS_STORAGE_KEY,
  SURVEY_STEP_KEY,
  clearPersistedSurveyState,
  loadPendingCompletion,
} from "./hooks/surveyStorage";
import { copySurveySessionToReportSession } from "./hooks/surveySession";

/* ------------------------------------------------------------------ */
/*  Shared icons                                                       */
/* ------------------------------------------------------------------ */
const ArrowRight: FC<{ className?: string }> = ({ className = "h-5 w-5" }) => (
  <svg
    aria-hidden
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);

const ArrowLeft: FC<{ className?: string }> = ({ className = "h-5 w-5" }) => (
  <svg
    aria-hidden
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Slide icons with purple glow                                       */
/* ------------------------------------------------------------------ */
const IconGlow: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="relative h-[40px] w-[40px]">
    <div
      className="absolute rounded-full"
      style={{
        width: "88px",
        height: "88px",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        background:
          "radial-gradient(circle, rgba(167, 139, 250, 0.55) 0%, rgba(167, 139, 250, 0.15) 40%, transparent 70%)",
      }}
    />
    {children}
  </div>
);

/* Slide 1 — Sparkle */
const SparkleIcon: FC = () => (
  <IconGlow>
    <div className="relative h-[40px] w-[40px] opacity-90">
      <svg
        aria-hidden
        className="absolute left-[5px] top-[5px]"
        width="31"
        height="31"
        viewBox="0 0 31 31"
        fill="none"
      >
        <path
          d="M13.7775 2.15656C13.8382 1.83158 14.0106 1.53806 14.2649 1.32684C14.5193 1.11562 14.8395 1 15.1701 1C15.5007 1 15.8208 1.11562 16.0752 1.32684C16.3295 1.53806 16.5019 1.83158 16.5626 2.15656L18.0516 10.0304C18.1573 10.5902 18.4293 11.1051 18.8322 11.5079C19.235 11.9108 19.7499 12.1828 20.3097 12.2886L28.1836 13.7775C28.5085 13.8382 28.8021 14.0106 29.0133 14.2649C29.2245 14.5193 29.3401 14.8395 29.3401 15.1701C29.3401 15.5007 29.2245 15.8208 29.0133 16.0752C28.8021 16.3295 28.5085 16.5019 28.1836 16.5626L20.3097 18.0516C19.7499 18.1573 19.235 18.4293 18.8322 18.8322C18.4293 19.235 18.1573 19.7499 18.0516 20.3097L16.5626 28.1836C16.5019 28.5085 16.3295 28.8021 16.0752 29.0133C15.8208 29.2245 15.5007 29.3401 15.1701 29.3401C14.8395 29.3401 14.5193 29.2245 14.2649 29.0133C14.0106 28.8021 13.8382 28.5085 13.7775 28.1836L12.2886 20.3097C12.1828 19.7499 11.9108 19.235 11.5079 18.8322C11.1051 18.4293 10.5902 18.1573 10.0304 18.0516L2.15656 16.5626C1.83158 16.5019 1.53806 16.3295 1.32684 16.0752C1.11562 15.8208 1 15.5007 1 15.1701C1 14.8395 1.11562 14.5193 1.32684 14.2649C1.53806 14.0106 1.83158 13.8382 2.15656 13.7775L10.0304 12.2886C10.5902 12.1828 11.1051 11.9108 11.5079 11.5079C11.9108 11.1051 12.1828 10.5902 12.2886 10.0304L13.7775 2.15656Z"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <svg
        aria-hidden
        className="absolute right-[2px] top-[0px]"
        width="8"
        height="8"
        viewBox="0 0 8 8"
        fill="none"
      >
        <path
          d="M4 1v6M1 4h6"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <svg
        aria-hidden
        className="absolute bottom-[2px] left-[2px]"
        width="8"
        height="8"
        viewBox="0 0 8 8"
        fill="none"
      >
        <path
          d="M3.83333 6.66667C5.39814 6.66667 6.66667 5.39814 6.66667 3.83333C6.66667 2.26853 5.39814 1 3.83333 1C2.26853 1 1 2.26853 1 3.83333C1 5.39814 2.26853 6.66667 3.83333 6.66667Z"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  </IconGlow>
);

/* Slide 2 — Scale / balance */
const ScaleIcon: FC = () => (
  <IconGlow>
    <div className="relative h-[40px] w-[40px] opacity-90">
      {/* Left pan */}
      <svg
        aria-hidden
        className="absolute left-[1px] top-[7px]"
        width="12"
        height="19"
        viewBox="0 0 12 19"
        fill="none"
      >
        <path
          d="M5.875 2.625L10.75 15.625C9.34359 16.6798 7.63301 17.25 5.875 17.25C4.11699 17.25 2.40641 16.6798 1 15.625L5.875 2.625ZM5.875 2.625V1"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {/* Beam */}
      <svg
        aria-hidden
        className="absolute left-[4px] top-[6px]"
        width="32"
        height="6"
        viewBox="0 0 32 6"
        fill="none"
      >
        <path
          d="M1 4.25H2.625C7.15939 4.25 11.6241 3.13383 15.625 1C19.6259 3.13383 24.0906 4.25 28.625 4.25H30.25"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {/* Vertical pole */}
      <svg
        aria-hidden
        className="absolute left-[19px] top-[4px]"
        width="2"
        height="32"
        viewBox="0 0 2 32"
        fill="none"
      >
        <path
          d="M1 1V30.25"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {/* Right pan */}
      <svg
        aria-hidden
        className="absolute right-[1px] top-[7px]"
        width="12"
        height="19"
        viewBox="0 0 12 19"
        fill="none"
      >
        <path
          d="M5.875 2.625L10.75 15.625C9.34359 16.6798 7.63301 17.25 5.875 17.25C4.11699 17.25 2.40641 16.6798 1 15.625L5.875 2.625ZM5.875 2.625V1"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {/* Base */}
      <svg
        aria-hidden
        className="absolute bottom-[1px] left-[11px]"
        width="19"
        height="2"
        viewBox="0 0 19 2"
        fill="none"
      >
        <path
          d="M1 1H17.25"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  </IconGlow>
);

/* Slide 3 — User with privacy indicator */
const PrivacyIcon: FC = () => (
  <IconGlow>
    <div className="relative h-[40px] w-[40px] opacity-90 flex items-center justify-center">
      <svg aria-hidden width="32" height="32" viewBox="0 0 32 32" fill="none">
        <path
          d="M25.3335 14.668V22.668"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M25.3335 17.332H28.0002"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2.6665 27.9995C2.66636 26.0088 3.22328 24.0578 4.27425 22.3672C5.32522 20.6766 6.82832 19.3138 8.61351 18.433C10.3987 17.5522 12.3947 17.1885 14.3759 17.3831C16.357 17.5777 18.2441 18.3228 19.8238 19.5341"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13.3332 17.3333C17.0151 17.3333 19.9998 14.3486 19.9998 10.6667C19.9998 6.98477 17.0151 4 13.3332 4C9.65127 4 6.6665 6.98477 6.6665 10.6667C6.6665 14.3486 9.65127 17.3333 13.3332 17.3333Z"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M25.3332 28.0013C26.8059 28.0013 27.9998 26.8074 27.9998 25.3346C27.9998 23.8619 26.8059 22.668 25.3332 22.668C23.8604 22.668 22.6665 23.8619 22.6665 25.3346C22.6665 26.8074 23.8604 28.0013 25.3332 28.0013Z"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  </IconGlow>
);

/* Slide 4 — Clipboard with question mark */
const ClipboardIcon: FC = () => (
  <IconGlow>
    <div className="relative h-[40px] w-[40px] opacity-90 flex items-center justify-center">
      <svg aria-hidden width="34" height="34" viewBox="0 0 34 34" fill="none">
        <path
          d="M21.2499 2.83203H12.7499C11.9675 2.83203 11.3333 3.46629 11.3333 4.2487V7.08203C11.3333 7.86444 11.9675 8.4987 12.7499 8.4987H21.2499C22.0323 8.4987 22.6666 7.86444 22.6666 7.08203V4.2487C22.6666 3.46629 22.0323 2.83203 21.2499 2.83203Z"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M22.6667 5.66797H25.5001C26.2515 5.66797 26.9722 5.96648 27.5036 6.49783C28.0349 7.02919 28.3334 7.74986 28.3334 8.5013V28.3346C28.3334 29.0861 28.0349 29.8068 27.5036 30.3381C26.9722 30.8695 26.2515 31.168 25.5001 31.168H8.50008C7.74863 31.168 7.02797 30.8695 6.49661 30.3381C5.96526 29.8068 5.66675 29.0861 5.66675 28.3346V8.5013C5.66675 7.74986 5.96526 7.02919 6.49661 6.49783C7.02797 5.96648 7.74863 5.66797 8.50008 5.66797H11.3334"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M16.8696 26.125H16.8827"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13.0769 15.667C13.3907 14.8021 13.9985 14.0751 14.7941 13.6129C15.5896 13.1507 16.5223 12.9829 17.429 13.1387C18.3358 13.2945 19.159 13.764 19.7546 14.4652C20.3503 15.1664 20.6805 16.0547 20.6877 16.9747C20.6877 19.5901 16.7646 20.8978 16.7646 20.8978"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  </IconGlow>
);

const slideIcons: Record<string, FC> = {
  sparkle: SparkleIcon,
  scale: ScaleIcon,
  privacy: PrivacyIcon,
  clipboard: ClipboardIcon,
};

/* ------------------------------------------------------------------ */
/*  Slide data                                                         */
/* ------------------------------------------------------------------ */
const TOTAL_STEPS = 4;
interface Slide {
  icon: string;
  heading: string;
  body: ReactNode;
}

const slides: Slide[] = [
  {
    icon: "sparkle",
    heading: "Quality In \u2192 Magic Out",
    body: (
      <>
        {/* Mobile — natural wrap */}
        <span className="md:hidden">
          LoveIQ follows a strict input–output principle: the accuracy of your report depends on the
          accuracy of your answers. Rushed or filtered responses lower signal quality; honest,
          precise responses produce clear, high-resolution insights.
        </span>
        {/* Desktop line breaks */}
        <span className="hidden md:inline">
          LoveIQ follows a strict input–output principle: the accuracy of your
          <br />
          report depends on the accuracy of your answers. Rushed or filtered
          <br />
          responses lower signal quality; honest, precise responses produce
          <br />
          clear, high-resolution insights.
        </span>
      </>
    ),
  },
  {
    icon: "scale",
    heading: "Judgment-Free Zone",
    body: (
      <>
        {/* Mobile — natural wrap */}
        <span className="md:hidden">
          This is a strictly judgment-free space. There are no good, bad, impressive, or
          embarrassing answers and no one is rating you. Don&rsquo;t answer how you should feel, how
          you wish to be seen, or what sounds mature or attractive. Answer what is actually true for
          you. The more real you are, the more precise and powerful your results will be.
        </span>
        {/* Desktop line breaks */}
        <span className="hidden md:inline">
          This is a strictly judgment-free space. There are no good, bad, impressive,
          <br />
          or embarrassing answers and no one is rating you. Don&rsquo;t answer how you
          <br />
          should feel, how you wish to be seen, or what sounds mature or
          <br />
          attractive. Answer what is actually true for you. The more real you are, the
          <br />
          more precise and powerful your results will be.
        </span>
      </>
    ),
  },
  {
    icon: "privacy",
    heading: "Your Privacy Matters",
    body: (
      <>
        {/* Mobile — natural wrap */}
        <span className="md:hidden">
          Everything can be fully anonymous and we encrypt with high security standards. If you
          prefer to remain unidentifiable, you&rsquo;re welcome to use an alias email address. Learn
          more in our{" "}
          <a
            href="/trust-zone"
            target="_blank"
            rel="noopener noreferrer"
            className="no-underline decoration-white/50 underline-offset-2 transition-all duration-300 hover:text-white hover:underline"
          >
            &gt; Trust Zone
          </a>
          .
        </span>
        {/* Desktop line breaks */}
        <span className="hidden md:inline">
          Everything can be fully anonymous and we encrypt with high security
          <br />
          standards. If you prefer to remain unidentifiable, you&rsquo;re welcome to use an
          <br />
          alias email address. Learn more in our{" "}
          <a
            href="/trust-zone"
            target="_blank"
            rel="noopener noreferrer"
            className="no-underline decoration-white/50 underline-offset-2 transition-all duration-300 hover:text-white hover:underline"
          >
            &gt; Trust Zone
          </a>
          .
        </span>
      </>
    ),
  },
  {
    icon: "clipboard",
    heading: "How the Survey Works",
    body: (
      <>
        {/* Mobile — natural wrap */}
        <span className="md:hidden">
          For ~15 min we will guide you towards the most meaningful exploration of your sexuality.
          Questions appear one at a time. Answer options are clear and simple. Dynamic Guidance
          adapts the journey to your responses.
          <br />
          <br />
          Now take a breath, trust your intuition — and enjoy the journey ahead.
        </span>
        {/* Desktop line breaks */}
        <span className="hidden md:inline">
          For ~15 min we will guide you towards the most meaningful exploration of
          <br />
          your sexuality. Questions appear one at a time. Answer options are clear
          <br />
          and simple. Dynamic Guidance adapts the journey to your responses.
          <br />
          <br />
          Now take a breath, trust your intuition — and enjoy the journey ahead.
        </span>
      </>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Screen 0 — Light intro                                             */
/* ------------------------------------------------------------------ */
const IntroScreen: FC<{
  onContinue: () => void;
  transitioning: boolean;
}> = ({ onContinue, transitioning }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !transitioning) onContinue();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onContinue, transitioning]);

  return (
    <main
      className={`relative flex flex-col items-center justify-center overflow-x-hidden px-7 sm:px-8 py-8 sm:py-10 md:py-16 ${transitioning ? "h-dvh overflow-hidden" : "min-h-dvh"}`}
      style={{
        backgroundImage: "linear-gradient(180deg, #fff 0%, rgba(250,245,255,0.3) 50%, #fff 100%)",
        paddingLeft: "max(1.75rem, env(safe-area-inset-left, 0px))",
        paddingRight: "max(1.75rem, env(safe-area-inset-right, 0px))",
      }}
    >
      <div className="relative z-10 flex w-full max-w-[700px] flex-col items-center text-center">
        {/* Text + button container — fades out during transition */}
        <div
          className="flex flex-col items-center transition-opacity duration-[600ms] ease-out"
          style={{ opacity: transitioning ? 0 : 1 }}
        >
          {/* Mobile heading */}
          <h1
            className="font-serif text-[36px] font-normal leading-[1.18] tracking-[-0.8px] text-[#1a1a2e] sm:text-[52px] sm:tracking-[-1.2px] md:hidden"
            style={{ animation: "survey-fade-up 700ms cubic-bezier(0.16,1,0.3,1) 0ms both" }}
          >
            Let&rsquo;s prepare you
            <br />
            well to discover
            <br />
            your
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, #FE6839 27.4%, #A78BFA 76.92%, #E9D5FF 100%)",
              }}
            >
              sexual archetypes
            </span>
          </h1>

          {/* Desktop heading */}
          <h1
            className="hidden font-serif font-normal leading-[1.18] text-[#1a1a2e] md:block md:text-[64px] md:leading-[1.18] md:tracking-[-1.5px]"
            style={{ animation: "survey-fade-up 700ms cubic-bezier(0.16,1,0.3,1) 0ms both" }}
          >
            Let&rsquo;s prepare you well
            <br />
            to discover your
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, #FE6839 27.4%, #A78BFA 76.92%, #E9D5FF 100%)",
              }}
            >
              sexual archetypes
            </span>
          </h1>

          {/* Mobile paragraph */}
          <p
            className="mt-8 max-w-[540px] font-sans text-[16px] font-light leading-[1.5] text-[#6a7282] sm:text-[18px] sm:leading-[29px] md:hidden"
            style={{ animation: "survey-fade-up 700ms cubic-bezier(0.16,1,0.3,1) 150ms both" }}
          >
            This short guide will help you get the most
            <br />
            meaningful and accurate results. Tap the
            <br />
            silhouette below to begin.
          </p>

          {/* Desktop paragraph */}
          <p
            className="mt-8 hidden max-w-[640px] font-sans font-light leading-[1.5] text-[#6a7282] md:block md:text-[20px]"
            style={{ animation: "survey-fade-up 700ms cubic-bezier(0.16,1,0.3,1) 150ms both" }}
          >
            This short guide will help you get the most meaningful and accurate
            <br />
            results. Tap the silhouette below to begin.
          </p>

          <button
            type="button"
            onClick={onContinue}
            disabled={transitioning}
            className="mt-10 inline-flex h-[54px] items-center justify-center gap-3 rounded-full bg-[#fe6839] px-8 text-[16px] font-bold uppercase tracking-[0.1em] text-white shadow-[0_15px_22px_rgba(254,104,57,0.2),0_6px_9px_rgba(254,104,57,0.2)] transition hover:-translate-y-[2px] hover:shadow-[0_18px_28px_rgba(254,104,57,0.28),0_8px_12px_rgba(254,104,57,0.24)] focus-visible-ring sm:h-[60px] sm:gap-4 sm:px-9 sm:text-[18px] disabled:opacity-70"
            style={{ animation: "survey-fade-up 700ms cubic-bezier(0.16,1,0.3,1) 300ms both" }}
          >
            Continue
            <ArrowRight className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </div>

        {/* Clickable avatar */}
        <div
          className="flex flex-col items-center"
          style={{ animation: "survey-fade-up 700ms cubic-bezier(0.16,1,0.3,1) 450ms both" }}
        >
          <button
            type="button"
            onClick={onContinue}
            disabled={transitioning}
            className={`group mt-12 h-[160px] w-[118px] sm:mt-10 sm:h-[200px] sm:w-[148px] md:mt-12 md:h-[240px] md:w-[177px] will-change-transform transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
              transitioning ? "scale-[6] sm:scale-[12]" : "cursor-pointer hover:scale-[1.03]"
            }`}
            aria-label="Continue to survey introduction"
          >
            <div className="relative h-[240px] w-[177px] origin-top-left scale-[0.667] sm:scale-[0.833] md:scale-100">
              {/* Hover glow — head */}
              <div className="pointer-events-none absolute left-1/2 -top-3 h-[152px] w-[140px] -translate-x-1/2 rounded-full bg-[#A78BFA] opacity-0 blur-[24px] transition-opacity duration-500 ease-out group-hover:opacity-100" />
              {/* Hover glow — body */}
              <div className="pointer-events-none absolute -bottom-3 left-1/2 h-[120px] w-[200px] -translate-x-1/2 rounded-[9999px_9999px_0_0] bg-[#A78BFA] opacity-0 blur-[24px] transition-opacity duration-500 ease-out group-hover:opacity-100" />
              <div className="absolute -left-[22px] top-0 h-[180px] w-[180px] rounded-full bg-[rgba(255,184,106,0.2)] blur-[56px]" />
              <div
                className="absolute left-1/2 top-0 h-[128px] w-[115px] -translate-x-1/2 rounded-full shadow-[0_2.813px_14.063px_0_rgba(126,87,194,0.3)]"
                style={{
                  background:
                    "radial-gradient(70.71% 70.71% at 50% 50%, #FE6839 0%, #A78BFA 79.81%, #A78BFA 100%)",
                }}
              />
              <div
                className="absolute bottom-0 left-1/2 h-[103px] w-[177px] -translate-x-1/2"
                style={{
                  borderRadius: "23592938px 23592938px 0 0",
                  background: "linear-gradient(180deg, #A78BFA 0%, #541475 68.03%)",
                }}
              />
            </div>
          </button>
          <span
            className="mt-4 font-sans text-[10px] font-bold uppercase leading-[15px] tracking-[2px] text-[#90A1B9] sm:text-[11px] sm:tracking-[2.5px] transition-opacity duration-300"
            style={
              transitioning
                ? { opacity: 0 }
                : { animation: "survey-fade-up 700ms cubic-bezier(0.16,1,0.3,1) 600ms both" }
            }
          >
            Tap to begin
          </span>
        </div>
      </div>

      {/* Dark overlay — crossfades in during transition */}
      <div
        className="pointer-events-none fixed inset-0 z-20 bg-[#0a0510] transition-opacity duration-[800ms] ease-out"
        style={{ opacity: transitioning ? 1 : 0, transitionDelay: transitioning ? "200ms" : "0ms" }}
      />
    </main>
  );
};

/* ------------------------------------------------------------------ */
/*  Dark wizard slide screen                                           */
/* ------------------------------------------------------------------ */
const SlideScreen: FC<{
  slideIndex: number;
  onContinue: () => void;
  onBack: () => void;
  onSkip: () => void;
}> = ({ slideIndex, onContinue, onBack, onSkip }) => {
  const [isLeaving, setIsLeaving] = useState(false);
  const [isLeavingForward, setIsLeavingForward] = useState(false);
  const slide = slides[slideIndex] ?? slides[0];
  const Icon = slideIcons[slide.icon] ?? SparkleIcon;

  const handleNext = useCallback(() => {
    if (isLeaving) return;
    setIsLeaving(true);
    setIsLeavingForward(true);
    setTimeout(() => {
      setIsLeaving(false);
      setIsLeavingForward(false);
      onContinue();
    }, 200);
  }, [onContinue, isLeaving]);

  const handlePrev = useCallback(() => {
    if (isLeaving) return;
    setIsLeaving(true);
    setTimeout(() => {
      setIsLeaving(false);
      onBack();
    }, 200);
  }, [onBack, isLeaving]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLeaving) return;
      if (e.key === "ArrowRight" || e.key === "Enter") handleNext();
      if (e.key === "ArrowLeft" && slideIndex > 0) handlePrev();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrev, slideIndex, isLeaving]);

  // Swipe gesture support for mobile
  const touchStartX = useRef<number | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null) return;
      const delta = touchStartX.current - e.changedTouches[0].clientX;
      touchStartX.current = null;
      if (Math.abs(delta) < 50) return;
      if (delta > 0)
        handleNext(); // swipe left → next
      else if (slideIndex > 0) handlePrev(); // swipe right → prev
    },
    [handleNext, handlePrev, slideIndex]
  );

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-[#140a1a]">
      {/* Orange corner blob */}
      <div className="pointer-events-none absolute bottom-0 left-0 -translate-x-1/2 translate-y-1/2">
        <div className="rounded-full bg-[#FE6839] w-[718px] h-[1895px] blur-[500px] sm:w-[1296px] sm:h-[1296px] animate-pulse-glow" />
      </div>
      {/* Purple corner blob */}
      <div className="pointer-events-none absolute right-0 top-0 translate-x-1/2 -translate-y-1/2">
        <div
          className="rounded-full bg-[#A78BFA] w-[653px] h-[1724px] blur-[400px] sm:w-[920px] sm:h-[920px] animate-pulse-glow"
          style={{ animationDelay: "2s", animationFillMode: "backwards" }}
        />
      </div>
      <div
        className="relative z-10 mx-auto flex w-full max-w-[1120px] flex-1 flex-col px-7 py-12 sm:px-10 sm:py-14"
        style={{
          paddingLeft: "max(1.75rem, env(safe-area-inset-left, 0px))",
          paddingRight: "max(1.75rem, env(safe-area-inset-right, 0px))",
        }}
      >
        {/* Top bar */}
        <div
          className="survey-animate flex items-center justify-between"
          style={{ animation: "survey-fade-in 600ms cubic-bezier(0.16,1,0.3,1) both" }}
        >
          <div className="flex items-center gap-4">
            <Image
              src="/favicon.svg"
              alt=""
              width={50}
              height={50}
              unoptimized
              className="h-[42px] w-[42px] rounded-full sm:h-[50px] sm:w-[50px]"
            />
            <span className="text-[12px] font-bold uppercase tracking-[1.6px] text-white/90 sm:text-[16px]">
              Identify Your Sexual Archetype
            </span>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="text-[12px] font-bold uppercase tracking-[1.2px] text-white/50 transition hover:text-white/80 focus-visible-ring"
          >
            Skip Intro
          </button>
        </div>

        {/* Slide content — key forces remount on slide change, retriggering animations */}
        <div
          key={slideIndex}
          className={`flex flex-1 flex-col justify-center py-12 sm:py-16 transition-opacity duration-200 ${isLeaving ? "opacity-0" : "opacity-100"}`}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="max-w-[294px] sm:max-w-none">
            <div
              className="survey-animate"
              style={{
                opacity: 0,
                animation: "survey-fade-up 700ms cubic-bezier(0.16,1,0.3,1) 0ms both",
              }}
            >
              <Icon />
            </div>

            <h2
              className="survey-animate mt-6 sm:mt-2 font-serif text-[36px] font-medium leading-[45px] sm:text-[52px] sm:leading-[64px] lg:text-[72px] lg:leading-[90px] text-white break-words"
              style={{
                opacity: 0,
                animation: "survey-fade-up 700ms cubic-bezier(0.16,1,0.3,1) 150ms both",
              }}
            >
              {slide.heading}
            </h2>

            <p
              className="survey-animate mt-6 max-w-[798px] lg:max-w-[880px] font-sans not-italic text-[18px] font-light leading-[29.25px] text-white/80"
              style={{
                opacity: 0,
                animation: "survey-fade-up 700ms cubic-bezier(0.16,1,0.3,1) 300ms both",
                fontVariationSettings: '"wght" 300',
              }}
            >
              {slide.body}
            </p>
          </div>
        </div>

        {/* Bottom: step bar + navigation */}
        <div
          className="survey-animate space-y-10 sm:space-y-12"
          style={{ animation: "survey-fade-in 700ms cubic-bezier(0.16,1,0.3,1) 400ms both" }}
        >
          {/* Step progress bar */}
          <div className="space-y-2">
            <div className="flex h-1 w-full max-w-[448px] gap-3">
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <div
                  key={i}
                  className="relative h-1 flex-1 overflow-hidden rounded-full"
                  style={{ background: "rgba(255,255,255,0.1)" }}
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: i <= slideIndex ? "100%" : "0%",
                      background: "#fe6839",
                      boxShadow: i <= slideIndex ? "0 0 8px rgba(254,104,57,0.5)" : "none",
                      transition: "width 500ms cubic-bezier(0.16,1,0.3,1), box-shadow 400ms ease",
                    }}
                  />
                </div>
              ))}
            </div>
            <span className="text-[12px] font-medium tracking-[0.5px] text-white/30">
              {slideIndex + 1} / {TOTAL_STEPS}
            </span>
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between">
            {/* Back button — fades in/out based on slideIndex */}
            <div
              className={`transition-opacity duration-300 ${slideIndex > 0 ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            >
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Go to previous slide"
                className="flex h-[48px] w-[48px] items-center justify-center rounded-full border border-[rgba(254,104,57,0.3)] bg-[rgba(254,104,57,0.1)] text-[#fe6839] transition hover:-translate-y-[1px] focus-visible-ring"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleNext}
              aria-label="Continue to next slide"
              className="inline-flex h-[48px] items-center gap-3 rounded-full bg-[#FE6839] px-7 sm:px-8 text-[14px] font-bold uppercase leading-[20px] tracking-[1.4px] text-white shadow-[0_10px_15px_-3px_rgba(254,104,57,0.2),0_4px_6px_-4px_rgba(254,104,57,0.2)] transition hover:-translate-y-[1px] hover:shadow-[0_14px_20px_-3px_rgba(254,104,57,0.28)] focus-visible-ring"
            >
              Continue
              <ArrowRight className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </div>

      {/* Dark overlay — crossfades in when leaving last slide for consent */}
      {slideIndex === TOTAL_STEPS - 1 && (
        <div
          className="pointer-events-none fixed inset-0 z-20 bg-[#0a0510] transition-opacity duration-200 ease-out"
          style={{ opacity: isLeavingForward ? 1 : 0 }}
        />
      )}
    </main>
  );
};

/* ------------------------------------------------------------------ */
/*  Consent screen — "Before we begin"                                 */
/* ------------------------------------------------------------------ */
const ConsentScreen: FC<{
  onAgree: () => void;
  onReturn: () => void;
}> = ({ onAgree, onReturn }) => {
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const canProceed = ageConfirmed && termsAccepted;

  const handleAgreeClick = useCallback(() => {
    setIsLeaving(true);
    setTimeout(() => onAgree(), 400);
  }, [onAgree]);

  return (
    <main
      className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4"
      style={{
        background:
          "linear-gradient(145deg, #d4a88a 0%, #c89888 25%, #b8909a 45%, #a890b0 65%, #9a8cb8 85%, #9088b0 100%)",
      }}
    >
      {/* Background gradient blobs */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="animate-pulse-glow absolute h-[140%] w-[110%] rounded-full"
          style={{
            bottom: "-40%",
            left: "-35%",
            background:
              "radial-gradient(ellipse at center, rgba(195,130,85,0.7) 0%, rgba(185,120,90,0.3) 45%, transparent 70%)",
          }}
        />
        <div
          className="animate-pulse-glow absolute h-[130%] w-[100%] rounded-full"
          style={{
            top: "-35%",
            right: "-25%",
            animationDelay: "2s",
            animationFillMode: "backwards",
            background:
              "radial-gradient(ellipse at center, rgba(155,140,195,0.7) 0%, rgba(145,130,185,0.3) 45%, transparent 70%)",
          }}
        />
      </div>

      {/* Popup card */}
      <div
        className={`survey-animate relative z-10 w-full max-w-[512px] overflow-hidden rounded-[24px] border border-[rgba(167,139,250,0.2)] bg-[rgba(19,11,28,0.9)] px-8 py-7 sm:py-10 shadow-[0_0_50px_rgba(84,20,117,0.4)] sm:px-10 transition-all duration-[400ms] ${isLeaving ? "opacity-0 scale-95" : ""}`}
        style={{ animation: "survey-scale-in 600ms cubic-bezier(0.16,1,0.3,1) 100ms both" }}
      >
        {/* 18+ badge */}
        <div className="flex justify-center">
          <div className="rounded-[14px] border border-[rgba(254,104,57,0.3)] bg-[rgba(254,104,57,0.1)] px-5 py-[11px] shadow-[0_0_20px_rgba(254,104,57,0.15)]">
            <span className="text-[24px] font-bold leading-[32px] tracking-[1.2px] text-[#fe6839]">
              18+
            </span>
          </div>
        </div>

        {/* Heading */}
        <h2 className="mt-4 sm:mt-5 text-center font-serif text-[30px] font-medium leading-[40px] text-white sm:text-[36px]">
          Before we begin
        </h2>

        {/* Subtext */}
        <p className="mt-3 text-[15px] font-light leading-[26px] text-white/70 sm:text-[16px]">
          We need your explicit consent before proceeding to the survey. Please confirm the
          following:
        </p>

        {/* Checkboxes */}
        <div className="mt-6 sm:mt-8 space-y-4">
          <div
            role="checkbox"
            aria-checked={ageConfirmed}
            tabIndex={0}
            onClick={() => setAgeConfirmed(!ageConfirmed)}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                setAgeConfirmed(!ageConfirmed);
              }
            }}
            className={`flex cursor-pointer items-start gap-4 rounded-[16px] border bg-white/5 px-4 py-4 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fe6839]/50 ${ageConfirmed ? "border-[rgba(254,104,57,0.3)]" : "border-white/10"}`}
          >
            <div
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] border transition-all duration-200 ease-out ${ageConfirmed ? "border-[#fe6839] bg-[#fe6839]" : "border-white/20 bg-[rgba(0,0,0,0.4)]"}`}
            >
              <svg
                className={`h-3.5 w-3.5 text-white transition-all duration-200 ${ageConfirmed ? "scale-100 opacity-100" : "scale-50 opacity-0"}`}
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M11.6667 3.5L5.25 9.91667L2.33333 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-[15px] font-medium leading-[24px] text-white/90 sm:text-[16px]">
              I confirm that I am 18 years of age or older.
            </span>
          </div>

          <div
            role="checkbox"
            aria-checked={termsAccepted}
            tabIndex={0}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a")) return;
              setTermsAccepted(!termsAccepted);
            }}
            onKeyDown={(e) => {
              if ((e.target as HTMLElement).closest("a")) return;
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                setTermsAccepted(!termsAccepted);
              }
            }}
            className={`flex cursor-pointer items-start gap-4 rounded-[16px] border bg-white/5 px-4 py-4 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fe6839]/50 ${termsAccepted ? "border-[rgba(254,104,57,0.3)]" : "border-white/10"}`}
          >
            <div
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] border transition-all duration-200 ease-out ${termsAccepted ? "border-[#fe6839] bg-[#fe6839]" : "border-white/20 bg-[rgba(0,0,0,0.4)]"}`}
            >
              <svg
                className={`h-3.5 w-3.5 text-white transition-all duration-200 ${termsAccepted ? "scale-100 opacity-100" : "scale-50 opacity-0"}`}
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M11.6667 3.5L5.25 9.91667L2.33333 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-[15px] font-medium leading-[24px] text-white/90 sm:text-[16px]">
              I have read and agree to the{" "}
              <Link
                href="/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#A78BFA] no-underline decoration-white/50 underline-offset-2 transition-all duration-300 hover:text-white hover:underline"
              >
                Privacy Policy
              </Link>
              ,{" "}
              <Link
                href="/terms-and-conditions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#A78BFA] no-underline decoration-white/50 underline-offset-2 transition-all duration-300 hover:text-white hover:underline"
              >
                Terms &amp; Conditions
              </Link>
              ,{" "}
              <Link
                href="/terms-of-use"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#A78BFA] no-underline decoration-white/50 underline-offset-2 transition-all duration-300 hover:text-white hover:underline"
              >
                Terms of Use
              </Link>
              ,{" "}
              <Link
                href="/digital-content-terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#A78BFA] no-underline decoration-white/50 underline-offset-2 transition-all duration-300 hover:text-white hover:underline"
              >
                Digital Content &amp; Subscription Terms
              </Link>{" "}
              and{" "}
              <Link
                href="/medical-disclaimer"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#A78BFA] no-underline decoration-white/50 underline-offset-2 transition-all duration-300 hover:text-white hover:underline"
              >
                Medical &amp; Psychological Disclaimer
              </Link>
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-6 sm:mt-8 flex gap-4">
          <button
            type="button"
            onClick={onReturn}
            className="flex-1 rounded-full border border-white/10 py-[15px] text-[14px] font-bold leading-[20px] tracking-[0.7px] text-white/60 transition hover:border-white/20 hover:text-white/80 focus-visible-ring"
          >
            Return to site
          </button>
          <button
            type="button"
            onClick={handleAgreeClick}
            disabled={!canProceed || isLeaving}
            className="flex-1 rounded-full border border-white/10 bg-white/5 py-[15px] text-[14px] font-bold leading-[20px] tracking-[0.7px] shadow-[0_10px_15px_rgba(0,0,0,0.1),0_4px_6px_rgba(0,0,0,0.1)] transition focus-visible-ring disabled:text-white/40 enabled:bg-[#fe6839] enabled:text-white enabled:hover:-translate-y-[1px]"
          >
            I agree
          </button>
        </div>
      </div>
    </main>
  );
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function loadInitialStep(): number {
  if (typeof window === "undefined") return 0;

  try {
    if (loadPendingCompletion()) {
      return TOTAL_STEPS + 2;
    }
  } catch {
    /* blocked or unavailable */
  }

  // 1. Try sessionStorage (same-tab refresh)
  try {
    const stored = sessionStorage.getItem(SURVEY_STEP_KEY);
    if (stored !== null) {
      const parsed = parseInt(stored, 10);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= TOTAL_STEPS + 2) {
        return parsed;
      }
    }
  } catch {
    /* blocked or unavailable */
  }

  // 2. If localStorage has answers, skip to engine (returning user)
  try {
    const raw = localStorage.getItem(ANSWERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.answers && Object.keys(parsed.answers).length > 0) {
        return TOTAL_STEPS + 2; // step 6 = engine
      }
    }
  } catch {
    /* corrupted or unavailable */
  }

  return 0;
}

/* ------------------------------------------------------------------ */
/*  Root — orchestrates all steps                                      */
/* ------------------------------------------------------------------ */
const SurveyPage: FC = () => {
  // 0 = intro, 1–4 = slides, 5 = consent, 6 = engine
  const [step, setStep] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const isPopStateNav = useRef(false);

  // Restore step from sessionStorage on mount (hydration-safe).
  // setState in a mount-only effect is intentional here — we need to read
  // sessionStorage after hydration to avoid SSR/client mismatch.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const restored = loadInitialStep();
    if (restored !== 0) setStep(restored);
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Persist step to sessionStorage on every change
  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(SURVEY_STEP_KEY, String(step));
    } catch {
      /* ignore */
    }
  }, [step, hydrated]);

  // Push history entry on forward navigation
  useEffect(() => {
    if (isPopStateNav.current) {
      isPopStateNav.current = false;
      return;
    }
    if (step > 0) {
      window.history.pushState({ surveyStep: step }, "");
    }
  }, [step]);

  // Handle browser back button
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      isPopStateNav.current = true;
      const prevStep = e.state?.surveyStep;
      setStep(prevStep !== undefined ? prevStep : 0);
      setTransitioning(false);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleIntroContinue = useCallback(() => {
    setTransitioning(true);
    setTimeout(() => {
      setStep(1);
      setTransitioning(false);
    }, 1200);
  }, []);

  const handleSlideContinue = useCallback(() => {
    setStep((s) => s + 1);
  }, []);

  const handleSlideBack = useCallback(() => {
    setStep((s) => Math.max(1, s - 1));
  }, []);

  const handleSkip = useCallback(() => {
    setStep(TOTAL_STEPS + 1); // jump to consent
  }, []);

  const handleReturn = useCallback((clearAnswers?: boolean) => {
    try {
      if (clearAnswers) {
        copySurveySessionToReportSession();
        clearPersistedSurveyState({
          clearPendingCompletion: true,
          clearSurveySession: false,
        });
      }
      sessionStorage.removeItem(SURVEY_STEP_KEY);
    } catch {
      /* ignore */
    }
    window.location.href = clearAnswers ? "/report" : "/";
  }, []);

  const handleAgree = useCallback(() => {
    setStep(TOTAL_STEPS + 2);
  }, []);

  // Wait for hydration before rendering to avoid flash
  if (!hydrated) return null;

  // Intro screen
  if (step === 0) {
    return <IntroScreen onContinue={handleIntroContinue} transitioning={transitioning} />;
  }

  // Wizard slides
  const slideIndex = step - 1;
  if (slideIndex < TOTAL_STEPS) {
    return (
      <SlideScreen
        slideIndex={slideIndex}
        onContinue={handleSlideContinue}
        onBack={handleSlideBack}
        onSkip={handleSkip}
      />
    );
  }

  // Consent screen
  if (step === TOTAL_STEPS + 1) {
    return <ConsentScreen onAgree={handleAgree} onReturn={handleReturn} />;
  }

  // Survey engine
  return <SurveyEngine onExit={() => handleReturn()} onComplete={() => handleReturn(true)} />;
};

export default SurveyPage;
