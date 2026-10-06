"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FC,
} from "react";
import type { Report3LoopStage } from "@/data/report3-partnership";
import PagerChevron from "./PagerChevron";
import useV4Reveal from "./useV4Reveal";
import V4LockBadge from "./V4LockBadge";
import { guardedUnlock } from "./v4Unlock";

/**
 * "Section - SPARK SEEKER LOOP" — Figma 532:231 in the Challenges in Partnerships
 * chapter (612:862 when locked): an orbit of the loop's six steps above a row of
 * centre-snapped slides, one per step, and a pager under them.
 *
 * The frames were drawn from the Sexual Stage Explorer's mobile layout (their layer
 * names are its DOM: `stage-explorer__mobile-orbit`, `stage-card__need`…), and the
 * behaviour is that one's: the slides are a native horizontal scroller, and the
 * orbit's indicator rides the ring 1:1 with it — 60° a step — so a swipe, a pager
 * tap and an orbit tap all move the same thing. The active step is read from
 * `scrollLeft` once a frame, as V3DimensionDeck does.
 *
 * The prompt says "Swipe", not the frame's "Flip": the explorer said "Flip" too, and
 * Clarity logged readers tapping its cards (SexualStageExplorer.tsx). Fatih's call,
 * 2026-09-24.
 *
 * LOCKED (612:862): the orbit, the slides and — since the 28.09 mobile review ("lets
 * blur also the navigational element of the visualisation") — the pager are blurred,
 * and the brand lock sits on the seam between them — the lock goes on visuals only
 * (V4LockBadge). The slides' lines arrive as the server sends them (lockedBlurCopy.ts:
 * the real lines since review 26.09), and a tap anywhere on the section opens the
 * paywall.
 *
 * THE PULSE (review 27.09). Mark: "let's have the dot of The Situation pulsated when
 * it comes into view. Ideally for a few seconds." At rest the violet indicator sits on
 * The Situation's dot, so the indicator is what pulses: a halo breathing out of it for
 * three beats once the orbit is 60% up the screen (never where nobody is looking: the
 * reveal has no catch-up), over for good once the beats end or the reader moves on.
 * Never on a locked loop.
 *
 * The step names and colours are the same for every archetype and live here; only
 * the two lines on each card are the archetype's, and arrive as props.
 *
 * DESKTOP (review 01.10, Mark: "This also needs a frame, and arrows to click. This is too
 * mobile designed right now. Also there shouldnt be much space when you navigated to the
 * last tile."). From 700px the slides sit in the galleries' frame, start-aligned from a
 * 22px inset that ends as far after the last card, and Previous / Next step the loop.
 * The track stops once the last card is whole, three steps short of it, so a step is
 * HELD: the orbit and the highlight go to it at once, and the track scrolls only for a
 * card not yet whole. The reader's own sideways scroll (wheel, drag, keys) lets the
 * scroll lead again. The phone keeps its centred swipe and its reading of the scroll.
 */

export const LOOP_STEPS = [
  { title: "The Situation", dot: "#B3B3B3", label: "#A5B4FC" },
  { title: "My Interpretation", dot: "#A78BFA", label: "#C4B5FD" },
  { title: "My Reaction", dot: "#A78BFA", label: "#D8B4FE" },
  { title: "Their Interpretation", dot: "#F472B6", label: "#F0ABFC" },
  { title: "Their Reaction", dot: "#F472B6", label: "#F9A8D4" },
  { title: "My Confirmation", dot: "#A78BFA", label: "#FDA4AF" },
] as const;

/** 532:245 — the dots sit on a 105px radius of the 224px orbit. */
const DOT_RADIUS_PCT = (105 / 224) * 100;

/** Where each step's label sits against its dot (552:233). */
const LABEL_SIDE = ["top", "right", "right", "bottom", "left", "left"] as const;

