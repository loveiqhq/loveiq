import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * When the plans pop-up appears.
 *
 * It used to fire on the FIRST scroll event, so readers were interrupted about a
 * second into the report, before they had seen anything worth paying for. It now
 * waits until they reach "Your snapshot" — the first section that shows them
 * their own numbers.
 *
 * Asserted at source level because the pricing modal is always mounted and only
 * styled open, which jsdom cannot distinguish (it applies no CSS). The behaviour
 * itself is covered in a real browser by `npm run qa:report --phase=trigger`,
 * which checks the pop-up stays shut through the sections above the snapshot and
 * opens on arrival, at both viewports.
 */
const SOURCE = readFileSync(join(process.cwd(), "features/report/ui/ReportPage.tsx"), "utf8");

describe("plans pop-up trigger", () => {
  it("observes the snapshot section rather than listening for any scroll", () => {
    expect(SOURCE).toContain('document.getElementById("snapshot")');
    expect(SOURCE).toMatch(/new IntersectionObserver\(/);
  });

  it("waits until the section has risen into the viewport, not merely touched its edge", () => {
    // A ratio threshold cannot work here: the section is 620px tall on desktop
    // but 1089px against a 900px viewport on mobile, so it can never exceed 83%
    // visible there. The bottom inset is height-independent.
    expect(SOURCE).toMatch(/rootMargin:\s*"0px 0px -25% 0px"/);
  });

  it("still shows the pop-up if the snapshot section is ever absent", () => {
    // Losing the offer entirely would be worse than firing it early, so the
    // missing-section path falls back to the old first-scroll trigger.
    const fallback = SOURCE.slice(SOURCE.indexOf("if (!snapshot)"));
    expect(fallback).toMatch(/addEventListener\("scroll"/);
  });

  it("fires at most once, and not while the modal is already open", () => {
    expect(SOURCE).toMatch(/if \(scrollTeaserFiredRef\.current\) return;/);
    expect(SOURCE).toMatch(/if \(!isPricingModalOpenRef\.current\)/);
  });

  it("keeps the forced-paywall arm opening immediately", () => {
    // The A/B treatment arm deliberately shows the paywall on load; the snapshot
    // trigger must not swallow that. `forcedPaywallCohort === "treatment"` is
    // checked in two places, so match the branch that opens the teaser rather
    // than slicing from the first occurrence.
    expect(SOURCE).toMatch(
      /forcedPaywallCohort === "treatment"\)\s*\{[\s\S]{0,300}?setIsScrollTeaserOpen\(true\)/
    );
  });
});
