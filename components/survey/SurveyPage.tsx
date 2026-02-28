"use client";

import { useState, useCallback, useEffect, useRef, type FC, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

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
      className="absolute -left-1 -top-1 rounded-full"
      style={{
        width: "47.997px",
        height: "47.997px",
        background: "rgba(167, 139, 250, 0.50)",
        filter: "blur(20px)",
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

/* Slide 3 — User with key / privacy */
const PrivacyIcon: FC = () => (
  <IconGlow>
    <div className="relative h-[40px] w-[40px] opacity-90 flex items-end">
      {/* Person — head + body, left side */}
      <svg aria-hidden width="16" height="28" viewBox="0 0 16 28" fill="none" className="shrink-0">
        {/* Head — centered at x=8 */}
        <circle
          cx="8"
          cy="7"
          r="6"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Body arc — shoulders, trimmed to not extend too far right */}
        <path
          d="M1 27C1 24.6 1.5 22.8 2.5 21.3C3.5 19.8 4.9 18.6 6.5 17.8C8.1 17 9.8 16.8 11.5 17C13.2 17.2 14.5 17.7 15 18.2"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {/* Key — flipped upward: tooth + shaft + ring (bottom to top), right side */}
      <svg
        aria-hidden
        width="8"
        height="22"
        viewBox="0 0 8 22"
        fill="none"
        className="shrink-0 ml-[2px]"
      >
        {/* Shaft going up */}
        <path
          d="M4 21V7"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Tooth pointing left */}
        <path
          d="M4 10H1"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Ring at top */}
        <circle
          cx="4"
          cy="4"
          r="3"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  </IconGlow>
);

