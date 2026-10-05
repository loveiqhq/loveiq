import type { Page } from "@playwright/test";

/**
 * Makes the page scroll instantly, for a spec that taps its way through it.
 *
 * Playwright scrolls a target into view before it clicks, and the site's
 * `html { scroll-behavior: smooth }` animates that scroll. Playwright aims once the
 * scroll has been asked for, not once it has finished, so on a slow runner the press
 * lands on the button and the release lands below it as the page moves, and no click
 * fires. That is how the Mobile Safari survey walk lost a scale answer on 2026-09-28
 * (#386), on two questions in one job, then waited four minutes on a disabled Next:
 * the trace has the tap "done" on "4 of 7" and the page 22px higher 45ms later.
 *
 * A person's tap never scrolls first, so this changes how the test taps, not what the
 * survey does. The visual-regression spec turns smooth scrolling off too.
 */
export async function instantScroll(page: Page): Promise<void> {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "html { scroll-behavior: auto !important; }";
      document.head.appendChild(style);
    });
  });
}
