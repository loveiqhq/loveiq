"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { installUxSignals, resetUxSignalsForPageview } from "@shared/observability/uxSignals";

/**
 * Mounts the global UX-quality signal listeners (scroll-depth, rage clicks,
 * dead clicks, tab visibility) exactly once for the app lifetime, and resets
 * per-pageview state when the App Router pathname changes (client-side nav).
 *
 * Designed as a sibling of `<WebVitals />` — render once at the app root.
 */
export default function UxSignals() {
  const pathname = usePathname();

  useEffect(() => {
    installUxSignals();
  }, []);

  useEffect(() => {
    // Pathname change = new pageview. Reset depth + dead-click dedupe so
    // navigating to a new page doesn't suppress its own milestones.
    resetUxSignalsForPageview();
  }, [pathname]);

  return null;
}
