import type Lenis from "lenis";

/**
 * The page's smooth scroll (Lenis, SmoothScroll.tsx) while one runs, for the code that
 * must pause and re-measure it round a body-scroll lock (body-scroll-lock.ts). Null on
 * a touch screen, under reduced motion, on admin pages and until Lenis has loaded.
 *
 * Its own module, not SmoothScroll's: the lock is a plain module every overlay imports,
 * and needs none of the component's React.
 */
export type SmoothScrollHandle = Pick<Lenis, "resize" | "start" | "stop">;

let current: SmoothScrollHandle | null = null;

export function setSmoothScroll(handle: SmoothScrollHandle | null): void {
  current = handle;
}

export function getSmoothScroll(): SmoothScrollHandle | null {
  return current;
}
