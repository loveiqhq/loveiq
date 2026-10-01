"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FC,
  type ReactNode,
} from "react";
import Image from "next/image";
import { trackWizardMapStep, trackWizardSlideAdvanced } from "@features/analytics/client";
import WizardReportMap, { MAP_STEPS } from "./wizard/WizardReportMap";
import { WIZARD_PROOF_CARDS, WIZARD_SLIDE_COUNT } from "./wizard/wizardContent";
import "./wizard/wizard-desktop.css";

/**
 * The pre-report wizard — Figma 1071:2092, "Pre Report Wizard — Mobile (production,
 * 393)", 30.09. Six slides between the end of the survey and the report:
 *   1 a note before you explore (with the three research tiles)
 *   2 the report map (an overview, then the four deep dives)
 *   3 unlocking is risk free    4 take only what resonates
 *   5 rate each section         6 invite your friends
 *
 * From 1024px a desktop layout in the system of Mark's desktop wizard frames (1:4454):
 * wizard/wizard-desktop.css, on the wz-* hooks named here (Fatih, 01.10). A phone keeps
 * the 393 design exactly.
 */

const MAP_SLIDE = 1;
const LEAVE_MS = 250;
const EXIT_MS = 600;
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

const fadeUp = (delay: number) => ({
  opacity: 0,
  animation: `survey-fade-up 700ms ${EASE} ${delay}ms both`,
});

/* ------------------------------------------------------------------ */
/*  Pieces every text slide shares                                      */
/* ------------------------------------------------------------------ */

/**
 * The 64px icon in its violet glow (e.g. 1049:1173). It was 80 until Mark's 01.10
 * round ("Decreased Icons size"), which scaled the drawing and its glow by 0.8.
 */
const SlideIcon: FC<{ name: string }> = ({ name }) => (
  <div className="relative h-16 w-16 shrink-0">
    <div
      aria-hidden
      className="pointer-events-none absolute left-[-38.4px] top-[-38.4px] h-[140.8px] w-[140.8px] rounded-full"
      style={{
        background:
          "radial-gradient(circle, rgba(167,139,250,0.55) 0%, rgba(167,139,250,0.15) 40%, rgba(167,139,250,0) 70%)",
      }}
    />
    <Image
      src={`/survey/wizard/${name}.svg`}
      alt=""
      width={64}
      height={64}
      unoptimized
      className="relative block h-16 w-16"
    />
  </div>
);

/** Manrope 18/29.25 in the 294 column; a slide's runs set their own weight and colour. */
const BODY = "wz-copy max-w-[294px] font-sans text-[18px] leading-[29.25px]";

const ProofCards: FC = () => (
  // 1049:1191 — 345 wide on the canvas, so wider than the 294 text column.
  <div className="wz-proof grid w-full grid-cols-3 gap-2">
    {WIZARD_PROOF_CARDS.map((card) => (
      <div
        key={card.title}
        className="wz-proof-card flex flex-col items-center gap-2 overflow-hidden rounded-[14px] px-2 py-[14px] text-center"
        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
      >
        <span
          className="wz-proof-icon flex h-[29.867px] w-[29.867px] items-center justify-center rounded-lg"
          style={{
            border: "1px solid rgba(255,255,255,0.16)",
            backgroundImage:
              "linear-gradient(90deg, rgba(254,104,57,0.22), rgba(167,139,250,0.22))",
          }}
        >
          <Image
            src={`/survey/wizard/${card.icon}.svg`}
            alt=""
            width={17}
            height={17}
            unoptimized
            className="block h-[17px] w-[17px]"
          />
        </span>
        {/* The title over its line, 8 apart as the card's own gap: a desktop sets the
         * pair beside the icon. */}
        <div className="wz-proof-text flex flex-col items-center gap-2">
          <p className="wz-proof-title font-sans text-[13px] font-bold leading-[17px] text-white">
            {card.title}
          </p>
          <p className="wz-proof-body font-sans text-[11px] font-normal leading-[15px] text-white/70">
            {card.body}
          </p>
        </div>
      </div>
    ))}
  </div>
);

