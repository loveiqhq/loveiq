"use client";

import { Fragment, type FC, type ReactNode } from "react";
import { useIntroCardNav } from "../hooks/useIntroCardNav";
import { GRADIENT_TEXT } from "../sheets/parts";
import {
  GUIDE_CARD_COUNT,
  GUIDE_CARDS,
  GUIDE_HEADER,
  type GuideCard,
  type GuideRule,
  type GuideRun,
} from "./guideContent";

/*
 * Survey 2.0's short guide: three cards in the intro's place (copy: ./guideContent.ts). Mark's
 * boards give the header, the rules list, the icons and the progress under the header; what they
 * redraw of today's slides in their own palette (the dark background, the orange, the bars, Skip
 * Intro, Continue) keeps today's values. Desktop follows today's slides: Mark drew phones only.
 *
 * It moves as today's slides do (useIntroCardNav) and records `guide_card_N` when a card shows,
 * `guide_back_N` on Back (cards 2 and 3) and, from SurveyPage, `guide_skip_N` on Skip Intro.
 */

const ICONS: Record<GuideCard["icon"], ReactNode> = {
  sparkle: (
    <>
      <path d="M11 3.5c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6z" />
      <path d="M19 3v3M17.5 4.5h3" />
      <circle cx="4.5" cy="18.5" r="1.3" />
    </>
  ),
  perspective: (
    <>
      <circle cx="12" cy="12" r="2.2" />
      <path d="M8 12H3M5.5 9.5 3 12l2.5 2.5" />
      <path d="M16 12h5M18.5 9.5 21 12l-2.5 2.5" />
    </>
  ),
  privacy: (
    <>
      <circle cx="10" cy="8" r="4" />
      <path d="M3 20a7 7 0 0 1 10.5-6" />
      <circle cx="18" cy="15" r="2" />
      <path d="M18 17v4M18 19h1.6" />
    </>
  ),
};

/** The card's icon in its soft purple glow (36px; half as big again on desktop). */
const GuideIcon: FC<{ icon: GuideCard["icon"] }> = ({ icon }) => (
  <div className="relative h-9 w-9 origin-top-left sm:scale-150">
    <span
      aria-hidden
      className="pointer-events-none absolute -left-[22px] -top-[22px] h-20 w-20 rounded-full"
      style={{
        background: "radial-gradient(circle, rgba(190,160,255,0.45) 0%, rgba(190,160,255,0) 65%)",
      }}
    />
    <svg
      aria-hidden
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#f1e9ff"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="relative m-[3px]"
    >
      {ICONS[icon]}
    </svg>
  </div>
);

