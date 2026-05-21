"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FC,
  type ReactNode,
} from "react";

type Testimonial = {
  name: string;
  role: string;
  photo: string;
  quote: ReactNode;
};

const testimonials: Testimonial[] = [
  {
    name: "Dr. Dijana Galijašević, 36",
    role: "Business founder & CEO",
    photo: "/testimonials/dijana.webp",
    quote: (
      <>
        I hesitated at first, but getting the{" "}
        <em>full report turned out to be one of the best decisions I made. Completely worth it.</em>
      </>
    ),
  },
  {
    name: "Philipp Leonhard, 42",
    role: "Product Owner IT",
    photo: "/testimonials/philipp.jpg",
    quote: (
      <>
        I&rsquo;d never really explored my sexuality or the patterns behind it before. I already
        learned a lot just from taking the test, but the{" "}
        <em>insights in the full report were truly eye-opening. Absolutely worth it.</em>
      </>
    ),
  },
  {
    name: "Marija Mustapić, 41",
    role: "IT Infrastructure",
    photo: "/testimonials/marija.jpg",
    quote: (
      <>
        Unlocking my report was <em>one of the best investments made for my sexuality.</em> It is
        shockingly precise.
      </>
    ),
  },
  {
    name: "Richard Petrich, 34",
    role: "Entrepreneur",
    photo: "/testimonials/richard.jpg",
    quote: (
      <>
        The results were <em>more insightful than I expected.</em> It connected dots between
        emotional triggers and communication styles I hadn&rsquo;t noticed before. Solid UX, too.
      </>
    ),
  },
];

const SLIDE_GAP = 24;
const AUTOPLAY_PX_PER_MS = 0.03;
const DRAG_DIRECTION_THRESHOLD = 5;

const ChevronLeft = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M10 12L6 8L10 4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M6 12L10 8L6 4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const StarIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path d="m10 1.8 2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.42l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.8Z" />
  </svg>
);

