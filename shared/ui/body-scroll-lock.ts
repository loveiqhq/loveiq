import { restoreScroll } from "./restore-scroll";

/**
 * One reference-counted body-scroll lock, shared by every overlay.
 *
 * Each overlay used to snapshot `document.body.style` on open and write those
 * values back on close. That is only correct while exactly one overlay is open.
 * When two overlap, the inner one snapshots the OUTER one's *locked* values and
 * restores them permanently on close — leaving `body { overflow: hidden }` (or
 * `position: fixed`) behind with nothing holding it.
 *
 * That is not theoretical: on 2026-09-05 a reader opened the report's chapter
 * drawer (lock 1), tapped "Share report" inside it (lock 2), and the paywall
 * auto-opened 200ms later (lock 3). Dismissing the paywall restored a locked
 * snapshot, and the report could not be scrolled for the rest of the visit —
 * PostHog logged seven `$dead_swipe` events before they gave up. The page still
 * scrolls PROGRAMMATICALLY in that state (`window.scrollBy` works), which is why
 * it never showed up in a test: only real touch scrolling is dead.
 *
 * Reference counting fixes it at the shared chokepoint. The first acquire
 * snapshots the genuinely-unlocked styles and applies the lock; nested acquires
 * only bump the count; the last release restores that one snapshot and puts the
 * reader back where they were. Overlays no longer touch `body.style` at all, so
 * no ordering of opens and closes can strand a lock.
 *
 * `position: fixed` + negative `top` (rather than plain `overflow: hidden`) is
 * kept from the pricing modal — it is the variant that also holds iOS Safari
 * still, and it is now applied uniformly.
 */

let depth = 0;
let snapshot: {
  htmlOverflow: string;
  bodyLeft: string;
  bodyOverflow: string;
  bodyPosition: string;
  bodyRight: string;
  bodyTop: string;
  bodyWidth: string;
  scrollY: number;
} | null = null;

export function lockBodyScroll(): void {
  if (typeof document === "undefined") return;

  depth += 1;
  if (depth > 1) return; // already locked by an outer overlay

  const scrollY = window.scrollY;
  snapshot = {
    htmlOverflow: document.documentElement.style.overflow,
    bodyLeft: document.body.style.left,
    bodyOverflow: document.body.style.overflow,
    bodyPosition: document.body.style.position,
    bodyRight: document.body.style.right,
    bodyTop: document.body.style.top,
    bodyWidth: document.body.style.width,
    scrollY,
  };

  document.documentElement.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.top = `-${scrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
  document.body.style.overflow = "hidden";
}

export function unlockBodyScroll(): void {
  if (typeof document === "undefined") return;
  if (depth === 0) return;

  depth -= 1;
  if (depth > 0) return; // an outer overlay still needs the lock

  const restore = snapshot;
  snapshot = null;
  if (!restore) return;

  document.documentElement.style.overflow = restore.htmlOverflow;
  document.body.style.left = restore.bodyLeft;
  document.body.style.overflow = restore.bodyOverflow;
  document.body.style.position = restore.bodyPosition;
  document.body.style.right = restore.bodyRight;
  document.body.style.top = restore.bodyTop;
  document.body.style.width = restore.bodyWidth;
  restoreScroll(restore.scrollY);
}

/** Test-only reset so one spec's leak can't bleed into the next. */
export function __resetBodyScrollLockForTests(): void {
  depth = 0;
  snapshot = null;
}
