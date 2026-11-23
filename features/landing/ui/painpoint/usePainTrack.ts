import { useEffect, useState } from "react";

/**
 * The pain-point carousel's position and step (landing page v2), shared by its desktop buttons
 * (PPainPointArrows) and phone dots (PPainPointDots). Both read the row itself, which the
 * server renders (PPainPoints.tsx), so the cards work as a plain scrolling list without
 * JavaScript. Imported by those two client components only.
 */

const reducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Which card is first in view, and whether the row is at either end. */
export const useTrackPosition = (trackId: string) => {
  const [position, setPosition] = useState({ active: 0, atStart: true, atEnd: false });

  useEffect(() => {
    const track = document.getElementById(trackId);
    if (!track) return;
    const read = () => {
      const left = track.scrollLeft;
      const cards = Array.from(track.children) as HTMLElement[];
      const first = cards[0]?.offsetLeft ?? 0;
      let active = 0;
      let distance = Infinity;
      cards.forEach((card, i) => {
        const d = Math.abs(card.offsetLeft - first - left);
        if (d < distance) {
          distance = d;
          active = i;
        }
      });
      setPosition({
        active,
        atStart: left <= 1,
        atEnd: left + track.clientWidth >= track.scrollWidth - 1,
      });
    };
    read();
    track.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);
    return () => {
      track.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
    };
  }, [trackId]);

  return position;
};

/** Scrolls the row one card on (1) or back (-1): a card's width and the gap after it. */
export const step = (trackId: string, direction: 1 | -1) => {
  const track = document.getElementById(trackId);
  const cards = track ? (Array.from(track.children) as HTMLElement[]) : [];
  if (!track || cards.length < 2) return;
  const left = direction * (cards[1]!.offsetLeft - cards[0]!.offsetLeft);
  const behavior: ScrollBehavior = reducedMotion() ? "auto" : "smooth";
  if (typeof track.scrollBy === "function") track.scrollBy({ left, behavior });
  else track.scrollLeft += left;
};
