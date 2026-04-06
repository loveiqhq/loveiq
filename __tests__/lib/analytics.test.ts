// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const EXPECTED_WAITLIST_SEND_TO = `AW-18068690553/${["guQ3CPHxh5cc", "EPms6adD"].join("")}`;
const clearConsentCookie = () => {
  document.cookie = "cookieyes-consent=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
};

const setConsentCookie = ({
  analytics = false,
  advertisement = false,
}: {
  analytics?: boolean;
  advertisement?: boolean;
} = {}) => {
  document.cookie = `cookieyes-consent=${[
    "consent:yes",
    "action:yes",
    "necessary:yes",
    `analytics:${analytics ? "yes" : "no"}`,
    `advertisement:${advertisement ? "yes" : "no"}`,
  ].join(",")}; path=/`;
};

// Must re-import in each test file to get fresh module state
let track: typeof import("../../lib/analytics").track;
let trackStartSurvey: typeof import("../../lib/analytics").trackStartSurvey;
let trackLearnMore: typeof import("../../lib/analytics").trackLearnMore;
let trackWaitlistSignup: typeof import("../../lib/analytics").trackWaitlistSignup;
let trackGoogleAdsWaitlistConversion: typeof import("../../lib/analytics").trackGoogleAdsWaitlistConversion;

describe("analytics", () => {
  const originalWindow = globalThis.window;

  beforeEach(async () => {
    clearConsentCookie();
    // Dynamically import to reset module state
    vi.resetModules();
    const mod = await import("../../lib/analytics");
    track = mod.track;
    trackStartSurvey = mod.trackStartSurvey;
    trackLearnMore = mod.trackLearnMore;
    trackWaitlistSignup = mod.trackWaitlistSignup;
    trackGoogleAdsWaitlistConversion = mod.trackGoogleAdsWaitlistConversion;
  });

  afterEach(() => {
    clearConsentCookie();
    // Restore window
    if (originalWindow === undefined) {
      // @ts-expect-error - restoring undefined window for SSR test
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  describe("track", () => {
    it("does nothing when window is undefined (SSR safety)", () => {
      // @ts-expect-error - simulating SSR
      delete globalThis.window;
      // Should not throw
      expect(() => track("test_event")).not.toThrow();
    });

    it("does nothing when gtag is not available", () => {
      setConsentCookie({ analytics: true });
      globalThis.window = { ...globalThis.window } as typeof globalThis.window;
      globalThis.window.__loveiqAnalyticsEnabled = true;
      delete globalThis.window.gtag;
      expect(() => track("test_event")).not.toThrow();
    });

    it("does nothing when analytics is not enabled", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = { ...globalThis.window, gtag: mockGtag } as typeof globalThis.window;

      track("test_event");

      expect(mockGtag).not.toHaveBeenCalled();
    });

    it("does nothing when analytics consent is not granted", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ advertisement: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      track("test_event");

      expect(mockGtag).not.toHaveBeenCalled();
    });

    it("calls window.gtag with event name", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      track("test_event");

      expect(mockGtag).toHaveBeenCalledWith("event", "test_event", undefined);
    });

    it("calls window.gtag with event name and params", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      track("test_event", { key: "value" });

      expect(mockGtag).toHaveBeenCalledWith("event", "test_event", { key: "value" });
    });
  });

  describe("trackStartSurvey", () => {
    it("fires cta_click with start_survey and location", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      trackStartSurvey("hero");

      expect(mockGtag).toHaveBeenCalledWith("event", "cta_click", {
        cta: "start_survey",
        location: "hero",
      });
    });

    it("passes nav location", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      trackStartSurvey("nav");

      expect(mockGtag).toHaveBeenCalledWith("event", "cta_click", {
        cta: "start_survey",
        location: "nav",
      });
    });
  });

  describe("trackLearnMore", () => {
    it("fires cta_click with learn_more and location", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      trackLearnMore("hero");

      expect(mockGtag).toHaveBeenCalledWith("event", "cta_click", {
        cta: "learn_more",
        location: "hero",
      });
    });
  });

  describe("trackWaitlistSignup", () => {
    it("fires waitlist_signup event with source", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      trackWaitlistSignup("landing-modal");

      expect(mockGtag).toHaveBeenCalledWith("event", "waitlist_signup", {
        method: "form",
        source: "landing-modal",
      });
    });
  });

  describe("trackGoogleAdsWaitlistConversion", () => {
    it("does nothing when gtag is not available", () => {
      setConsentCookie({ advertisement: true });
      globalThis.window = { ...globalThis.window } as typeof globalThis.window;
      globalThis.window.__loveiqGoogleAdsEnabled = true;
      delete globalThis.window.gtag;

      expect(() => trackGoogleAdsWaitlistConversion()).not.toThrow();
    });

    it("does nothing when Google Ads is not enabled", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ advertisement: true });
      globalThis.window = { ...globalThis.window, gtag: mockGtag } as typeof globalThis.window;

      trackGoogleAdsWaitlistConversion();

      expect(mockGtag).not.toHaveBeenCalled();
    });

    it("does nothing when advertisement consent is not granted", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqGoogleAdsEnabled: true,
      } as typeof globalThis.window;

      trackGoogleAdsWaitlistConversion();

      expect(mockGtag).not.toHaveBeenCalled();
    });

    it("fires the Google Ads conversion event", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ advertisement: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqGoogleAdsEnabled: true,
      } as typeof globalThis.window;

      trackGoogleAdsWaitlistConversion();

      expect(mockGtag).toHaveBeenCalledWith("event", "conversion", {
        send_to: EXPECTED_WAITLIST_SEND_TO,
        value: 1.0,
        currency: "MXN",
      });
    });
  });
});
