"use client";

import type { FC } from "react";

type SubmitStatus = "idle" | "submitting" | "success" | "error";

interface SurveyConfirmationProps {
  status: SubmitStatus;
  onExit: () => void;
  onRetry?: () => void;
}

const EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

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

const BackgroundOrbs: FC = () => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
    <div className="absolute -top-[10%] -right-[10%] h-[300px] w-[300px] rounded-full bg-[rgba(254,104,57,0.15)] blur-[50px] md:h-[500px] md:w-[500px] animate-float1" />
    <div className="absolute -bottom-[5%] -left-[10%] h-[250px] w-[250px] rounded-full bg-[rgba(156,125,255,0.18)] blur-[40px] md:h-[450px] md:w-[450px] animate-float2" />
    <div className="absolute bottom-[15%] left-[30%] h-[200px] w-[200px] rounded-full bg-[rgba(111,63,255,0.08)] blur-[60px] md:h-[350px] md:w-[350px] animate-float3" />
    <div className="absolute inset-0 bg-noise opacity-[0.03]" />
  </div>
);

const CheckmarkIcon: FC = () => (
  <svg
    className="h-10 w-10 text-white sm:h-12 sm:w-12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{
      strokeDasharray: 24,
      strokeDashoffset: 24,
      animation: `checkmark-draw 600ms ${EASING} 700ms both`,
    }}
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const EnvelopeIcon: FC = () => (
  <svg
    className="h-4 w-4 shrink-0 text-[#fe6839]"
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

const BarChartIcon: FC = () => (
  <svg
    className="h-4 w-4 shrink-0 text-[#a78bfa]"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="12" y1="20" x2="12" y2="10" />
    <line x1="18" y1="20" x2="18" y2="4" />
    <line x1="6" y1="20" x2="6" y2="16" />
  </svg>
);

const ShieldIcon: FC<{ className?: string }> = ({
  className = "h-4 w-4 shrink-0 text-white/40",
}) => (
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
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const InfoIcon: FC = () => (
  <svg
    className="h-10 w-10 text-white sm:h-12 sm:w-12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const PulsingDots: FC = () => (
  <div className="flex items-center gap-1.5" aria-hidden="true">
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        className="h-2.5 w-2.5 rounded-full bg-white"
        style={{
          animation: `survey-scale-in 600ms ${EASING} ${i * 150}ms infinite alternate`,
        }}
      />
    ))}
  </div>
);

