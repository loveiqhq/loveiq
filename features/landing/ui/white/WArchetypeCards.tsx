"use client";

import { useCallback, useEffect, useRef, useState, type FC } from "react";
import { ArchetypeCard, archetypes } from "../S06Archetypes";

/**
 * White-variant "14 abstractions" section (Figma 7828:9835): a centered heading
 * above a continuously-gliding carousel of the dark landing's archetype cards
 * (reused from S06Archetypes), replicating the dark S06 carousel — perpetual
 * smooth motion, drag/swipe in either direction, prev/next arrows, AND a dot
 * indicator that tracks the active card.
 *
 * Mechanism (mirrors S06): a requestAnimationFrame loop translates the track
 * left at a constant speed; the cards render in 3 identical sets and we wrap by
 * one set width so the loop is seamless. The user can grab/swipe the track to
 * scroll either way (vertical-vs-horizontal direction lock so a vertical swipe
 * still scrolls the page on mobile). Arrows nudge by one card and dots jump to a
 * card, both with a short eased transition. Hovering or dragging pauses the
 * glide. Reduced-motion users get a static, manually-scrollable row.
 * `items-stretch` + the card's `h-full` keeps every card the same height.
 *
 * "use client" is required: it imports the `archetypes` DATA array from a
 * "use client" module, which a Server Component would only see as a proxy.
 */

const GLIDE_SPEED = 0.03; // px per ms (~30px/s) — calm, matches the dark feel.
const SETS = 3; // identical copies of the card list for a seamless wrap buffer.
const COUNT = archetypes.length;

