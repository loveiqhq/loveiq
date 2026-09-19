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
/**
 * Mirrors the default `rootMargin`'s -30% bottom inset: the fraction of the
 * viewport, measured from the top, that counts as "readable".
 */
const REVEAL_BAND = 0.7;

export function useRevealOnView<T extends Element>({
  threshold = 0.25,
  rootMargin = "0px 0px -30% 0px",
}: { threshold?: number; rootMargin?: string } = {}): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [isRevealed, setIsRevealed] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const el = ref.current;
    if (!el || isRevealed) return;

    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) reveal();
      },
      { threshold, rootMargin }
    );

    function reveal() {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scrollend", check);
      if (frame) cancelAnimationFrame(frame);
      setIsRevealed(true);
    }

    /**
     * The safety net. An IntersectionObserver reports a CHANGE of state, and only
     * for frames the browser actually rendered — so a viewport that jumps the whole
     * chart in one frame (scrollbar drag, End, ⌘↓, an in-page anchor) goes
     * not-intersecting → not-intersecting and fires nothing. The chart would then
     * sit in its pre-animation state forever, which for a self-drawing chart means a
     * permanently BLANK chart. Measured: roughly one in three fast scrolls left the
     * energy graph empty.
     *
     * This checks the same band the `rootMargin` inset describes, so it reveals at
     * the same moment the observer would have — it just also catches the case where
     * the chart is already past.
     */
    function check() {
      frame = 0;
      const node = ref.current;
      if (!node) return;
      if (node.getBoundingClientRect().top < window.innerHeight * REVEAL_BAND) reveal();
    }

    function onScroll() {
      if (!frame) frame = requestAnimationFrame(check);
    }

    observer.observe(el);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scrollend", check);
    // Already on screen at mount (hydration part-way down the page, or a deep link
    // to a chapter) — no crossing is coming.
    check();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scrollend", check);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [isRevealed, threshold, rootMargin]);

  return [ref, isRevealed];
}

export default useRevealOnView;
