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

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  clearConsentCookie();
  const mod = await import("@features/analytics/client");
  track = mod.track;
  setSurveyVariant = mod.setSurveyVariant;
  window.gtag = vi.fn() as unknown as typeof window.gtag;
});

describe("the persona walks' tap", () => {
  it("hears every event PostHog is sent, with the same params, before PostHog does", () => {
    // How many PostHog calls had happened when the tap heard each event. Recorded, not
    // asserted in here: track() swallows whatever the tap throws, an expect() included.
    const heard: Array<[string, Record<string, unknown>, number]> = [];
    window.__loveiqEventTap = (name, params) => {
      heard.push([name, params, ph.capture.mock.calls.length]);
    };
    track("survey_progress", { question_id: "Q3", question_index: 3 });
    track("report_viewed");
    expect(heard).toEqual([
      ["survey_progress", { question_id: "Q3", question_index: 3 }, 0],
      ["report_viewed", {}, 1],
    ]);
    expect(ph.capture).toHaveBeenCalledTimes(2);
    delete window.__loveiqEventTap;
  });

  it("cannot stop an event reaching PostHog when it throws", () => {
    window.__loveiqEventTap = () => {
      throw new Error("a broken listener");
    };
    expect(() => track("begin_checkout", { plan: "core" })).not.toThrow();
    expect(ph.capture).toHaveBeenCalledWith("begin_checkout", { plan: "core" });
    delete window.__loveiqEventTap;
  });

  it("changes nothing for a visitor, whose page has no tap", () => {
    expect(window.__loveiqEventTap).toBeUndefined();
    track("cta_click", { cta: "start_survey" });
    expect(ph.capture).toHaveBeenCalledWith("cta_click", { cta: "start_survey" });
  });
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
  });

  it("does not register an arm when it is null", () => {
    setSurveyVariant(null);
    expect(ph.register).not.toHaveBeenCalled();
  });
});