const WArchetypeCards: FC = () => {
  const trackRef = useRef<HTMLDivElement>(null);
  const translateRef = useRef(0);
  const oneSetWidthRef = useRef(0);
  const strideRef = useRef(0);
  const pausedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  // Drag state.
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTranslateRef = useRef(0);
  const dirLockRef = useRef<"h" | "v" | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track || track.children.length < 2) return;
    oneSetWidthRef.current = track.scrollWidth / SETS;
    const first = track.children[0] as HTMLElement;
    const second = track.children[1] as HTMLElement;
    strideRef.current = second.offsetLeft - first.offsetLeft || first.offsetWidth;
  }, []);

  const wrap = useCallback((value: number) => {
    let t = value;
    const w = oneSetWidthRef.current;
    if (w > 0) {
      while (t > 0) t -= w;
      while (t <= -w) t += w;
    }
    return t;
  }, []);

  const syncActiveIndex = useCallback(() => {
    const stride = strideRef.current;
    if (stride <= 0) return;
    const idx = Math.round(Math.abs(translateRef.current) / stride) % COUNT;
    setActiveIndex((prev) => (prev === idx ? prev : idx));
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);

    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const tick = (now: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = now;
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;

      if (
        !pausedRef.current &&
        !draggingRef.current &&
        !reduceMotion &&
        oneSetWidthRef.current > 0
      ) {
        translateRef.current = wrap(translateRef.current - delta * GLIDE_SPEED);
        if (trackRef.current) {
          trackRef.current.style.transform = `translateX(${translateRef.current}px)`;
        }
        syncActiveIndex();
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("resize", measure);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [measure, syncActiveIndex, wrap]);

  // Settle the track to an absolute translate with a short eased transition,
  // pausing the glide so the rAF doesn't fight it, then re-seed the clock.
  const settleTo = useCallback(
    (target: number) => {
      const track = trackRef.current;
      if (!track) return;
      const t = wrap(target);
      pausedRef.current = true;
      translateRef.current = t;
      track.style.transition = "transform 0.45s ease-out";
      track.style.transform = `translateX(${t}px)`;
      syncActiveIndex();
      window.setTimeout(() => {
        if (trackRef.current) trackRef.current.style.transition = "";
        lastTimeRef.current = 0;
        pausedRef.current = false;
      }, 470);
    },
    [syncActiveIndex, wrap]
  );

  const nudge = useCallback(
    (direction: -1 | 1) => settleTo(translateRef.current - direction * strideRef.current),
    [settleTo]
  );
  const goToDot = useCallback(
    (index: number) => settleTo(-(index * strideRef.current)),
    [settleTo]
  );

  /* ---- drag / swipe ---- */
  const dragStart = useCallback((x: number, y?: number) => {
    draggingRef.current = true;
    startXRef.current = x;
    startYRef.current = y ?? 0;
    dirLockRef.current = null;
    startTranslateRef.current = translateRef.current;
    if (trackRef.current) trackRef.current.style.transition = "";
  }, []);

  const dragMove = useCallback(
    (x: number, y: number | undefined, e?: React.TouchEvent) => {
      if (!draggingRef.current) return;
      // Lock to horizontal or vertical on the first meaningful movement so a
      // vertical swipe still scrolls the page (mobile).
      if (y !== undefined && dirLockRef.current === null) {
        const dx = Math.abs(x - startXRef.current);
        const dy = Math.abs(y - startYRef.current);
        if (dx > 5 || dy > 5) dirLockRef.current = dx > dy ? "h" : "v";
      }
      if (dirLockRef.current === "v") {
        draggingRef.current = false; // hand the gesture back to the page
        return;
      }
      if (dirLockRef.current === "h" && e) e.preventDefault();
      translateRef.current = wrap(startTranslateRef.current + (x - startXRef.current));
      if (trackRef.current) {
        trackRef.current.style.transform = `translateX(${translateRef.current}px)`;
      }
    },
    [wrap]
  );

  const dragEnd = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    dirLockRef.current = null;
    lastTimeRef.current = 0;
    syncActiveIndex();
  }, [syncActiveIndex]);

  const pauseGlide = useCallback(() => {
    pausedRef.current = true;
  }, []);
  const resumeGlide = useCallback(() => {
    lastTimeRef.current = 0;
    pausedRef.current = false;
  }, []);

  const cards = Array.from({ length: SETS }, () => archetypes).flat();

  return (
    <section className="overflow-hidden bg-white pb-16 pt-4 lg:py-24">
      <div className="content-shell">
        <div className="animate-on-scroll mx-auto max-w-2xl text-center">
          <h2 className="font-serif text-3xl font-medium leading-tight text-[#161021] sm:text-[40px]">
            14 personalities.{" "}
            <span className="bg-gradient-to-r from-[#fe6839] via-[#d95b88] to-[#cb5fc1] bg-clip-text text-transparent">
              You are more than just one of them.
            </span>
          </h2>
        </div>
      </div>

      {/* Continuously-gliding, drag/swipeable marquee, pulled well below the heading. */}
      <div
        className="relative mt-8 w-full overflow-hidden motion-reduce:overflow-x-auto sm:mt-20"
        onMouseEnter={pauseGlide}
        onMouseLeave={() => {
          dragEnd();
          resumeGlide();
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          dragStart(e.clientX);
        }}
        onMouseMove={(e) => dragMove(e.clientX, undefined)}
        onMouseUp={dragEnd}
        onTouchStart={(e) => dragStart(e.touches[0]!.clientX, e.touches[0]!.clientY)}
        onTouchMove={(e) => dragMove(e.touches[0]!.clientX, e.touches[0]!.clientY, e)}
        onTouchEnd={() => {
          dragEnd();
          resumeGlide();
        }}
      >
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-white to-transparent sm:w-24 lg:w-32"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-white to-transparent sm:w-24 lg:w-32"
          aria-hidden
        />

        <div
          ref={trackRef}
          className="flex w-max cursor-grab select-none items-stretch will-change-transform active:cursor-grabbing"
        >
          {cards.map((a, i) => (
            <div
              key={`${a.name}-${i}`}
              className="mr-4 shrink-0 sm:mr-8 lg:mr-6"
              aria-hidden={i >= COUNT || undefined}
            >
              <ArchetypeCard archetype={a} variant="white" />
            </div>
          ))}
        </div>
      </div>

      {/* Controls — prev arrow · dots · next arrow, sat well below the cards
          (extra gap on mobile). */}
      {/* No `content-shell` here: its `margin: 0 auto` would zero out the
          top margin. A plain centered flex row keeps the mt-* spacing intact. */}
      <div className="mt-20 flex items-center justify-center gap-4 sm:mt-16 sm:gap-6">
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label="Previous archetypes"
          className="focus-visible-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-black/10 text-[#161021] transition hover:bg-black/[0.04] active:scale-95"
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

        {/* No row gap: the spacing lives inside each button as padding, so the
            tap targets reach 24px without overlapping each other. */}
        <div className="flex items-center">
          {archetypes.map((a, i) => (
            <button
              key={a.name}
              type="button"
              onClick={() => goToDot(i)}
              aria-label={`Go to ${a.name}`}
              aria-current={i === activeIndex ? "true" : undefined}
              // The visible pill stays 8px tall; the button around it is padded
              // out to a 24px square tap target (WCAG 2.2 target-size).
              className="-my-2 flex h-6 items-center px-2 py-2"
            >
              <span
                aria-hidden
                className={`block h-2 rounded-full transition-all duration-300 ${
                  i === activeIndex ? "w-5 bg-[#fe6839]" : "w-2 bg-black/15 hover:bg-black/30"
                }`}
              />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label="Next archetypes"
          className="focus-visible-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-black/10 text-[#161021] transition hover:bg-black/[0.04] active:scale-95"
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