const ArrowRight: FC = () => (
  <svg
    aria-hidden
    className="h-[18px] w-[18px]"
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

const ArrowLeft: FC = () => (
  <svg
    aria-hidden
    className="h-5 w-5"
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

/** Card 1: the three rules, numbered in rings. */
const RulesList: FC<{ rules: readonly GuideRule[] }> = ({ rules }) => (
  <ol className="flex flex-col gap-[22px] sm:max-w-[560px] [@media(max-width:639px)_and_(max-height:720px)]:gap-4">
    {rules.map((rule, i) => (
      <li key={rule.title} className="flex items-start gap-[14px]">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full border-[1.5px] border-white/35 text-[13px] font-bold text-white">
          {i + 1}
        </span>
        <div>
          <div
            className="text-[16px] font-bold leading-[23px] text-white sm:text-[18px] sm:leading-[26px]"
            style={{ fontVariationSettings: '"wght" 700' }}
          >
            {rule.title}
          </div>
          <div
            className="mt-0.5 text-[15px] font-light leading-[23px] text-white/80 sm:text-[17px] sm:leading-[26px]"
            style={{ fontVariationSettings: '"wght" 300' }}
          >
            {rule.text}
          </div>
        </div>
      </li>
    ))}
  </ol>
);

function Run({ run }: { run: GuideRun }): ReactNode {
  if (typeof run === "string") return run;
  if ("strong" in run) {
    return (
      <strong className="font-extrabold text-white [font-variation-settings:'wght'_800]">
        {run.strong}
      </strong>
    );
  }
  return (
    <a
      href={run.href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-[#fe6839] underline decoration-[#fe6839] decoration-2 underline-offset-2 transition-all duration-300 hover:text-[#ff8a6a] hover:decoration-[#ff8a6a]"
    >
      {run.link}
    </a>
  );
}

/** Cards 2 and 3: lines of text, today's slide body. */
const Lines: FC<{ lines: readonly (readonly GuideRun[])[]; gap: number }> = ({ lines, gap }) => (
  <p
    className="mr-6 max-w-[798px] font-sans text-[18px] font-light leading-[29.25px] text-white/80 sm:mr-0"
    style={{ fontVariationSettings: '"wght" 300' }}
  >
    {lines.map((line, i) => (
      <span key={i} className="block" style={i > 0 && gap > 0 ? { marginTop: gap } : undefined}>
        {line.map((run, j) => (
          <Fragment key={j}>
            <Run run={run} />
          </Fragment>
        ))}
      </span>
    ))}
  </p>
);

const fadeUp = (delayMs: number) => ({
  opacity: 0,
  animation: `survey-fade-up 700ms cubic-bezier(0.16,1,0.3,1) ${delayMs}ms both`,
});

export const GuideScreen: FC<{
  /** The card, from 0. */
  cardIndex: number;
  onContinue: () => void;
  onBack: () => void;
  onSkip: () => void;
}> = ({ cardIndex, onContinue, onBack, onSkip }) => {
  const index = Math.min(Math.max(cardIndex, 0), GUIDE_CARD_COUNT - 1);
  const card = GUIDE_CARDS[index]!;
  const number = index + 1;
  const { isLeaving, isLeavingForward, handleNext, handlePrev, handleTouchStart, handleTouchEnd } =
    useIntroCardNav({
      index,
      viewEvent: `guide_card_${number}`,
      backEvent: index > 0 ? `guide_back_${number}` : null,
      onContinue,
      onBack,
    });

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-[#140a1a]">
      {/* Today's slides' glows, in opacity only, and still under reduced motion (globals.css) */}
      <div className="pointer-events-none absolute bottom-0 left-0 -translate-x-1/2 translate-y-1/2">
        <div
          className="animate-pulse-glow-opacity survey-calm-glow h-[1895px] w-[718px] rounded-full bg-[#FE6839] blur-[500px] sm:h-[1296px] sm:w-[1296px]"
          style={{ willChange: "opacity", transform: "translateZ(0)" }}
        />
      </div>
      <div className="pointer-events-none absolute right-0 top-0 -translate-y-1/2 translate-x-1/2">
        <div
          className="animate-pulse-glow-opacity survey-calm-glow h-[1724px] w-[653px] rounded-full bg-[#A78BFA] blur-[400px] sm:h-[920px] sm:w-[920px]"
          style={{
            animationDelay: "2s",
            animationFillMode: "backwards",
            willChange: "opacity",
            transform: "translateZ(0)",
          }}
        />
      </div>

      {/* The gutters in classes, not an inline style: inline, the safe-area padding (0 off a notch)
          overrode sm:px-10, and from 640px to the 1120px column (tablets, small windows) the
          cards touched both edges of the screen. Phones keep 0 here: their rows carry their own. */}
      <div className="relative z-10 mx-auto flex w-full max-w-[1120px] flex-1 flex-col pb-24 pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)] pt-6 sm:py-10 sm:pl-[max(2.5rem,env(safe-area-inset-left,0px))] sm:pr-[max(2.5rem,env(safe-area-inset-right,0px))]">
        {/* Header: "Short guide / before you start", Skip Intro */}
        <div
          className="survey-animate flex items-center gap-4 px-[26px] sm:px-0"
          style={{ animation: "survey-fade-in 600ms cubic-bezier(0.16,1,0.3,1) both" }}
        >
          <p className="flex-1 font-serif text-[18px] font-normal leading-[24px] tracking-[-0.01em] text-white sm:text-[22px] sm:leading-[30px]">
            <span className="text-transparent" style={GRADIENT_TEXT}>
              {GUIDE_HEADER.accent}
            </span>
            <br />
            <span>{GUIDE_HEADER.rest}</span>
          </p>
          <button
            type="button"
            onClick={onSkip}
            className="text-[12px] font-bold uppercase tracking-[1.2px] text-white/50 transition hover:text-white/80 focus-visible-ring"
          >
            Skip Intro
          </button>
        </div>

        {/* Progress, under the header */}
        <div
          className="survey-animate mt-6 space-y-2 px-7 sm:px-0"
          style={{ animation: "survey-fade-in 600ms cubic-bezier(0.16,1,0.3,1) both" }}
        >
          <div aria-hidden className="flex h-1 w-full gap-3 sm:max-w-[448px]">
            {GUIDE_CARDS.map((_, i) => (
              <div
                key={i}
                className="relative h-1 flex-1 overflow-hidden rounded-full"
                style={{ background: "rgba(255,255,255,0.1)" }}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: i <= index ? "100%" : "0%",
                    background: "#fe6839",
                    boxShadow: i <= index ? "0 0 8px rgba(254,104,57,0.5)" : "none",
                    transition: "width 500ms cubic-bezier(0.16,1,0.3,1), box-shadow 400ms ease",
                  }}
                />
              </div>
            ))}
          </div>
          <span className="block text-[12px] font-medium tracking-[0.5px] text-white/30">
            {number} / {GUIDE_CARD_COUNT}
          </span>
        </div>

        {/* The card: key remounts it, replaying its entrance */}
        <div
          key={index}
          className={`flex flex-1 flex-col pt-[clamp(1.5rem,6.6dvh,3.5rem)] transition-opacity duration-200 sm:justify-center sm:py-6 ${isLeaving ? "opacity-0" : "opacity-100"}`}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="pl-7 pr-10 sm:px-0">
            <div className="survey-animate" style={fadeUp(0)}>
              <GuideIcon icon={card.icon} />
            </div>
            {/* Short phones (an iPhone SE) get a compact card, so the last rule stays clear of the
                Continue button as today's slides do there. */}
            <h1
              className="survey-animate mt-6 break-words font-serif text-[28px] font-semibold leading-[38px] tracking-[-0.01em] text-white sm:mt-10 sm:text-[44px] sm:leading-[58px] [@media(max-width:639px)_and_(max-height:720px)]:mt-4 [@media(max-width:639px)_and_(max-height:720px)]:text-[26px] [@media(max-width:639px)_and_(max-height:720px)]:leading-[34px]"
              style={fadeUp(150)}
            >
              {card.heading}
            </h1>
            <div className="survey-animate mt-[22px] sm:mt-6" style={fadeUp(300)}>
              {"rules" in card ? (
                <RulesList rules={card.rules} />
              ) : (
                <Lines lines={card.lines} gap={card.gap} />
              )}
            </div>
          </div>
        </div>

        {/* Back (cards 2 and 3): the phone's bottom-left corner, in the row on desktop */}
        <div className="flex items-center justify-between">
          {index > 0 ? (
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Go to previous slide"
              className="fixed z-10 flex h-[48px] w-[48px] items-center justify-center rounded-full border border-[rgba(254,104,57,0.3)] bg-[rgba(254,104,57,0.1)] text-[#fe6839] transition hover:-translate-y-[1px] focus-visible-ring sm:static"
              style={{
                left: "max(1.75rem, env(safe-area-inset-left, 1.75rem))",
                bottom: "max(1.875rem, env(safe-area-inset-bottom, 1.875rem))",
              }}
            >
              <ArrowLeft />
            </button>
          ) : (
            <span aria-hidden className="hidden h-[48px] w-[48px] sm:block" />
          )}
          {/* Inline continue — desktop only */}
          <button
            type="button"
            onClick={handleNext}
            aria-label="Continue to next slide"
            className="hidden h-[48px] items-center gap-3 rounded-full bg-[#FE6839] px-8 text-[14px] font-bold uppercase leading-[20px] tracking-[1.4px] text-white shadow-[0_10px_15px_-3px_rgba(254,104,57,0.2),0_4px_6px_-4px_rgba(254,104,57,0.2)] transition hover:-translate-y-[1px] hover:shadow-[0_14px_20px_-3px_rgba(254,104,57,0.28)] focus-visible-ring sm:inline-flex"
          >
            Continue
            <ArrowRight />
          </button>
        </div>
      </div>

      {/* Sticky continue button — mobile only, fixed bottom-right */}
      <button
        type="button"
        onClick={handleNext}
        aria-label="Continue to next slide"
        className="fixed z-10 inline-flex h-[52px] items-center gap-3 rounded-full bg-[#FE6839] px-7 text-[14px] font-bold uppercase leading-[20px] tracking-[1.4px] text-white shadow-[0_10px_30px_-3px_rgba(254,104,57,0.45)] transition hover:-translate-y-[1px] focus-visible-ring sm:hidden"
        style={{
          right: "max(1.5rem, env(safe-area-inset-right, 1.5rem))",
          bottom: "max(1.75rem, env(safe-area-inset-bottom, 1.75rem))",
        }}
      >
        Continue
        <ArrowRight />
      </button>

      {/* Dark overlay — crossfades in when leaving the last card for the consent */}
      {index === GUIDE_CARD_COUNT - 1 && (
        <div
          className="pointer-events-none fixed inset-0 z-20 bg-[#0a0510] transition-opacity duration-200 ease-out"
          style={{ opacity: isLeavingForward ? 1 : 0 }}
        />
      )}
    </main>
  );
};
