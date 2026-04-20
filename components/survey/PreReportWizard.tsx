"use client";

import { useState, useCallback, useEffect, useRef, type FC, type ReactNode } from "react";
import Image from "next/image";

/* ------------------------------------------------------------------ */
/*  Arrow icons                                                        */
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
/*  Icon components with purple glow                                   */
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

/* Sparkle icon — slides 1 & 4 */
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

/* Scale / balance icon — slide 2 */
const ScaleIcon: FC = () => (
  <IconGlow>
    <div className="relative h-[40px] w-[40px] opacity-90">
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

/* User with key icon — slides 3 & 5 */
const UserKeyIcon: FC = () => (
  <IconGlow>
    <div className="relative flex h-[40px] w-[40px] items-center justify-center opacity-90">
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

/* ------------------------------------------------------------------ */
/*  Slide data                                                         */
/* ------------------------------------------------------------------ */
const TOTAL_SLIDES = 5;

interface Slide {
  icon: FC;
  heading: string;
  body: ReactNode;
}

const slides: Slide[] = [
  {
    icon: SparkleIcon,
    heading: "A note before you explore your report.",
    body: (
      <>
        <strong>Congratulations on completing your test.</strong> Your openness and persistence made
        the upcoming report possible. Your report is{" "}
        <strong>based on +60 responses you shared</strong> and draws on insights from over +100
        scientific papers and books.{" "}
        <strong>The results are designed to help you better understand yourself and grow.</strong>
      </>
    ),
  },
  {
    icon: ScaleIcon,
    heading: "Take only what resonates.",
    body: (
      <>
        This report offers perspectives, patterns, and possibilities — not rigid definitions.{" "}
        <strong>Keep only what feels meaningful and useful for your life.</strong> Let the insights
        that resonate guide your self-understanding and growth.
      </>
    ),
  },
  {
    icon: UserKeyIcon,
    heading: "Rate each report section.",
    body: (
      <>
        Your feedback helps us improve the experience and refine the insights we provide to you
        personally in the future.{" "}
        <strong>As you go through the report, please rate each section</strong> to let us know what
        was helpful, surprising, or meaningful.
      </>
    ),
  },
  {
    icon: SparkleIcon,
    heading: "Share your report with your partner.",
    body: (
      <>
        <strong>Sharing your report can open powerful conversations</strong> about desire, needs,
        boundaries, and intimacy. When partners understand each other more deeply, connection,
        trust, and attraction often grow.
      </>
    ),
  },
  {
    icon: UserKeyIcon,
    heading: "Invite your friends to grow.",
    body: (
      <>
        Many people discover new insights when exploring these topics together. Invite friends to
        take this survey as well and to explore their own report.
      </>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  PreReportWizard                                                    */
/* ------------------------------------------------------------------ */
interface PreReportWizardProps {
  onComplete: () => void;
}

const PreReportWizard: FC<PreReportWizardProps> = ({ onComplete }) => {
  const [slideIndex, setSlideIndex] = useState(0);
  const [isLeaving, setIsLeaving] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // Entrance fade-in
  useEffect(() => {
    const raf = requestAnimationFrame(() => setHasEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const slide = slides[slideIndex];
  const Icon = slide.icon;

  const handleNext = useCallback(() => {
    if (isLeaving) return;
    setIsLeaving(true);
    setTimeout(() => {
      setIsLeaving(false);
      if (slideIndex >= TOTAL_SLIDES - 1) {
        setIsExiting(true);
        setTimeout(onComplete, 600);
      } else {
        setSlideIndex((i) => i + 1);
      }
    }, 250);
  }, [slideIndex, onComplete, isLeaving]);

  const handlePrev = useCallback(() => {
    if (isLeaving || slideIndex === 0) return;
    setIsLeaving(true);
    setTimeout(() => {
      setIsLeaving(false);
      setSlideIndex((i) => i - 1);
    }, 250);
  }, [slideIndex, isLeaving]);

  const handleSkip = useCallback(() => {
    setIsExiting(true);
    setTimeout(onComplete, 600);
  }, [onComplete]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLeaving) return;
      if (e.key === "ArrowRight" || e.key === "Enter") handleNext();
      if (e.key === "ArrowLeft" && slideIndex > 0) handlePrev();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrev, slideIndex, isLeaving]);

  // Touch swipe — only trigger on primarily horizontal gestures
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;
      const deltaX = touchStartX.current - e.changedTouches[0].clientX;
      const deltaY = touchStartY.current - e.changedTouches[0].clientY;
      touchStartX.current = null;
      touchStartY.current = null;
      if (Math.abs(deltaX) < 50) return;
      // Ignore if gesture is more vertical than horizontal
      if (Math.abs(deltaY) >= Math.abs(deltaX)) return;
      if (deltaX > 0) handleNext();
      else if (slideIndex > 0) handlePrev();
    },
    [handleNext, handlePrev, slideIndex]
  );

  return (
    <main
      className="relative flex min-h-screen flex-col overflow-hidden bg-[#140a1a]"
      style={{
        touchAction: "pan-y",
        opacity: isExiting ? 0 : hasEntered ? 1 : 0,
        transition: isExiting
          ? "opacity 600ms cubic-bezier(0.16, 1, 0.3, 1)"
          : "opacity 800ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* Orange corner blob */}
      <div className="pointer-events-none absolute bottom-0 left-0 -translate-x-1/2 translate-y-1/2">
        <div className="h-[1895px] w-[718px] animate-pulse-glow rounded-full bg-[#FE6839] blur-[500px] sm:h-[1296px] sm:w-[1296px]" />
      </div>
      {/* Purple corner blob */}
      <div className="pointer-events-none absolute right-0 top-0 translate-x-1/2 -translate-y-1/2">
        <div
          className="h-[1724px] w-[653px] animate-pulse-glow rounded-full bg-[#A78BFA] blur-[400px] sm:h-[920px] sm:w-[920px]"
          style={{ animationDelay: "2s", animationFillMode: "backwards" }}
        />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[1120px] flex-1 flex-col px-6 py-12 sm:px-10 sm:py-14">
        {/* Top bar */}
        <div
          className="flex items-center justify-between"
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
            onClick={handleSkip}
            className="text-[12px] font-bold uppercase tracking-[1.2px] text-white/50 transition hover:text-white/80 focus-visible-ring"
          >
            Skip Intro
          </button>
        </div>

        {/* Slide content — key forces remount to retrigger animations */}
        <div
          key={slideIndex}
          className="flex flex-1 flex-col justify-center py-12 sm:py-16"
          style={{
            opacity: isLeaving ? 0 : 1,
            transform: isLeaving ? "translateY(-8px)" : "translateY(0)",
            transition:
              "opacity 250ms cubic-bezier(0.16, 1, 0.3, 1), transform 250ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="max-w-[294px] sm:max-w-none">
            <div
              style={{
                opacity: 0,
                animation: "survey-fade-up 700ms cubic-bezier(0.16,1,0.3,1) 0ms both",
              }}
            >
              <Icon />
            </div>

            <h2
              className="mt-6 font-serif text-[36px] font-medium leading-[45px] text-white sm:mt-2 sm:text-[52px] sm:leading-[64px] lg:text-[72px] lg:leading-[90px]"
              style={{
                opacity: 0,
                animation: "survey-fade-up 700ms cubic-bezier(0.16,1,0.3,1) 150ms both",
              }}
            >
              {slide.heading}
            </h2>

            <p
              className="mt-6 max-w-[798px] lg:max-w-[880px] font-sans not-italic text-[18px] font-light leading-[29.25px] text-white/80 [&_strong]:font-bold [&_strong]:text-white"
              style={{
                fontVariationSettings: '"wght" 300',
                opacity: 0,
                animation: "survey-fade-up 700ms cubic-bezier(0.16,1,0.3,1) 300ms both",
              }}
            >
              {slide.body}
            </p>
          </div>
        </div>

        {/* Bottom: step bar + navigation */}
        <div
          className="space-y-10 sm:space-y-12"
          style={{ animation: "survey-fade-in 700ms cubic-bezier(0.16,1,0.3,1) 400ms both" }}
        >
          {/* Step progress bar */}
          <div className="space-y-2">
            <div className="flex h-1 w-full max-w-[448px] gap-3">
              {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
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
              {slideIndex + 1} / {TOTAL_SLIDES}
            </span>
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between">
            {/* Back button */}
            <div
              className={`transition-opacity duration-300 ${slideIndex > 0 ? "opacity-100" : "pointer-events-none opacity-0"}`}
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
              aria-label={
                slideIndex >= TOTAL_SLIDES - 1 ? "View your report" : "Continue to next slide"
              }
              className="inline-flex h-[48px] items-center gap-3 rounded-full bg-[#FE6839] px-7 text-[14px] font-bold uppercase leading-[20px] tracking-[1.4px] text-white shadow-[0_10px_15px_-3px_rgba(254,104,57,0.2),0_4px_6px_-4px_rgba(254,104,57,0.2)] transition hover:-translate-y-[1px] hover:shadow-[0_14px_20px_-3px_rgba(254,104,57,0.28)] focus-visible-ring sm:px-8"
            >
              {slideIndex >= TOTAL_SLIDES - 1 ? "View Report" : "Continue"}
              <ArrowRight className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </div>
    </main>
  );
};

export default PreReportWizard;
