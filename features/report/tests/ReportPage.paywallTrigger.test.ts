import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * When the plans pop-up appears, and how gently.
 *
 * Three triggers preceded the current one: the FIRST scroll event of any size,
 * which interrupted readers a second in, then "Your snapshot", then "Typical
 * Beliefs". It now waits until they reach "Attachment Style" — one chapter past the
 * two half-shown ones, so the reader has seen twice what sits behind the paywall
 * before being asked to pay for it (MO, 2026-08-21).
 *
 * Asserted at source level because the pricing modal is always mounted and only
 * styled open, which jsdom cannot distinguish (it applies no CSS). The behaviour
 * itself is covered in a real browser by `npm run qa:report --phase=trigger`,
 * which checks the pop-up stays shut through the sections above the trigger and
 * opens on arrival, at both viewports.
 */
const SOURCE = readFileSync(join(process.cwd(), "features/report/ui/ReportPage.tsx"), "utf8");
const CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

describe("plans pop-up trigger", () => {
  it("observes the chapter after the two teased ones, not any scroll", () => {
    expect(SOURCE).toContain('document.getElementById("attachment_style")');
    expect(SOURCE).toMatch(/new IntersectionObserver\(/);
    expect(SOURCE).toMatch(/observer\.observe\(trigger\)/);
  });

  it("arms the countdown on the first offer card, not only on the pop-up", () => {
    // Every locked chapter's card prints "Time left to secure this price" over this
    // countdown, and with no deadline those digits render 00:00 — a dead offer. While
    // the pop-up sat on the FIRST paywalled chapter that could not happen: no card was
    // ever on screen before it fired. Now that it waits for Attachment, the two
    // half-shown chapters come first, so the first card arms the clock instead.
    expect(SOURCE).toContain('document.querySelector(".report-premium-overlay")');
    const block = SOURCE.slice(SOURCE.indexOf("const firstOfferCard"));
    expect(block.slice(0, 900)).toMatch(/armPaywallCountdown\(\)/);
    // ...and it is torn down with the rest of the effect.
    expect(SOURCE).toMatch(/cardObserver\?\.disconnect\(\)/);
  });

  it("waits until the section has risen into the viewport, not merely touched its edge", () => {
    // A ratio threshold cannot work here: the section is 620px tall on desktop
    // but 1089px against a 900px viewport on mobile, so it can never exceed 83%
    // visible there. The bottom inset is height-independent.
    expect(SOURCE).toMatch(/rootMargin:\s*"0px 0px -25% 0px"/);
  });

  it("still shows the pop-up if that chapter is ever absent", () => {
    // Losing the offer entirely would be worse than firing it early, so the chain
    // degrades to the chapter this trigger used to sit on, then to the snapshot, then
    // to first-scroll.
    expect(SOURCE).toMatch(
      /getElementById\("attachment_style"\) \?\?\s*document\.getElementById\("typical_beliefs"\) \?\?\s*document\.getElementById\("snapshot"\)/
    );
    const fallback = SOURCE.slice(SOURCE.indexOf("if (!trigger)"));
    expect(fallback).toMatch(/addEventListener\("scroll"/);
  });

  it("waits a beat after arrival instead of firing on the same frame", () => {
    // Landing the modal the instant the chapter appears reads as an ambush.
    const delay = SOURCE.match(/setIsPricingModalOpen\(true\);[\s\S]{0,80}?\}, (\d+)\);/);
    expect(delay, "the pop-up timer is gone").not.toBeNull();
    expect(Number(delay![1])).toBeGreaterThanOrEqual(1500);
  });

  it("fades the pop-up in slowly enough not to startle", () => {
    // The complaint that produced this: at 220ms the whole report blurs, darkens
    // and a panel lands inside a fifth of a second. Entrance timing lives on the
    // `.is-visible` rules (a transition is governed by the state it runs toward).
    const durations = [
      /\.report-pricing-modal\.is-visible \.report-pricing-modal__backdrop \{[^}]*?transition: opacity (\d+)ms/,
      /\.report-pricing-modal\.is-visible \.report-pricing-modal__dialog \{[^}]*?opacity (\d+)ms/,
      /\.report-page__shell-wrap \{[^}]*?filter (\d+)ms/,
    ].map((re) => {
      const m = CSS.match(re);
      expect(m, `entrance timing missing for ${re}`).not.toBeNull();
      return Number(m![1]);
    });

    for (const ms of durations) expect(ms).toBeGreaterThanOrEqual(500);
  });

  it("fires at most once, and not while the modal is already open", () => {
    expect(SOURCE).toMatch(
      /if \(scrollTeaserFiredRef\.current \|\| plansOfferedRef\.current\) return;/
    );
    expect(SOURCE).toMatch(/if \(!isPricingModalOpenRef\.current\)/);
  });

  it("cannot re-offer itself after the reader dismisses it", () => {
    // `scrollTeaserFiredRef` is reset by the effect's cleanup, so a data refetch or
    // view switch re-arms the trigger — and by then the reader is usually BELOW the
    // chapter, which the "already passed it" check reads as an arrival. A ref that
    // survives cleanup is what keeps the offer to one per report session.
    expect(SOURCE).toMatch(/plansOfferedRef\.current = true;/);
    const cleanup = SOURCE.slice(SOURCE.indexOf("scrollTeaserFiredRef.current = false"));
    expect(cleanup).not.toMatch(/plansOfferedRef\.current = false/);
  });

  it("starts the urgency countdown on arrival, not on page load", () => {
    // Reading the free chapters for ten minutes used to burn the clock to 00:00
    // before the offer had been made: the deadline was created in a mount effect.
    // Mount now only PEEKS (an entry already in storage = this tab has seen the
    // paywall); `openPlans` arms it, before the settle beat so the chapter's own
    // locked card and the pop-up show the same number.
    expect(SOURCE).toMatch(/const running = peekReportPaywallDeadline\(/);
    const openPlans = SOURCE.slice(SOURCE.indexOf("function openPlans()"));
    const armIdx = openPlans.indexOf("armPaywallCountdown()");
    const timerIdx = openPlans.indexOf("scrollTeaserTimerRef.current = setTimeout");
    expect(armIdx, "openPlans no longer arms the countdown").toBeGreaterThan(-1);
    expect(armIdx).toBeLessThan(timerIdx);
  });

  it("also arms the countdown for every other route to the paywall", () => {
    // Forced arm on load, ?offer=1 deep-link, 24h ladder auto-open, manual
    // "Unlock" CTAs — one effect covers them all, so no open path can show a
    // countdown that was never anchored.
    expect(SOURCE).toMatch(
      /if \(!isPricingModalOpen && !isScrollTeaserOpen\) return;[\s\S]{0,220}?armPaywallCountdown\(\)/
    );
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
