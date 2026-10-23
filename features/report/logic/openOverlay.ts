/**
 * What else is open over the report, if anything. The plans and share windows, the chapter
 * drawer and the invite modal mark themselves `aria-modal` only while open. The cookie
 * banner publishes its height as `--liq-consent-h` (shared/ui/ConsentBannerOffset.tsx).
 * The guided tour waits while any of them is up (ui/hooks/useGuidedTour.ts).
 */
export function findOpenOverlay(doc: Document): string | null {
  if (doc.querySelector('[aria-modal="true"]')) return "dialog";
  if (doc.querySelector("[data-invite-modal]")) return "invite";
  if (doc.querySelector(".report-fb--expanded")) return "feedback";
  const root = doc.documentElement;
  const published =
    root.style.getPropertyValue("--liq-consent-h") ||
    doc.defaultView?.getComputedStyle(root).getPropertyValue("--liq-consent-h") ||
    "";
  if ((parseFloat(published) || 0) > 0) return "cookie_banner";
  if (doc.querySelector(".cky-modal-open")) return "cookie_banner";
  return null;
}
