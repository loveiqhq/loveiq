"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type Lenis from "lenis";

function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
}

// R-14: respect OS-level reduced-motion preference. Users with vestibular
// disorders or motion-sensitivity set this to opt out of smooth-scroll +
// parallax-style effects.
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    // Disable Lenis on admin pages — they use overflow-y-auto containers
    // that Lenis's wheel hijacking breaks. R-14: also disable when the
    // user prefers reduced motion. We re-run the effect when the user
    // toggles the preference live so the disable is reactive.
    if (isTouchDevice() || pathname.startsWith("/admin") || prefersReducedMotion()) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotionChange = () => {
      if (motionQuery.matches) {
        lenisRef.current?.destroy();
        lenisRef.current = null;
      }
    };
    motionQuery.addEventListener("change", onMotionChange);

    // Dynamic import keeps lenis out of the initial JS bundle evaluated at
    // module load time. If lenis fails in a given browser (e.g. Playwright
    // WebKit on Linux), React hydration still completes because the import
    // only runs inside this effect — after hydration is already done.
    let cancelled = false;
    import("lenis")
      .then(({ default: LenisClass }) => {
        if (cancelled) return;
        const lenis = new LenisClass({
          autoRaf: true,
          smoothWheel: true,
          duration: 0.7,
          easing: (t: number) => 1 - Math.pow(1 - t, 3),
          orientation: "vertical",
          gestureOrientation: "vertical",
          touchMultiplier: 1,
          anchors: true,
        });
        lenisRef.current = lenis;
      })
      .catch(() => {
        // Lenis unavailable — graceful degradation to native scroll.
      });

    return () => {
      cancelled = true;
      motionQuery.removeEventListener("change", onMotionChange);
      lenisRef.current?.destroy();
      lenisRef.current = null;
    };
  }, [pathname]);

  return <>{children}</>;
}
