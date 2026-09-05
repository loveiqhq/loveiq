"use client";

import { useEffect, useRef, useState, type FC } from "react";

/**
 * Chapter 2.2 "Typical Beliefs", V3 layout — Figma 10392:19945
 * ("Typical Beliefs — MOBILE 393 — V4 TURN (mid-scroll)").
 *
 * The frame's name is the spec: each limiting belief TURNS into its supportive
 * version as the reader scrolls past it. Figma captures a mid-scroll moment —
 * rows 1-4 already turned (green), row 5 caught mid-transition showing both
 * lines, rows 6-10 untouched. So this is one-way per row: once a row has
 * crossed the flip line it stays turned, which reads far better than a value
 * that flickers as the reader scrolls back and forth.
 *
 * Same data as V1: `copy.loosen` supplies the belief/shift pairs and
 * `copy.keep` the beliefs already worth holding.
 */

const Tick: FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const ChevronUp: FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m18 15-6-6-6 6" />
  </svg>
);

interface Props {
  loosen: { belief: string | null; shift: string | null }[];
  keep: (string | null)[];
}

const V3Beliefs: FC<Props> = ({ loosen, keep }) => {
  const listRef = useRef<HTMLDivElement>(null);
  const [turned, setTurned] = useState<number>(0);
  const [keepOpen, setKeepOpen] = useState(true);

  const rows = loosen.filter((r) => r.belief);
  const keeps = keep.filter((k): k is string => !!k);

  // One-way: `turned` only ever grows, so scrolling back up does not un-turn a
  // belief the reader has already been shown.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // Reduced motion turns everything at once. Routed through the same rAF path
    // rather than a direct setState here, which would be a synchronous state
    // update inside an effect.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const line = reduced ? Number.POSITIVE_INFINITY : window.innerHeight * 0.62;
        let count = 0;
        el.querySelectorAll<HTMLElement>(".rv3-belief").forEach((row) => {
          if (row.getBoundingClientRect().top < line) count += 1;
        });
        setTurned((prev) => (count > prev ? count : prev));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [rows.length]);

  if (!rows.length && !keeps.length) return null;

  return (
    <div className="rv3-beliefs" data-node-id="10392:19945">
      {rows.length ? (
        <>
          <header className="rv3-beliefs__head">
            <div>
              <p className="rv3-beliefs__eyebrow">Beliefs that shut down desire</p>
              <p className="rv3-beliefs__sub">
                Keep scrolling to see what to replace these with.
              </p>
            </div>
            <span className="rv3-beliefs__count">{rows.length}</span>
          </header>

          <div className="rv3-beliefs__band" aria-hidden="true">
            <span className="rv3-beliefs__band-left">
              <i className="rv3-beliefs__dot rv3-beliefs__dot--shut" />
              As it stands
            </span>
            <span className="rv3-beliefs__band-right">
              Turned supportive
              <i className="rv3-beliefs__dot rv3-beliefs__dot--open" />
            </span>
          </div>

          <div className="rv3-beliefs__list" ref={listRef}>
            {rows.map((row, i) => {
              const on = i < turned && !!row.shift;
              return (
                <div key={row.belief} className={`rv3-belief${on ? " is-on" : ""}`}>
                  <span className="rv3-belief__rule" aria-hidden="true">
                    <span className="rv3-belief__rule-fill" />
                  </span>
                  <div className="rv3-belief__text">
                    <p className="rv3-belief__was">{row.belief}</p>
                    {row.shift ? (
                      <>
                        <p className="rv3-belief__now">{row.shift}</p>
                        <span className="rv3-belief__chip">
                          <Tick />
                          The shift
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {keeps.length ? (
        <section className={`rv3-keeps${keepOpen ? " is-open" : ""}`} data-node-id="10392:20020">
          <button
            type="button"
            className="rv3-keeps__head"
            aria-expanded={keepOpen}
            onClick={() => setKeepOpen((v) => !v)}
          >
            <span className="rv3-keeps__num">{keeps.length}</span>
            <span className="rv3-keeps__head-text">
              <span className="rv3-keeps__title">Already opening your desire</span>
              <span className="rv3-keeps__sub">Worth keeping exactly as they are</span>
            </span>
            <span className="rv3-keeps__chev" aria-hidden="true">
              <ChevronUp />
            </span>
          </button>
          <div className="rv3-keeps__body">
            <div>
              <ul className="rv3-keeps__list">
                {keeps.map((k) => (
                  <li key={k}>
                    <span className="rv3-keeps__tick" aria-hidden="true">
                      <Tick />
                    </span>
                    {k}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default V3Beliefs;
