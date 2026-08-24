// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted so the vi.mock factory below can close over the same spies.
const ph = vi.hoisted(() => ({
  capture: vi.fn(),
  register: vi.fn(),
  identify: vi.fn(),
  init: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: ph }));

const clearConsentCookie = () => {
  document.cookie = "cookieyes-consent=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
};
const grantAnalyticsConsent = () => {
  document.cookie =
    "cookieyes-consent=consent:yes,action:yes,necessary:yes,analytics:yes,advertisement:no; path=/";
};

let track: typeof import("@features/analytics/client").track;
let setSurveyVariant: typeof import("@features/analytics/client").setSurveyVariant;
let setForcedPaywallArm: typeof import("@features/analytics/client").setForcedPaywallArm;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  clearConsentCookie();
  const mod = await import("@features/analytics/client");
  track = mod.track;
  setSurveyVariant = mod.setSurveyVariant;
  setForcedPaywallArm = mod.setForcedPaywallArm;
  window.gtag = vi.fn() as unknown as typeof window.gtag;
});

describe("PostHog mirror of the GA4 event taxonomy", () => {
  it("forwards every tracked event to PostHog with its params", () => {
    grantAnalyticsConsent();
    window.__loveiqAnalyticsEnabled = true;
    track("paywall_view", { plan: "full_report", price: 19 });
    expect(ph.capture).toHaveBeenCalledWith("paywall_view", { plan: "full_report", price: 19 });
  });

  // The regression this guards: PostHog is intentionally NOT consent-gated on
  // this site (owner decision, same as Microsoft Clarity). If the capture is
  // ever moved below the GA4 gates, the whole ~33-event custom funnel silently
  // disappears for anyone who declined analytics — while autocapture keeps
  // recording them, so the loss looks like nothing at all.
  it("still reaches PostHog when analytics consent is absent, while GA4 is skipped", () => {
    window.__loveiqAnalyticsEnabled = true;
    track("begin_checkout", { plan: "essentials" });
    expect(ph.capture).toHaveBeenCalledWith("begin_checkout", { plan: "essentials" });
    expect(window.gtag).not.toHaveBeenCalled();
  });

  it("still reaches PostHog when the GA bootstrap flag never ran", () => {
    grantAnalyticsConsent();
    window.__loveiqAnalyticsEnabled = false;
    track("report_viewed");
    expect(ph.capture).toHaveBeenCalledWith("report_viewed", undefined);
    expect(window.gtag).not.toHaveBeenCalled();
  });

  it("registers experiment arms as PostHog super properties", () => {
    setSurveyVariant("white");
    expect(ph.register).toHaveBeenCalledWith({ survey_variant: "white" });
    setForcedPaywallArm("treatment");
    expect(ph.register).toHaveBeenCalledWith({ forced_paywall_arm: "treatment" });
  });

  it("does not register an arm when it is null", () => {
    setSurveyVariant(null);
    setForcedPaywallArm(null);
    expect(ph.register).not.toHaveBeenCalled();
  });
});
