import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/** The first z-index a rule for exactly this selector sets. */
function zIndex(css: string, selector: string): number {
  const m = new RegExp(
    `^${selector.replace(/[.-]/g, "\\$&")}\\s*\\{[^}]*?z-index:\\s*(\\d+)`,
    "m"
  ).exec(css);
  if (!m) throw new Error(`no z-index for ${selector}`);
  return Number(m[1]);
}

describe("what sits on top of what on the report", () => {
  const css = readFileSync("features/report/ui/report.css", "utf8");

  it("puts the open chapter list above the sticky unlock bar and below the paywall", () => {
    // The bar covered the list's last chapters on a phone, so they could not be tapped.
    const drawer = zIndex(css, ".report-chapter-drawer-root");
    expect(drawer).toBeGreaterThan(zIndex(css, ".report-sticky-unlock"));
    expect(drawer).toBeLessThan(zIndex(css, ".report-pricing-modal"));
  });

  it("dims the bar and the chapter list under the guided tour, and keeps every window above it", () => {
    // The page opens none of these while the tour runs; one that did must still be usable.
    const tour = zIndex(readFileSync("features/report/ui/v3/guidedTour.css", "utf8"), ".rv4-tour");
    expect(tour).toBeGreaterThan(zIndex(css, ".report-sticky-unlock"));
    expect(tour).toBeGreaterThan(zIndex(css, ".report-chapter-drawer-root"));
    expect(tour).toBeLessThan(zIndex(css, ".report-pricing-modal"));
    expect(tour).toBeLessThan(zIndex(css, ".report-share-modal"));
    expect(tour).toBeLessThan(zIndex(css, ".report-checkout-handoff"));
  });
});
