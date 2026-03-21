"use client";

import { useState, useEffect, useRef, useCallback, type FC } from "react";

/* ------------------------------------------------------------------ */
/*  Step configuration                                                 */
/* ------------------------------------------------------------------ */
interface ProcessingStep {
  icon: FC<{ className?: string }>;
  message: string;
  durationMs: number;
}

const EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
const FADE_OUT_MS = 400;
const FADE_IN_MS = 500;
const EXIT_FADE_MS = 800;

/* ------------------------------------------------------------------ */
/*  SVG Icons                                                          */
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
  { icon: CheckSquareIcon, message: "Extracting your answers...", durationMs: 2400 },
  {
    icon: FileUserIcon,
    message: "Scoring your answers against our archetypes...",
    durationMs: 2800,
  },
  { icon: FilePenIcon, message: "Generating your report results...", durationMs: 2600 },
  { icon: LockIcon, message: "Creating your protected access link...", durationMs: 2200 },
  { icon: MailIcon, message: "Sending you a report access link...", durationMs: 2000 },
];

const TOTAL_DURATION_MS = STEPS.reduce((sum, s) => sum + s.durationMs, 0);
const MAX_PERCENT = 95;

/* ------------------------------------------------------------------ */
/*  Circular progress ring                                             */
/* ------------------------------------------------------------------ */
const RING_R = 88;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;

