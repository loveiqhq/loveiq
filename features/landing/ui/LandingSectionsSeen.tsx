"use client";

import { useEffect, type FC } from "react";
import {
  trackSectionSeen,
  trackSectionTime,
  type LandingSection,
} from "@features/analytics/client";

/**
 * How far down the landing a visitor got: `section_seen` once per section per page, when
 * part of it reaches the top half of the screen, or all of it is on screen. Sections opt
 * in with `data-landing-section`; the hero has none, since every page view starts there.
 * And how long each section was in view: `section_time`, below.
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

  /**
   * Time in view, per section: at least half of it on screen, or across the middle of the
   * screen, which is how a section taller than two screens fills half of it (it is never half
   * on screen). The clock runs only while the tab shows. What was not sent yet goes when the
   * tab hides, on pagehide, and on unmount: the calls to action are links inside the app, so
   * leaving for the survey fires no pagehide.
   */
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sections = [...document.querySelectorAll<HTMLElement>("[data-landing-section]")];
    const half = new Set<Element>();
    const middle = new Set<Element>();
    const since = new Map<Element, number>();
    const unsent = new Map<Element, number>();
    // Between pagehide and a return from the back-forward cache, while the tab may still
    // read as visible.
    let gone = false;
    const sync = () => {
      const now = performance.now();
      const showing = !gone && document.visibilityState === "visible";
      for (const el of sections) {
        const start = since.get(el);
        const on = showing && (half.has(el) || middle.has(el));
        if (on && start === undefined) since.set(el, now);
        if (!on && start !== undefined) {
          since.delete(el);
          unsent.set(el, (unsent.get(el) ?? 0) + now - start);
        }
      }
    };
    const send = () => {
      for (const [el, ms] of unsent) {
        const section = (el as HTMLElement).dataset.landingSection;
        const visible_ms = Math.round(ms);
        if (section && visible_ms > 0)
          trackSectionTime({ section: section as LandingSection, visible_ms });
      }
      unsent.clear();
    };
    const watch = (
      inView: Set<Element>,
      isIn: (e: IntersectionObserverEntry) => boolean,
      init: IntersectionObserverInit
    ) =>
      new IntersectionObserver((es) => {
        for (const e of es) {
          if (isIn(e)) inView.add(e.target);
          else inView.delete(e.target);
        }
        sync();
      }, init);
    const observers = [
      watch(half, (e) => e.intersectionRatio >= 0.5, { threshold: 0.5 }),
      // A band 1% of the screen high across its middle: a line of no height may never be
      // reported as crossed in every browser.
      watch(middle, (e) => e.isIntersecting, { rootMargin: "-49.5% 0px -49.5% 0px" }),
    ];
    for (const el of sections) for (const o of observers) o.observe(el);
    const onVisibility = () => {
      sync();
      if (document.visibilityState === "hidden") send();
    };
    const onPageHide = () => {
      gone = true;
      sync();
      send();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      gone = false;
      sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      observers.forEach((o) => o.disconnect());
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      onPageHide();
    };
  }, []);
  return null;
};

export default LandingSectionsSeen;
