/**
 * The rules behind the report's guided tour (Notion "Add the guided tooltip into the
 * report"; Figma Report 3.0 `1713:1071` › "Guided tour in context" `1755:1275`, Ready for
 * Dev 16.10; Mark's prototype, tab "Guided tour").
 *
 * WHY. Readers skim V4 and never touch its controls: in Mark's PostHog review (13.10)
 * nobody opened a fold or collapsed a chapter, and since the slimmed report (16.10) the
 * folds' "Show All" and the paywall's locks look alike. At the 14.10 sync the team chose
 * a short click-through tour on the first open over tips that pop up while scrolling
 * (Fatih: "a short tutorial before the report starts … show everything and then push
 * them back to the beginning"); Marcus picked it in Figma the same day ("Variant B").
 *
 * WHAT. One stop per control, in reading order: the chapter menu, the first "Show All",
 * a chapter's toggle, "Try This" and, for a reader who has not paid, a locked chapter's
 * "Unlock Report" (Fatih, 17.10: Essentials buyers count as paid). The page dims around a
 * rounded hole on the control; a bubble beside it explains it. Next, Back and the arrow
 * keys move between stops; Escape or "Skip Tour" ends it. Finishing fades the dim and
 * scrolls back to the top. Figma's spec card (`1755:1276`) has the numbers below.
 *
 * Pure so every rule is tested on its own; `V4GuidedTour` and `useGuidedTour` wire them
 * to the page.
 */

export type TourStepId = "chapter_menu" | "show_all" | "chapter_toggle" | "try_this" | "unlock";
export type TourTrigger = "auto" | "replay";
export type TourPlacement = "below" | "above" | "right";
export type TourGesture = "nudge" | "shimmer" | "turn";
/** How a run ended, for the event and for the page. */
export type TourOutcome = "completed" | "skipped";
/** How a reader left before the end: the bubble's link, Escape, or the back button. */
export type TourSkipSource = "skip_button" | "escape" | "browser_back";
/** Where "Replay the Tour" was tapped: the phone's chapter drawer or the desktop sidebar. */
export type TourReplaySource = "drawer" | "sidebar";

/** Every stop, in order. The last is only for readers who have not paid. */
export const TOUR_STEP_IDS: readonly TourStepId[] = [
  "chapter_menu",
  "show_all",
  "chapter_toggle",
  "try_this",
  "unlock",
];

/**
 * Seen once per report (`guidedTourKey`): localStorage, sessionStorage where that is
 * refused. Versioned so a reworked tour can be shown again by bumping it.
 */
export const GUIDED_TOUR_KEY = "loveiq-report-tour-v1";

/**
 * The record of one report's tour. Once per report, not once per browser: a reader who
 * had seen it on one report never met it on their next, including straight after the
 * survey and its wizard (Marcus, 20.10: "Tutorial should start on the report page"). A
 * preview has no submission; its record is "preview", kept for the tab only, so every
 * preview link opened shows the first open as a reader meets it.
 */
export function guidedTourKey(submissionId: number | null): string {
  return `${GUIDED_TOUR_KEY}:${submissionId ?? "preview"}`;
}

/** Where a stop's control comes to rest: this share down the visible screen. */
export const ANCHOR_AT = 0.42;
/** The hole is the control plus this much on every side (Spotlight edge `1754:1421`). */
export const HOLE_PAD = 6;
/** A control drawn square still gets a soft hole: the prototype's 10, plus the padding. */
const HOLE_RADIUS_FALLBACK = 10;
/** From the hole's edge to the bubble; the arrow sits in this gap. */
export const BUBBLE_GAP = 10;
/** Tour / Step `1754:1404`: 292 wide, never closer than 16px to the screen's sides. */
export const BUBBLE_MAX_WIDTH = 292;
const SIDE_MARGIN = 16;
/** The bubble's controls always stay this far inside the top and bottom of the screen. */
const EDGE_MARGIN = 12;
/** The arrow is a 16×9 triangle, kept clear of the bubble's 14px corners. */
export const ARROW_BASE = 16;
const ARROW_INSET = 14;

