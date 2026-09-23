/**
 * The same-URL history entry an open overlay owns, so the back button can close
 * it (see features/report/ui/hooks/useCloseOnBack.ts). Nothing else writes this
 * key, which is what lets the pieces that must step around that entry — the
 * hand-off to Stripe — recognise it.
 */
export const OVERLAY_ENTRY_KEY = "__loveiqOverlay";

/** Whether the entry on top is an overlay's own: a duplicate of the page beneath it. */
export function isOnOverlayEntry(): boolean {
  return typeof window !== "undefined" && Boolean(window.history.state?.[OVERLAY_ENTRY_KEY]);
}
