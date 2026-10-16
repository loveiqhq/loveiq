/**
 * The first paywall card a reader meets: the same selector the page reports "paywall
 * reached" with. The slimmed report's Summary gate (16.10) sits in Part II, above every
 * chapter, and is left out, so "paywall reached" still waits for the first chapter's card
 * (Fatih, 16.10).
 */
export const FIRST_PAYWALL_SELECTOR =
  ".report-premium-overlay, .rv4-premium:not(.rv4-premium--summary)";
