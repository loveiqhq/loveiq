"use client";

import { useEffect, useRef, useState } from "react";

/**
 * One-shot scroll reveal for the report's charts: returns a ref to attach to the
 * CHART itself and a flag that flips true the first time it is genuinely on
 * screen. Callers add `is-animated` from the flag; the choreography lives in CSS.
 *
 * Attach the ref to the chart, NOT to the section wrapper. A report section runs
 * far taller than the viewport, so a section-level observer fires while its chart
 * is still hundreds of pixels below the fold — the animation then plays out and
 * finishes before the reader ever scrolls to it, which reads as "no animation at
 * all". `rootMargin`'s -30% bottom inset holds the trigger back until the chart
 * has actually entered the readable part of the viewport.
 *
 * Defaults suit a chart a few hundred pixels tall. A chart taller than ~70% of
 * the viewport can never reach `threshold: 0.25` inside the inset root, so pass a
 * lower threshold for those.
 *
 * The flag starts TRUE where IntersectionObserver is unavailable (SSR, old
 * browsers) so the chart is never left in its pre-animation state — an empty
 * chart is a far worse failure than an unanimated one. Reduced-motion is handled
 * in CSS, which keeps presentation in one place: the `is-animated` class still
 * lands, and the reduce block pins each part to its final value.
 */
export function useRevealOnView<T extends Element>({
  threshold = 0.25,
  rootMargin = "0px 0px -30% 0px",
}: { threshold?: number; rootMargin?: string } = {}): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [isRevealed, setIsRevealed] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const el = ref.current;
    if (!el || isRevealed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsRevealed(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isRevealed, threshold, rootMargin]);

  return [ref, isRevealed];
}

export default useRevealOnView;
