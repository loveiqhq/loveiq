"use client";

import Image from "next/image";
import { useRef, useState, useEffect, useCallback, type FC } from "react";

const experts = [
  {
    name: "Dr. Dijana Galijašević",
    tags: ["Business Ethics", "Social Science"],
    photo: "/academic/dijana.jpg",
    photoPosition: "30% 15%",
  },
  {
    name: "Dr. Bruno Steinkraus",
    tags: ["Biochemistry", "Neuroscience"],
    photo: "/academic/bruno.jpg",
    photoPosition: "63% 15%",
    photoScale: 1.2,
  },
  {
    name: "Dr. Quentin Ferry",
    tags: ["Machine Learning", "Molecular Biology"],
    photo: "/academic/quentin.png",
    photoPosition: "center 25%",
  },
];

const renderLogos = (index: number) => {
  const mod = index % experts.length;
  switch (mod) {
    case 0: // Dijana — Columbia + HHL
      return (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/academic/columbia-logo.svg"
            alt="Columbia University logo"
            style={{ height: 40, width: 58, transform: "scaleY(-1)" }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/academic/hhl-logo.svg"
            alt="HHL Leipzig logo"
            style={{ height: 34, width: 136 }}
          />
        </>
      );
    case 1: // Bruno — ICL + Oxford
      return (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/academic/icl-logo.svg"
            alt="Imperial College London logo"
            style={{ height: 28, width: 107, transform: "scaleY(-1)" }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/academic/oxford-logo.svg"
            alt="University of Oxford logo"
            style={{ height: 38, width: 128, transform: "scaleY(-1)" }}
          />
        </>
      );
    case 2: // Quentin — Oxford + MIT
      return (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/academic/oxford-logo.svg"
            alt="University of Oxford logo"
            style={{ height: 34, width: 115, transform: "scaleY(-1)" }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/academic/mit-logo.svg" alt="MIT logo" style={{ height: 40, width: 75 }} />
        </>
      );
    default:
      return null;
  }
};

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

const S08AcademicBoard: FC = () => {
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
  const cardWidth = 364; // 340px card + 24px margin (m-3 = 12px each side)
  const totalWidth = cardWidth * experts.length;

  const updateActiveIndex = useCallback(() => {
    const position = Math.abs(currentTranslateRef.current);
    const index = Math.round(position / cardWidth) % experts.length;
    setActiveIndex(index);
  }, [cardWidth]);

  const animate = useCallback(
    (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const delta = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      if (!isPaused && !isDraggingRef.current) {
        currentTranslateRef.current -= delta * 0.025;

        if (Math.abs(currentTranslateRef.current) >= totalWidth) {
          currentTranslateRef.current = currentTranslateRef.current + totalWidth;
        }

        if (carouselRef.current) {
          carouselRef.current.style.transform = `translateX(${currentTranslateRef.current}px)`;
        }

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

  const navigateToSlide = useCallback(
    (index: number) => {
      const targetPosition = -(index * cardWidth);
      currentTranslateRef.current = targetPosition;
      if (carouselRef.current) {
        carouselRef.current.style.transition = "transform 0.4s ease-out";
        carouselRef.current.style.transform = `translateX(${targetPosition}px)`;
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

  const handlePrevious = useCallback(() => {
    const newIndex = activeIndex <= 0 ? experts.length - 1 : activeIndex - 1;
    navigateToSlide(newIndex);
  }, [activeIndex, navigateToSlide]);

  const handleNext = useCallback(() => {
    const newIndex = activeIndex >= experts.length - 1 ? 0 : activeIndex + 1;
    navigateToSlide(newIndex);
  }, [activeIndex, navigateToSlide]);

  const handleDotClick = useCallback(
    (index: number) => {
      navigateToSlide(index);
    },
    [navigateToSlide]
  );

  return (
    <section
      className="section-shell relative overflow-hidden bg-[#0A0510] px-4 text-white"
      aria-labelledby="academic-board-heading"
    >
      <div className="content-shell flex flex-col items-center gap-8">
        <h2
          id="academic-board-heading"
          className="max-w-[889px] text-center font-serif text-3xl font-normal leading-tight tracking-[-0.02em] text-white sm:text-4xl md:text-5xl lg:text-[64px] lg:leading-[64px] lg:tracking-[-1.2px]"
        >
          Supported by academic multidisciplinary expertise
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-center text-lg font-light leading-relaxed text-text-secondary">
          Our Academic Board supports us that what we build is grounded in science, ethics and state
          of the art methodology.
        </p>
      </div>

      <div className="relative mt-12 w-screen max-w-none left-1/2 -translate-x-1/2 overflow-hidden pb-4 sm:mt-16">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#0a0510] to-transparent sm:w-24"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#0a0510] to-transparent sm:w-24"
          aria-hidden
        />

        <div
          ref={carouselRef}
          className="flex w-max cursor-grab select-none active:cursor-grabbing"
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
          onTouchStart={(e) => handleDragStart(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={(e) => handleDragMove(e.touches[0].clientX, e.touches[0].clientY, e)}
          onTouchEnd={handleDragEnd}
          onMouseEnter={() => setIsPaused(true)}
        >
          {[...experts, ...experts, ...experts].map((expert, idx) => (
            <div
              key={`${expert.name}-${idx}`}
              className="relative m-3 h-[528px] w-[340px] overflow-hidden rounded-[24px] border border-white/10 shadow-[0_20px_35px_rgba(0,0,0,0.45)]"
            >
              {/* Photo */}
              <Image
                src={expert.photo}
                alt={expert.name}
                fill
                sizes="680px"
                className="object-cover"
                style={{
                  objectPosition: expert.photoPosition,
                  ...(expert.photoScale ? { transform: `scale(${expert.photoScale})` } : {}),
                }}
                priority={idx < 4}
              />

              {/* Desaturation overlay */}
              <div
                className="absolute inset-0 bg-[rgba(255,255,255,0.3)] mix-blend-saturation"
                aria-hidden
              />

              {/* Dark gradient */}
              <div
                className="absolute inset-0 bg-gradient-to-t from-[#0a0510] from-[1%] via-[rgba(10,5,16,0.6)] via-[37%] to-transparent to-[72%]"
                aria-hidden
              />

              {/* Bottom content */}
              <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 p-4">
                {/* Name */}
                <h3 className="font-serif text-[25px] font-semibold leading-[28px] tracking-[-0.5px] text-white">
                  {expert.name}
                </h3>

                {/* Tags */}
                <div className="flex flex-col items-start gap-2">
                  {expert.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/25 bg-white/15 px-[17px] py-[5px] font-sans text-[12px] font-bold uppercase tracking-[1.2px] text-white shadow-[0_10px_15px_-3px_rgba(0,0,0,0.2),0_4px_6px_-4px_rgba(0,0,0,0.2)] backdrop-blur-[2px]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Logos */}
                <div className="flex h-12 items-center justify-evenly">{renderLogos(idx)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Slider Controls */}
      <div className="mt-4 flex items-center justify-center gap-6 pb-8">
        <button
          onClick={handlePrevious}
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-[#1e102e] shadow-sm transition-all duration-200 hover:border-white/20 hover:bg-[#2a1840] active:scale-95"
          aria-label="Previous slide"
        >
          <ChevronLeft />
        </button>

        <div className="flex items-center gap-2">
          {experts.map((_, index) => (
            <button
              key={index}
              onClick={() => handleDotClick(index)}
              className={`h-2 w-2 rounded-full transition-all duration-300 ${
                index === activeIndex ? "bg-[#fe6839]" : "bg-white/20 hover:bg-white/40"
              }`}
              aria-label={`Go to slide ${index + 1}`}
              aria-current={index === activeIndex ? "true" : undefined}
            />
          ))}
        </div>

        <button
          onClick={handleNext}
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-[#1e102e] shadow-sm transition-all duration-200 hover:border-white/20 hover:bg-[#2a1840] active:scale-95"
          aria-label="Next slide"
        >
          <ChevronRight />
        </button>
      </div>
    </section>
  );
};

export default S08AcademicBoard;