const PricingTestimonialsCarousel: FC = () => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [cardWidth, setCardWidth] = useState(360);
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

  const slideWidth = cardWidth + SLIDE_GAP;
  const totalWidth = slideWidth * testimonials.length;

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const available = viewport.clientWidth;
    if (available <= 0) return;
    const isMobile = available < 768;
    // Mobile: ~70% of viewport so side cards clearly peek (Figma look).
    // Desktop: ~78% with a generous cap.
    const ratio = isMobile ? 0.7 : 0.78;
    const minW = isMobile ? 220 : 240;
    const maxW = isMobile ? 320 : 560;
    const target = available * ratio;
    const next = Math.max(minW, Math.min(target, maxW));
    setCardWidth(Math.round(next));
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => measure();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [measure]);

  const updateActiveIndex = useCallback(() => {
    if (slideWidth <= 0) return;
    const position = Math.abs(currentTranslateRef.current);
    const index = Math.round(position / slideWidth) % testimonials.length;
    setActiveIndex(index);
  }, [slideWidth]);

  const animate = useCallback(
    (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const delta = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      if (!isDraggingRef.current && totalWidth > 0) {
        currentTranslateRef.current -= delta * AUTOPLAY_PX_PER_MS;

        if (Math.abs(currentTranslateRef.current) >= totalWidth) {
          currentTranslateRef.current = currentTranslateRef.current + totalWidth;
        }

        if (trackRef.current) {
          trackRef.current.style.transform = `translateX(${currentTranslateRef.current}px)`;
        }

        updateActiveIndex();
      }

      if (animateFnRef.current) {
        animationRef.current = requestAnimationFrame(animateFnRef.current);
      }
    },
    [totalWidth, updateActiveIndex]
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
    if (trackRef.current) {
      trackRef.current.style.transition = "";
    }
  };

  const handleDragMove = (clientX: number, clientY?: number, e?: React.TouchEvent) => {
    if (!isDraggingRef.current) return;

    if (clientY !== undefined && directionLockedRef.current === null) {
      const deltaX = Math.abs(clientX - startXRef.current);
      const deltaY = Math.abs(clientY - startYRef.current);
      if (deltaX > DRAG_DIRECTION_THRESHOLD || deltaY > DRAG_DIRECTION_THRESHOLD) {
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

    if (trackRef.current) {
      trackRef.current.style.transform = `translateX(${currentTranslateRef.current}px)`;
    }
  };

  const handleDragEnd = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    directionLockedRef.current = null;
    lastTimeRef.current = 0;
    updateActiveIndex();
  };

  const navigateToSlide = useCallback(
    (index: number) => {
      const target = -(index * slideWidth);
      currentTranslateRef.current = target;
      if (trackRef.current) {
        trackRef.current.style.transition = "transform 0.4s ease-out";
        trackRef.current.style.transform = `translateX(${target}px)`;
        window.setTimeout(() => {
          if (trackRef.current) {
            trackRef.current.style.transition = "";
          }
        }, 400);
      }
      setActiveIndex(index);
      lastTimeRef.current = 0;
    },
    [slideWidth]
  );

  const handlePrevious = useCallback(() => {
    const next = activeIndex <= 0 ? testimonials.length - 1 : activeIndex - 1;
    navigateToSlide(next);
  }, [activeIndex, navigateToSlide]);

  const handleNext = useCallback(() => {
    const next = activeIndex >= testimonials.length - 1 ? 0 : activeIndex + 1;
    navigateToSlide(next);
  }, [activeIndex, navigateToSlide]);

  return (
    <section className="report-pricing-modal__testimonials" aria-label="Customer testimonials">
      <div ref={viewportRef} className="report-pricing-modal__testimonials-viewport">
        <div
          ref={trackRef}
          className="report-pricing-modal__testimonials-track"
          data-lenis-prevent
          onMouseDown={(e) => {
            e.preventDefault();
            handleDragStart(e.clientX);
          }}
          onMouseMove={(e) => handleDragMove(e.clientX)}
          onMouseUp={handleDragEnd}
          onMouseLeave={handleDragEnd}
          onTouchStart={(e) => {
            handleDragStart(e.touches[0]!.clientX, e.touches[0]!.clientY);
          }}
          onTouchMove={(e) => handleDragMove(e.touches[0]!.clientX, e.touches[0]!.clientY, e)}
          onTouchEnd={handleDragEnd}
          onTouchCancel={handleDragEnd}
          style={{ gap: `${SLIDE_GAP}px` }}
        >
          {[...testimonials, ...testimonials, ...testimonials].map((item, idx) => {
            const isActive = idx % testimonials.length === activeIndex;
            return (
              <article
                key={`${item.name}-${idx}`}
                className={`report-pricing-modal__testimonial-card${isActive ? " is-active" : ""}`}
                style={{ width: `${cardWidth}px` }}
                aria-roledescription="testimonial"
              >
                <header className="report-pricing-modal__testimonial-head">
                  <div className="report-pricing-modal__testimonial-avatar">
                    <Image
                      src={item.photo}
                      alt=""
                      width={188}
                      height={188}
                      sizes="(max-width: 640px) 94px, 64px"
                      quality={95}
                      draggable={false}
                    />
                  </div>
                  <div className="report-pricing-modal__testimonial-id">
                    <p className="report-pricing-modal__testimonial-name">{item.name}</p>
                    <p className="report-pricing-modal__testimonial-role">{item.role}</p>
                  </div>
                </header>
                <div
                  className="report-pricing-modal__testimonial-stars"
                  role="img"
                  aria-label="5 out of 5 stars"
                >
                  {Array.from({ length: 5 }).map((_, i) => (
                    <StarIcon key={i} />
                  ))}
                </div>
                <blockquote className="report-pricing-modal__testimonial-quote">
                  &ldquo;{item.quote}&rdquo;
                </blockquote>
              </article>
            );
          })}
        </div>
      </div>

      <div className="report-pricing-modal__testimonial-controls">
        <button
          type="button"
          className="report-pricing-modal__testimonial-arrow"
          onClick={handlePrevious}
          aria-label="Previous testimonial"
        >
          <ChevronLeft />
        </button>

        <div className="report-pricing-modal__testimonial-dots" role="tablist">
          {testimonials.map((item, index) => (
            <button
              key={item.name}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              aria-current={index === activeIndex ? "true" : undefined}
              aria-label={`Go to testimonial ${index + 1}`}
              onClick={() => navigateToSlide(index)}
              className={`report-pricing-modal__testimonial-dot ${
                index === activeIndex ? "is-active" : ""
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          className="report-pricing-modal__testimonial-arrow"
          onClick={handleNext}
          aria-label="Next testimonial"
        >
          <ChevronRight />
        </button>
      </div>
    </section>
  );
};

export default PricingTestimonialsCarousel;
