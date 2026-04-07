"use client";

import { useEffect, useRef, useState, type FC, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  feedbackWidget?: ReactNode;
  sectionId: string;
  title: string;
}

const ReportSection: FC<Props> = ({ children, feedbackWidget, sectionId, title }) => {
  const ref = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.08 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      id={sectionId}
      data-report-section="true"
      className={`report-section ${isVisible ? "is-visible" : ""}`}
    >
      <header className="report-section__header">
        <h2 className="report-section__title">{title}</h2>
        {feedbackWidget}
      </header>
      <div className="report-section__body">{children}</div>
    </section>
  );
};

export default ReportSection;
