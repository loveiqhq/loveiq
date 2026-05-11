"use client";

import Image from "next/image";
import { useRef, useState, useEffect, useCallback, type FC } from "react";

const personas = [
  {
    title: "Singles",
    description:
      "Gain self-awareness, attract healthier partners, and stop repeating old patterns.",
    image: "/carousel/singles.png",
    overlay: "from-[#1a0b2a]/85 via-[#0a0510]/35 to-transparent",
  },
  {
    title: "People in Relationships",
    description: "Decode each other's needs and create more intimacy, ease, and connection.",
    image: "/carousel/relationships.png",
    overlay: "from-[#1a0b2a]/85 via-[#0a0510]/35 to-transparent",
  },
  {
    title: "Couples Exploring Growth",
    description: "Strengthen communication, sexual alignment, and long-term compatibility.",
    image: "/carousel/couplesGrowth.png",
    overlay: "from-[#1a0b2a]/85 via-[#0a0510]/35 to-transparent",
    featured: true,
  },
  {
    title: "Self-Development Lovers",
    description:
      "Anyone obsessed with understanding their psychology, attachment style, and desire patterns.",
    image: "/carousel/selfDevelopers.png",
    overlay: "from-[#1a0b2a]/85 via-[#0a0510]/75 to-transparent",
    smallText: true,
  },
  {
    title: "Therapists & Coaches",
    description:
      "Use a structured psychometric tool to help clients articulate their emotional and sexual identity.",
    image: "/carousel/therapists.png",
    smallText: true,
  },
];

