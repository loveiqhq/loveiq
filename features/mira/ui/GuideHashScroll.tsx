"use client";

import { useEffect } from "react";

/**
 * Takes the guide to its #practice-N on a fresh load. Desktop Safari sometimes skipped the
 * browser's own jump (2 of 10 fresh loads on staging, 21 Nov 2026), so once the page and its
 * fonts are in, the section is brought to the top without animation.
 */
export default function GuideHashScroll() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!/^practice-[1-7]$/.test(id)) return;
    const jump = () =>
      document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "instant" });
    jump();
    void document.fonts?.ready.then(jump);
    window.addEventListener("load", jump, { once: true });
    return () => window.removeEventListener("load", jump);
  }, []);
  return null;
}
