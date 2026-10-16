// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ph = vi.hoisted(() => ({ capture: vi.fn(), register: vi.fn() }));
vi.mock("posthog-js", () => ({ default: ph }));
// Every gate open: production, and analytics consent (the dataLayer push needs it).
vi.mock("@shared/env/is-non-prod-deploy", async (orig) => ({
  ...(await orig<object>()),
  isProductionSite: () => true,
}));

import { trackLandingCardAnswer } from "@features/analytics/client";

beforeEach(() => {
  ph.capture.mockClear();
  document.cookie = "cookieyes-consent=analytics:yes";
  window.dataLayer = [];
});
afterEach(() => {
  document.cookie = "cookieyes-consent=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
});

describe("an answer given to PostHog alone", () => {
  it("reaches PostHog with the point picked, and Google's dataLayer without it", () => {
    trackLandingCardAnswer({ location: "hero", changed: false, value: 6 });
    expect(ph.capture).toHaveBeenCalledWith("landing_card_answer", {
      location: "hero",
      changed: false,
      value: 6,
    });
    // The same event still reaches GA4 (the gates are open), as where and whether only.
    const pushed = (window.dataLayer as Record<string, unknown>[]).filter(
      (e) => e.event === "landing_card_answer"
    );
    expect(pushed).toEqual([{ event: "landing_card_answer", location: "hero", changed: false }]);
  });
});
