/**
 * The click every V4 paywall surface shares — the gated article band, the
 * practice card's band, the locked belief rows and the chapter's blurred prose.
 *
 * `.rv4-doc` and the live report are copyable on non-prod deploys, so a drag that
 * ends inside a gated block must not open the paywall. Same guard as
 * PremiumOverlay.tsx:146. Returns a handler rather than taking an event, so it
 * reads as `onClick={guardedUnlock(onUnlock)}` at the call site.
 */
export const guardedUnlock = (onUnlock?: () => void) => () => {
  if (typeof window !== "undefined" && window.getSelection()?.toString()) return;
  onUnlock?.();
};
