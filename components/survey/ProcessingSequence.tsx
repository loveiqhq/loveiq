"use client";

import { useState, useEffect, useRef, useCallback, type FC } from "react";

/* ------------------------------------------------------------------ */
/*  Step configuration                                                 */
/* ------------------------------------------------------------------ */
interface ProcessingStep {
  icon: FC<{ className?: string }>;
  message: string;
  percent: number;
  /** Minimum ms this step stays visible */
  durationMs: number;
}

const EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
const FADE_OUT_MS = 500;
const FADE_IN_MS = 600;
const EXIT_FADE_MS = 800;

/* ------------------------------------------------------------------ */
/*  SVG Icons (matching Figma exactly)                                 */
/* ------------------------------------------------------------------ */
const CheckSquareIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const FileUserIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <circle cx="12" cy="13" r="2" />
    <path d="M16 19c0-1.657-1.79-3-4-3s-4 1.343-4 3" />
  </svg>
);

const FilePenIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 22h6a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v10" />
    <path d="M14 2v6h6" />
    <path d="m2 21.5 3.5-1L15 11l-2-2L3.5 18.5Z" />
  </svg>
);

const LockIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const MailIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Steps data                                                         */
/* ------------------------------------------------------------------ */
const STEPS: ProcessingStep[] = [
  {
    icon: CheckSquareIcon,
    message: "Extracting your answers...",
    percent: 21,
    durationMs: 2400,
  },
  {
    icon: FileUserIcon,
    message: "Scoring your answers against our archetypes...",
    percent: 41,
    durationMs: 2800,
  },
  {
    icon: FilePenIcon,
    message: "Generating your report results...",
    percent: 61,
    durationMs: 2600,
  },
  {
    icon: LockIcon,
    message: "Creating your protected access link...",
    percent: 81,
    durationMs: 2200,
  },
  {
    icon: MailIcon,
    message: "Sending you a report access link...",
    percent: 95,
    durationMs: 2000,
  },
];

