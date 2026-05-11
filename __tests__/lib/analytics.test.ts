// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const EXPECTED_PURCHASE_SEND_TO = `AW-18068690553/${["guQ3CPHxh5cc", "EPms6adD"].join("")}`;
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
let trackSurveyStart: typeof import("../../lib/analytics").trackSurveyStart;
let trackSurveyProgress: typeof import("../../lib/analytics").trackSurveyProgress;
let trackSurveyComplete: typeof import("../../lib/analytics").trackSurveyComplete;
let trackReportViewed: typeof import("../../lib/analytics").trackReportViewed;
let trackPaywallView: typeof import("../../lib/analytics").trackPaywallView;
let trackBeginCheckout: typeof import("../../lib/analytics").trackBeginCheckout;
let trackReportEngagement: typeof import("../../lib/analytics").trackReportEngagement;
let trackReportPurchase: typeof import("../../lib/analytics").trackReportPurchase;
let trackGoogleAdsPurchaseConversion: typeof import("../../lib/analytics").trackGoogleAdsPurchaseConversion;
let trackLandingPageView: typeof import("../../lib/analytics").trackLandingPageView;
let trackPriceShown: typeof import("../../lib/analytics").trackPriceShown;

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
    trackSurveyStart = mod.trackSurveyStart;
    trackSurveyProgress = mod.trackSurveyProgress;
    trackSurveyComplete = mod.trackSurveyComplete;
    trackReportViewed = mod.trackReportViewed;
    trackPaywallView = mod.trackPaywallView;
    trackBeginCheckout = mod.trackBeginCheckout;
    trackReportEngagement = mod.trackReportEngagement;
    trackReportPurchase = mod.trackReportPurchase;
    trackGoogleAdsPurchaseConversion = mod.trackGoogleAdsPurchaseConversion;
    trackLandingPageView = mod.trackLandingPageView;
    trackPriceShown = mod.trackPriceShown;
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
    // Clean up dataLayer
    if (globalThis.window) {
      delete globalThis.window.dataLayer;
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

    it("pushes to dataLayer for GTM consumption", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      track("test_event", { key: "value" });

      expect(globalThis.window.dataLayer).toBeDefined();
      expect(globalThis.window.dataLayer).toContainEqual({
        event: "test_event",
        key: "value",
      });
    });

    it("initializes dataLayer if not present", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;
      delete globalThis.window.dataLayer;

      track("first_event");

      expect(Array.isArray(globalThis.window.dataLayer)).toBe(true);
      expect(globalThis.window.dataLayer!.length).toBe(1);
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

  describe("trackSurveyStart", () => {
    it("fires survey_started", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      trackSurveyStart();

      expect(mockGtag).toHaveBeenCalledWith("event", "survey_started", undefined);
      expect(mockGtag).toHaveBeenCalledTimes(1);
    });
  });

  describe("trackSurveyComplete", () => {
    it("fires survey_completed with duration_ms + completion_time_seconds", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      trackSurveyComplete(120000);

      expect(mockGtag).toHaveBeenCalledWith("event", "survey_completed", {
        duration_ms: 120000,
        completion_time_seconds: 120,
      });
      expect(mockGtag).toHaveBeenCalledTimes(1);
    });

    it("includes total_questions on survey_completed when provided", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      trackSurveyComplete(60000, 35);

      expect(mockGtag).toHaveBeenCalledWith("event", "survey_completed", {
        duration_ms: 60000,
        completion_time_seconds: 60,
        total_questions: 35,
      });
    });
  });

  describe("trackSurveyProgress", () => {
    it("emits survey_progress with question_id, question_index, and computed progress_pct", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      trackSurveyProgress("Q07", 5, 10);

      expect(mockGtag).toHaveBeenCalledWith("event", "survey_progress", {
        question_id: "Q07",
        question_index: 5,
        progress_pct: 50,
      });
    });

    it("returns 0 progress when totalQuestions is zero (defensive)", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      trackSurveyProgress("Q01", 0, 0);

      expect(mockGtag).toHaveBeenCalledWith(
        "event",
        "survey_progress",
        expect.objectContaining({ progress_pct: 0 })
      );
    });
  });

  describe("trackReportViewed", () => {
    it("emits report_viewed with report_type and archetype when given", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      trackReportViewed("full_report", "The Sage");

      expect(mockGtag).toHaveBeenCalledWith("event", "report_viewed", {
        report_type: "full_report",
        archetype: "The Sage",
      });
    });

    it("omits archetype param when null/undefined", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      trackReportViewed("locked", null);

      expect(mockGtag).toHaveBeenCalledWith("event", "report_viewed", {
        report_type: "locked",
      });
    });
  });

  describe("trackPaywallView", () => {
    it("emits paywall_view with currency from first item and full items array", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      trackPaywallView([
        { plan: "essentials", price: 19.99, currency: "EUR" },
        { plan: "full_report", price: 29.99, currency: "EUR" },
        { plan: "all_reports", price: 259.0, currency: "EUR" },
      ]);

      expect(mockGtag).toHaveBeenCalledWith("event", "paywall_view", {
        currency: "EUR",
        items: [
          { plan: "essentials", price: 19.99, currency: "EUR" },
          { plan: "full_report", price: 29.99, currency: "EUR" },
          { plan: "all_reports", price: 259.0, currency: "EUR" },
        ],
      });
    });

    it("does nothing when items array is empty", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      trackPaywallView([]);

      expect(mockGtag).not.toHaveBeenCalled();
    });
  });

  describe("trackLandingPageView", () => {
    it("fires landing_page_view event to gtag (GA4-only, no params)", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      trackLandingPageView();

      expect(mockGtag).toHaveBeenCalledWith("event", "landing_page_view", undefined);
    });
  });

  describe("trackPriceShown", () => {
    it("emits price_shown to gtag with full pricing-cluster metadata", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      trackPriceShown({
        plan: "full_report",
        price: 9.99,
        currency: "EUR",
        bucket: "A",
        pricing_cluster_id: "B-full_report-A-tier_2-iOS-google-engaged-d0",
        discount_step: 0,
        experiment_group: "B",
        msrp: 69.99,
        initial_price: 9.99,
      });

      expect(mockGtag).toHaveBeenCalledWith(
        "event",
        "price_shown",
        expect.objectContaining({
          plan: "full_report",
          price: 9.99,
          bucket: "A",
          pricing_cluster_id: "B-full_report-A-tier_2-iOS-google-engaged-d0",
          discount_step: 0,
        })
      );
    });
  });

  describe("trackBeginCheckout", () => {
    it("emits begin_checkout with plan, price, currency", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      trackBeginCheckout("full_report", 29.99, "EUR");

      expect(mockGtag).toHaveBeenCalledWith("event", "begin_checkout", {
        plan: "full_report",
        price: 29.99,
        currency: "EUR",
      });
    });
  });

  describe("trackReportEngagement", () => {
    it.each([
      [60, "report_engagement_1min"],
      [300, "report_engagement_5min"],
      [600, "report_engagement_10min"],
    ] as const)("emits %s payload with %s event name", (seconds, expectedEventName) => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      trackReportEngagement(seconds, "full_report", "Sage", 42);

      expect(mockGtag).toHaveBeenCalledWith("event", expectedEventName, {
        engagement_seconds: seconds,
        report_type: "full_report",
        archetype: "Sage",
        scroll_depth_pct: 42,
      });
    });

    it("omits archetype param when null", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      trackReportEngagement(60, "locked", null, 25);

      expect(mockGtag).toHaveBeenCalledWith("event", "report_engagement_1min", {
        engagement_seconds: 60,
        report_type: "locked",
        scroll_depth_pct: 25,
      });
    });
  });

  describe("trackReportPurchase", () => {
    it("pushes GA4 ecommerce purchase event into dataLayer with items array", () => {
      setConsentCookie({ analytics: true });
      const dataLayer: Array<Record<string, unknown>> = [];
      globalThis.window = {
        ...globalThis.window,
        dataLayer,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      trackReportPurchase({
        value: 29.99,
        currency: "EUR",
        transaction_id: "txn_123",
        item_name: "Full report",
      });

      expect(dataLayer).toContainEqual(
        expect.objectContaining({
          event: "purchase",
          transaction_id: "txn_123",
          value: 29.99,
          currency: "EUR",
          items: [{ item_name: "Full report", price: 29.99, quantity: 1 }],
        })
      );
    });

    it("falls back to default item_name when not provided", () => {
      setConsentCookie({ analytics: true });
      const dataLayer: Array<Record<string, unknown>> = [];
      globalThis.window = {
        ...globalThis.window,
        dataLayer,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      trackReportPurchase({
        value: 19.99,
        currency: "USD",
        transaction_id: "txn_default",
      });

      expect(dataLayer[0]).toMatchObject({
        event: "purchase",
        items: [{ item_name: "LoveIQ Report", price: 19.99, quantity: 1 }],
      });
    });

    it("preserves A/B + attribution context fields on the purchase push", () => {
      setConsentCookie({ analytics: true });
      const dataLayer: Array<Record<string, unknown>> = [];
      globalThis.window = {
        ...globalThis.window,
        dataLayer,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      trackReportPurchase({
        value: 19.99,
        currency: "EUR",
        transaction_id: "txn_456",
        item_name: "Essentials only",
        pricing_cluster_id: "B-DE-iOS-google-engaged",
        base_price_bucket: "A",
        experiment_group: "B",
        discount_step: 2,
        country_tier: "1",
        device_type: "iOS",
        traffic_source: "facebook",
        engagement_score: 65,
        behavioral_bucket: "€200",
        initial_price: 39.99,
      });

      expect(dataLayer[0]).toMatchObject({
        event: "purchase",
        pricing_cluster_id: "B-DE-iOS-google-engaged",
        discount_step: 2,
        traffic_source: "facebook",
        initial_price: 39.99,
      });
    });

    it("does not push when analytics consent is not granted", () => {
      setConsentCookie({ advertisement: true });
      const dataLayer: Array<Record<string, unknown>> = [];
      globalThis.window = {
        ...globalThis.window,
        dataLayer,
        __loveiqAnalyticsEnabled: true,
      } as typeof globalThis.window;

      trackReportPurchase({
        value: 19.99,
        currency: "EUR",
        transaction_id: "txn_no_consent",
      });

      expect(dataLayer).toHaveLength(0);
    });
  });

  describe("trackGoogleAdsPurchaseConversion", () => {
    const purchaseParams = {
      value: 27.49,
      currency: "EUR",
      transaction_id: "cs_test_123",
    };

    it("does nothing when gtag is not available", () => {
      setConsentCookie({ advertisement: true });
      globalThis.window = { ...globalThis.window } as typeof globalThis.window;
      globalThis.window.__loveiqGoogleAdsEnabled = true;
      delete globalThis.window.gtag;

      expect(() => trackGoogleAdsPurchaseConversion(purchaseParams)).not.toThrow();
    });

    it("does nothing when Google Ads is not enabled", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ advertisement: true });
      globalThis.window = { ...globalThis.window, gtag: mockGtag } as typeof globalThis.window;

      trackGoogleAdsPurchaseConversion(purchaseParams);

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

      trackGoogleAdsPurchaseConversion(purchaseParams);

      expect(mockGtag).not.toHaveBeenCalled();
    });

    it("fires the Google Ads conversion event with dynamic value, currency, and transaction_id", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ advertisement: true });
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        __loveiqGoogleAdsEnabled: true,
      } as typeof globalThis.window;

      trackGoogleAdsPurchaseConversion(purchaseParams);

      expect(mockGtag).toHaveBeenCalledWith("event", "conversion", {
        send_to: EXPECTED_PURCHASE_SEND_TO,
        value: 27.49,
        currency: "EUR",
        transaction_id: "cs_test_123",
      });
    });

    it("trackReportPurchase pushes GA4 purchase to dataLayer and fires Google Ads conversion when both consents granted", () => {
      const mockGtag = vi.fn();
      setConsentCookie({ analytics: true, advertisement: true });
      const dataLayer: Array<Record<string, unknown>> = [];
      globalThis.window = {
        ...globalThis.window,
        gtag: mockGtag,
        dataLayer,
        __loveiqAnalyticsEnabled: true,
        __loveiqGoogleAdsEnabled: true,
      } as typeof globalThis.window;

      trackReportPurchase(purchaseParams);

      expect(dataLayer).toContainEqual(
        expect.objectContaining({
          event: "purchase",
          value: 27.49,
          currency: "EUR",
          transaction_id: "cs_test_123",
        })
      );
      expect(mockGtag).toHaveBeenCalledWith("event", "conversion", {
        send_to: EXPECTED_PURCHASE_SEND_TO,
        value: 27.49,
        currency: "EUR",
        transaction_id: "cs_test_123",
      });
    });
  });
});
