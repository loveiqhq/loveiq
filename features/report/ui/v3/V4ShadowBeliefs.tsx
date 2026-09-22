"use client";

import { useEffect, useRef, useState, type FC } from "react";
import type { Report3BeliefTurnView } from "@/data/report3-typical-beliefs";

/**
 * "Typical shadow beliefs" — Figma 368:5482, the coral panel in the Typical
 * Beliefs chapter, and the one genuinely animated element in the report.
 *
 * WHAT THE FRAME ENCODES. Mark drew it mid-scroll and named every row with the
 * animation's own parameter: `krow/1 · turned (p=1)` through `krow/4`, then
 * `krow/5 · CROSSING THE LINE (p=0.5)`, then `krow/6 · at rest (p=0)` to
 * `krow/10`. A dashed `marker/mid-screen line` runs across the frame at the point
 * row 5 is crossing. So a row turns as it passes the middle of the viewport: the
 * shadow belief is struck through rather than removed, its coral minus becomes a
 * green check, and "THE SHIFT" and the sun belief it becomes appear underneath.
 * That marker is an annotation for whoever built this and is NOT rendered.
 *
 * WHY THE TURN IS BINARY, NOT A CONTINUOUS p. `p=0.5` is what the transition looks
 * like halfway through, not a value the page has to compute. Driving it from CSS
 * transitions on one `is-turned` class gets the same picture off the compositor,
 * where a scroll-linked interpolation would mean writing styles from a scroll
 * handler on ten rows at once. It also keeps the strike honest: a partly drawn
 * line-through cannot be expressed across a wrapped line, but
 * `text-decoration-color` fading from transparent to coral can, and reads as the
 * same thing.
 *
 * ACCESSIBILITY. The shift is always in the DOM, only collapsed, so a reader who
 * never scrolls it into view still hears what each belief becomes. Nothing here is
 * interactive, so nothing takes focus.
 */

/**
 * How far above the viewport's middle a row's top must reach before it turns.
 * The frame puts the line at the middle exactly; the 12px is hysteresis, so a row
 * resting on the line does not flicker on every scroll of a pixel.
 */
const TURN_MARGIN_PX = 12;

/**
 * 368:5486 and 368:5566. Panel chrome, so it lives here rather than in
 * report3-typical-beliefs.ts: that module is registered paid copy, and a client
 * component may not reach into it at runtime even for a heading.
 */
const PANEL_TITLE = "Typical shadow beliefs";
const SHIFT_LABEL = "THE SHIFT";

interface Props {
  turns: readonly Report3BeliefTurnView[];
  /**
   * Index of the first LOCKED row, or null when the chapter is open. 381:222 turns
   * rows 1 to 3 and marks row 4 onwards "at rest (p=0) · LOCKED" under a 5px layer
   * blur, which is why one number does both jobs: a locked row never turns AND is
   * blurred. Its shift has already been withheld by the server.
   */
  lockedFrom?: number | null;
}

const V4ShadowBeliefs: FC<Props> = ({ turns, lockedFrom = null }) => {
  const animatedCount = lockedFrom ?? turns.length;
  const rowsRef = useRef<(HTMLLIElement | null)[]>([]);
  const [turned, setTurned] = useState<ReadonlySet<number>>(new Set());
  const queued = useRef(false);
  const frame = useRef(0);

  useEffect(() => {
    const read = () => {
      const line = window.innerHeight / 2;
      const next = new Set<number>();
      rowsRef.current.forEach((el, i) => {
        if (!el || i >= animatedCount) return;
        if (el.getBoundingClientRect().top < line - TURN_MARGIN_PX) next.add(i);
      });
      setTurned((prev) =>
        prev.size === next.size && [...next].every((i) => prev.has(i)) ? prev : next
      );
    };
    // Same coalescing as V4BackToTop, and the same reason for a separate flag:
    // the rAF handle is assigned only after the call returns.
    const onScroll = () => {
      if (queued.current) return;
      queued.current = true;
      frame.current = window.requestAnimationFrame(() => {
        queued.current = false;
        read();
      });
    };

    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame.current) window.cancelAnimationFrame(frame.current);
    };
  }, [animatedCount]);

  return (
    <section className="rv4-turn" data-node-id="368:5482" data-name="Typical shadow beliefs">
      {/* 368:5483 — a blurred coral ellipse bled into the top-right corner. */}
      <span className="rv4-turn__blob" aria-hidden="true" />

      {/* 368:5484 */}
      <h4 className="rv4-turn__head">{PANEL_TITLE}</h4>

      {/* 368:5495 */}
      <ul className="rv4-turn__list">
        {turns.map((turn, i) => {
          const isTurned = turned.has(i);
          return (
            <li
              key={turn.shadow}
              ref={(el) => {
                rowsRef.current[i] = el;
              }}
              className={`rv4-turn__row${isTurned ? " is-turned" : ""}${
                lockedFrom !== null && i >= lockedFrom ? " is-locked" : ""
              }`}
            >
              {/* 368:5557 */}
              <div className="rv4-turn__belief">
                <span className="rv4-turn__tick" aria-hidden="true">
                  <span className="rv4-turn__minus" />
                  <svg className="rv4-turn__check" viewBox="0 0 9 9" fill="none">
                    <path
                      d="M1.4 4.8L3.5 6.9L7.6 2.1"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <p className="rv4-turn__text">{turn.shadow}</p>
              </div>

              {/* 368:5562 — in the DOM at every scroll position, collapsed until the
               * row turns, so it is read aloud either way. Absent entirely on a
               * locked row: the server withheld it, and a row that can never turn
               * would never have shown it. */}
              {turn.shift !== null ? (
                <div className="rv4-turn__shift">
                  <div className="rv4-turn__shift-inner">
                    <span className="rv4-turn__shift-label">
                      <svg className="rv4-turn__shift-check" viewBox="0 0 9 9" fill="none">
                        <path
                          d="M1.4 4.8L3.5 6.9L7.6 2.1"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {SHIFT_LABEL}
                    </span>
                    <p className="rv4-turn__shift-text">{turn.shift}</p>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* 368:5616 — the frame's foot rule, a 9px tick at 75%. */}
      <div className="rv4-turn__foot" aria-hidden="true" />
    </section>
  );
};

export default V4ShadowBeliefs;