/* Slide 4 — Clipboard */
const ClipboardIcon: FC = () => (
  <IconGlow>
    <div className="relative h-[40px] w-[40px] opacity-90">
      {/* Clipboard body */}
      <svg
        aria-hidden
        className="absolute left-[5px] top-[4px]"
        width="25"
        height="28"
        viewBox="0 0 25 28"
        fill="none"
      >
        <path
          d="M18 1H20.8333C21.5848 1 22.3055 1.29851 22.8368 1.82986C23.3682 2.36122 23.6667 3.08189 23.6667 3.83333V23.6667C23.6667 24.4181 23.3682 25.1388 22.8368 25.6701C22.3055 26.2015 21.5848 26.5 20.8333 26.5H3.83333C3.08189 26.5 2.36122 26.2015 1.82986 25.6701C1.29851 25.1388 1 24.4181 1 23.6667V3.83333C1 3.08189 1.29851 2.36122 1.82986 1.82986C2.36122 1.29851 3.08189 1 3.83333 1H6.66667"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {/* Clipboard tab */}
      <svg
        aria-hidden
        className="absolute left-[11px] top-[1px]"
        width="14"
        height="8"
        viewBox="0 0 14 8"
        fill="none"
      >
        <path
          d="M10.9167 1H2.41667C1.63426 1 1 1.63426 1 2.41667V5.25C1 6.0324 1.63426 6.66667 2.41667 6.66667H10.9167C11.6991 6.66667 12.3333 6.0324 12.3333 5.25V2.41667C12.3333 1.63426 11.6991 1 10.9167 1Z"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {/* Question mark — clean ?, centered in clipboard */}
      <svg
        aria-hidden
        className="absolute left-[12px] top-[13px]"
        width="10"
        height="16"
        viewBox="0 0 10 16"
        fill="none"
      >
        <path
          d="M1 4C1 2.34315 2.34315 1 4 1H5C6.65685 1 8 2.34315 8 4C8 5.65685 6.65685 7 5 7V9"
          stroke="#F7F5F7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="5" cy="13" r="1.2" fill="#F7F5F7" />
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
    body: "LoveIQ follows a strict input\u2013output principle: the accuracy of your report depends on the accuracy of your answers. Rushed or filtered responses lower signal quality; honest, precise responses produce clear, high-resolution insights.",
  },
  {
    icon: "scale",
    heading: "Judgment-Free Zone",
    body: (
      <>
        This is a strictly judgment-free space. There are no good, bad, impressive,
        <br className="hidden lg:inline" /> or embarrassing answers and no one is rating you.
        Don&rsquo;t answer how you
        <br className="hidden lg:inline" /> should feel, how you wish to be seen, or what sounds
        mature or
        <br className="hidden lg:inline" /> attractive. Answer what is actually true for you. The
        more real you are, the
        <br className="hidden lg:inline" /> more precise and powerful your results will be.
      </>
    ),
  },
  {
    icon: "privacy",
    heading: "Your Privacy Matters",
    body: (
      <>
        Everything can be fully anonymous and we encrypt with high security standards. If you prefer
        to remain completely unidentifiable, you&rsquo;re welcome to use an alias email address.{" "}
        <span className="inline-block">
          Learn more in our{" "}
          <Link
            href="/trust-zone"
            className="font-extrabold text-white transition-colors duration-300 hover:text-[#fe6839] hover:underline hover:decoration-[#fe6839]"
          >
            &gt; Trust Zone.
          </Link>
        </span>
      </>
    ),
  },
  {
    icon: "clipboard",
    heading: "How the Survey Works",
    body: (
      <>
        Questions appear one at a time. Answer options are clear and simple. Dynamic Guidance adapts
        the journey to your responses.
        <br />
        <br />
        Now take a breath, trust your intuition — and enjoy the journey ahead.
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
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-16"
      style={{
        backgroundImage: "linear-gradient(180deg, #fff 0%, rgba(250,245,255,0.3) 50%, #fff 100%)",
      }}
    >
      <div className="relative z-10 flex w-full max-w-[700px] flex-col items-center text-center">
        {/* Text + button container — fades out during transition */}
        <div
          className="flex flex-col items-center transition-opacity duration-[600ms] ease-out"
          style={{ opacity: transitioning ? 0 : 1 }}
        >
          <h1
            className="font-serif text-[36px] font-normal leading-[1.18] tracking-[-0.8px] text-[#1a1a2e] sm:text-[52px] sm:tracking-[-1.2px] md:text-[64px] md:leading-[1.18] md:tracking-[-1.5px]"
            style={{ animation: "survey-fade-up 700ms cubic-bezier(0.16,1,0.3,1) 0ms both" }}
          >
            Let&rsquo;s prepare you well to discover
            <br />
            <span className="whitespace-nowrap">
              your{" "}
              <span className="bg-gradient-to-r from-[#fe6839] from-[27%] via-[#a78bfa] via-[77%] to-[#e9d5ff] bg-clip-text text-transparent">
                sexual archetypes
              </span>
            </span>
          </h1>

          <p
            className="mt-8 max-w-[540px] font-sans text-[16px] font-light leading-[1.5] text-[#6a7282] sm:text-[18px] sm:leading-[29px] md:text-[20px]"
            style={{ animation: "survey-fade-up 700ms cubic-bezier(0.16,1,0.3,1) 150ms both" }}
          >
            This short guide will help you get the most meaningful and accurate
            <br />
            <span className="whitespace-nowrap">results. The survey takes about 15 minutes.</span>
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
        <div style={{ animation: "survey-fade-up 700ms cubic-bezier(0.16,1,0.3,1) 450ms both" }}>
          <button
            type="button"
            onClick={onContinue}
            disabled={transitioning}
            className={`relative mt-12 h-[240px] w-[177px] sm:mt-16 will-change-transform transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
              transitioning ? "scale-[6] sm:scale-[12]" : "cursor-pointer hover:scale-[1.03]"
            }`}
            aria-label="Continue to survey introduction"
          >
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
          </button>
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
    <main
      className="relative flex min-h-screen flex-col overflow-hidden"
      style={{
        background: `
          radial-gradient(ellipse 140% 140% at 0% 100%, #FE6839 0%, rgba(254,104,57,0.4) 30%, transparent 65%),
          radial-gradient(ellipse 140% 140% at 100% 0%, #A78BFA 0%, rgba(167,139,250,0.35) 30%, transparent 65%),
          #140a1a
        `,
      }}
    >
      <div className="relative z-10 mx-auto flex w-full max-w-[1120px] flex-1 flex-col px-5 py-12 sm:px-10 sm:py-14">
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
            className="survey-animate mt-2 font-serif text-[36px] font-medium leading-[44px] sm:text-[52px] sm:leading-[64px] lg:text-[72px] lg:leading-[90px] text-white"
            style={{
              opacity: 0,
              animation: "survey-fade-up 700ms cubic-bezier(0.16,1,0.3,1) 150ms both",
            }}
          >
            {slide.heading}
          </h2>

          <p
            className="survey-animate mt-4 sm:mt-8 max-w-[798px] lg:max-w-[880px] font-sans text-[16px] font-normal leading-[26px] sm:text-[20px] sm:leading-[32px] lg:text-[24px] lg:leading-[39px] text-white/80"
            style={{
              opacity: 0,
              animation: "survey-fade-up 700ms cubic-bezier(0.16,1,0.3,1) 300ms both",
            }}
          >
            {slide.body}
          </p>
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
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4"
      style={{
        background:
          "linear-gradient(145deg, #d4a88a 0%, #c89888 25%, #b8909a 45%, #a890b0 65%, #9a8cb8 85%, #9088b0 100%)",
      }}
    >
      {/* Background gradient blobs */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute h-[140%] w-[110%] rounded-full"
          style={{
            bottom: "-40%",
            left: "-35%",
            background:
              "radial-gradient(ellipse at center, rgba(195,130,85,0.7) 0%, rgba(185,120,90,0.3) 45%, transparent 70%)",
          }}
        />
        <div
          className="absolute h-[130%] w-[100%] rounded-full"
          style={{
            top: "-35%",
            right: "-25%",
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
                className="no-underline decoration-white/50 underline-offset-2 transition-all duration-300 hover:text-white hover:underline"
              >
                Privacy Policy
              </Link>
              ,{" "}
              <Link
                href="/terms-and-conditions"
                className="no-underline decoration-white/50 underline-offset-2 transition-all duration-300 hover:text-white hover:underline"
              >
                Terms &amp; Conditions
              </Link>
              ,{" "}
              <Link
                href="/terms-of-use"
                className="no-underline decoration-white/50 underline-offset-2 transition-all duration-300 hover:text-white hover:underline"
              >
                Terms of Use
              </Link>
              ,{" "}
              <Link
                href="/digital-content-terms"
                className="no-underline decoration-white/50 underline-offset-2 transition-all duration-300 hover:text-white hover:underline"
              >
                Digital Content &amp; Subscription Terms
              </Link>{" "}
              and{" "}
              <Link
                href="/medical-disclaimer"
                className="no-underline decoration-white/50 underline-offset-2 transition-all duration-300 hover:text-white hover:underline"
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
/*  Root — orchestrates all steps                                      */
/* ------------------------------------------------------------------ */
const SurveyPage: FC = () => {
  // 0 = intro, 1–4 = slides, 5 = consent
  const [step, setStep] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const isPopStateNav = useRef(false);

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

  const handleReturn = useCallback(() => {
    window.location.href = "/";
  }, []);

  const handleAgree = useCallback(() => {
    // Placeholder — will navigate to actual survey when ready
    setStep(TOTAL_STEPS + 2);
  }, []);

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

  // Post-consent placeholder
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0510] text-white">
      <p className="text-lg text-white/60">Survey coming soon...</p>
    </main>
  );
};

export default SurveyPage;
