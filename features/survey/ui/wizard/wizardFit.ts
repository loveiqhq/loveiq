/**
 * The wizard on a phone, scaled to fit (Fatih, 01.10: "Scale to fit"; Marcus: CONTINUE
 * sticky to the bottom, Mark: "Yes"; Notion: "Some slides seem to be longer than others…
 * They should all be equal size and not scrollable").
 *
 * Figma draws every slide at 345 x 640 in the 393 x 852 frame (1049:1161): the slide 36
 * down, the 99.2 footer right under it, 76.8 left below. So each slide is laid out at
 * 345 x 640, Figma's line breaks and all, and drawn at ONE scale k for the whole wizard,
 * the footer full size under it so its buttons keep their 48:
 * - a taller phone keeps k = 1 and pins the footer 76.8 above the bottom;
 * - a shorter one gives up the gap under the footer first (down to 20, or the home
 *   indicator's safe area, or a cookie banner's height while it covers the bottom), then
 *   scales;
 * - below a readable 0.8 the top tightens to 16 and the gap to 12 before it scales on;
 * - below 0.6 (a phone on its side) the slide scrolls at 0.6, as a last resort.
 * A narrow phone (320) caps k at its column: 272 / 345.
 */

export interface WizardFitInput {
  /** The frame's width: the 393 column, or a narrower phone's. */
  width: number;
  /** The frame's height (100dvh). */
  height: number;
  /** env(safe-area-inset-bottom). */
  safeBottom?: number;
  /** The cookie banner's height while it covers the bottom (--liq-consent-h). */
  consent?: number;
}

export interface WizardFit {
  /** The scale every slide is drawn at. */
  k: number;
  /** From the top to the slide and SKIP INTRO. */
  top: number;
  /** Under the footer. */
  bottom: number;
  /** Even 0.6 does not fit: the slide scrolls inside its box. */
  scroll: boolean;
}

const SLIDE_WIDTH = 345;
const SLIDE_HEIGHT = 640;
/** CONTINUE's 48, 24, the 3.2 bar and the counter's 24 (1049:1217). */
const FOOTER = 99.2;
/** The column's padding either side. */
const SIDE = 24;
const TOP = 36;
/** 48 under the footer and the frame's spare 28.8. */
const BOTTOM = 76.8;
const BOTTOM_MIN = 20;
const READABLE = 0.8;
const TIGHT_TOP = 16;
const TIGHT_BOTTOM_MIN = 12;
const FLOOR = 0.6;

/** Hundredths of a pixel: 716.8 - 640 is 76.79999999999995 in floating point. */
const px = (value: number) => Math.round(value * 100) / 100;

export function wizardFit({
  width,
  height,
  safeBottom = 0,
  consent = 0,
}: WizardFitInput): WizardFit {
  const reserve = safeBottom + consent;
  const widthK = Math.min(1, (width - 2 * SIDE) / SLIDE_WIDTH);
  const solve = (top: number, least: number) => {
    const room = height - top - FOOTER;
    const floor = Math.max(least, reserve);
    // The height's own bound: the slide and the least gap under the footer fill the room.
    const heightK = (room - floor) / SLIDE_HEIGHT;
    const k = Math.min(1, widthK, heightK);
    // What the slide leaves at that scale goes under the footer first, up to Figma's 76.8,
    // so the footer stays under the slide; only past that does space open above it.
    const bottom = px(Math.max(floor, Math.min(room - SLIDE_HEIGHT * k, BOTTOM)));
    return { top, bottom, k, heightK };
  };
  let fit = solve(TOP, BOTTOM_MIN);
  // Tighten for the height alone: a 320 phone's column caps k without any want of room.
  if (fit.heightK < READABLE) fit = solve(TIGHT_TOP, TIGHT_BOTTOM_MIN);
  // Floored to 1e-4, so 640k never rounds up past the room it was given.
  const k = Math.floor(fit.k * 1e4) / 1e4;
  if (k < FLOOR) return { k: FLOOR, top: fit.top, bottom: fit.bottom, scroll: true };
  return { k, top: fit.top, bottom: fit.bottom, scroll: false };
}
