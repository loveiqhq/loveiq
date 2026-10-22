/**
 * Whether the report's guided tour is running (features/report/ui/v3/V4GuidedTour.tsx).
 *
 * The tour scrolls the page by itself, from the top down to Typical Beliefs and on to the
 * first locked chapter, while the reader only watches. Everything that reads scrolling as
 * reading would count that trip: the chapters' reach and time, `cta_seen`, scroll depth and
 * the "paywall reached" ping. Worse, the plans pop-up fires once a visit, when its
 * chapter comes into view, so a tour that set it off would spend it before the reader
 * ever got there on their own. Each of those asks this flag and
 * stands down while it is set, without disconnecting, so it still fires when the reader
 * really arrives.
 *
 * A plain module, like `isBodyScrollLocked` (body-scroll-lock.ts), which the same readers
 * already consult: shared code (uxSignals) needs it, and none of the tour's React.
 */

let active = false;
const listeners = new Set<() => void>();

export function setGuidedTourActive(on: boolean): void {
  if (active === on) return;
  active = on;
  for (const listener of [...listeners]) listener();
}

export function isGuidedTourActive(): boolean {
  return active;
}

/** For `useSyncExternalStore`, and for observers that look again once the tour ends. */
export function subscribeGuidedTour(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only reset: module state outlives a jsdom test. */
export function __resetGuidedTourForTests(): void {
  active = false;
  listeners.clear();
}