const GuaranteeCard: FC = () => (
  // 1066:2273
  <div
    className="wz-guarantee flex w-full items-center gap-[14px] overflow-hidden rounded-[14px] px-4 py-[14px]"
    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
  >
    <span className="wz-guarantee-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]">
      <Image
        src="/survey/wizard/shield.svg"
        alt=""
        width={23.622}
        height={27.312}
        unoptimized
        className="block h-[27.312px] w-[23.622px] max-w-none"
      />
    </span>
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <p className="wz-guarantee-title font-sans text-[15px] font-bold leading-5 text-white">
        14-day money-back guarantee
      </p>
      <p className="wz-guarantee-body font-sans text-[12px] font-normal leading-4 text-white/70">
        No questions asked. Full refund.
      </p>
    </div>
  </div>
);

interface TextSlide {
  icon: string;
  heading: string;
  body: ReactNode;
  /** What follows the paragraph, with the gap above it. */
  extra?: { node: ReactNode; gap: number };
}

/** Slides 1 and 3-6, keyed by their index in the six. Copy verbatim from the frames. */
const TEXT_SLIDES: Record<number, TextSlide> = {
  // 1049:1161
  0: {
    icon: "note",
    heading: "A note before you explore your report.",
    body: (
      <p className={`${BODY} font-bold text-white`}>
        Congratulations on completing your test.
        <span className="font-light text-white/80"> Your openness made this report possible. </span>
        <br />
        <span className="font-normal">It draws on the 60+ answers you gave and is</span> grounded in
        a broad body of sexual and psychological research
        <span className="font-normal">, including:</span>
      </p>
    ),
    // 20 under the copy's box (1049:1190), which Figma fixes at 198 for the seven lines'
    // 204.75: CSS stacks the lines in full, so the cards sit 13.25 under the last one.
    extra: { node: <ProofCards />, gap: 13.25 },
  },
  // 1066:2186
  2: {
    icon: "risk-free",
    heading: "Unlocking your report is fully risk free.",
    body: (
      <p className={`${BODY} font-light text-white/80`}>
        As we are <strong className="font-bold">confident in the value</strong> of this report, we
        are offering you a <br />
        <strong className="font-bold">14-day money back guarantee</strong>, <br />
        no questions asked.
      </p>
    ),
    // The paragraph's own 21px foot, then the card's 24 (1066:2214, 1066:2215).
    extra: { node: <GuaranteeCard />, gap: 45 },
  },
  // 1066:1841
  3: {
    icon: "resonates",
    heading: "Take only what resonates.",
    body: (
      <div className={BODY}>
        <p className="font-light text-white/80">
          This report offers perspectives, patterns, and possibilities, not rigid definitions.
        </p>
        <p className="mt-[29.25px]">
          <strong className="font-bold text-white">
            Keep only what feels meaningful and useful for your life.
          </strong>
          <span className="font-light text-white/80">
            {" "}
            Let the insights that resonate guide your self-understanding and growth.
          </span>
        </p>
      </div>
    ),
  },
  // 1066:1956
  4: {
    icon: "rate",
    heading: "Rate each report section.",
    body: (
      <p className={`${BODY} font-light text-white/80`}>
        Your feedback helps us improve the experience and refine the insights we provide to you
        personally in the future.{" "}
        <strong className="font-bold text-white">
          As you go through the report, please rate each section
        </strong>{" "}
        to let us know what was helpful, surprising, or meaningful.
      </p>
    ),
  },
  // 1066:2070
  5: {
    icon: "invite",
    heading: "Invite your friends to grow.",
    body: (
      <p className={`${BODY} font-light text-white/80`}>
        Many people discover new insights when exploring these topics together.{" "}
        <strong className="font-extrabold text-white">Invite friends to take this survey</strong>{" "}
        <strong className="font-bold text-white">as well</strong> and to explore their own report.
      </p>
    ),
  },
};

