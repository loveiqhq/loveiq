// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { restoreScroll } from "@shared/ui/restore-scroll";

/**
 * Every overlay locks the page with `position: fixed; top: -scrollY` and unlocks by
 * putting the window back. That restore used to be a bare `window.scrollTo(0, y)`,
 * which obeys `html { scroll-behavior: smooth }` — and at that moment the page is at 0,
 * because `position: fixed` has just been removed, so it ANIMATED from the top of the
 * page down to wherever the reader was: "it starts at the very top of the page and then
 * scrolls down to the section that I was just looking at" (MO, 2026-08-22).
 */
describe("restoreScroll", () => {
  afterEach(() => {
    document.documentElement.style.scrollBehavior = "";
    vi.restoreAllMocks();
  });

  it("scrolls without animating", () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    restoreScroll(1234);
    expect(scrollTo).toHaveBeenCalledWith({ top: 1234, left: 0, behavior: "instant" });
  });

  it("overrides the stylesheet's smooth scrolling for the one call, then puts it back", () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "scrollTo",
      vi.fn(() => seen.push(document.documentElement.style.scrollBehavior))
    );
    document.documentElement.style.scrollBehavior = "smooth";
    restoreScroll(10);
    // inline `auto` outranks the stylesheet while the call happens...
    expect(seen).toEqual(["auto"]);
    // ...and the page's own value goes back, so anchor links still glide
    expect(document.documentElement.style.scrollBehavior).toBe("smooth");
  });

  it("leaves no inline value behind when there was none", () => {
    vi.stubGlobal("scrollTo", vi.fn());
    restoreScroll(0);
    expect(document.documentElement.style.scrollBehavior).toBe("");
  });

  it("is used by every overlay that locks the page", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");

    // The report's overlays no longer own their lock: they acquire the shared
    // reference-counted one, which is what calls restoreScroll on the last
    // release. Asserted via that call so the animation regression stays fenced
    // off whichever route an overlay takes.
    const lock = readFileSync(join(process.cwd(), "shared/ui/body-scroll-lock.ts"), "utf8");
    expect(lock, "the shared lock must restore scroll on release").toContain("restoreScroll(");

    const viaSharedLock = [
      "features/report/ui/ReportPricingModal.tsx",
      "features/report/ui/ShareReportModal.tsx",
      "features/report/ui/ReportMobileNav.tsx",
      "features/survey/ui/SurveyPauseModal.tsx",
    ];
    const locksByHand = [
      "features/landing/ui/NavSection.tsx",
      "features/landing/ui/white/WNavSection.tsx",
      "features/about/ui/AboutNavSection.tsx",
      "features/legal/ui/LegalNavSection.tsx",
    ];

    for (const f of viaSharedLock) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(src, `${f} must release the shared lock`).toContain("unlockBodyScroll");
      // Two overlays that each snapshot and rewrite body.style is the bug this
      // split prevents: the inner one saves the outer one's LOCKED values and
      // restores them for good, leaving the page unscrollable by touch.
      expect(src, `${f} must not write body.style itself`).not.toMatch(
        /document\.body\.style\.(overflow|position|top|left|right|width)\s*=/
      );
    }

    for (const f of [...locksByHand, "shared/ui/body-scroll-lock.ts"]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(src, f).toContain("restoreScroll(");
      // the bare call is what animated from the top of the page
      expect(src, `${f} still restores scroll by hand`).not.toMatch(/window\.scrollTo\(0,/);
    }
  });
});
