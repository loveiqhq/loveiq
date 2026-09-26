"use client";

import { useEffect, useRef, useState, type FC } from "react";
import type { Report3BeliefTurnView } from "@/data/report3-typical-beliefs";
import V4LockBadge from "./V4LockBadge";
import { guardedUnlock } from "./v4Unlock";

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
 * THE PAYWALLED STATE — 381:222. Rows 1 to 3 still turn. Row 4 is the ramp: the
 * blur fades in over its top half, real copy underneath. Rows 5 to 10 sit under
 * the full blur, their text as the server sends it (lockedBlurCopy.ts). The locked
 * rows live in their own group, which owns the click and carries the gradient lock
 * (441:5956) 100px below its top — inside the group rather than measured from the
 * panel, because rows 1 to 3 grow from 61 to 126px as they turn.
 *
 * ACCESSIBILITY. The shift is always in the DOM, only collapsed, so a reader who
 * never scrolls it into view still hears what each belief becomes. The locked
 * rows are `aria-hidden` and `inert`; the lock badge is the accessible control.
 */

/**
 * How far above the viewport's middle a row's top must reach before it turns.
 * The frame puts the line at the middle exactly; the 12px keeps a row resting on
 * the line from flickering on every scroll of a pixel.
 */
const TURN_MARGIN_PX = 12;

/**
 * 368:5486 and 368:5566. Panel chrome, so it lives here rather than in
 * report3-typical-beliefs.ts: that module is registered paid copy, and a client
 * component may not reach into it at runtime even for a heading.
 */
const PANEL_TITLE = "Typical shadow beliefs";
const SHIFT_LABEL = "THE SHIFT";

const Check: FC<{ className: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 9 9" fill="none">
    <path
      d="M1.4 4.8L3.5 6.9L7.6 2.1"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface Props {
  turns: readonly Report3BeliefTurnView[];
  /**
   * Index of the first LOCKED row, or null when the chapter is open. 381:222 turns
   * rows 1 to 3 and marks row 4 onwards "at rest (p=0) · LOCKED", which is why one
   * number does both jobs: a locked row never turns AND is blurred. Its shift has
   * already been withheld by the server.
   */
  lockedFrom?: number | null;
  /** Opens the paywall from the locked rows. Omitted, the rows are inert. */
  onUnlock?: () => void;
}

const V4ShadowBeliefs: FC<Props> = ({ turns, lockedFrom = null, onUnlock }) => {
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

  const locked = lockedFrom !== null;

  // Keyed by index: in decoy mode a locked reader's rows 5-10 arrive scrambled, and
  // scrambled text is not a stable identity.
  const row = (turn: Report3BeliefTurnView, i: number) => {
    const isLocked = locked && i >= lockedFrom;
    const isRamp = locked && i === lockedFrom;
    return (
      <li
        key={i}
        ref={(el) => {
          rowsRef.current[i] = el;
        }}
        className={`rv4-turn__row${turned.has(i) ? " is-turned" : ""}${
          isLocked ? ` is-locked ${isRamp ? "is-ramp" : "is-blurred"}` : ""
        }`}
      >
        {/* 368:5557 */}
        <div className="rv4-turn__belief">
          <span className="rv4-turn__tick" aria-hidden="true">
            <span className="rv4-turn__minus" />
            <Check className="rv4-turn__check" />
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
                <Check className="rv4-turn__shift-check" />
                {SHIFT_LABEL}
              </span>
              <p className="rv4-turn__shift-text">{turn.shift}</p>
            </div>
          </div>
        ) : null}

        {/* 381:272 — the blur ramps in over this row's top 50.8%. */}
        {isRamp ? (
          <span className="rv4-pblur rv4-turn__ramp" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        ) : null}
      </li>
    );
  };

  return (
    <section
      className={`rv4-turn${locked ? " is-locked" : ""}`}
      data-node-id={locked ? "381:222" : "368:5482"}
      data-name="Typical shadow beliefs"
    >
      {/* 368:5483 — a blurred coral ellipse bled into the top-right corner. */}
      <span className="rv4-turn__blob" aria-hidden="true" />

      {/* 368:5484 */}
      <h4 className="rv4-turn__head">{PANEL_TITLE}</h4>

      {/* 368:5495 */}
      <ul className="rv4-turn__list">
        {(locked ? turns.slice(0, lockedFrom) : turns).map((turn, i) => row(turn, i))}
      </ul>

      {locked ? (
        <div className="rv4-tb-lock rv4-turn__lock" onClick={guardedUnlock(onUnlock)}>
          <ul className="rv4-turn__list is-locked" aria-hidden="true" inert>
            {turns.slice(lockedFrom).map((turn, j) => row(turn, lockedFrom + j))}
          </ul>
          <V4LockBadge />
        </div>
      ) : null}

      {/* 368:5616 — the frame's 29px foot. */}
      <div className="rv4-turn__foot" aria-hidden="true" />
    </section>
  );
};

export default V4ShadowBeliefs;