const TextSlideView: FC<{ slide: TextSlide }> = ({ slide }) => (
  <div
    className={`wz-text flex w-full flex-col items-start pt-[37px]${slide.extra ? " has-extra" : ""}`}
  >
    <div className="wz-icon survey-animate" style={fadeUp(0)}>
      <SlideIcon name={slide.icon} />
    </div>
    <h2
      className="wz-heading survey-animate mb-[13px] max-w-[294px] pt-6 font-serif text-[28px] font-medium leading-[38px] text-white"
      style={fadeUp(150)}
    >
      {slide.heading}
    </h2>
    <div className="wz-body survey-animate pt-5" style={fadeUp(300)}>
      {slide.body}
    </div>
    {slide.extra ? (
      // The gap above it is a class, not an inline padding, so a desktop can take it away.
      <div
        className="wz-extra survey-animate w-full pt-[var(--wz-extra-gap)]"
        style={{ ...fadeUp(400), "--wz-extra-gap": `${slide.extra.gap}px` } as CSSProperties}
      >
        {slide.extra.node}
      </div>
    ) : null}
  </div>
);

/* ------------------------------------------------------------------ */
/*  The background — two blurred blobs on #140a1a (e.g. 1049:1163/1164) */
/* ------------------------------------------------------------------ */

/** The map (1049:1628) runs the orange up and the violet down; every other slide draws .51 / .79. */
const Blobs: FC<{ map: boolean }> = ({ map }) => (
  <div aria-hidden className="pointer-events-none absolute inset-0">
    <div
      className="absolute left-[-359px] top-[-95.5px] h-[1895px] w-[718px] rounded-full bg-[#fe6839] blur-[500px] transition-opacity duration-700 motion-reduce:transition-none"
      style={{ opacity: map ? 0.71 : 0.51, willChange: "opacity", transform: "translateZ(0)" }}
    />
    <div
      className="absolute left-[66.5px] top-[-862px] h-[1724px] w-[653px] rounded-full bg-[#a78bfa] blur-[400px] transition-opacity duration-700 motion-reduce:transition-none"
      style={{ opacity: map ? 0.59 : 0.79, willChange: "opacity", transform: "translateZ(0)" }}
    />
  </div>
);

/* ------------------------------------------------------------------ */
/*  PreReportWizard                                                    */
/* ------------------------------------------------------------------ */

interface PreReportWizardProps {
  onComplete: () => void;
  /** Off on /wizard-preview, so a reviewer's clicks never reach the funnel's events. */
  track?: boolean;
}

