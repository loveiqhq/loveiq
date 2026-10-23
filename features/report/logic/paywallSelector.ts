/**
 * The first paywall a reader meets: the same selector the page reports "paywall reached"
 * with. Since the slimmed report (16.10) a chapter's wall is its "Unlock Full Chapter" sample
 * (`.rv4-unlock`) where it was a card, and where the wall closes copy folded under "Show All"
 * (Typical Beliefs' challenges) it is clipped until the fold opens, so the fold that holds it
 * stands in for it (`.rv4-fold.has-wall`, the wall's ancestor, so first in document order).
 * The Summary's gate sits in Part II, above every chapter, and is left out, so "paywall
 * reached" still waits for the first chapter's wall (Fatih, 16.10).
 */
export const FIRST_PAYWALL_SELECTOR =
  ".report-premium-overlay, .rv4-premium:not(.rv4-premium--summary), .rv4-fold.has-wall, .rv4-unlock";
