import { isNonProdDeploy } from "@shared/env/is-non-prod-deploy";

/**
 * The rules behind the report's leave offer: a pop-up shown ONCE to an unpaid reader,
 * offering their full report free for a 20-minute call with Mark and Marcus (Mark,
 * #all-loveiq 08.10: "a bounce pop up that offers users a free report for talking to
 * Marcus and me for 20 minutes"; LoveIQ Sync 12.10: the calls are a value exchange,
 * never a thrown-around discount).
 *
 * WHEN IT SHOWS (Fatih, 14.10: by scroll, on every device). PAYWALL_BEAT_MS after the
 * reader scrolls the first paywall card into view, the same short beat the plans pop-up
 * takes, so the card is seen before the offer arrives. Anything that blocks it below
 * only delays it: it opens at the first moment nothing is in the way.
 *
 * WHEN IT NEVER SHOWS.
 *  - On a return visit. The team took the returning-reader discount pop-up out on
 *    02.10 as too aggressive, so only the tab that just finished the survey qualifies.
 *  - Within POPUP_POINT_QUIET_MS of the pay pop-up test's point
 *    (shared/experiments/popupArm.ts), in either arm: that test is judged on exits in
 *    exactly that window.
 *  - Over anything else that is open, and to anyone who has paid.
 *
 * Pure so every rule is tested on its own; `useLeaveIntent` wires them to the page.
 */

/** From the paywall card coming into view to the offer: the plans pop-up's own beat. */
export const PAYWALL_BEAT_MS = 1_600;
export const POPUP_POINT_QUIET_MS = 30_000;
export const FIRST_VISIT_WINDOW_MS = 2 * 60 * 60 * 1000;
/** A report date this far ahead of the device clock still counts as now. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * The first paywall card: the same selector the page reports the paywall with. The slimmed
 * report's Summary gate (16.10) sits in Part II, above every chapter, and is left out, so
 * the offer and "paywall reached" still wait for the first chapter's card (Fatih, 16.10).
 */
export const FIRST_PAYWALL_SELECTOR =
  ".report-premium-overlay, .rv4-premium:not(.rv4-premium--summary)";
/** Where a report has no card (it draws one only with its new copy): the first lock. */
export const LOCKED_CHAPTER_SELECTOR = ".rv4-chapter.is-locked";

export type LeaveTrigger = "paywall_reached" | "forced";
export type LeaveOffer = "founder_call";
export type LeaveOverride = "on" | "off" | "show";
export type LeaveMode = "off" | "trigger" | "show";
/** The page's query: `useSearchParams()` in the app, `URLSearchParams` in tests. */
export type SearchParams = Pick<URLSearchParams, "get" | "has">;

export type LeaveDismissSource =
  "close_button" | "not_now" | "backdrop" | "escape" | "browser_back" | "superseded";

/**
 * Preview switch, off production only: `?leave=on` keeps the real trigger but skips
 * who the reader is (so a preview with no submission can show it), `?leave=show` opens
 * it at once, `?leave=off` turns it off.
 */
export function resolveLeaveOverride(param: string | null | undefined): LeaveOverride | null {
  if (!isNonProdDeploy()) return null;
  if (param === "on" || param === "off" || param === "show") return param;
  return null;
}

/** Signs the address came from an email or a checkout, not straight from the survey. */
export function hasReturnMarkers(search: SearchParams): boolean {
  if (search.has("offer") || search.has("promo") || search.has("pricingSessionId")) return true;
  if (search.get("invite") === "1") return true;
  if (search.has("from")) return true;
  const fromEmail = /email|nurture/i;
  return (
    fromEmail.test(search.get("utm_source") ?? "") || fromEmail.test(search.get("utm_medium") ?? "")
  );
}

/**
 * The report's creation time. The database writes microseconds and sometimes a space
 * and a short offset (`2026-10-14 09:00:00.851299+00`), which not every browser parses.
 */
export function parseReportDate(value: string | null | undefined): number | null {
  const raw = value?.trim();
  if (!raw) return null;
  const iso = raw
    .replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, "$1T$2")
    .replace(/(\.\d{3})\d+/, "$1")
    .replace(/([+-]\d{2})$/, "$1:00");
  const at = Date.parse(iso);
  return Number.isNaN(at) ? null : at;
}

/**
 * The tab that just finished the survey, soon after. Nothing new is stored for this:
 * the survey leaves its report token in this tab's sessionStorage on submit, an email
 * link opens a new tab without it, and a restored tab days later fails the age check.
 */
export function isFirstVisit({
  urlToken,
  completedToken,
  reportDate,
  now,
  search,
}: {
  urlToken: string | null;
  completedToken: string | null;
  reportDate: string | null | undefined;
  now: number;
  search: SearchParams;
}): boolean {
  if (!urlToken || completedToken !== urlToken) return false;
  if (hasReturnMarkers(search)) return false;
  const created = parseReportDate(reportDate);
  if (created === null) return false;
  const age = now - created;
  return age <= FIRST_VISIT_WINDOW_MS && age >= -CLOCK_SKEW_MS;
}

/** Whether the offer runs on this page, and how. */
export function leaveMode(input: {
  override: LeaveOverride | null;
  bookingUrl: string | null;
  isV4: boolean;
  viewMode: "owner" | "shared";
  hasPurchased: boolean;
  viewingOwnArchetype: boolean;
  submissionId: number | null | undefined;
  userEmail: string | null | undefined;
  firstVisit: boolean;
  isProbe: boolean;
}): LeaveMode {
  // What the reader owns and what the page is: no switch overrides these. The free
  // report is their own archetype's, so it is only offered there.
  if (!input.bookingUrl || !input.isV4 || input.viewMode !== "owner") return "off";
  if (input.hasPurchased || !input.viewingOwnArchetype) return "off";
  if (input.override === "off") return "off";
  if (input.override === "show") return "show";
  if (input.override === "on") return "trigger";
  // Who the reader is. The coupon is granted against the submission and emailed.
  if (!input.submissionId || !input.userEmail?.trim()) return "off";
  if (!input.firstVisit || input.isProbe) return "off";
  return "trigger";
}

/** Inside the pay pop-up test's measuring window. */
export function isInsidePopupWindow(pointAt: number | null, now: number): boolean {
  return pointAt !== null && now - pointAt < POPUP_POINT_QUIET_MS;
}

/**
 * What else is open, if anything. The plans and share windows, the chapter drawer and
 * the invite modal mark themselves `aria-modal` only while open. The cookie banner
 * publishes its height as `--liq-consent-h` (shared/ui/ConsentBannerOffset.tsx).
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

/** Shown once per submission, for good: localStorage, so a later visit never repeats it. */
export function leaveOfferKey(submissionId: number): string {
  return `loveiq-leave-offer:${submissionId}`;
}

/** When this tab first saw the pay pop-up test's point. */
export function popupPointKey(submissionId: number): string {
  return `loveiq-leave-offer-point:${submissionId}`;
}

/**
 * The offer behind the trigger. One today; a later 50/50 against a review prompt
 * (LoveIQ Sync 12.10) picks here and logs its exposure where the offer is shown.
 */
export function chooseLeaveOffer(): LeaveOffer {
  return "founder_call";
}
