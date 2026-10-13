"use client";

import { useEffect, type FC } from "react";
import { trackSectionSeen, type LandingSection } from "@features/analytics/client";

/**
 * How far down the landing a visitor got: `section_seen` once per section per page, when
 * part of it reaches the top half of the screen. Sections opt in with
 * `data-landing-section`; the hero has none, since every page view starts there.
 */
const LandingSectionsSeen: FC = () => {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          const section = (entry.target as HTMLElement).dataset.landingSection;
          if (section) trackSectionSeen({ section: section as LandingSection });
        }
      },
      // The bottom half of the screen is left out: a section only peeking in under the
      // fold has not been read.
      { rootMargin: "0px 0px -50% 0px" }
    );
    document.querySelectorAll("[data-landing-section]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return null;
};

export default LandingSectionsSeen;
