"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type Lenis from "lenis";

function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
}

export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    // Disable Lenis on admin pages — they use overflow-y-auto containers
    // that Lenis's wheel hijacking breaks.
    if (isTouchDevice() || pathname.startsWith("/admin")) return;

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
      lenisRef.current?.destroy();
      lenisRef.current = null;
    };
  }, [pathname]);

  return <>{children}</>;
}
