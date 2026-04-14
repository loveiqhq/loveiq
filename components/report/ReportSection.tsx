"use client";

import { useEffect, useRef, useState, type FC, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  feedbackWidget?: ReactNode;
  sectionId: string;
  title: string;
}

function shouldRevealSection(element: HTMLElement, sectionId: string) {
  if (typeof window === "undefined") return true;

  const currentHash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  if (currentHash === sectionId) {
    return true;
  }

  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const topOffset = window.innerWidth < 768 ? 72 : 96;

  return (
    rect.bottom > topOffset &&
    rect.top < viewportHeight &&
    rect.right > 0 &&
    rect.left < viewportWidth
  );
}

const ReportSection: FC<Props> = ({ children, feedbackWidget, sectionId, title }) => {
  const ref = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [eyebrow, ...titleSegments] = title.split(/:\s+/);
  const hasSplitTitle = titleSegments.length > 0;
  const resolvedTitle = hasSplitTitle ? titleSegments.join(": ").trim() : title;

  useEffect(() => {
    const element = ref.current;
    if (!element || isVisible) return;

    const revealSection = () => {
      if (!shouldRevealSection(element, sectionId)) {
        return false;
      }

      setIsVisible(true);
      return true;
    };

    if (revealSection()) {
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      const fallbackId = requestAnimationFrame(() => setIsVisible(true));
      return () => cancelAnimationFrame(fallbackId);
    }

    let rafId: number | null = null;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting || entry.intersectionRatio > 0) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.01, rootMargin: "0px 0px -12% 0px" }
    );

    const scheduleRevealCheck = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(() => {
        rafId = null;

        if (revealSection()) {
          observer.disconnect();
        }
      });
    };

    observer.observe(element);
    window.addEventListener("hashchange", scheduleRevealCheck);
    window.addEventListener("resize", scheduleRevealCheck, { passive: true });

    return () => {
      window.removeEventListener("hashchange", scheduleRevealCheck);
      window.removeEventListener("resize", scheduleRevealCheck);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      observer.disconnect();
    };
  }, [isVisible, sectionId]);

  return (
    <section
      ref={ref}
      id={sectionId}
      data-report-section="true"
      className={`report-section ${isVisible ? "is-visible" : ""}`}
    >
      <header className="report-section__header">
        <div className={`report-section__title-stack ${hasSplitTitle ? "is-split" : ""}`}>
          {hasSplitTitle ? (
            <>
              <h2 className="report-section__title">{eyebrow}</h2>
              <p className="report-section__subtitle">{resolvedTitle}</p>
            </>
          ) : (
            <h2 className="report-section__title">{resolvedTitle}</h2>
          )}
        </div>
        {feedbackWidget}
      </header>
      <div className="report-section__body">{children}</div>
    </section>
  );
};

export default ReportSection;
