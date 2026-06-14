"use client";

import { useCallback, useEffect, useRef, useState, type FC } from "react";
import { ArchetypeCard, archetypes } from "../S06Archetypes";

/**
 * White-variant "14 abstractions" section (Figma 7828:9835): a centered heading
 * above a one-direction auto-advancing carousel of the dark landing's archetype
 * cards (reused from S06Archetypes), with prev/next controls + dots. All cards
 * are forced to equal height (items-stretch + the card's h-full).
 */
const WArchetypeCards: FC = () => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = archetypes.length;

  const goTo = useCallback(
    (next: number) => {
      setIndex(((next % count) + count) % count);
    },
    [count]
  );

  // Auto-advance one direction; pauses on hover/touch.
  useEffect(() => {
    if (paused) return undefined;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, 4000);
    return () => window.clearInterval(id);
  }, [paused, count]);

  // Scroll the active card into view (native scroll-snap container).
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.children[index] as HTMLElement | undefined;
    if (card) {
      track.scrollTo({ left: card.offsetLeft - 16, behavior: "smooth" });
    }
  }, [index]);

  return (
    <section className="overflow-hidden bg-white py-16 lg:py-24">
      <div className="content-shell">
        <div className="animate-on-scroll mx-auto mb-12 max-w-2xl text-center">
          <h2 className="font-serif text-3xl font-medium leading-tight text-[#161021] sm:text-[40px]">
            14 abstractions.{" "}
            <span className="bg-gradient-to-r from-[#fe6839] via-[#d95b88] to-[#cb5fc1] bg-clip-text text-transparent">
              You are more than just one of them.
            </span>
          </h2>
        </div>
      </div>

      {/* Full-bleed scroll-snap carousel — items-stretch + the card's h-full keeps
          every card the same height. */}
      <div
        ref={trackRef}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        className="flex snap-x snap-mandatory items-stretch gap-6 overflow-x-auto scroll-smooth px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {archetypes.map((a) => (
          <div key={a.name} className="shrink-0 snap-start">
            <ArchetypeCard archetype={a} />
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="content-shell mt-8 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          aria-label="Previous archetype"
          className="focus-visible-ring flex h-10 w-10 items-center justify-center rounded-full border border-black/10 text-[#161021] transition hover:bg-black/[0.04] active:scale-95"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          {archetypes.map((a, i) => (
            <button
              key={a.name}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to ${a.name}`}
              aria-current={i === index ? "true" : undefined}
              className={`h-2 rounded-full transition-all ${i === index ? "w-5 bg-accent-orange" : "w-2 bg-black/15 hover:bg-black/30"}`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          aria-label="Next archetype"
          className="focus-visible-ring flex h-10 w-10 items-center justify-center rounded-full border border-black/10 text-[#161021] transition hover:bg-black/[0.04] active:scale-95"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
    </section>
  );
};

export default WArchetypeCards;