/** Spotlight edge: the hole travels this long between stops, then the edge pulses. */
export const HOLE_TRAVEL_MS = 350;
/** One pulse; it runs twice on arrival (Tooltip / Focus ring `1713:1121`). */
export const EDGE_PULSE_MS = 1_400;
/** The bubble's fade and 8px rise. */
export const BUBBLE_IN_MS = 200;
/** After Finish the dim fades out while the page scrolls back to the top. */
export const FINISH_FADE_MS = 300;
/** A landing this far from ANCHOR_AT is corrected once (rows that grow as they pass). */
export const LANDING_TOLERANCE_PX = 24;

/** The first open: if the reader has already scrolled this far, it is no longer a first look. */
export const AUTO_START_SCROLL_LIMIT = 100;
/** A beat after the report and its fonts are in, so the page is seen before it dims. */
export const AUTO_START_DELAY_MS = 400;
/** How long to wait for every stop's control to render (folds measure after mount). */
export const ANCHOR_WAIT_MS = 3_000;
/** With no consent decision stored, CookieYes gets this long after load to show its banner. */
export const CONSENT_GRACE_MS = 3_000;

const COOKIEYES_CONSENT_COOKIE = "cookieyes-consent";

/** The stops this reader gets. The unlock stop is only for a reader who has not paid. */
export function tourSteps({ includeUnlock }: { includeUnlock: boolean }): TourStepId[] {
  return TOUR_STEP_IDS.filter((id) => includeUnlock || id !== "unlock");
}

/**
 * Per stop: whether the page goes to the very top (the menu lives there), which side the
 * bubble takes when it fits (Figma draws the unlock stop's bubble above its lock; on a
 * desktop the menu is the left sidebar, so its bubble sits to the right), and the small
 * move each control makes on arrival. "Try This" has none (spec card).
 */
export function stepMotion(
  id: TourStepId,
  { sidebar }: { sidebar: boolean }
): { toTop: boolean; prefer: TourPlacement | null; gesture: TourGesture | null } {
  switch (id) {
    case "chapter_menu":
      return {
        toTop: true,
        prefer: sidebar ? "right" : "below",
        gesture: sidebar ? null : "nudge",
      };
    case "show_all":
      return { toTop: false, prefer: null, gesture: "shimmer" };
    case "chapter_toggle":
      return { toTop: false, prefer: null, gesture: "turn" };
    case "try_this":
      return { toTop: false, prefer: null, gesture: null };
    case "unlock":
      return { toTop: false, prefer: "above", gesture: "shimmer" };
  }
}

