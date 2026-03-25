import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Must re-import in each test file to get fresh module state
let track: typeof import("../../lib/analytics").track;
let trackStartSurvey: typeof import("../../lib/analytics").trackStartSurvey;
let trackLearnMore: typeof import("../../lib/analytics").trackLearnMore;
let trackWaitlistSignup: typeof import("../../lib/analytics").trackWaitlistSignup;
let trackSurveyStart: typeof import("../../lib/analytics").trackSurveyStart;
let trackSurveyComplete: typeof import("../../lib/analytics").trackSurveyComplete;
let trackReportPurchase: typeof import("../../lib/analytics").trackReportPurchase;

describe("analytics", () => {
  const originalWindow = globalThis.window;

  beforeEach(async () => {
    // Dynamically import to reset module state
    vi.resetModules();
    const mod = await import("../../lib/analytics");
    track = mod.track;
    trackStartSurvey = mod.trackStartSurvey;
    trackLearnMore = mod.trackLearnMore;
    trackWaitlistSignup = mod.trackWaitlistSignup;
    trackSurveyStart = mod.trackSurveyStart;
    trackSurveyComplete = mod.trackSurveyComplete;
    trackReportPurchase = mod.trackReportPurchase;
  });

  afterEach(() => {
    // Restore window
    if (originalWindow === undefined) {
      // @ts-expect-error - restoring undefined window for SSR test
      delete globalThis.window;
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
      globalThis.window = { ...globalThis.window } as typeof globalThis.window;
      delete globalThis.window.gtag;
      expect(() => track("test_event")).not.toThrow();
    });

    it("calls window.gtag with event name", () => {
      const mockGtag = vi.fn();
      globalThis.window = { ...globalThis.window, gtag: mockGtag } as typeof globalThis.window;

      track("test_event");

      expect(mockGtag).toHaveBeenCalledWith("event", "test_event", undefined);
    });

    it("calls window.gtag with event name and params", () => {
      const mockGtag = vi.fn();
      globalThis.window = { ...globalThis.window, gtag: mockGtag } as typeof globalThis.window;

      track("test_event", { key: "value" });

      expect(mockGtag).toHaveBeenCalledWith("event", "test_event", { key: "value" });
    });

    it("pushes to dataLayer for GTM consumption", () => {
      const mockGtag = vi.fn();
      globalThis.window = { ...globalThis.window, gtag: mockGtag } as typeof globalThis.window;

      track("test_event", { key: "value" });

      expect(globalThis.window.dataLayer).toBeDefined();
      expect(globalThis.window.dataLayer).toContainEqual({
        event: "test_event",
        key: "value",
      });
    });

    it("initializes dataLayer if not present", () => {
      const mockGtag = vi.fn();
      globalThis.window = { ...globalThis.window, gtag: mockGtag } as typeof globalThis.window;
      delete globalThis.window.dataLayer;

      track("first_event");

      expect(Array.isArray(globalThis.window.dataLayer)).toBe(true);
      expect(globalThis.window.dataLayer!.length).toBe(1);
    });
  });

  describe("trackStartSurvey", () => {
    it("fires cta_click with start_survey and location", () => {
      const mockGtag = vi.fn();
      globalThis.window = { ...globalThis.window, gtag: mockGtag } as typeof globalThis.window;

      trackStartSurvey("hero");

      expect(mockGtag).toHaveBeenCalledWith("event", "cta_click", {
        cta: "start_survey",
        location: "hero",
      });
    });

    it("passes nav location", () => {
      const mockGtag = vi.fn();
      globalThis.window = { ...globalThis.window, gtag: mockGtag } as typeof globalThis.window;

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
      globalThis.window = { ...globalThis.window, gtag: mockGtag } as typeof globalThis.window;

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
      globalThis.window = { ...globalThis.window, gtag: mockGtag } as typeof globalThis.window;

      trackWaitlistSignup("landing-modal");

      expect(mockGtag).toHaveBeenCalledWith("event", "waitlist_signup", {
        method: "form",
        source: "landing-modal",
      });
    });
  });

  describe("trackSurveyStart (dual-fire)", () => {
    it("fires both legacy survey_start and new survey_started", () => {
      const mockGtag = vi.fn();
      globalThis.window = { ...globalThis.window, gtag: mockGtag } as typeof globalThis.window;

      trackSurveyStart();

      expect(mockGtag).toHaveBeenCalledWith("event", "survey_start", undefined);
      expect(mockGtag).toHaveBeenCalledWith("event", "survey_started", undefined);
      expect(mockGtag).toHaveBeenCalledTimes(2);
    });
  });

  describe("trackSurveyComplete (dual-fire)", () => {
    it("fires both legacy survey_complete and new survey_completed with duration", () => {
      const mockGtag = vi.fn();
      globalThis.window = { ...globalThis.window, gtag: mockGtag } as typeof globalThis.window;

      trackSurveyComplete(120000);

      expect(mockGtag).toHaveBeenCalledWith("event", "survey_complete", { duration_ms: 120000 });
      expect(mockGtag).toHaveBeenCalledWith("event", "survey_completed", { duration_ms: 120000 });
      expect(mockGtag).toHaveBeenCalledTimes(2);
    });
  });

  describe("trackReportPurchase", () => {
    it("fires report_purchase event with required params", () => {
      const mockGtag = vi.fn();
      globalThis.window = { ...globalThis.window, gtag: mockGtag } as typeof globalThis.window;

      trackReportPurchase({
        value: 29.99,
        currency: "EUR",
        transaction_id: "txn_123",
      });

      expect(mockGtag).toHaveBeenCalledWith(
        "event",
        "report_purchase",
        expect.objectContaining({
          value: 29.99,
          currency: "EUR",
          transaction_id: "txn_123",
        })
      );
    });

    it("fires report_purchase with full pricing cluster params", () => {
      const mockGtag = vi.fn();
      globalThis.window = { ...globalThis.window, gtag: mockGtag } as typeof globalThis.window;

      trackReportPurchase({
        value: 19.99,
        currency: "EUR",
        transaction_id: "txn_456",
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

      expect(mockGtag).toHaveBeenCalledWith(
        "event",
        "report_purchase",
        expect.objectContaining({
          pricing_cluster_id: "B-DE-iOS-google-engaged",
          discount_step: 2,
          traffic_source: "facebook",
          initial_price: 39.99,
        })
      );
    });
  });
});
