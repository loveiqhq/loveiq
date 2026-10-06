"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that counts up from 0 once — V4's entrances (review 28.09). Mark, on the top
 * three and the archetype card: "Please check how the animation in V2 worked … the %
 * also count up from 0". This is Report 2.0's own count-up (CoreArchetypeSection): one
 * rAF loop over 1800ms on an easeInOutCubic, landing exactly on the target.
 *
 * - It starts at 0 everywhere, the server included, and counts only once `run` is true
 *   (a useV4Reveal flag), so /report-v4-preview hydrates onto the same markup.
 * - Under reduced motion it shows the target from mount and never animates.
 * - A finished count is final; a count cut short (an unmount, React's dev double
 *   effect) starts again on the next run.
 *
 * The number is decoration: callers mark it aria-hidden and give assistive tech the
 * final value, so nobody hears it tick.
 */

export interface V4CountUpOptions {
  /** How long the count takes, in ms. V2's match strength takes 1800. */
  duration?: number;
  /** How long it holds at 0 after `run`, in ms, to follow a staggered bar. */
  delay?: number;
  /** Decimal places it counts in: 0 for "43%", 1 for "43.4%". */
  decimals?: number;
}

/** V2's curve (CoreArchetypeSection): slow out of 0, slow into the value. */
const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

const reducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useV4CountUp(
  target: number,
  run: boolean,
  { duration = 1800, delay = 0, decimals = 0 }: V4CountUpOptions = {}
): number {
  const [value, setValue] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    const scale = 10 ** decimals;
    const round = (n: number) => Math.round(n * scale) / scale;

    if (done.current) return;

    let frame = 0;
    // As V2's reduced-motion path does: the value in one frame, and no count.
    if (reducedMotion()) {
      frame = requestAnimationFrame(() => {
        done.current = true;
        setValue(round(target));
      });
      return () => cancelAnimationFrame(frame);
    }
    if (!run) return;

    const start = performance.now() + delay;
    const step = () => {
      const progress = Math.min(Math.max((performance.now() - start) / duration, 0), 1);
      if (progress >= 1) {
        done.current = true;
        frame = 0;
        setValue(round(target));
        return;
      }
      setValue(round(easeInOutCubic(progress) * target));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [run, target, duration, delay, decimals]);

  return value;
}

export default useV4CountUp;
