import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The two report versions must not drift apart on fixes.
 *
 * The 2026-09-13 revert put `ui/v1/` in front of 100% of readers while
 * `ui/sections/` (report 2.0) stayed behind `?v2=1` as the foundation for
 * report 3.0. Both copies therefore ship, and three interaction fixes made in
 * 2.0 had never been applied to v1 — so for readers they were simply absent.
 * One was worse than absent: `report.css` is shared, so v1's paywall card
 * inherited `cursor: pointer` from the 2.0 fix while keeping no click handler.
 * It advertised itself as clickable and swallowed the tap; measured 0/3 devices
 * on production.
 *
 * These are source-text assertions on purpose. The point is not to re-test the
 * behaviour — each fix has its own behavioural test — but to fail loudly when
 * one copy is changed and its twin is forgotten.
 */
const ROOT = join(__dirname, "..", "ui");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const PAIRS = {
  premiumOverlay: ["sections/PremiumOverlay.tsx", "v1/sections/PremiumOverlay.tsx"],
  stageExplorer: ["sections/SexualStageExplorer.tsx", "v1/sections/SexualStageExplorer.tsx"],
  practiceTendencies: [
    "sections/PracticeTendenciesSection.tsx",
    "v1/sections/PracticeTendenciesSection.tsx",
  ],
} as const;

describe("report v1 / 2.0 parity on shipped interaction fixes", () => {
  it.each(PAIRS.premiumOverlay)("%s: the overlay wrapper itself is clickable", (file) => {
    const src = read(file);
    // The wrapper element carries the handler — not only the CTA button. A
    // regex across the opening tag so formatting changes do not break it.
    const wrapper = src.match(/<div\s+className="report-premium-overlay"[\s\S]{0,400}?>/);
    expect(wrapper, `${file}: no .report-premium-overlay wrapper found`).not.toBeNull();
    expect(
      wrapper?.[0].includes("onClick"),
      `${file}: the paywall card wrapper has no onClick, so tapping the card body does nothing. ` +
        `report.css gives this element cursor:pointer, so it would look clickable and not be.`
    ).toBe(true);
  });

  it.each(PAIRS.premiumOverlay)("%s: the CTA does not double-fire the unlock", (file) => {
    const src = read(file);
    const cta = src.match(/<button[^>]*className="report-premium-overlay__cta"[^>]*>/);
    expect(cta, `${file}: no CTA button found`).not.toBeNull();
    expect(
      cta?.[0].includes("onClick"),
      `${file}: the CTA has its own onClick while the wrapper also handles clicks — ` +
        `the unlock event fires twice.`
    ).toBe(false);
  });

  it.each(PAIRS.stageExplorer)("%s: does not tell readers to flip non-flipping cards", (file) => {
    const src = read(file);
    // The cards are a horizontal scroll-snap carousel with no flip face.
    expect(
      /<p>\s*Flip the below cards/.test(src),
      `${file}: copy still says "Flip the below cards" — they swipe, they do not flip.`
    ).toBe(false);
  });

  it.each(PAIRS.practiceTendencies)(
    "%s: the info button toggles and does not open on focus",
    (file) => {
      const src = read(file);
      expect(
        src.includes('className="report-practice-table__info-button"'),
        `${file}: no info button found`
      ).toBe(true);
      // Whole-file assertions on purpose: the opening tag carries long
      // explanatory comments, and a windowed regex around the tag silently
      // stopped short of the handler and failed on files that were correct.
      // These strings appear exactly once per file.
      expect(
        /onFocus=\{\(event\) => handleOpenFromAnchor/.test(src),
        `${file}: the info button opens on focus. A tap focuses before it clicks, so the ` +
          `first tap opens then immediately toggles shut.`
      ).toBe(false);
      expect(
        src.includes("isOpen ? onClose(rowId)"),
        `${file}: the info button opens instead of toggling, so on a phone it cannot be dismissed.`
      ).toBe(true);
    }
  );

  it("the hover-open path is gated to pointers that can actually hover", () => {
    for (const file of PAIRS.practiceTendencies) {
      const src = read(file);
      expect(
        src.includes('matchMedia?.("(hover: hover)")'),
        `${file}: hover-open is not gated. Touch browsers synthesise mouseenter after a tap, ` +
          `which re-opens the row the tap is trying to close.`
      ).toBe(true);
    }
  });
});