const SurveyConfirmation: FC<SurveyConfirmationProps> = ({ status, onExit, onRetry }) => {
  const isSuccess = status === "success";
  const isSubmitting = status === "submitting" || status === "idle";
  const isError = status === "error";

  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0a0510] px-6 text-center"
      role="status"
      aria-live="polite"
    >
      <BackgroundOrbs />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-5 lg:max-w-lg lg:gap-8">
        {/* Status pill */}
        <div {...fadeUp(100, 500)}>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full bg-[#fe6839]"
              style={{ animation: isSubmitting ? "pulse 1.5s ease-in-out infinite" : undefined }}
            />
            <span className="font-sans text-[11px] font-medium uppercase tracking-[0.15em] text-white/50">
              {isSubmitting ? "Processing" : isError ? "Saved Locally" : "Assessment Complete"}
            </span>
          </div>
        </div>

        {/* Celebration icon */}
        <div className="relative" {...scaleIn(300, 600)}>
          <div
            className="absolute inset-0 m-auto h-[104px] w-[104px] rounded-full border border-dashed border-white/10 sm:h-[120px] sm:w-[120px]"
            style={{ animation: "slow-spin 30s linear infinite" }}
            aria-hidden="true"
          />
          <div
            className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#fe6839] to-[#a78bfa] sm:h-28 sm:w-28"
            style={{
              boxShadow: "0 0 60px rgba(254,104,57,0.2), 0 0 120px rgba(156,125,255,0.1)",
            }}
          >
            {isSubmitting && <PulsingDots />}
            {isSuccess && <CheckmarkIcon />}
            {isError && <InfoIcon />}
          </div>
        </div>

        {/* Heading */}
        <h2
          className="font-serif text-[32px] font-bold leading-tight text-white sm:text-[40px] lg:text-[48px]"
          {...fadeUp(800)}
        >
          {isSubmitting && "Processing Your Answers…"}
          {isSuccess && "Your Journey Begins"}
          {isError && "Answers Saved Locally"}
        </h2>

        {/* Body text */}
        <p
          className="max-w-md font-sans text-[15px] leading-relaxed text-white/60 sm:text-[16px]"
          {...fadeUp(1000)}
        >
          {isSubmitting &&
            "We’re carefully analyzing your responses across 14 archetypes and 19 psychological dimensions."}
          {isSuccess &&
            "Thank you for sharing your story. Your personalized intimacy profile is being prepared — a deep, science-backed mirror of your desires, patterns, and potential."}
          {isError &&
            "We couldn’t reach our servers right now, but your answers are safely stored. You can try again later or return to the site."}
        </p>

        {/* Decorative divider */}
        {isSuccess && (
          <div
            className="h-px w-full max-w-[180px] bg-gradient-to-r from-transparent via-[#fe6839]/30 to-transparent"
            style={{
              transformOrigin: "center",
              animation: `width-expand 500ms ${EASING} 1200ms both`,
            }}
            aria-hidden="true"
          />
        )}

        {/* Next steps card */}
        {isSuccess && (
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-5"
            {...scaleIn(1400)}
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3" {...fadeUp(1500, 300)}>
                <EnvelopeIcon />
                <span className="text-left font-sans text-[14px] text-white/70">
                  Check your email for your report
                </span>
              </div>
              <div className="flex items-center gap-3" {...fadeUp(1600, 300)}>
                <BarChartIcon />
                <span className="text-left font-sans text-[14px] text-white/70">
                  14 archetypes analyzed
                </span>
              </div>
              <div className="flex items-center gap-3" {...fadeUp(1700, 300)}>
                <ShieldIcon />
                <span className="text-left font-sans text-[14px] text-white/70">
                  Your data is encrypted &amp; anonymous
                </span>
              </div>
            </div>
          </div>
        )}

        {/* CTA buttons */}
        {isSuccess && (
          <div {...fadeUp(1900)}>
            <button
              type="button"
              onClick={onExit}
              className="rounded-full bg-gradient-brand px-8 py-3.5 font-sans text-[14px] font-bold text-white shadow-[0_4px_20px_rgba(254,104,57,0.3)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(254,104,57,0.4)] focus-visible-ring"
            >
              Return to LoveIQ
            </button>
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-3" {...fadeUp(1200)}>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-full border border-white/15 bg-transparent px-6 py-3 font-sans text-[14px] font-medium text-white/80 transition-all duration-300 hover:border-white/30 hover:bg-white/5 focus-visible-ring"
              >
                Try Again
              </button>
            )}
            <button
              type="button"
              onClick={onExit}
              className="rounded-full bg-gradient-brand px-6 py-3 font-sans text-[14px] font-bold text-white shadow-[0_4px_20px_rgba(254,104,57,0.3)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(254,104,57,0.4)] focus-visible-ring"
            >
              Return to Site
            </button>
          </div>
        )}

        {/* Trust line */}
        {isSuccess && (
          <div
            className="flex items-center gap-1.5"
            style={{ opacity: 0, animation: `survey-fade-in 400ms ${EASING} 2100ms both` }}
          >
            <ShieldIcon className="h-3 w-3 shrink-0 text-white/30" />
            <span className="font-sans text-[11px] font-medium uppercase tracking-wide text-white/30">
              Your privacy is protected
            </span>
          </div>
        )}
      </div>
    </main>
  );
};

export default SurveyConfirmation;