const CircularProgress: FC<{ percent: number }> = ({ percent }) => {
  const offset = CIRCUMFERENCE - (percent / 100) * CIRCUMFERENCE;
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 200 200"
      fill="none"
      aria-hidden="true"
      style={{ transform: "rotate(-90deg)" }}
    >
      <defs>
        <linearGradient id="circ-progress-grad" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fe6839" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      {/* Background track */}
      <circle cx="100" cy="100" r={RING_R} stroke="rgba(255,255,255,0.04)" strokeWidth="2.5" />
      {/* Progress arc */}
      <circle
        cx="100"
        cy="100"
        r={RING_R}
        stroke="url(#circ-progress-grad)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
        style={{
          transition: `stroke-dashoffset 200ms ${EASING}`,
          filter: "drop-shadow(0 0 6px rgba(254,104,57,0.4))",
        }}
      />
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  Background orbs                                                    */
/* ------------------------------------------------------------------ */
const BackgroundOrbs: FC = () => (
  <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
    <div
      className="absolute h-[400px] w-[400px] rounded-full blur-[120px]"
      style={{ background: "rgba(167,139,250,0.10)", left: "14%", top: "15%" }}
    />
    <div
      className="absolute h-[300px] w-[300px] rounded-full blur-[100px]"
      style={{ background: "rgba(254,104,57,0.10)", right: "5%", bottom: "20%" }}
    />
  </div>
);

/* ------------------------------------------------------------------ */
/*  ProcessingSequence                                                 */
/* ------------------------------------------------------------------ */
interface ProcessingSequenceProps {
  onComplete: () => void;
  submitDone: boolean;
}

const ProcessingSequence: FC<ProcessingSequenceProps> = ({ onComplete, submitDone }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [contentPhase, setContentPhase] = useState<"entering" | "visible" | "exiting">("entering");
  const [isExitingScreen, setIsExitingScreen] = useState(false);
  const [displayPercent, setDisplayPercent] = useState(0);
  const stepsComplete = useRef(false);
  const submitDoneRef = useRef(submitDone);
  const hasCalledComplete = useRef(false);
  const startTimeRef = useRef(0);

  useEffect(() => {
    submitDoneRef.current = submitDone;
  }, [submitDone]);

  const fireComplete = useCallback(() => {
    if (hasCalledComplete.current) return;
    hasCalledComplete.current = true;
    setDisplayPercent(100);
    setTimeout(() => {
      setIsExitingScreen(true);
      setTimeout(onComplete, EXIT_FADE_MS);
    }, 500);
  }, [onComplete]);

  // Smooth percentage counter: ticks up by 1 continuously from 0 → 95
  useEffect(() => {
    startTimeRef.current = performance.now();
    let raf: number;

    const tick = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const pct = Math.min(Math.floor((elapsed / TOTAL_DURATION_MS) * MAX_PERCENT), MAX_PERCENT);
      setDisplayPercent(pct);
      if (pct < MAX_PERCENT) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Content entrance animation per step — intentional cascading render
  // to trigger entering→visible CSS transition on step change.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setContentPhase("entering");
    const timer = setTimeout(() => setContentPhase("visible"), 50);
    return () => clearTimeout(timer);
  }, [stepIndex]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
      setContentPhase("exiting");
      setTimeout(() => {
        setContentPhase("entering");
        setStepIndex((i) => i + 1);
      }, FADE_OUT_MS);
    }, step.durationMs);

    return () => clearTimeout(timer);
  }, [stepIndex, fireComplete]);

  // If submit finishes after all steps are done
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (submitDone && stepsComplete.current) {
      fireComplete();
    }
  }, [submitDone, fireComplete]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const step = STEPS[stepIndex] ?? STEPS[STEPS.length - 1];
  const Icon = step.icon;

  // Icon transitions: scale inside the circle
  const iconStyle: React.CSSProperties =
    contentPhase === "exiting"
      ? { opacity: 0, transform: "scale(0.8)", transition: `all ${FADE_OUT_MS}ms ${EASING}` }
      : contentPhase === "entering"
        ? { opacity: 0, transform: "scale(0.8)" }
        : { opacity: 1, transform: "scale(1)", transition: `all ${FADE_IN_MS}ms ${EASING}` };

  // Text transitions: slide vertically
  const textStyle: React.CSSProperties =
    contentPhase === "exiting"
      ? {
          opacity: 0,
          transform: "translateY(-10px)",
          transition: `all ${FADE_OUT_MS}ms ${EASING}`,
        }
      : contentPhase === "entering"
        ? { opacity: 0, transform: "translateY(16px)" }
        : {
            opacity: 1,
            transform: "translateY(0)",
            transition: `all ${FADE_IN_MS}ms ${EASING}`,
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

      <div className="relative z-10 flex flex-col items-center px-6">
        {/* ---- Circle + progress ring (PERSISTENT) ---- */}
        <div className="relative flex items-center justify-center">
          {/* Outer radial glow */}
          <div
            className="absolute rounded-full opacity-[0.84]"
            style={{
              width: "240px",
              height: "240px",
              background:
                "radial-gradient(circle, rgba(167,139,250,0.18) 0%, rgba(120,80,200,0.06) 50%, transparent 75%)",
            }}
          />

          {/* Circular progress ring */}
          <div className="absolute h-[140px] w-[140px] sm:h-[184px] sm:w-[184px]">
            <CircularProgress percent={displayPercent} />
          </div>

          {/* Inner circle (persistent) */}
          <div
            className="relative flex h-[108px] w-[108px] items-center justify-center rounded-full shadow-[0_0_60px_0_rgba(167,139,250,0.12)] sm:h-[144px] sm:w-[144px]"
            style={{
              background:
                "radial-gradient(circle at 40% 35%, rgba(30,20,50,1) 0%, rgba(14,8,24,1) 100%)",
            }}
          >
            <div className="absolute inset-0 rounded-full border border-white/[0.06]" />
            <div className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]" />

            {/* Icon — only this transitions */}
            <div key={stepIndex} style={iconStyle}>
              <Icon className="h-7 w-7 text-[#fe6839] sm:h-[37px] sm:w-[37px]" />
            </div>
          </div>
        </div>

        {/* ---- Message text (TRANSITIONS) ---- */}
        <div key={`msg-${stepIndex}`} className="mt-8 sm:mt-10" style={textStyle}>
          <p className="max-w-[400px] text-center font-serif text-[17px] leading-[28px] text-white sm:text-[20px] sm:leading-[30px]">
            {step.message}
          </p>
        </div>

        {/* ---- Percentage (PERSISTENT) ---- */}
        <span className="mt-3 font-sans text-[13px] font-normal tracking-[0.025em] text-white/50">
          {displayPercent}% complete
        </span>
      </div>
    </main>
  );
};

export default ProcessingSequence;
