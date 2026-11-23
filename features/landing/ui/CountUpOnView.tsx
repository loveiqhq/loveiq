"use client";

import { useEffect, useRef, type FC } from "react";

/**
 * A number that rolls up from 0 to its value once, as it comes into view (landing page v2:
 * Marcus, 15 Nov, "making Numbers Roll up"; Hana's board "animated pain-point section" and the
 * design system's CountUp, 16 Nov). 1.6s (`duration-count`), easing out, once 40% of the
 * number is on screen. Where a row of them shares a line (from lg) each starts 150ms after the
 * one before, as on the board; on a phone each card comes into view on its own and starts at
 * once.
 *
 * The digits are written straight to the page, with no render per frame. The final value
 * holds the width from the start, so the card never re-wraps, and screen readers hear only the
 * final value. Under reduced motion, without IntersectionObserver, or before JavaScript runs,
 * the value simply stands: what the server renders is the final number.
 *
 * Research stats only, never a price or a time (design system: no countdowns, no urgency).
 */

/** How long a count takes, and how far apart a row's counts start (Hana's board). */
export const COUNT_MS = 1600;
export const COUNT_STAGGER_MS = 150;

/** The board's curve: fast out of 0, settling into the value. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

const reducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** From lg the four numbers share a row and enter together. */
const sharesARow = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1024px)").matches;

const CountUpOnView: FC<{
  value: number;
  suffix?: string;
  /** Its place in its row: 0 for the first. */
  index?: number;
  /** The numeral's type and colour (its gradient), on the digits and their width holder. */
  className?: string;
}> = ({ value, suffix = "", index = 0, className = "" }) => {
  const box = useRef<HTMLSpanElement | null>(null);
  const digits = useRef<HTMLSpanElement | null>(null);
  const final = `${value}${suffix}`;

  useEffect(() => {
    const el = digits.current;
    const target = box.current;
    if (!el || !target) return;
    if (
      reducedMotion() ||
      typeof IntersectionObserver === "undefined" ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      return;
    }

    el.textContent = `0${suffix}`;
    let frame = 0;
    let timer = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        const wait = index > 0 && sharesARow() ? index * COUNT_STAGGER_MS : 0;
        timer = window.setTimeout(() => {
          let start = 0;
          const step = (now: number) => {
            if (!start) start = now;
            const t = Math.min(1, (now - start) / COUNT_MS);
            el.textContent = `${Math.round(value * easeOut(t))}${suffix}`;
            if (t < 1) frame = window.requestAnimationFrame(step);
          };
          frame = window.requestAnimationFrame(step);
        }, wait);
      },
      // 40% of the number anywhere on screen (the design system's CountUp), with no margin: a
      // trimmed foot left a number parked there at "0%".
      { threshold: 0.4 }
    );
    observer.observe(target);

    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
      el.textContent = final;
    };
  }, [value, suffix, index, final]);

  return (
    <span ref={box} className="relative inline-block [font-variant-numeric:tabular-nums]">
      <span className="sr-only">{final}</span>
      {/* Holds the final width; the counting digits sit over it. */}
      <span aria-hidden className={`invisible ${className}`}>
        {final}
      </span>
      <span ref={digits} aria-hidden data-count-up className={`absolute inset-0 ${className}`}>
        {final}
      </span>
    </span>
  );
};

export default CountUpOnView;
