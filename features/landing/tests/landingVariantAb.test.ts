import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LANDING_VARIANT_ARMS,
  LANDING_VARIANT_COOKIE,
  LANDING_VARIANT_EXPERIMENT,
  isLandingVariant,
  normalizeLandingVariant,
} from "@shared/experiments/landingVariant";

/**
 * Round 2 of the landing A/B: the current white landing against the one before
 * the 2026-08-10 rebuild. The pieces live in five files and a broken link in any
 * one of them loses the test's data without breaking the page — so they are
 * pinned here rather than left to a manual read-through.
 */
describe("landing A/B — the two arms", () => {
  it("serves exactly the two white arms, with the dark control retired", () => {
    expect([...LANDING_VARIANT_ARMS]).toEqual(["white", "white_prev"]);
    // "control" is still a valid value (historical rows carry it) but is not an arm.
    expect(isLandingVariant("control")).toBe(true);
    expect(LANDING_VARIANT_ARMS).not.toContain("control");
    expect(isLandingVariant("white_prev")).toBe(true);
    expect(isLandingVariant("purple")).toBe(false);
  });

  it("defaults an absent or unknown value to the live arm, never to a dead one", () => {
    // This used to default to "control" — a landing that no longer exists.
    expect(normalizeLandingVariant(null)).toBe("white");
    expect(normalizeLandingVariant("nonsense")).toBe("white");
    expect(normalizeLandingVariant("white_prev")).toBe("white_prev");
  });

  it("uses a fresh experiment id so round 1 and round 2 stay apart in GA4", () => {
    expect(LANDING_VARIANT_EXPERIMENT).toBe("landing-white-rebuild-ab");
  });

  it("renders one arm per variant, chosen from the proxy's header", () => {
    const page = readFileSync(join(process.cwd(), "app/page.tsx"), "utf8");
    // Read from the REQUEST HEADER, not cookies(): on the visit that mints the
    // cookie, cookies() cannot see it yet and the first render would flip.
    expect(page).toContain("LANDING_VARIANT_HEADER");
    // ...and not by importing next/headers' cookies (the comment explains why).
    expect(page).not.toMatch(/^import \{[^}]*\bcookies\b/m);
    expect(page).toContain(
      'variant === "white_prev" ? <LandingPageWhiteV1 /> : <LandingPageWhite />'
    );
  });

  it("stamps the arm on every durable event, the submission and the Stripe session", () => {
    // The cookie is the single source the funnel reads downstream.
    const analytics = readFileSync(join(process.cwd(), "features/analytics/client.ts"), "utf8");
    // Guarded by the shared type guard: a literal list here silently dropped the
    // new arm's stamp from every persisted event.
    expect(analytics).toMatch(/isLandingVariant\(v\)/);
    expect(analytics).toContain("landing_variant: landingVariant");

    const survey = readFileSync(join(process.cwd(), "app/api/survey/route.ts"), "utf8");
    expect(survey).toContain("base.landing_variant = landingVariantRaw");

    const checkout = readFileSync(
      join(process.cwd(), "app/api/stripe/checkout-session/route.ts"),
      "utf8"
    );
    expect(checkout).toContain("normalizeLandingVariant");

    const tracker = readFileSync(
      join(process.cwd(), "features/landing/ui/LandingPageTracker.tsx"),
      "utf8"
    );
    expect(tracker).toContain("setLandingVariant(variant)");
    expect(tracker).toContain("trackExperimentExposure");
  });

  it("names the cookie per environment, with the __Host- prefix in production", () => {
    expect(LANDING_VARIANT_COOKIE).toBe("__liq_lv");
  });

  it("gives each arm its own tracker variant", () => {
    const current = readFileSync(
      join(process.cwd(), "features/landing/ui/white/LandingPageWhite.tsx"),
      "utf8"
    );
    const previous = readFileSync(
      join(process.cwd(), "features/landing/ui/white-v1/LandingPageWhiteV1.tsx"),
      "utf8"
    );
    expect(current).toContain('<LandingPageTracker variant="white" />');
    expect(previous).toContain('<LandingPageTracker variant="white_prev" />');
  });

  it("keeps the previous arm's own hero, carousel, FAQ and CTA pinned", () => {
    const previous = readFileSync(
      join(process.cwd(), "features/landing/ui/white-v1/LandingPageWhiteV1.tsx"),
      "utf8"
    );
    // The four sections the rebuild redesigned come from this folder...
    for (const local of [
      'from "./WHero"',
      'from "./WArchetypeCards"',
      'import("./WFAQ")',
      'import("./WCTA")',
    ]) {
      expect(previous).toContain(local);
    }
    // ...and the rest are shared, so a fix lands on both arms.
    for (const shared of ["../white/WNavSection", "../white/WHowItWorks", "../white/WGlossary"]) {
      expect(previous).toContain(shared);
    }
  });
});
