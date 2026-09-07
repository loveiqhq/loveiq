"use client";

import { useEffect } from "react";

/**
 * Publish the consent banner's height as `--liq-consent-h`.
 *
 * CookieYes renders its banner `position: fixed` at `z-index: 9999999`, pinned
 * to the bottom of the viewport. On a phone it is **316px tall** — 38% of a
 * Pixel 7, 48% of an iPhone 15 Pro, 49% of a 360x640 Android — and everything we
 * pin to the bottom sits underneath it.
 *
 * Measured on production 2026-09-07: with the banner up, a real touch tap on
 * "Unlock full report" landed on the banner on every phone tried (Pixel 7,
 * iPhone 15 Pro, Galaxy S5) — `elementFromPoint` at the button's centre returned
 * the CookieYes wrapper, and the tap never reached the button. Accepting consent
 * and re-tapping the identical element worked every time. Desktop barely
 * notices: the same banner is 152px, 17% of a 1440x900 window, and the desktop
 * CTA sits clear of it — which is why this survived so long.
 *
 * We can neither restyle a third-party banner nor paint over it (consent must
 * stay usable, and covering it would be worse than the bug), so we measure it
 * and let our own bottom-pinned UI step aside until the reader answers.
 *
 * The variable is 0px whenever no banner is showing, so every consumer can just
 * read `var(--liq-consent-h, 0px)` unconditionally.
 */
const BANNER_SELECTOR = ".cky-consent-container, .cky-modal, [class*='cky-consent']";

export default function ConsentBannerOffset() {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    let watched: Element | null = null;

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => schedule());

    function measure() {
      frame = 0;
      const el = document.querySelector<HTMLElement>(BANNER_SELECTOR);

      if (el !== watched) {
        if (watched) resizeObserver?.unobserve(watched);
        watched = el;
        if (el) resizeObserver?.observe(el);
      }

      const rect = el?.getBoundingClientRect();
      // Only a banner that is genuinely on screen AND sitting against the bottom
      // edge can cover our bottom-pinned UI. A centred consent modal, or one
      // animated off-screen, must not push the CTA around.
      const coversBottom =
        !!rect &&
        rect.height > 0 &&
        rect.width > 0 &&
        rect.bottom > window.innerHeight - 8 &&
        rect.top < window.innerHeight;

      // Clamp to 60% of the viewport. On a very short screen (a 360x298 flip
      // cover, say) the banner is taller than the space above it, and offsetting
      // by its full height would push the CTA off the top of the screen — worse
      // than being covered. Past that point nothing can be made reachable, so
      // stop moving.
      const offset = coversBottom
        ? Math.min(Math.ceil(rect.height), Math.floor(window.innerHeight * 0.6))
        : 0;
      root.style.setProperty("--liq-consent-h", `${offset}px`);
    }

    function schedule() {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    }

    schedule();

    // The banner is injected by a third-party script well after hydration, and
    // is removed (or animated away) the moment consent is given — both are DOM
    // mutations, so one observer covers appear, resize and dismiss.
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      root.style.removeProperty("--liq-consent-h");
    };
  }, []);

  return null;
}