const PreReportWizard: FC<PreReportWizardProps> = ({ onComplete, track = true }) => {
  const [slideIndex, setSlideIndex] = useState(0);
  /** The map's own step: 0 the overview, 1-4 a deep dive. */
  const [mapStep, setMapStep] = useState(0);
  const [isLeaving, setIsLeaving] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // Mirrors of the state for the handlers, so a key press or a double tap inside one
  // render cannot act twice or on a stale slide.
  const slideRef = useRef(0);
  const stepRef = useRef(0);
  const busyRef = useRef(false);
  const lastDiveRef = useRef(1);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  /** The column scrolls on a short phone; each new view starts at its top. */
  const scrollRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  /** Back had focus when it was pressed: slide 1 draws none, so focus goes to CONTINUE. */
  const refocusRef = useRef(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setHasEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (slideIndex === 0 && refocusRef.current) continueRef.current?.focus({ preventScroll: true });
    refocusRef.current = false;
  }, [slideIndex]);

  const exit = useCallback(() => {
    busyRef.current = true;
    setIsExiting(true);
    setTimeout(onComplete, EXIT_MS);
  }, [onComplete]);

  const moveMap = useCallback(
    (to: number, control: "next" | "previous" | "continue" | "back") => {
      const from = stepRef.current;
      if (to === from || to < 0 || to > MAP_STEPS) return;
      if (track) trackWizardMapStep({ from_step: from, to_step: to, control });
      if (to >= 1) lastDiveRef.current = to;
      stepRef.current = to;
      setMapStep(to);
      // Into or out of the tiles is a change of view, like a slide: hold input for as
      // long, or a double tap on CONTINUE would skip the deep dives altogether.
      if (control === "continue" || control === "back") {
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        busyRef.current = true;
        setTimeout(() => {
          busyRef.current = false;
        }, LEAVE_MS);
      }
    },
    [track]
  );

  /** Leave the slide (250ms), then land on `to`. */
  const moveSlide = useCallback(
    (to: number, direction: "next" | "previous") => {
      const from = slideRef.current;
      busyRef.current = true;
      setIsLeaving(true);
      setTimeout(() => {
        busyRef.current = false;
        setIsLeaving(false);
        if (track) trackWizardSlideAdvanced({ from_slide: from, to_slide: to, direction });
        // Forward onto the map shows its overview; back from slide 3 shows the deep dive
        // last looked at, the way Figma's separate deep-dive slide would come back.
        if (to === MAP_SLIDE) {
          const step = direction === "next" ? 0 : lastDiveRef.current;
          stepRef.current = step;
          setMapStep(step);
        }
        slideRef.current = to;
        setSlideIndex(to);
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
      }, LEAVE_MS);
    },
    [track]
  );

  const goNext = useCallback(() => {
    if (busyRef.current) return;
    const slide = slideRef.current;
    if (slide === MAP_SLIDE && stepRef.current === 0) {
      moveMap(1, "continue");
      return;
    }
    if (slide >= WIZARD_SLIDE_COUNT - 1) {
      busyRef.current = true;
      setIsLeaving(true);
      setTimeout(exit, LEAVE_MS);
      return;
    }
    moveSlide(slide + 1, "next");
  }, [exit, moveMap, moveSlide]);

  const goBack = useCallback(() => {
    if (busyRef.current) return;
    const slide = slideRef.current;
    if (slide === MAP_SLIDE && stepRef.current > 0) {
      moveMap(0, "back");
      return;
    }
    if (slide === 0) return;
    moveSlide(slide - 1, "previous");
  }, [moveMap, moveSlide]);

  const handleSkip = useCallback(() => {
    if (busyRef.current) return;
    exit();
  }, [exit]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target instanceof Element ? e.target : null;
      switch (e.key) {
        case "Enter":
          // A focused button already acts on Enter; acting here too would move twice.
          if (target?.closest("button, a, input, textarea, select")) return;
          goNext();
          break;
        case "ArrowRight":
          goNext();
          break;
        case "ArrowLeft":
          goBack();
          break;
        case "ArrowDown":
        case "ArrowUp": {
          if (slideRef.current !== MAP_SLIDE || busyRef.current) return;
          const step = stepRef.current;
          const to = e.key === "ArrowDown" ? Math.min(step + 1, MAP_STEPS) : step - 1;
          // ▲ stops at the first deep dive, as its button does.
          if (to < 1) return;
          e.preventDefault();
          moveMap(to, e.key === "ArrowDown" ? "next" : "previous");
          break;
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goBack, goNext, moveMap]);

  // A mostly horizontal swipe of 50px or more moves a slide.
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
  }, []);
  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touchStart.current;
      const t = e.changedTouches[0];
      touchStart.current = null;
      if (!start || !t) return;
      const dx = start.x - t.clientX;
      const dy = start.y - t.clientY;
      if (Math.abs(dx) < 50 || Math.abs(dy) >= Math.abs(dx)) return;
      if (dx > 0) goNext();
      else goBack();
    },
    [goBack, goNext]
  );

  const isLast = slideIndex >= WIZARD_SLIDE_COUNT - 1;
  const textSlide = TEXT_SLIDES[slideIndex];

  return (
    <main
      className="wz-root relative min-h-[100dvh] overflow-hidden bg-[#140a1a]"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        touchAction: "pan-y",
        opacity: isExiting ? 0 : hasEntered ? 1 : 0,
        transition: `opacity ${isExiting ? 600 : 800}ms ${EASE}`,
      }}
    >
      {/* The 393 canvas, centred; from 1024px the 1120 desktop frame (wizard-desktop.css). */}
      <div className="wz-frame relative mx-auto h-[100dvh] w-full max-w-[393px]">
        <Blobs map={slideIndex === MAP_SLIDE} />

        {/* data-lenis-prevent: the column is the scroller, and the page's smooth scroll
         * (Lenis, desktop) would otherwise cancel the wheel over it; on a 650px-tall
         * window CONTINUE and Back sat below the fold, out of a mouse's reach. */}
        <div
          ref={scrollRef}
          data-lenis-prevent
          className="wz-scroll relative z-10 flex h-full flex-col overflow-y-auto overflow-x-hidden px-6 py-12"
        >
          {/* 1049:1241 — two lines in its 68px, its right edge 17 in from the canvas's. */}
          <button
            type="button"
            onClick={handleSkip}
            className="wz-skip absolute right-[17px] top-12 z-20 w-[68px] text-center font-sans text-[12px] font-bold uppercase leading-[18px] tracking-[1.2px] text-white/50 transition hover:text-white/80 focus-visible-ring"
          >
            Skip Intro
          </button>

          {/* The 640px slot keeps the bar and the buttons where every frame draws them. Its
           * basis is a class, so a desktop can let it fill the frame. */}
          <div
            key={slideIndex}
            className="wz-slot flex w-full flex-[0_1_640px] flex-col items-start"
            style={{
              opacity: isLeaving ? 0 : 1,
              transform: isLeaving ? "translateY(-8px)" : "translateY(0)",
              transition: `opacity ${LEAVE_MS}ms ${EASE}, transform ${LEAVE_MS}ms ${EASE}`,
            }}
          >
            {textSlide ? (
              <TextSlideView slide={textSlide} />
            ) : (
              <div
                className="wz-map survey-animate w-full"
                style={{ opacity: 0, animation: `survey-fade-in 600ms ${EASE} both` }}
              >
                <WizardReportMap step={mapStep} onStep={(to, control) => moveMap(to, control)} />
              </div>
            )}
          </div>

          <div className="wz-footer w-full shrink-0">
            {/* 1049:1219 — six segments, filled up to this slide. */}
            <div className="flex h-1 w-full max-w-[448px] gap-3">
              {Array.from({ length: WIZARD_SLIDE_COUNT }, (_, i) => {
                const filled = i <= slideIndex;
                return (
                  <div
                    key={i}
                    data-wizard-segment
                    data-filled={filled}
                    className="relative h-1 flex-1 rounded-full transition-shadow duration-500 motion-reduce:transition-none"
                    style={{
                      background: "rgba(255,255,255,0.1)",
                      boxShadow: filled ? "0 0 8px 0 rgba(254,104,57,0.5)" : "none",
                    }}
                  >
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-[#fe6839] transition-[width] duration-500 motion-reduce:transition-none"
                      style={{ width: filled ? "100%" : "0%", transitionTimingFunction: EASE }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="relative h-6">
              <span className="absolute left-0 top-1 whitespace-nowrap font-sans text-[12px] font-medium leading-[18px] tracking-[0.5px] text-white/30">
                {`${slideIndex + 1} / ${WIZARD_SLIDE_COUNT}`}
              </span>
            </div>

            {/* 1049:1235 — slide 1 draws CONTINUE alone, at the left; the rest pair it with Back.
             * A desktop keeps CONTINUE at the right, as Mark's desktop frames do. */}
            <div className="wz-nav flex items-center justify-between pt-10">
              {slideIndex > 0 ? (
                <button
                  ref={backRef}
                  type="button"
                  onClick={() => {
                    refocusRef.current = document.activeElement === backRef.current;
                    goBack();
                  }}
                  aria-label="Go to previous slide"
                  className="wz-back flex h-12 w-12 items-center justify-center rounded-full transition hover:-translate-y-[1px] focus-visible-ring"
                  style={{
                    background: "rgba(254,104,57,0.1)",
                    border: "1px solid rgba(254,104,57,0.3)",
                  }}
                >
                  <Image
                    src="/survey/wizard/arrow-left.svg"
                    alt=""
                    width={20}
                    height={20}
                    unoptimized
                    className="block h-5 w-5"
                  />
                </button>
              ) : null}
              {/* Each name holds the word the button shows (WCAG 2.5.3). */}
              <button
                ref={continueRef}
                type="button"
                onClick={goNext}
                aria-label={isLast ? "Continue to your report" : "Continue to next slide"}
                className="wz-continue inline-flex h-12 items-center gap-3 rounded-full bg-[#fe6839] px-7 font-sans text-[14px] font-bold uppercase leading-5 tracking-[1.4px] text-white transition hover:-translate-y-[1px] focus-visible-ring"
                style={{
                  filter:
                    "drop-shadow(0 10px 7.5px rgba(254,104,57,0.2)) drop-shadow(0 4px 3px rgba(254,104,57,0.2))",
                }}
              >
                Continue
                <Image
                  src="/survey/wizard/arrow-right.svg"
                  alt=""
                  width={18}
                  height={18}
                  unoptimized
                  className="block h-[18px] w-[18px]"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default PreReportWizard;
