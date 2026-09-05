"use client";

import { useEffect, useRef, useState, type FC, type ReactNode } from "react";
import V3Chapter, { getV3Chapter, useIsV3 } from "./v3/V3Chapter";

interface Props {
  children: ReactNode;
  feedbackWidget?: ReactNode;
  primaryArchetype?: string;
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

function renderTitleWithArchetype(text: string, archetype?: string) {
  if (!archetype || !text.includes(archetype)) return text;
  const idx = text.indexOf(archetype);
  return (
    <>
      {text.slice(0, idx)}
      <span className="report-archetype-name">{archetype}</span>
      {text.slice(idx + archetype.length)}
    </>
  );
}

const ReportSection: FC<Props> = ({
  children,
  feedbackWidget,
  primaryArchetype,
  sectionId,
  title,
}) => {
  const ref = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  // V3 swaps this wrapper's chrome for the numbered-chapter accordion. Read
  // unconditionally so hook order stays stable across both variants.
  const isV3 = useIsV3();
  const v3Chapter = isV3 ? getV3Chapter(sectionId) : null;
  // String.prototype.split always returns ≥1 entries, so the first element is defined.
  const [eyebrow, ...titleSegments] = title.split(/:\s+/) as [string, ...string[]];
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
      (entries) => {
        const entry = entries[0];
        if (entry && (entry.isIntersecting || entry.intersectionRatio > 0)) {
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

  if (v3Chapter) {
    return (
      <V3Chapter chapter={v3Chapter} sectionId={sectionId} feedbackWidget={feedbackWidget}>
        {children}
      </V3Chapter>
    );
  }

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
              <h2 className="report-section__title">
                {renderTitleWithArchetype(eyebrow, primaryArchetype)}
              </h2>
              <p className="report-section__subtitle">
                {renderTitleWithArchetype(resolvedTitle, primaryArchetype)}
              </p>
            </>
          ) : (
            <h2 className="report-section__title">
              {renderTitleWithArchetype(resolvedTitle, primaryArchetype)}
            </h2>
          )}
        </div>
      </header>
      <div className="report-section__body">{children}</div>
      {feedbackWidget ? <div className="report-section__feedback-row">{feedbackWidget}</div> : null}
    </section>
  );
};

export default ReportSection;
