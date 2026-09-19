/**
 * Put the window back where it was after a scroll lock, with no animation.
 *
 * Every overlay here locks the page with `position: fixed; top: -scrollY` and unlocks by
 * calling `window.scrollTo(0, scrollY)`. That call obeys `html { scroll-behavior: smooth }`
 * (app/globals.css), and at the moment it runs the page is at 0 — `position: fixed` has
 * just been removed — so the restore ANIMATED from the top of the page down to wherever
 * the reader was. Reported on the report's paywall: "it starts at the very top of the
 * page and then scrolls down to the section that I was just looking at. Feels a bit
 * strange" (MO, 2026-08-22). The same thing happened when closing any nav menu.
 *
 * An inline `scroll-behavior: auto` outranks the stylesheet for the one call, and
 * `behavior: "instant"` covers engines that ignore the property. Both are put back
 * immediately, so in-page anchor links keep scrolling smoothly.
 */
export function restoreScroll(y: number): void {
  if (typeof window === "undefined") return;
  const html = document.documentElement;
  const previous = html.style.scrollBehavior;
  html.style.scrollBehavior = "auto";
  window.scrollTo({ top: y, left: 0, behavior: "instant" as ScrollBehavior });
  html.style.scrollBehavior = previous;
}