/** 532:250 — the two-arrow cycle glyph at the orbit's centre. */
const CycleIcon: FC = () => (
  <svg
    className="rv4-loop__icon"
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    aria-hidden="true"
  >
    <path d="M2 8a6 6 0 0 1 10.5-3.9" strokeLinecap="round" />
    <path d="M14 8a6 6 0 0 1-10.5 3.9" strokeLinecap="round" />
    <path d="M11.5 1.5l1 2.6-2.6 1" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4.5 14.5l-1-2.6 2.6-1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface Props {
  /** The six steps' lines, in orbit order; when locked, as lockedBlurCopy.ts decides. */
  stages: readonly Report3LoopStage[];
  locked?: boolean;
  /** Opens the paywall from the locked section. */
  onUnlock?: () => void;
}

const V4PartnershipLoop: FC<Props> = ({ stages, locked = false, onUnlock }) => {
  const [active, setActive] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const stepRef = useRef(0);
  const [orbitBoxRef, orbitSeen] = useV4Reveal<HTMLDivElement>({
    band: 0.6,
    catchUp: false,
    enabled: !locked,
  });
  const [movedOn, setMovedOn] = useState(false);
  const [pulseDone, setPulseDone] = useState(false);
  const pulsing = orbitSeen && !movedOn && !pulseDone;
  // From 700px: the arrows' held step (see DESKTOP above).
  const [desktop, setDesktop] = useState(false);
  const desktopRef = useRef(false);
  const [held, setHeld] = useState<number | null>(null);
  const heldRef = useRef<number | null>(null);
  const readRef = useRef<() => void>(() => {});
  const shown = desktop && held !== null ? held : active;

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(min-width: 700px)");
    const update = () => {
      desktopRef.current = query.matches;
      setDesktop(query.matches);
      // Below 700px the swipe leads alone: a step the arrows held must not keep the orbit
      // from following it (final review, 01.10).
      if (!query.matches && heldRef.current !== null) {
        heldRef.current = null;
        setHeld(null);
        readRef.current();
      }
    };
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  // The slide pitch, measured rather than assumed: it narrows with the viewport
  // (slides are min(320px, 100% - 32px) wide). Zero until the section is laid out
  // — inside a collapsed chapter it is display:none.
  const measure = useCallback(() => {
    const slides = viewportRef.current?.querySelectorAll<HTMLElement>(".rv4-loop__slide");
    const pitch = slides && slides.length > 1 ? slides[1]!.offsetLeft - slides[0]!.offsetLeft : 0;
    stepRef.current = pitch > 0 ? pitch : 0;
    return stepRef.current;
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let frame = 0;
    let queued = false;
    const read = () => {
      queued = false;
      const step = stepRef.current || measure();
      if (!step) return;
      // A desktop's track stops once the last card is whole, three and a half pitches in,
      // so its scroll range is spread over the six steps; the phone centres each card.
      const max = viewport.scrollWidth - viewport.clientWidth;
      const steps = LOOP_STEPS.length - 1;
      const raw =
        desktopRef.current && max > 0
          ? (viewport.scrollLeft / max) * steps
          : viewport.scrollLeft / step;
      const at = Math.min(steps, Math.max(0, raw));
      // A held step keeps the orbit where the arrows put it (desktop).
      if (heldRef.current === null) {
        orbitRef.current?.style.setProperty("--orbit-rot", `${Math.round(at * 60 * 100) / 100}deg`);
      }
      setActive(Math.round(at));
      // The pulse points at The Situation; once the reader has left it, it is done.
      if (Math.round(at) !== 0) setMovedOn(true);
    };
    readRef.current = read;
    const onScroll = () => {
      // Set before scheduling: a frame callback that runs synchronously clears it.
      if (queued) return;
      queued = true;
      frame = requestAnimationFrame(read);
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    // A chapter opening, a rotation or a font swap changes the pitch.
    const resize =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            stepRef.current = 0;
            read();
          })
        : null;
    resize?.observe(viewport);
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      resize?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [measure]);

  // The halo is the indicator's ::after, whose animationend reaches the indicator. A
  // native listener, because jsdom cannot fire React's onAnimationEnd.
  useEffect(() => {
    const indicator = indicatorRef.current;
    if (!pulsing || !indicator) return;
    const end = () => setPulseDone(true);
    indicator.addEventListener("animationend", end);
    return () => indicator.removeEventListener("animationend", end);
  }, [pulsing]);

  // The reader's own sideways scroll lets the scroll lead again (desktop): a sideways
  // wheel, the arrow keys, a touch drag, or a press on the scrollbar. A vertical wheel
  // over the loop is the page scrolling, and a click on a card is not a scroll (final
  // review, 01.10: it swung the orbit back from the last step).
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!desktop || !viewport) return;
    const release = () => {
      if (heldRef.current === null) return;
      heldRef.current = null;
      setHeld(null);
      readRef.current();
    };
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) release();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") release();
    };
    const onPointer = (event: PointerEvent) => {
      if (event.target === viewport) release();
    };
    viewport.addEventListener("wheel", onWheel, { passive: true });
    viewport.addEventListener("pointerdown", onPointer, { passive: true });
    viewport.addEventListener("touchmove", release, { passive: true });
    viewport.addEventListener("keydown", onKey);
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("pointerdown", onPointer);
      viewport.removeEventListener("touchmove", release);
      viewport.removeEventListener("keydown", onKey);
    };
  }, [desktop]);

  const goTo = (index: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scroll = (left: number) => {
      if (typeof viewport.scrollTo === "function") {
        viewport.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
      } else {
        viewport.scrollLeft = left;
      }
    };
    if (desktop) {
      const k = Math.min(LOOP_STEPS.length - 1, Math.max(0, index));
      heldRef.current = k;
      setHeld(k);
      orbitRef.current?.style.setProperty("--orbit-rot", `${k * 60}deg`);
      if (k !== 0) setMovedOn(true);
      // Scroll only for a card not yet whole, and never past the end.
      const slide = viewport.querySelectorAll<HTMLElement>(".rv4-loop__slide")[k];
      if (!slide) return;
      const box = viewport.getBoundingClientRect();
      const from = box.left + viewport.clientLeft;
      const card = slide.getBoundingClientRect();
      if (card.left >= from - 1 && card.left + card.width <= from + viewport.clientWidth + 1) {
        return;
      }
      const max = viewport.scrollWidth - viewport.clientWidth;
      scroll(Math.max(0, Math.min(max, k * (stepRef.current || measure()))));
      return;
    }
    scroll(index * (stepRef.current || measure()));
  };

  return (
    <section
      className={`rv4-loop${locked ? " is-locked" : ""}`}
      data-node-id={locked ? "612:862" : "532:231"}
      data-name="Section - SPARK SEEKER LOOP"
      onClick={locked ? guardedUnlock(onUnlock) : undefined}
    >
      {/* 532:243 — the orbit, 224px, labels outside the ring. A mouse shortcut to a
       * step; the pager below is the keyboard path, so the orbit is hidden from
       * assistive tech and its dots are out of the tab order. */}
      <div
        ref={orbitBoxRef}
        className="rv4-loop__orbit-box"
        aria-hidden={locked ? true : undefined}
        inert={locked}
      >
        <div
          ref={orbitRef}
          className="rv4-loop__orbit"
          data-node-id="532:245"
          aria-hidden="true"
          style={{ "--orbit-rot": "0deg" } as CSSProperties}
        >
          <span className="rv4-loop__ring rv4-loop__ring--outer" />
          <span className="rv4-loop__ring rv4-loop__ring--mid" />
          <span className="rv4-loop__ring rv4-loop__ring--inner" />
          <div className="rv4-loop__center">
            <CycleIcon />
            {/* The phone swipes; from 700px the arrows lead (review 01.10). */}
            <p className="rv4-loop__prompt">
              <span className="rv4-loop__prompt-touch">
                Swipe the cards below to follow the loop.
              </span>
              <span className="rv4-loop__prompt-pointer">Use the arrows to follow the loop.</span>
            </p>
          </div>
          {LOOP_STEPS.map((step, i) => {
            const angle = ((-90 + i * 60) * Math.PI) / 180;
            const at = {
              left: `${50 + DOT_RADIUS_PCT * Math.cos(angle)}%`,
              top: `${50 + DOT_RADIUS_PCT * Math.sin(angle)}%`,
            };
            return (
              <Fragment key={step.title}>
                <button
                  type="button"
                  className="rv4-loop__dot"
                  style={{ ...at, "--rv4-loop-dot": step.dot } as CSSProperties}
                  tabIndex={-1}
                  aria-label={`Show ${step.title}`}
                  onClick={() => goTo(i)}
                />
                {/* Tappable too (review 27.09: "It is hard to click the stages/dots"):
                 * a reader aims at the words as often as at the 11px dot. */}
                <span
                  className={`rv4-loop__label rv4-loop__label--${LABEL_SIDE[i]}${
                    i === shown ? " is-active" : ""
                  }`}
                  style={at}
                  onClick={() => goTo(i)}
                >
                  {step.title}
                </span>
              </Fragment>
            );
          })}
          {/* 532:259 — rides the ring with the scroll (--orbit-rot). */}
          <span
            ref={indicatorRef}
            className={`rv4-loop__indicator${pulsing ? " is-pulsing" : ""}`}
          />
        </div>
      </div>

      {/* The cards and their pager. From 700px they sit in the galleries' frame (review
       * 01.10); the phone draws no frame. */}
      <div className="rv4-loop__deck">
        {/* 532:262 — the slides, centre-snapped, the next one peeking in. */}
        <div
          ref={viewportRef}
          className="rv4-loop__viewport"
          role="region"
          aria-roledescription="carousel"
          aria-label="The loop, step by step"
          tabIndex={locked ? -1 : 0}
          aria-hidden={locked ? true : undefined}
          inert={locked}
        >
          <div className="rv4-loop__track">
            {LOOP_STEPS.map((step, i) => {
              const stage = stages[i];
              return (
                <article
                  key={step.title}
                  className={`rv4-loop__slide${i === shown ? " is-active" : ""}`}
                  aria-roledescription="slide"
                  aria-label={`${step.title} (${i + 1} of ${LOOP_STEPS.length})`}
                  style={
                    {
                      "--rv4-loop-dot": step.dot,
                      "--rv4-loop-label": step.label,
                    } as CSSProperties
                  }
                >
                  <header className="rv4-loop__head">
                    <span className="rv4-loop__bullet" aria-hidden="true" />
                    <h4 className="rv4-loop__title">{step.title}</h4>
                  </header>
                  <dl className="rv4-loop__rows">
                    <div className="rv4-loop__row">
                      <dt className="rv4-loop__term">What Happens</dt>
                      <dd className="rv4-loop__happens">{stage?.happens}</dd>
                    </div>
                  </dl>
                  <div className="rv4-loop__need">
                    <span className="rv4-loop__need-label">What’s Underneath</span>
                    <span className="rv4-loop__need-value">{stage?.underneath}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {/* 532:399 — six dots joined by hairlines; blurred with the rest when locked
         * (612:982), so hidden from assistive tech like the orbit and the slides. */}
        <div
          className="rv4-loop__pager"
          role="group"
          aria-label="Loop steps"
          aria-hidden={locked || undefined}
          inert={locked}
        >
          {/* From 700px only (review 01.10): Previous and Next either side of the dots. The
           * arrows stay focusable at the ends (aria-disabled), so a keyboard keeps its place. */}
          <button
            type="button"
            className="rv4-loop__arrow"
            aria-label="Previous step"
            aria-disabled={shown <= 0 || undefined}
            onClick={() => {
              if (shown > 0) goTo(shown - 1);
            }}
          >
            <PagerChevron back />
          </button>
          {LOOP_STEPS.map((step, i) => (
            <Fragment key={step.title}>
              {i > 0 ? <span className="rv4-loop__pager-line" aria-hidden="true" /> : null}
              <button
                type="button"
                className={`rv4-loop__pager-dot${i === shown ? " is-active" : ""}`}
                aria-label={`Show ${step.title}`}
                aria-current={i === shown ? "true" : undefined}
                onClick={() => goTo(i)}
              />
            </Fragment>
          ))}
          <button
            type="button"
            className="rv4-loop__arrow"
            aria-label="Next step"
            aria-disabled={shown >= LOOP_STEPS.length - 1 || undefined}
            onClick={() => {
              if (shown < LOOP_STEPS.length - 1) goTo(shown + 1);
            }}
          >
            <PagerChevron />
          </button>
        </div>
      </div>

      {/* 612:1002 — on the seam between the orbit and the slides. */}
      {locked ? <V4LockBadge /> : null}
    </section>
  );
};

export default V4PartnershipLoop;
