"use client";

import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";
import { pingFunnelEvent } from "@features/analytics/client";

interface IntroCardNavOptions {
  /** The card on screen, from 0. Only cards after the first go back. */
  index: number;
  /** Sent when the card shows, once a page (`intro_slide_N`, Survey 2.0's `guide_card_N`). */
  viewEvent: string;
  /** Sent on going back from this card; null on a card with no way back (the first). */
  backEvent: string | null;
  onContinue: () => void;
  onBack: () => void;
}

/**
 * How the cards before the consent move: today's intro slides and Survey 2.0's short guide
 * (features/survey/ui/guide). Continue, the right arrow, Enter and a swipe left go on; Back, the
 * left arrow and a swipe right go back; each after the card's 200 ms fade.
 */
export function useIntroCardNav({
  index,
  viewEvent,
  backEvent,
  onContinue,
  onBack,
}: IntroCardNavOptions) {
  const [isLeaving, setIsLeaving] = useState(false);
  const [isLeavingForward, setIsLeavingForward] = useState(false);

  // The Continue or Back under way. Cleared when the cards go (Skip Intro jumps to the
  // consent): its 200ms timer would otherwise still move a step on from there, onto the
  // questions with the consent never agreed.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    []
  );

  const handleNext = useCallback(() => {
    if (isLeaving) return;
    setIsLeaving(true);
    setIsLeavingForward(true);
    pending.current = setTimeout(() => {
      setIsLeaving(false);
      setIsLeavingForward(false);
      onContinue();
    }, 200);
  }, [onContinue, isLeaving]);

  const handlePrev = useCallback(() => {
    if (isLeaving) return;
    // The Back button, the left arrow or a swipe. The first card has none (only the browser's).
    if (backEvent) pingFunnelEvent(backEvent);
    setIsLeaving(true);
    pending.current = setTimeout(() => {
      setIsLeaving(false);
      onBack();
    }, 200);
  }, [onBack, isLeaving, backEvent]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLeaving) return;
      // A focused button or link acts on Enter itself (Skip Intro, Back): moving on here too
      // would take a second step.
      if (
        e.key === "Enter" &&
        e.target instanceof Element &&
        e.target.closest("button, a, input, textarea, select")
      )
        return;
      if (e.key === "ArrowRight" || e.key === "Enter") handleNext();
      if (e.key === "ArrowLeft" && index > 0) handlePrev();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrev, index, isLeaving]);

  // The card's reach signal. Fires once per (visitor, day, card).
  useEffect(() => {
    pingFunnelEvent(viewEvent);
  }, [viewEvent]);

  // Swipe gesture support for mobile
  const touchStartX = useRef<number | null>(null);
  const handleTouchStart = useCallback((e: TouchEvent) => {
    // TouchEvent always fires with at least one touch point.
    touchStartX.current = e.touches[0]!.clientX;
  }, []);
  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (touchStartX.current === null) return;
      const delta = touchStartX.current - e.changedTouches[0]!.clientX;
      touchStartX.current = null;
      if (Math.abs(delta) < 50) return;
      if (delta > 0)
        handleNext(); // swipe left → next
      else if (index > 0) handlePrev(); // swipe right → prev
    },
    [handleNext, handlePrev, index]
  );

  return { isLeaving, isLeavingForward, handleNext, handlePrev, handleTouchStart, handleTouchEnd };
}
