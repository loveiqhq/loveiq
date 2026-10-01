"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { wizardFit, type WizardFit } from "./wizardFit";

/** Where the desktop layout starts (wizard-desktop.css): it sizes its slides itself. */
const DESKTOP_MIN = 1024;
/** The phone column's widest. */
const FRAME_WIDTH = 393;
/** Figma's 393 x 852 frame, until the first measure (and on a desktop). */
const FIGMA: WizardFit = { k: 1, top: 36, bottom: 76.8, scroll: false };

const same = (a: WizardFit, b: WizardFit) =>
  a.k === b.k && a.top === b.top && a.bottom === b.bottom && a.scroll === b.scroll;

/**
 * The phone's fit (wizardFit) for the frame `frameRef` points at, kept current as the
 * window resizes (a phone's toolbar folding away changes 100dvh), and as the cookie banner
 * comes and goes: ConsentBannerOffset publishes its height on <html> as --liq-consent-h.
 * `safeRef` is an element as tall as env(safe-area-inset-bottom).
 */
export function useWizardFit(
  frameRef: RefObject<HTMLElement | null>,
  safeRef: RefObject<HTMLElement | null>
): WizardFit {
  const [fit, setFit] = useState<WizardFit>(FIGMA);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const root = document.documentElement;
    const measure = () => {
      let next = FIGMA;
      if (window.innerWidth < DESKTOP_MIN) {
        // jsdom lays nothing out: the window stands in for the frame there.
        const box = frame.getBoundingClientRect();
        next = wizardFit({
          width: box.width || Math.min(FRAME_WIDTH, window.innerWidth),
          height: box.height || window.innerHeight,
          safeBottom: safeRef.current?.offsetHeight ?? 0,
          consent:
            Number.parseFloat(getComputedStyle(root).getPropertyValue("--liq-consent-h")) || 0,
        });
      }
      setFit((prev) => (same(prev, next) ? prev : next));
    };
    measure();
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    resize?.observe(frame);
    window.addEventListener("resize", measure);
    const banner = new MutationObserver(measure);
    banner.observe(root, { attributes: true, attributeFilter: ["style"] });
    return () => {
      resize?.disconnect();
      window.removeEventListener("resize", measure);
      banner.disconnect();
    };
  }, [frameRef, safeRef]);
  return fit;
}
