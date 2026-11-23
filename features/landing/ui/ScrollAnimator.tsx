"use client";

import { useEffect } from "react";

const ScrollAnimator = () => {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // `.animate-on-scroll` hides itself until `.animate`; a `[data-reveal]` group stays put and
    // only passes `.animate` to its children's CSS (landing page v2's cascades, Hana's board).
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(".animate-on-scroll, [data-reveal]")
    );
    if (!elements.length) return;

    // A browser without the observer (and jsdom) gets the content at once, not a page of
    // `.animate-on-scroll` elements left at opacity 0.
    if (typeof IntersectionObserver === "undefined") {
      elements.forEach((el) => el.classList.add("animate"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("animate");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -10% 0px" }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return null;
};

export default ScrollAnimator;