// Arrow icons as inline SVG components
const ChevronLeft = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M10 12L6 8L10 4"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M6 12L10 8L6 4"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const S03PerfectFor: FC = () => {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const directionLockedRef = useRef<"horizontal" | "vertical" | null>(null);
  const currentTranslateRef = useRef(0);
  const startTranslateRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const animateFnRef = useRef<((timestamp: number) => void) | null>(null);
  const cardWidth = 366; // card width + margin
  const totalWidth = cardWidth * personas.length;

  // Calculate active index based on current translate position
  const updateActiveIndex = useCallback(() => {
    const position = Math.abs(currentTranslateRef.current);
    const index = Math.round(position / cardWidth) % personas.length;
    setActiveIndex(index);
  }, [cardWidth]);

  const animate = useCallback(
    (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const delta = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      if (!isPaused && !isDraggingRef.current) {
        currentTranslateRef.current -= delta * 0.03; // Speed: pixels per ms

        // Reset to beginning when we've scrolled past the first set
        if (Math.abs(currentTranslateRef.current) >= totalWidth) {
          currentTranslateRef.current = currentTranslateRef.current + totalWidth;
        }

        if (carouselRef.current) {
          carouselRef.current.style.transform = `translateX(${currentTranslateRef.current}px)`;
        }

        // Update active index for dot indicators
        updateActiveIndex();
      }

      if (animateFnRef.current) {
        animationRef.current = requestAnimationFrame(animateFnRef.current);
      }
    },
    [isPaused, totalWidth, updateActiveIndex]
  );

  useEffect(() => {
    animateFnRef.current = animate;
  }, [animate]);

  useEffect(() => {
    const startAnimation = (timestamp: number) => {
      if (animateFnRef.current) animateFnRef.current(timestamp);
    };
    animationRef.current = requestAnimationFrame(startAnimation);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const handleDragStart = (clientX: number, clientY?: number) => {
    isDraggingRef.current = true;
    startXRef.current = clientX;
    startYRef.current = clientY ?? 0;
    directionLockedRef.current = null;
    startTranslateRef.current = currentTranslateRef.current;
  };

  const handleDragMove = (clientX: number, clientY?: number, e?: React.TouchEvent) => {
    if (!isDraggingRef.current) return;

    if (clientY !== undefined && directionLockedRef.current === null) {
      const deltaX = Math.abs(clientX - startXRef.current);
      const deltaY = Math.abs(clientY - startYRef.current);
      if (deltaX > 5 || deltaY > 5) {
        directionLockedRef.current = deltaX > deltaY ? "horizontal" : "vertical";
      }
    }

    if (directionLockedRef.current === "vertical") {
      isDraggingRef.current = false;
      return;
    }

    if (directionLockedRef.current === "horizontal" && e) {
      e.preventDefault();
    }

    const diff = clientX - startXRef.current;
    currentTranslateRef.current = startTranslateRef.current + diff;

    if (currentTranslateRef.current > 0) {
      currentTranslateRef.current = -totalWidth + currentTranslateRef.current;
    } else if (Math.abs(currentTranslateRef.current) >= totalWidth) {
      currentTranslateRef.current = currentTranslateRef.current + totalWidth;
    }

    if (carouselRef.current) {
      carouselRef.current.style.transform = `translateX(${currentTranslateRef.current}px)`;
    }
  };

  const handleDragEnd = () => {
    isDraggingRef.current = false;
    directionLockedRef.current = null;
    lastTimeRef.current = 0;
    updateActiveIndex();
  };

  // Navigate to a specific slide index
  const navigateToSlide = useCallback(
    (index: number) => {
      const targetPosition = -(index * cardWidth);
      currentTranslateRef.current = targetPosition;
      if (carouselRef.current) {
        carouselRef.current.style.transition = "transform 0.4s ease-out";
        carouselRef.current.style.transform = `translateX(${targetPosition}px)`;
        // Remove transition after animation completes
        setTimeout(() => {
          if (carouselRef.current) {
            carouselRef.current.style.transition = "";
          }
        }, 400);
      }
      setActiveIndex(index);
      lastTimeRef.current = 0;
    },
    [cardWidth]
  );

  // Navigate left (previous slide)
  const handlePrevious = useCallback(() => {
    const newIndex = activeIndex <= 0 ? personas.length - 1 : activeIndex - 1;
    navigateToSlide(newIndex);
  }, [activeIndex, navigateToSlide]);

  // Navigate right (next slide)
  const handleNext = useCallback(() => {
    const newIndex = activeIndex >= personas.length - 1 ? 0 : activeIndex + 1;
    navigateToSlide(newIndex);
  }, [activeIndex, navigateToSlide]);

  // Handle dot click
  const handleDotClick = useCallback(
    (index: number) => {
      navigateToSlide(index);
    },
    [navigateToSlide]
  );

  return (
    <section
      className="section-shell relative overflow-hidden bg-[#0A0510] px-4 text-text-primary"
      aria-labelledby="audience-heading"
    >
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute left-0 top-1/2 h-[480px] w-[480px] -translate-y-1/2 rounded-full bg-[#541475]/12 blur-[110px]"
          aria-hidden
        />
      </div>

      <div className="content-shell relative flex flex-col items-center gap-8">
        <div className="absolute inset-0 -z-[1]">
          <div
            className="absolute left-0 top-1/2 h-[420px] w-[420px] -translate-y-1/2 rounded-full bg-[#541475]/10 blur-[90px]"
            aria-hidden
          />
        </div>

        <div className="max-w-4xl space-y-5 text-center sm:space-y-6 mb-8 sm:mb-10">
          <h2
            id="audience-heading"
            className="font-serif text-4xl leading-tight text-white sm:text-5xl md:text-[52px] md:leading-[1.1]"
          >
            <span className="block sm:inline">Who Is This</span>{" "}
            <span className="block sm:inline">
              Perfect For
              <span className="bg-gradient-to-r from-[#fe6839] to-[#a78bfa] bg-clip-text text-transparent">
                ?
              </span>
            </span>
          </h2>
          <p className="max-w-2xl text-base leading-relaxed text-text-secondary sm:text-lg sm:leading-relaxed">
            We built this for anyone ready to grow, discover themselves, and actively enhance their
            sexual life. And honestly, we built it for ourselves too (and yes, we use it).
          </p>
        </div>
      </div>

      <div className="relative w-screen max-w-none left-1/2 -translate-x-1/2 overflow-hidden pb-4 mt-8 sm:mt-10">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-16 sm:w-24 bg-gradient-to-r from-[#0a0510] to-transparent z-10"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-16 sm:w-24 bg-gradient-to-l from-[#0a0510] to-transparent z-10"
          aria-hidden
        />

        <div
          ref={carouselRef}
          className="flex w-max cursor-grab active:cursor-grabbing select-none"
          onMouseDown={(e) => {
            e.preventDefault();
            handleDragStart(e.clientX);
          }}
          onMouseMove={(e) => handleDragMove(e.clientX)}
          onMouseUp={handleDragEnd}
          onMouseLeave={() => {
            handleDragEnd();
            setIsPaused(false);
          }}
          onTouchStart={(e) => handleDragStart(e.touches[0]!.clientX, e.touches[0]!.clientY)}
          onTouchMove={(e) => handleDragMove(e.touches[0]!.clientX, e.touches[0]!.clientY, e)}
          onTouchEnd={handleDragEnd}
          onMouseEnter={() => setIsPaused(true)}
        >
          {[...personas, ...personas].map((item, idx) => (
            <div
              key={`${item.title}-${idx}`}
              className="group relative m-3 h-[520px] w-[320px] overflow-hidden rounded-[32px] shadow-[0_20px_35px_rgba(0,0,0,0.55)] transition-transform duration-700 ease-out transform-gpu hover:-translate-y-3 hover:shadow-[0_28px_50px_rgba(0,0,0,0.65)] sm:w-[360px] [clip-path:inset(0_round_32px)]"
            >
              <Image
                src={item.image}
                alt={item.title}
                fill
                sizes="(min-width: 640px) 360px, 90vw"
                className={`object-cover transition-transform duration-700 ${
                  item.featured
                    ? "scale-[1.05] group-hover:scale-[1.1]"
                    : "group-hover:scale-[1.04]"
                }`}
                priority={idx === 0}
              />
              <div
                className={`pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0510]/80 via-[#0a0510]/40 to-transparent ${item.overlay ?? ""}`}
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-[#7c3aed]/55 via-[#a78bfa]/25 to-transparent opacity-0 blur-[4px] transition-opacity duration-500 group-hover:opacity-100"
                aria-hidden
              />
              <div className="absolute inset-x-0 bottom-0 p-6 pb-8 space-y-3 transition-all duration-500 ease-out translate-y-[60px] group-hover:translate-y-0">
                <div className="min-h-[64px] flex items-end">
                  <p className="font-serif text-2xl font-semibold text-white drop-shadow-md leading-tight">
                    {item.title}
                  </p>
                </div>
                {item.description && (
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 rounded-b-2xl bg-[radial-gradient(circle_at_50%_100%,rgba(167,139,250,0.42),transparent_70%)] opacity-0 blur-md transition-opacity duration-400 group-hover:opacity-100" />
                    <p
                      className={`relative text-white/80 opacity-0 transition-opacity duration-400 delay-100 group-hover:opacity-100 ${item.smallText ? "text-xs" : "text-sm"}`}
                    >
                      {item.description}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Slider Controls */}
      <div className="flex items-center justify-center gap-6 mt-4 pb-8">
        {/* Previous Button */}
        <button
          onClick={handlePrevious}
          className="flex items-center justify-center w-12 h-12 rounded-2xl bg-[#1e102e] border border-white/10 shadow-sm transition-all duration-200 hover:bg-[#2a1840] hover:border-white/20 active:scale-95"
          aria-label="Previous slide"
        >
          <ChevronLeft />
        </button>

        {/* Dot Indicators */}
        <div className="flex items-center gap-2">
          {personas.map((_, index) => (
            <button
              key={index}
              onClick={() => handleDotClick(index)}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                index === activeIndex ? "bg-[#fe6839]" : "bg-white/20 hover:bg-white/40"
              }`}
              aria-label={`Go to slide ${index + 1}`}
              aria-current={index === activeIndex ? "true" : undefined}
            />
          ))}
        </div>

        {/* Next Button */}
        <button
          onClick={handleNext}
          className="flex items-center justify-center w-12 h-12 rounded-2xl bg-[#1e102e] border border-white/10 shadow-sm transition-all duration-200 hover:bg-[#2a1840] hover:border-white/20 active:scale-95"
          aria-label="Next slide"
        >
          <ChevronRight />
        </button>
      </div>
    </section>
  );
};

export default S03PerfectFor;
