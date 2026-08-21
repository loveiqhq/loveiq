// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The A/B is only worth running if the arm reaches the analytics. Two paths carry
 * it, and both have already been wrong once:
 *   - GA4, via LandingPageTracker (user property + experiment_exposure);
 *   - every durable event, via the __liq_lv cookie read in persistAnalyticsEvent —
 *     which validated against a hardcoded list of the ROUND 1 arms, so a
 *     `white_prev` visitor's events shipped with no variant at all.
 */
const setConsent = () => {
  document.cookie =
    "cookieyes-consent=consent:yes,action:yes,necessary:yes,analytics:yes,advertisement:no; path=/";
};

describe("landing A/B — the arm reaches the analytics", () => {
  beforeEach(() => {
    vi.resetModules();
    document.cookie = "__liq_lv=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    setConsent();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reports each arm to GA4 as a user property and an exposure event", async () => {
    const analytics = await import("@features/analytics/client");
    const setVariant = vi.spyOn(analytics, "setLandingVariant").mockImplementation(() => {});
    const exposure = vi.spyOn(analytics, "trackExperimentExposure").mockImplementation(() => {});
    vi.spyOn(analytics, "trackLandingPageView").mockImplementation(() => {});
    const { default: LandingPageTracker } = await import("@features/landing/ui/LandingPageTracker");
    const { LANDING_VARIANT_EXPERIMENT } = await import("@shared/experiments/landingVariant");

    for (const arm of ["white", "white_prev"] as const) {
      setVariant.mockClear();
      exposure.mockClear();
      render(<LandingPageTracker variant={arm} />);
      expect(setVariant).toHaveBeenCalledWith(arm);
      expect(exposure).toHaveBeenCalledWith({
        experiment: LANDING_VARIANT_EXPERIMENT,
        variant: arm,
        surface: "landing",
      });
    }
  });

  it("stamps the arm from the cookie onto a durable event, previous arm included", async () => {
    for (const arm of ["white", "white_prev"] as const) {
      vi.resetModules();
      setConsent();
      // persistAnalyticsEvent needs a submission context and a CSRF token, or it
      // returns before it would ever stamp anything.
      document.cookie = `__liq_lv=${arm}; path=/`;
      document.cookie = "__csrf=test-csrf; path=/";
      (window as unknown as { __loveiqReportSubmissionId: number }).__loveiqReportSubmissionId =
        381;
      // sendBeacon would short-circuit the fetch path this asserts on.
      vi.stubGlobal("navigator", { ...navigator, sendBeacon: undefined });
      const bodies: Record<string, unknown>[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init?: { body?: string }) => {
          bodies.push(JSON.parse(init?.body ?? "{}"));
          return { ok: true, json: async () => ({}) } as Response;
        })
      );

      const { trackReportViewed } = await import("@features/analytics/client");
      trackReportViewed("locked", "Explorer of Edges");

      await vi.waitFor(() => expect(bodies.length).toBeGreaterThan(0));
      expect(bodies[0]).toMatchObject({
        event_type: "report_viewed",
        metadata: expect.objectContaining({ landing_variant: arm }),
      });
    }
  });
});
