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
  <div
    className="relative flex-shrink-0"
    style={{ width: "80px", height: "80px", aspectRatio: "1/1" }}
  >
    <div
      className="pointer-events-none absolute rounded-full"
      style={{
        width: "176px",
        height: "176px",
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

/* Slide 1 — report / document icon */
const Slide1Icon: FC = () => (
  <IconGlow>
    <svg
      aria-hidden
      className="relative opacity-90"
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6.6665 20H19.9998"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.6665 33.3335H19.9998"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.6665 46.6665H19.9998"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.6665 60H19.9998"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M60.0002 6.6665H20.0002C16.3183 6.6665 13.3335 9.65127 13.3335 13.3332V66.6665C13.3335 70.3484 16.3183 73.3332 20.0002 73.3332H60.0002C63.6821 73.3332 66.6668 70.3484 66.6668 66.6665V13.3332C66.6668 9.65127 63.6821 6.6665 60.0002 6.6665Z"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M31.6665 26.6665H48.3332"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M31.6665 40H53.3332"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M31.6665 53.3335H46.6665"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </IconGlow>
);

/* Slide 2 — user profile in frame */
const Slide2Icon: FC = () => (
  <IconGlow>
    <svg
      aria-hidden
      className="relative opacity-90"
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M60 70C60 64.6957 57.8929 59.6086 54.1421 55.8579C50.3914 52.1071 45.3043 50 40 50C34.6957 50 29.6086 52.1071 25.8579 55.8579C22.1071 59.6086 20 64.6957 20 70"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M39.9998 50.0002C47.3636 50.0002 53.3332 44.0306 53.3332 36.6668C53.3332 29.303 47.3636 23.3335 39.9998 23.3335C32.636 23.3335 26.6665 29.303 26.6665 36.6668C26.6665 44.0306 32.636 50.0002 39.9998 50.0002Z"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M63.3333 10H16.6667C12.9848 10 10 12.9848 10 16.6667V63.3333C10 67.0152 12.9848 70 16.6667 70H63.3333C67.0152 70 70 67.0152 70 63.3333V16.6667C70 12.9848 67.0152 10 63.3333 10Z"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </IconGlow>
);

/* Slide 3 — thumbs up */
const Slide3Icon: FC = () => (
  <IconGlow>
    <svg
      aria-hidden
      className="relative opacity-90"
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M49.9998 19.5998L46.6665 33.3332H66.0998C67.1348 33.3332 68.1556 33.5741 69.0813 34.037C70.007 34.4998 70.8122 35.1719 71.4332 35.9998C72.0542 36.8278 72.4738 37.789 72.659 38.8073C72.8441 39.8255 72.7896 40.8729 72.4998 41.8665L64.7332 68.5332C64.3293 69.9179 63.4871 71.1344 62.3332 71.9998C61.1792 72.8653 59.7756 73.3332 58.3332 73.3332H13.3332C11.5651 73.3332 9.86937 72.6308 8.61913 71.3805C7.36888 70.1303 6.6665 68.4346 6.6665 66.6665V39.9998C6.6665 38.2317 7.36888 36.536 8.61913 35.2858C9.86937 34.0356 11.5651 33.3332 13.3332 33.3332H22.5332C23.7735 33.3325 24.989 32.9859 26.043 32.3322C27.0971 31.6786 27.9479 30.7439 28.4998 29.6332L39.9998 6.6665C41.5718 6.68597 43.119 7.0604 44.5259 7.76182C45.9327 8.46325 47.1629 9.47353 48.1245 10.7172C49.0861 11.9608 49.7542 13.4057 50.079 14.9438C50.4037 16.482 50.3766 18.0736 49.9998 19.5998Z"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M23.3335 33.3335V73.3335"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </IconGlow>
);

/* Slide 4 — heart with plus */
const Slide4Icon: FC = () => (
  <IconGlow>
    <svg
      aria-hidden
      className="relative opacity-90"
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M48.2634 64.5798L45.0268 67.7098C44.4056 68.4232 43.6398 68.9962 42.7802 69.3908C41.9206 69.7854 40.9869 69.9926 40.041 69.9986C39.0952 70.0046 38.1589 69.8093 37.2944 69.4256C36.4298 69.0419 35.6568 68.4786 35.0268 67.7731L16.6667 49.9998C11.6667 44.9998 6.66675 39.3331 6.66675 31.6665C6.66682 27.9571 7.79206 24.3351 9.89386 21.2787C11.9957 18.2223 14.9751 15.8753 18.4388 14.5478C21.9024 13.2203 25.6873 12.9746 29.2935 13.8433C32.8996 14.712 36.1575 16.6541 38.6367 19.4131C38.8114 19.5999 39.0225 19.7487 39.257 19.8505C39.4915 19.9522 39.7444 20.0048 40.0001 20.0048C40.2557 20.0048 40.5086 19.9522 40.7432 19.8505C40.9777 19.7487 41.1888 19.5999 41.3634 19.4131C43.8349 16.6361 47.0935 14.6777 50.7055 13.7985C54.3176 12.9193 58.1117 13.161 61.583 14.4914C65.0543 15.8219 68.038 18.178 70.1371 21.2461C72.2362 24.3143 73.3511 27.949 73.3334 31.6665C73.3324 33.3487 73.0865 35.0218 72.6034 36.6331"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M50 50H70"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M60 40V60"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </IconGlow>
);

/* Slide 5 — user with plus */
const Slide5Icon: FC = () => (
  <IconGlow>
    <svg
      aria-hidden
      className="relative opacity-90"
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6.66669 70.0002C6.66641 64.8679 8.14714 59.8446 10.9312 55.5331C13.7152 51.2216 17.6843 47.8051 22.362 45.6936C27.0398 43.582 32.2275 42.8652 37.3026 43.6291C42.3776 44.393 47.1245 46.6052 50.9734 50.0002"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M33.3334 43.3333C42.5381 43.3333 50 35.8714 50 26.6667C50 17.4619 42.5381 10 33.3334 10C24.1286 10 16.6667 17.4619 16.6667 26.6667C16.6667 35.8714 24.1286 43.3333 33.3334 43.3333Z"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M63.3333 53.3335V73.3335"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M73.3333 63.3335H53.3333"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
    icon: Slide1Icon,
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
    icon: Slide2Icon,
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
    icon: Slide3Icon,
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
    icon: Slide4Icon,
    heading: "Share your report with someone you care about.",
    body: (
      <>
        <strong>Sharing your report can open powerful conversations</strong> about desire, needs,
        boundaries, and intimacy. When partners or counterparts understand each other more deeply,
        connection, trust, and attraction often grow.
      </>
    ),
  },
  {
    icon: Slide5Icon,
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
        <div
          className="h-[1895px] w-[718px] animate-pulse-glow-opacity rounded-full bg-[#FE6839] blur-[500px] sm:h-[1296px] sm:w-[1296px]"
          style={{ willChange: "opacity", transform: "translateZ(0)" }}
        />
      </div>
      {/* Purple corner blob */}
      <div className="pointer-events-none absolute right-0 top-0 translate-x-1/2 -translate-y-1/2">
        <div
          className="h-[1724px] w-[653px] animate-pulse-glow-opacity rounded-full bg-[#A78BFA] blur-[400px] sm:h-[920px] sm:w-[920px]"
          style={{
            animationDelay: "2s",
            animationFillMode: "backwards",
            willChange: "opacity",
            transform: "translateZ(0)",
          }}
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
