import { describe, expect, it } from "vitest";
import { wizardFit } from "@features/survey/ui/wizard/wizardFit";

/**
 * The wizard on a phone, scaled to fit (Fatih, 01.10: "Scale to fit"). Figma draws every
 * slide at 345 x 640 in the 393 x 852 frame (1049:1161): the slide 36 down, the 99.2 footer
 * right under it, 76.8 left below. Marcus: CONTINUE sticky to the bottom (Mark: "Yes");
 * Notion: "They should all be equal size and not scrollable".
 *
 * So every slide takes ONE scale k. A taller phone keeps k = 1 and pins the footer 76.8
 * above the bottom; a shorter one gives up the gap under the footer first, then scales.
 * Below a readable 0.8 the top and bottom padding tighten; below 0.6 (a phone on its
 * side) the slide may scroll, as a last resort.
 */
describe("wizardFit", () => {
  it("draws Figma's frame exactly at 393 x 852", () => {
    expect(wizardFit({ width: 393, height: 852 })).toEqual({
      k: 1,
      top: 36,
      bottom: 76.8,
      scroll: false,
    });
  });

  it("keeps a taller phone at 1, the footer pinned 76.8 above the bottom", () => {
    expect(wizardFit({ width: 393, height: 932 })).toEqual({
      k: 1,
      top: 36,
      bottom: 76.8,
      scroll: false,
    });
  });

  it("gives up the gap under the footer first, then scales", () => {
    // 699 leaves 563.8 under the 36 and over the footer: 20 of it below, 543.8 for 640.
    const fit = wizardFit({ width: 393, height: 699 });
    expect(fit.bottom).toBe(20);
    expect(fit.top).toBe(36);
    expect(fit.k).toBeCloseTo(543.8 / 640);
    expect(fit.scroll).toBe(false);
  });

  it("tightens the padding before scaling past readable", () => {
    // At 36 / 20, 548 would scale to 0.68: the top goes to 16, the bottom to 12.
    const fit = wizardFit({ width: 393, height: 548 });
    expect(fit.top).toBe(16);
    expect(fit.bottom).toBe(12);
    expect(fit.k).toBeCloseTo((548 - 16 - 99.2 - 12) / 640);
    expect(fit.scroll).toBe(false);
  });

  it("lets the slide scroll, at 0.6, only where even that cannot fit", () => {
    const fit = wizardFit({ width: 393, height: 400 });
    expect(fit.k).toBe(0.6);
    expect(fit.scroll).toBe(true);
    expect(fit.top).toBe(16);
  });

  it("lays a 320 phone out at Figma's 345 and scales it to the column", () => {
    // The width caps k at 272 / 345 = 0.79; 568 tall it is the height that binds.
    expect(wizardFit({ width: 320, height: 900 }).k).toBeCloseTo(272 / 345);
    const se = wizardFit({ width: 320, height: 568 });
    expect(se.k).toBeCloseTo((568 - 16 - 99.2 - 12) / 640);
    // The width alone never tightens the padding: the height has room.
    expect(wizardFit({ width: 320, height: 900 }).top).toBe(36);
  });

  it("keeps a column-bound slide's footer under it, the room left going below, as Figma has it", () => {
    // 320 x 699: the column binds k at 0.79 and the slide leaves 59.2 of the room. It goes
    // under the footer (up to Figma's 76.8), not above it: the footer stays under the slide.
    const fit = wizardFit({ width: 320, height: 699 });
    expect(fit.k).toBeCloseTo(272 / 345, 3);
    expect(fit.bottom).toBeCloseTo(699 - 36 - 99.2 - (640 * 272) / 345, 1);
  });

  it("keeps the footer clear of the home indicator and the cookie banner", () => {
    // A 34px safe area is under the 76.8 at 852: nothing moves.
    expect(wizardFit({ width: 393, height: 852, safeBottom: 34 }).k).toBe(1);
    // At 699 it outweighs the 20.
    const notch = wizardFit({ width: 393, height: 699, safeBottom: 34 });
    expect(notch.bottom).toBe(34);
    expect(notch.k).toBeCloseTo((699 - 36 - 99.2 - 34) / 640);
    // The banner sits over the home indicator's strip, so the two are not added up.
    expect(wizardFit({ width: 393, height: 852, safeBottom: 34, consent: 316 }).bottom).toBe(316);
    // CookieYes is 316 tall on a phone (ConsentBannerOffset): CONTINUE steps above it.
    const banner = wizardFit({ width: 393, height: 852, consent: 316 });
    expect(banner.bottom).toBe(316);
    expect(banner.top).toBe(16);
    expect(banner.k).toBeCloseTo((852 - 16 - 99.2 - 316) / 640);
  });
});
