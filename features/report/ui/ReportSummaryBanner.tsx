"use client";

import { useEffect, useState, type FC } from "react";
import { trackReportSummaryJumped } from "@features/analytics/client";

interface Props {
  onSummaryClick?: () => void;
  /** Owner's archetype name, for analytics attribution. */
  archetype?: string | null;
}

const SCROLL_THRESHOLD = 15;

const ReportSummaryBanner: FC<Props> = ({ onSummaryClick, archetype }) => {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const lastScrollY = { current: window.scrollY };
    const lastDirection: { current: "up" | "down" | null } = { current: null };
    let ticking = false;

    const update = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      if (scrollY <= 0) {
        setHidden(false);
        lastScrollY.current = scrollY;
        ticking = false;
        return;
      }
      const diff = scrollY - lastScrollY.current;
      if (Math.abs(diff) >= SCROLL_THRESHOLD) {
        const direction = diff > 0 ? "down" : "up";
        if (direction !== lastDirection.current) {
          lastDirection.current = direction;
          setHidden(direction === "down");
        }
        lastScrollY.current = scrollY;
      }
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    };

    const onResize = () => {
      if (window.scrollY <= 0) setHidden(false);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div className={`report-summary-banner${hidden ? " report-summary-banner--hidden" : ""}`}>
      <a
        href="#summary"
        className="report-summary-banner__btn"
        onClick={() => {
          trackReportSummaryJumped({ source: "banner", archetype });
          onSummaryClick?.();
        }}
      >
        <span className="report-summary-banner__label-primary">Want it shorter?</span>
        <span className="report-summary-banner__label-secondary">Jump to the report summary</span>
      </a>
    </div>
  );
};

export default ReportSummaryBanner;
