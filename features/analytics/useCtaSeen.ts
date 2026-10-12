"use client";

import { useEffect, type RefObject } from "react";

import { trackCtaSeen, type CtaSeen } from "./client";

/**
 * Which calls to action have been seen, per page. A report has one card per locked chapter;
 * the landing has its hero video or its question card.
 */
const seen = new Set<string>();

/**
 * `cta_seen` the first time half of the element is in view, once per page and call to
 * action. Geometry only: a modal over it still counts, as it does for a person who closes
 * the modal and finds the card there.
 */
export function useCtaSeen(
  ref: RefObject<Element | null>,
  cta: CtaSeen,
  /**
   * Observe again when this changes. The landing hero swaps its slot (card or video)
   * without unmounting, so the card's ref can be attached after the first render.
   */
  attachedWhen?: unknown
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const key = `${cta} ${window.location.pathname}`;
    if (seen.has(key)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5)) return;
        observer.disconnect();
        if (seen.has(key)) return;
        seen.add(key);
        trackCtaSeen({ cta });
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, cta, attachedWhen]);
}
