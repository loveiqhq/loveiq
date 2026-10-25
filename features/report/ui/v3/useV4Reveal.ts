"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { isGuidedTourActive, subscribeGuidedTour } from "@shared/ui/guided-tour-state";

/**
 * A one-shot "the reader can see it now" flag for V4's entrances (review 27.09): the
 * sun beliefs' neighbours, the A&B headlines, the flywheel's pulse, the fantasy map's
 * dots, the part glows and the Snapshot rows. Callers render a pending class until it
 * flips; the choreography lives in CSS.
 *
 * WHY NOT REPORT 2.0'S useRevealOnView. Three things V4 needs, which V2's hook cannot
 * give without changing it under every V2 chart:
 * - It starts revealed wherever IntersectionObserver is missing, the server included.
 *   /report-v4-preview is server-rendered, so hydration would mismatch, React would
 *   keep the server's revealed class, and the entrance would never play. This starts
 *   `false` everywhere and decides after mount.
 * - Its scroll check fires for a box inside a collapsed chapter: a designed chapter
 *   closes with `display: none`, and a 0×0 box reports top 0, "on screen". A box with
 *   no size never reveals here; the observer catches it when the chapter reopens.
 * - Its catch-up check overrides the observer's threshold, so an entrance cannot be
 *   held for a given depth. One `band` drives both here.
 *
 * HELD WHILE THE GUIDED TOUR MOVES THE PAGE (shared/ui/guided-tour-state.ts; sync 23.10:
 * "the score animations play in the background during the tour"). The tour scrolls the
 * real page through Part 2 on its way to Typical Beliefs, behind its scrim, so every
 * entrance it passed played out unseen and the reader later scrolled down to finished
 * scores. Nothing reveals while it runs. When it ends, a box on screen reveals at once;
 * one the tour carried the page past is never caught up out of sight, and waits for the
 * reader to scroll to it.
 */

export interface V4RevealOptions {
  /** How far down the viewport counts as "in view", as a fraction of its height. */
  band?: number;
  /**
   * Also reveal a box already past the band — at mount, and on a scroll that jumps
   * over it (End, a scrollbar drag, a nudge's jump). Off for an effect that must not
   * play where nobody is looking: the flywheel's pulse.
   */
  catchUp?: boolean;
  /** False: never reveal, and watch nothing. For surfaces under the paywall's blur. */
  enabled?: boolean;
}

export function useV4Reveal<T extends Element>({
  band = 0.7,
  catchUp = true,
  enabled = true,
}: V4RevealOptions = {}): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const current = ref.current;
    if (!enabled || revealed || !current) return;
    const el: Element = current;

    let done = false;
    let frame = 0;
    let observer: IntersectionObserver | null = null;
    let unsubscribeTour: (() => void) | null = null;
    // The tour, not the reader, brought this box into the band (or past it).
    let passedByTour = false;

    function teardown() {
      observer?.disconnect();
      el.removeEventListener("focusin", reveal);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scrollend", check);
      unsubscribeTour?.();
      unsubscribeTour = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    }

    function reveal() {
      if (done) return;
      if (isGuidedTourActive()) {
        passedByTour = true;
        return;
      }
      done = true;
      teardown();
      setRevealed(true);
    }

    /** The band the observer's root margin describes, read directly. */
    function check() {
      frame = 0;
      const node = ref.current;
      if (!node) return;
      const box = node.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return;
      if (box.top >= window.innerHeight * band) return;
      // Above the screen: a jump over it catches it up, unless the jump was the tour's,
      // or the surface must never play unseen (catchUp off).
      if (box.bottom <= 0 && (passedByTour || !catchUp)) return;
      reveal();
    }

    function onScroll() {
      if (!frame) frame = requestAnimationFrame(check);
    }

    // Focus inside reveals it too. A held-back surface is clear, and a browser scrolls a
    // focused control into view only when it is off screen, so a keyboard reader could
    // tab onto a map dot or a Snapshot row below the band and see neither it nor its
    // focus ring (final review 27.09).
    el.addEventListener("focusin", reveal);

    if (typeof IntersectionObserver === "undefined") {
      if (catchUp) {
        reveal();
        // Held by the tour, with nothing to watch: it shows the moment the tour ends.
        if (!done) {
          unsubscribeTour = subscribeGuidedTour(() => {
            if (!isGuidedTourActive()) reveal();
          });
        }
      }
      return teardown;
    }

    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) reveal();
      },
      { rootMargin: `0px 0px -${Math.round((1 - band) * 100)}% 0px`, threshold: 0 }
    );
    observer.observe(el);

    // Look again the moment the tour ends. It hands the reader back at the top, where
    // what it scrolled past sits below the band once more.
    unsubscribeTour = subscribeGuidedTour(() => {
      if (!isGuidedTourActive()) onScroll();
    });

    if (catchUp) {
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("scrollend", check);
      check();
    }

    return teardown;
  }, [band, catchUp, enabled, revealed]);

  return [ref, revealed];
}

export default useV4Reveal;
