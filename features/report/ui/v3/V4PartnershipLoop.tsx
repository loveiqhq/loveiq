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
 * LOCKED (612:862): the orbit and the slides are blurred, the pager is left sharp,
 * and the brand lock sits on the seam between them — the lock goes on visuals only
 * (V4LockBadge). The slides' lines arrive as the server sends them (lockedBlurCopy.ts:
 * the real lines since review 26.09), and a tap anywhere on the section opens the
 * paywall.
 *
 * The step names and colours are the same for every archetype and live here; only
 * the two lines on each card are the archetype's, and arrive as props.
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
  const stepRef = useRef(0);

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
      const at = Math.min(LOOP_STEPS.length - 1, Math.max(0, viewport.scrollLeft / step));
      orbitRef.current?.style.setProperty("--orbit-rot", `${Math.round(at * 60 * 100) / 100}deg`);
      setActive(Math.round(at));
    };
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

  const goTo = (index: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const left = index * (stepRef.current || measure());
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof viewport.scrollTo === "function") {
      viewport.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
    } else {
      viewport.scrollLeft = left;
    }
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
      <div className="rv4-loop__orbit-box" aria-hidden={locked ? true : undefined} inert={locked}>
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
            <p className="rv4-loop__prompt">Swipe the cards below to follow the loop.</p>
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
                  style={at}
                  tabIndex={-1}
                  aria-label={`Show ${step.title}`}
                  onClick={() => goTo(i)}
                />
                <span
                  className={`rv4-loop__label rv4-loop__label--${LABEL_SIDE[i]}${
                    i === active ? " is-active" : ""
                  }`}
                  style={at}
                >
                  {step.title}
                </span>
              </Fragment>
            );
          })}
          {/* 532:259 — rides the ring with the scroll (--orbit-rot). */}
          <span className="rv4-loop__indicator" />
        </div>
      </div>

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
                className={`rv4-loop__slide${i === active ? " is-active" : ""}`}
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

      {/* 532:399 — six dots joined by hairlines; sharp even when locked. */}
      <div className="rv4-loop__pager" role="group" aria-label="Loop steps" inert={locked}>
        {LOOP_STEPS.map((step, i) => (
          <Fragment key={step.title}>
            {i > 0 ? <span className="rv4-loop__pager-line" aria-hidden="true" /> : null}
            <button
              type="button"
              className={`rv4-loop__pager-dot${i === active ? " is-active" : ""}`}
              aria-label={`Show ${step.title}`}
              aria-current={i === active ? "true" : undefined}
              onClick={() => goTo(i)}
            />
          </Fragment>
        ))}
      </div>

      {/* 612:1002 — on the seam between the orbit and the slides. */}
      {locked ? <V4LockBadge /> : null}
    </section>
  );
};

export default V4PartnershipLoop;