/* ------------------------------------------------------------------ */
/*  Animated ring SVG                                                  */
/* ------------------------------------------------------------------ */
const AnimatedRing: FC = () => (
  <svg
    className="absolute inset-0 h-full w-full animate-[processing-ring-spin_8s_linear_infinite]"
    viewBox="0 0 176 176"
    fill="none"
    aria-hidden="true"
  >
    <circle
      cx="88"
      cy="88"
      r="86"
      stroke="url(#ring-gradient)"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeDasharray="270 270"
    />
    <defs>
      <linearGradient id="ring-gradient" x1="0" y1="0" x2="176" y2="176">
        <stop offset="0%" stopColor="rgba(167,139,250,0.5)" />
        <stop offset="50%" stopColor="rgba(167,139,250,0.15)" />
        <stop offset="100%" stopColor="rgba(167,139,250,0)" />
      </linearGradient>
    </defs>
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Background orbs                                                    */
/* ------------------------------------------------------------------ */
const BackgroundOrbs: FC = () => (
  <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
    <div
      className="absolute h-[400px] w-[400px] rounded-full blur-[120px]"
      style={{
        background: "rgba(167,139,250,0.10)",
        left: "14%",
        top: "15%",
      }}
    />
    <div
      className="absolute h-[300px] w-[300px] rounded-full blur-[100px]"
      style={{
        background: "rgba(254,104,57,0.10)",
        right: "5%",
        bottom: "20%",
      }}
    />
  </div>
);

/* ------------------------------------------------------------------ */
/*  Progress bar                                                       */
/* ------------------------------------------------------------------ */
const ProgressBar: FC<{ percent: number }> = ({ percent }) => (
  <div className="w-full max-w-[280px] sm:max-w-[320px]">
    <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className="h-full rounded-full"
        style={{
          width: `${percent}%`,
          background: "linear-gradient(90deg, #fe6839, #a78bfa)",
          boxShadow: "0 0 12px rgba(254,104,57,0.4)",
          transition: `width 800ms ${EASING}`,
        }}
      />
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  ProcessingSequence                                                 */
/* ------------------------------------------------------------------ */
interface ProcessingSequenceProps {
  /** Called after all steps complete AND submission has finished */
  onComplete: () => void;
  /** The actual API submission status */
  submitDone: boolean;
}

const ProcessingSequence: FC<ProcessingSequenceProps> = ({ onComplete, submitDone }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<"entering" | "visible" | "exiting">("entering");
  const [isExitingScreen, setIsExitingScreen] = useState(false);
  const [displayPercent, setDisplayPercent] = useState(STEPS[0].percent);
  const stepsComplete = useRef(false);
  const submitDoneRef = useRef(submitDone);
  const hasCalledComplete = useRef(false);

  useEffect(() => {
    submitDoneRef.current = submitDone;
  }, [submitDone]);

  const fireComplete = useCallback(() => {
    if (hasCalledComplete.current) return;
    hasCalledComplete.current = true;
    setIsExitingScreen(true);
    setTimeout(onComplete, EXIT_FADE_MS);
  }, [onComplete]);

  // Entrance animation for each step
  useEffect(() => {
    setPhase("entering");
    const timer = setTimeout(() => setPhase("visible"), 50);
    return () => clearTimeout(timer);
  }, [stepIndex]);

  // Auto-advance through steps
  useEffect(() => {
    if (stepIndex >= STEPS.length) return;

    const step = STEPS[stepIndex];
    const timer = setTimeout(() => {
      if (stepIndex >= STEPS.length - 1) {
        stepsComplete.current = true;
        setTimeout(() => {
          if (submitDoneRef.current) fireComplete();
        }, 1000);
        return;
      }
      setPhase("exiting");
      setTimeout(() => {
        setStepIndex((i) => i + 1);
      }, FADE_OUT_MS);
    }, step.durationMs);

    return () => clearTimeout(timer);
  }, [stepIndex, fireComplete]);

  // If submit finishes after all steps are done, fire completion
  useEffect(() => {
    if (submitDone && stepsComplete.current) {
      fireComplete();
    }
  }, [submitDone, fireComplete]);

  // Animate the percentage counter
  useEffect(() => {
    const target = STEPS[stepIndex]?.percent ?? 95;
    const start = displayPercent;
    const diff = target - start;
    if (diff === 0) return;

    const duration = 800;
    const startTime = performance.now();
    let raf: number;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayPercent(Math.round(start + diff * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  const step = STEPS[stepIndex] ?? STEPS[STEPS.length - 1];
  const Icon = step.icon;

  const contentStyle: React.CSSProperties =
    phase === "exiting"
      ? {
          opacity: 0,
          transform: "translateY(-12px) scale(0.98)",
          transition: `opacity ${FADE_OUT_MS}ms ${EASING}, transform ${FADE_OUT_MS}ms ${EASING}`,
        }
      : phase === "entering"
        ? {
            opacity: 0,
            transform: "translateY(20px) scale(0.98)",
          }
        : {
            opacity: 1,
            transform: "translateY(0) scale(1)",
            transition: `opacity ${FADE_IN_MS}ms ${EASING}, transform ${FADE_IN_MS}ms ${EASING}`,
          };

  return (
    <main
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#0a0510]"
      role="status"
      aria-live="polite"
      aria-label={step.message}
      style={{
        opacity: isExitingScreen ? 0 : 1,
        transition: `opacity ${EXIT_FADE_MS}ms ${EASING}`,
      }}
    >
      <BackgroundOrbs />

      <div className="relative z-10 flex flex-col items-center gap-8 px-6 sm:gap-10">
        {/* Icon + text — animated per step */}
        <div
          key={stepIndex}
          className="flex flex-col items-center gap-8 sm:gap-10"
          style={contentStyle}
        >
          {/* Icon container */}
          <div className="relative flex items-center justify-center">
            <div
              className="absolute rounded-full opacity-[0.84]"
              style={{
                width: "220px",
                height: "220px",
                background:
                  "radial-gradient(circle, rgba(167,139,250,0.18) 0%, rgba(120,80,200,0.06) 50%, transparent 75%)",
              }}
            />

            <div className="absolute h-[136px] w-[136px] sm:h-[176px] sm:w-[176px]">
              <AnimatedRing />
            </div>

            <div
              className="relative flex h-[108px] w-[108px] items-center justify-center rounded-full shadow-[0_0_60px_0_rgba(167,139,250,0.12)] sm:h-[144px] sm:w-[144px]"
              style={{
                background:
                  "radial-gradient(circle at 40% 35%, rgba(30,20,50,1) 0%, rgba(14,8,24,1) 100%)",
              }}
            >
              <div className="absolute inset-0 rounded-full border border-white/[0.06]" />
              <div className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]" />
              <Icon className="h-7 w-7 text-[#fe6839] sm:h-[37px] sm:w-[37px]" />
            </div>
          </div>

          {/* Text content */}
          <div className="flex flex-col items-center gap-3">
            <p className="max-w-[400px] text-center font-serif text-[17px] leading-[28px] text-white sm:text-[20px] sm:leading-[30px]">
              {step.message}
            </p>
            <span className="font-sans text-[13px] font-normal tracking-[0.025em] text-white/50">
              {displayPercent}% complete
            </span>
          </div>
        </div>

        {/* Progress bar — persists across steps */}
        <ProgressBar percent={displayPercent} />
      </div>
    </main>
  );
};

export default ProcessingSequence;