export const easeInOutQuad = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/** The prototype's scroll: quick for a short hop, never longer than 0.7s. */
export function scrollDurationMs(distance: number): number {
  const d = Math.abs(distance);
  if (d < 2) return 0;
  return Math.min(700, 280 + d * 0.12);
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * The scroll position that rests the control at ANCHOR_AT of the visible screen. `view`
 * is that screen in viewport terms: the window less whatever covers its bottom (the
 * cookie banner). Clamped to the page, so a control near either end sits where it can.
 */
export function scrollTargetFor({
  anchor,
  scrollY,
  view,
  maxScroll,
}: {
  anchor: { top: number; height: number };
  scrollY: number;
  view: { top: number; height: number };
  maxScroll: number;
}): number {
  const target = scrollY + anchor.top + anchor.height / 2 - (view.top + view.height * ANCHOR_AT);
  return clamp(Math.round(target), 0, Math.max(0, maxScroll));
}

export interface TourRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TourHole extends TourRect {
  /** Corner radius, already capped so a pill stays a pill and a disc stays round. */
  r: number;
}

/** The control's box grown by HOLE_PAD, its corners following the control's own. */
export function holeFor(rect: TourRect, radius: number): TourHole {
  const w = rect.w + HOLE_PAD * 2;
  const h = rect.h + HOLE_PAD * 2;
  const own = Number.isFinite(radius) && radius > 0 ? radius : HOLE_RADIUS_FALLBACK;
  return {
    x: rect.x - HOLE_PAD,
    y: rect.y - HOLE_PAD,
    w,
    h,
    r: Math.min(own + HOLE_PAD, w / 2, h / 2),
  };
}

/** Partway from one hole to the next, for the spotlight's travel. */
export function lerpHole(from: TourHole, to: TourHole, t: number): TourHole {
  const at = (a: number, b: number) => a + (b - a) * t;
  return {
    x: at(from.x, to.x),
    y: at(from.y, to.y),
    w: at(from.w, to.w),
    h: at(from.h, to.h),
    r: at(from.r, to.r),
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * The dim as ONE path: the whole screen, minus the hole (even-odd), as the prototype draws
 * it. No giant box-shadow, which repaints the page on every frame of the travel.
 */
export function scrimPath(width: number, height: number, hole: TourHole | null): string {
  const outer = `M0 0H${round(width)}V${round(height)}H0Z`;
  if (!hole) return outer;
  const x = round(hole.x);
  const y = round(hole.y);
  const right = round(hole.x + hole.w);
  const bottom = round(hole.y + hole.h);
  const r = round(hole.r);
  return (
    outer +
    `M${round(hole.x + hole.r)} ${y}H${round(hole.x + hole.w - hole.r)}` +
    `A${r} ${r} 0 0 1 ${right} ${round(hole.y + hole.r)}V${round(hole.y + hole.h - hole.r)}` +
    `A${r} ${r} 0 0 1 ${round(hole.x + hole.w - hole.r)} ${bottom}H${round(hole.x + hole.r)}` +
    `A${r} ${r} 0 0 1 ${x} ${round(hole.y + hole.h - hole.r)}V${round(hole.y + hole.r)}` +
    `A${r} ${r} 0 0 1 ${round(hole.x + hole.r)} ${y}Z`
  );
}

/** 292, or the screen less 16px a side on anything narrower. */
export function bubbleWidth(viewportWidth: number): number {
  return Math.max(0, Math.min(BUBBLE_MAX_WIDTH, viewportWidth - SIDE_MARGIN * 2));
}

export interface BubblePlacement {
  placement: TourPlacement;
  left: number;
  top: number;
  /** The arrow's offset inside the bubble: from its left (below/above) or top (right). */
  arrow: number;
}

/**
 * Where the bubble goes. Below the hole while the control sits in the top half of the
 * screen, above it in the bottom half (the prototype's rule), unless the stop prefers a
 * side that has room. Wherever it lands, its buttons stay on screen: it is clamped inside
 * the view even if that means covering part of the page.
 */
export function placeBubble({
  hole,
  size,
  view,
  prefer,
}: {
  hole: TourHole;
  size: { w: number; h: number };
  view: { width: number; top: number; bottom: number };
  prefer: TourPlacement | null;
}): BubblePlacement {
  const topMin = view.top + EDGE_MARGIN;
  const topMax = Math.max(topMin, view.bottom - EDGE_MARGIN - size.h);
  const fitsBelow = hole.y + hole.h + BUBBLE_GAP + size.h <= view.bottom - EDGE_MARGIN;
  const fitsAbove = hole.y - BUBBLE_GAP - size.h >= topMin;
  const fitsRight = hole.x + hole.w + BUBBLE_GAP + size.w <= view.width - SIDE_MARGIN;

  if (prefer === "right" && fitsRight) {
    const pointY = hole.y + Math.min(hole.h / 2, 40);
    const top = clamp(pointY - 28, topMin, topMax);
    return {
      placement: "right",
      left: hole.x + hole.w + BUBBLE_GAP,
      top,
      arrow: clamp(pointY - top - ARROW_BASE / 2, ARROW_INSET, size.h - ARROW_INSET - ARROW_BASE),
    };
  }

  let placement: "below" | "above";
  if (prefer === "above" && fitsAbove) placement = "above";
  else if (prefer === "below" && fitsBelow) placement = "below";
  else {
    const upperHalf = hole.y + hole.h / 2 < view.top + (view.bottom - view.top) / 2;
    placement = upperHalf ? "below" : "above";
    if (placement === "below" && !fitsBelow && fitsAbove) placement = "above";
    else if (placement === "above" && !fitsAbove && fitsBelow) placement = "below";
  }

  const centre = hole.x + hole.w / 2;
  const left = clamp(
    centre - size.w / 2,
    SIDE_MARGIN,
    Math.max(SIDE_MARGIN, view.width - SIDE_MARGIN - size.w)
  );
  const top = clamp(
    placement === "below" ? hole.y + hole.h + BUBBLE_GAP : hole.y - BUBBLE_GAP - size.h,
    topMin,
    topMax
  );
  return {
    placement,
    left,
    top,
    arrow: clamp(centre - left - ARROW_BASE / 2, ARROW_INSET, size.w - ARROW_INSET - ARROW_BASE),
  };
}

/** Why the tour will not start on its own on this load, or null when it may. */
export type TourRuledOut = "disabled" | "not_auto" | "seen";
/** What it is waiting for before it can start, or null when nothing is in the way. */
export type TourWaitingOn = "overlay" | "hidden" | "consent" | "anchors";

export function tourRuledOut({
  enabled,
  autoStart,
  seen,
}: {
  /** A V4 report, loaded, read by its owner or in a preview, showing the archetype it holds. */
  enabled: boolean;
  /** Not a shared view, not a probe, not a return from checkout. */
  autoStart: boolean;
  seen: boolean;
}): TourRuledOut | null {
  if (!enabled) return "disabled";
  if (!autoStart) return "not_auto";
  if (seen) return "seen";
  return null;
}

/**
 * Anything still in the way. Each of these only delays the start: it is retried until
 * nothing is open, the tab is in front, the cookie question is settled and the tour's
 * controls exist.
 */
export function tourWaitingOn({
  overlay,
  hidden,
  consentSettled,
  anchorsReady,
}: {
  overlay: string | null;
  hidden: boolean;
  consentSettled: boolean;
  anchorsReady: boolean;
}): TourWaitingOn | null {
  if (overlay) return "overlay";
  if (hidden) return "hidden";
  if (!consentSettled) return "consent";
  if (!anchorsReady) return "anchors";
  return null;
}

/** The reader started reading before the tour could: let them, and try again next open. */
export function tourTooLate(scrollY: number): boolean {
  return scrollY > AUTO_START_SCROLL_LIMIT;
}

/**
 * Whether the reader has answered the cookie banner. CookieYes stores `action:yes` in its
 * cookie once they accept or reject; until then its banner may still be on its way, since
 * it loads after the page (app/layout.tsx, lazyOnload). With no answer stored the tour
 * gives it CONSENT_GRACE_MS from load, and a banner that does show holds the tour back as
 * any open overlay does (`findOpenOverlay`).
 */
export function hasConsentDecision(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) return false;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.split("=");
    if (rawName?.trim() !== COOKIEYES_CONSENT_COOKIE) continue;
    let value = rest.join("=");
    try {
      value = decodeURIComponent(value);
    } catch {
      // Not encoded: read as is.
    }
    return value.split(",").some((entry) => entry.trim() === "action:yes");
  }
  return false;
}

/** Settled: answered, or CookieYes has had its chance to show the banner. */
export function consentSettled({
  cookieHeader,
  sinceLoadMs,
}: {
  cookieHeader: string | null | undefined;
  sinceLoadMs: number;
}): boolean {
  return hasConsentDecision(cookieHeader) || sinceLoadMs >= CONSENT_GRACE_MS;
}
