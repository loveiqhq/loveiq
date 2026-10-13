"use client";

import { useEffect, type FC } from "react";
import { trackSectionSeen, type LandingSection } from "@features/analytics/client";

/**
 * How far down the landing a visitor got: `section_seen` once per section per page, when
 * part of it reaches the top half of the screen, or all of it is on screen. Sections opt
 * in with `data-landing-section`; the hero has none, since every page view starts there.
 */
const LandingSectionsSeen: FC = () => {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sections = [...document.querySelectorAll<HTMLElement>("[data-landing-section]")];
    const counted = new Set<Element>();
    const observers: IntersectionObserver[] = [];
    const count = (el: Element) => {
      if (counted.has(el)) return;
      counted.add(el);
      for (const o of observers) o.unobserve(el);
      const section = (el as HTMLElement).dataset.landingSection;
      if (section) trackSectionSeen({ section: section as LandingSection });
    };
    observers.push(
      // Part of it in the top half: a section only peeking in under the fold is not read.
      new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && count(e.target)), {
        rootMargin: "0px 0px -50% 0px",
      }),
      // Or wholly on screen: on a tall window the page ends before the footer can climb
      // into the top half.
      new IntersectionObserver(
        (es) => es.forEach((e) => e.intersectionRatio >= 0.99 && count(e.target)),
        { threshold: 0.99 }
      )
    );
    // Scrolled past before this ran (a slow phone scrolls the server-rendered page first).
    for (const el of sections) if (el.getBoundingClientRect().bottom <= 0) count(el);
    for (const el of sections) for (const o of observers) if (!counted.has(el)) o.observe(el);
    return () => observers.forEach((o) => o.disconnect());
  }, []);
  return null;
};

export default LandingSectionsSeen;
