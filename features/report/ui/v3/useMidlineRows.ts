"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * How far above the viewport's middle a row's top must reach before it counts as
 * past the line. Figma puts the line at the middle exactly (368:5482's dashed
 * `marker/mid-screen line`); the 12px keeps a row resting on the line from flickering
 * on every scroll of a pixel.
 */
export const MIDLINE_MARGIN_PX = 12;

/**
 * The rows of a list whose tops have risen past the middle of the viewport — the
 * scroll line Typical Beliefs' panels animate on: the coral rows turn there (368:5482)
 * and, since review 27.09, the sun rows draw their ticks there too ("similarly as above
 * with the scroll").
 *
 * The set is rebuilt from the rows' positions on every scroll or resize, so a row
 * scrolled back below the line leaves it again. Rows from `count` on are never
 * counted: they sit behind the paywall. A scroll handler writes no styles; the caller
 * turns the set into a class and CSS transitions do the rest, off the compositor.
 */
export function useMidlineRows(
  rowsRef: RefObject<readonly (Element | null)[]>,
  count: number
): ReadonlySet<number> {
  const [passed, setPassed] = useState<ReadonlySet<number>>(new Set());
  const queued = useRef(false);
  const frame = useRef(0);

  useEffect(() => {
    const read = () => {
      const line = window.innerHeight / 2;
      const next = new Set<number>();
      let laidOut = false;
      rowsRef.current.forEach((el, i) => {
        if (!el || i >= count) return;
        const box = el.getBoundingClientRect();
        if (box.width !== 0 || box.height !== 0) laidOut = true;
        if (box.top < line - MIDLINE_MARGIN_PX) next.add(i);
      });
      // A designed chapter closes with `display: none`: every row measures 0×0 at top
      // 0, which would read as past the line. Keep what the reader last saw instead.
      if (!laidOut) return;
      setPassed((prev) =>
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
  }, [count, rowsRef]);

  return passed;
}

export default useMidlineRows;
