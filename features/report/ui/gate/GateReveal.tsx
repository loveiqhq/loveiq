"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FC } from "react";
import type {
  GateReveal as GateRevealData,
  GateRevealAspectKey,
} from "@features/report/logic/gateReveal";
import { v4ArchetypeColors } from "../v3/v4ArchetypeColors";
import { useV4CountUp } from "../v3/useV4CountUp";
import { GATE_REVEAL_COPY } from "./gateRevealContent";
import "./gate-reveal.css";

/** The board's card (296px) and the gap between two (12px): one step of the carousel. */
const CARD_STEP = 308;

/** The ring: r 26 in a 60 box, drawn at 76px. */
const RING_C = 2 * Math.PI * 26;

const reducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** The board's icon for each aspect (lucide-style, 23px, the archetype's glyph colour). */
const AspectIcon: FC<{ aspect: GateRevealAspectKey }> = ({ aspect }) => {
  const common = {
    width: 23,
    height: 23,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
    focusable: false,
  } as const;
  switch (aspect) {
    case "motivation":
      return (
        <svg {...common} {...stroke} strokeWidth={1.8}>
          <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
          <path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
          <path d="M12 12.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z" />
        </svg>
      );
    case "communication":
      return (
        <svg {...common} {...stroke} strokeWidth={1.5}>
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        </svg>
      );
    case "initiation":
      return (
        <svg {...common} {...stroke} strokeWidth={1.5}>
          <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      );
    case "attachment":
      return (
        <svg {...common} {...stroke} strokeWidth={1.5}>
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </svg>
      );
    case "power":
      return (
        <svg {...common} {...stroke} strokeWidth={1.5}>
          <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
        </svg>
      );
  }
};

