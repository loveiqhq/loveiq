"use client";

import { useEffect, useState, type FC } from "react";

/**
 * The phone's dots under "Inside Each Chapter" (Landing V2, Mark 30.10): one per card, the
 * card in view drawn long, following the reader's swipe. Decoration only: the cards are the
 * content, and a desktop shows all four (the dots hide from `md`).
 */
export const PtsSampleDots: FC<{ trackId: string; count: number; label: string }> = ({
  trackId,
  count,
  label,
}) => {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const track = document.getElementById(trackId);
    if (!track) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const cards = Array.from(track.children) as HTMLElement[];
        const left = track.scrollLeft;
        let best = 0;
        let distance = Infinity;
        cards.forEach((card, i) => {
          const d = Math.abs(card.offsetLeft - track.offsetLeft - left);
          if (d < distance) {
            distance = d;
            best = i;
          }
        });
        setActive(best);
      });
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      track.removeEventListener("scroll", onScroll);
    };
  }, [trackId]);

  return (
    <div aria-hidden className="mt-1 flex items-center justify-center gap-1.5 md:hidden">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={`block h-1.5 rounded-full transition-[width] duration-200 ${
            i === active
              ? "w-[22px] bg-[linear-gradient(90deg,#fe6839,#bf66d9)]"
              : "w-1.5 bg-[#ddd4ee]"
          }`}
        />
      ))}
      <span className="ml-2.5 font-sans text-[12px] font-semibold text-[#6b6678]">{label}</span>
    </div>
  );
};