/** The match as a ring that fills while its number counts up, once, as the page opens. */
const MatchRing: FC<{ match: number; archetype: string }> = ({ match, archetype }) => {
  const [run, setRun] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setRun(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const shown = useV4CountUp(match, run, { duration: 1400, delay: 200 });
  const filled = (RING_C * Math.max(0, Math.min(100, match))) / 100;
  return (
    <div
      className="iugr-ring"
      role="img"
      aria-label={GATE_REVEAL_COPY.ringLabel(match, archetype)}
      data-gate-ring
    >
      <svg width="76" height="76" viewBox="0 0 60 60" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="iugr-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fe6839" />
            <stop offset="50%" stopColor="#bf66d9" />
            <stop offset="100%" stopColor="#958ef6" />
          </linearGradient>
        </defs>
        <circle cx="30" cy="30" r="26" fill="none" stroke="#e9e7f2" strokeWidth="5" />
        <circle
          className={`iugr-ring__arc${run ? " is-run" : ""}`}
          cx="30"
          cy="30"
          r="26"
          fill="none"
          stroke="url(#iugr-ring)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${RING_C}`}
          transform="rotate(-90 30 30)"
          style={{ "--iugr-arc": `${filled}` } as CSSProperties}
        />
      </svg>
      <span className="iugr-ring__label" aria-hidden="true">
        <span className="iugr-ring__value">{`${shown}%`}</span>
        <span className="iugr-ring__match">{GATE_REVEAL_COPY.match}</span>
      </span>
    </div>
  );
};

/** One aspect card: open (its sentence) or locked (a blurred stand-in under the lock). */
const AspectCard: FC<{
  aspect: GateRevealData["aspects"][number];
  index: number;
  total: number;
  onLocked: () => void;
}> = ({ aspect, index, total, onLocked }) => (
  <li
    className="iugr-card"
    aria-roledescription="slide"
    aria-label={GATE_REVEAL_COPY.cardLabel(index + 1, total)}
    data-gate-aspect={aspect.key}
    data-locked={aspect.locked || undefined}
  >
    <div className="iugr-card__head">
      <span className="iugr-card__icon">
        <AspectIcon aspect={aspect.key} />
      </span>
      <span className="iugr-card__labels">
        <span className="iugr-card__title">{aspect.title}</span>
        <span className="iugr-card__sub">{aspect.subtitle}</span>
      </span>
    </div>
    <p className="iugr-card__value">{aspect.value}</p>
    {aspect.locked ? (
      <div className="iugr-card__veil">
        <p className="iugr-card__body iugr-card__body--veiled" aria-hidden="true">
          {aspect.body}
        </p>
        <button
          type="button"
          className="iugr-card__lock"
          aria-label={GATE_REVEAL_COPY.locked}
          onClick={onLocked}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            {...stroke}
            strokeWidth={1.9}
            aria-hidden="true"
            focusable="false"
          >
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </button>
      </div>
    ) : (
      <p className="iugr-card__body">{aspect.body}</p>
    )}
  </li>
);

/** The carousel: swipe or scroll natively; ‹ ›, the dots and the keys move one card. */
const AspectCarousel: FC<{ aspects: GateRevealData["aspects"]; onLocked: () => void }> = ({
  aspects,
  onLocked,
}) => {
  const track = useRef<HTMLUListElement | null>(null);
  const [active, setActive] = useState(0);
  const total = aspects.length;

  const go = useCallback(
    (i: number) => {
      const el = track.current;
      const to = Math.max(0, Math.min(total - 1, i));
      if (!el) return;
      el.scrollTo({ left: to * CARD_STEP, behavior: reducedMotion() ? "auto" : "smooth" });
      setActive(to);
    },
    [total]
  );

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setActive(Math.max(0, Math.min(total - 1, Math.round(el.scrollLeft / CARD_STEP))))
      );
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
    };
  }, [total]);

  return (
    <section
      className="iugr-carousel"
      aria-roledescription="carousel"
      aria-label={GATE_REVEAL_COPY.carouselLabel}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          go(active + 1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          go(active - 1);
        }
      }}
    >
      <ul ref={track} className="iugr-carousel__track" data-gate-carousel>
        {aspects.map((aspect, i) => (
          <AspectCard
            key={aspect.key}
            aspect={aspect}
            index={i}
            total={total}
            onLocked={onLocked}
          />
        ))}
      </ul>
      <div className="iugr-carousel__controls">
        <button
          type="button"
          className="iugr-carousel__arrow"
          aria-label={GATE_REVEAL_COPY.previous}
          disabled={active === 0}
          onClick={() => go(active - 1)}
        >
          <span aria-hidden="true">‹</span>
        </button>
        {aspects.map((aspect, i) => (
          <button
            key={aspect.key}
            type="button"
            className="iugr-carousel__dot"
            aria-label={GATE_REVEAL_COPY.dot(i + 1)}
            aria-current={i === active ? "true" : undefined}
            onClick={() => go(i)}
          >
            <span className={`iugr-carousel__pip${i === active ? " is-active" : ""}`} />
          </button>
        ))}
        <button
          type="button"
          className="iugr-carousel__arrow"
          aria-label={GATE_REVEAL_COPY.next}
          disabled={active === total - 1}
          onClick={() => go(active + 1)}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </section>
  );
};

const Tick: FC = () => (
  <span className="iugr-why__tick" aria-hidden="true">
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2e7d5b"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  </span>
);

/**
 * The top of Mark's redesigned page, under the way out and the badge: the reader's Core
 * Archetype with its match ring and one line, the aspect carousel (two open, three locked),
 * then why to unlock. A lock takes the reader to the price card.
 */
export const GateReveal: FC<{ reveal: GateRevealData; onLocked: () => void }> = ({
  reveal,
  onLocked,
}) => {
  const { nameInk, glyph } = v4ArchetypeColors(reveal.archetype);
  return (
    <div
      className="iugr"
      data-gate-reveal
      style={{ "--iugr-name": nameInk, "--iugr-glyph": glyph } as CSSProperties}
    >
      <div className="iugr-head">
        <MatchRing match={reveal.matchStrength} archetype={reveal.archetype} />
        <h1 className="iugr-head__name">{reveal.archetype}</h1>
      </div>
      {reveal.blurb ? <p className="iugr-blurb">{reveal.blurb}</p> : null}
      <AspectCarousel aspects={reveal.aspects} onLocked={onLocked} />
      <div className="iugr-why">
        <div className="iugr-why__rule" role="separator" />
        <h2 className="iugr-why__title">
          {GATE_REVEAL_COPY.why.lead}
          <span className="iugr-why__emph">{GATE_REVEAL_COPY.why.emph}</span>
        </h2>
        <ul className="iugr-why__list">
          {GATE_REVEAL_COPY.whyItems.map((item) => (
            <li className="iugr-why__item" key={item}>
              <Tick />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
