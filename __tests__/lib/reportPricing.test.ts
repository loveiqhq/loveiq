import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.fn();

vi.mock("../../lib/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: Parameters<typeof mockFetchWithTimeout>) =>
    mockFetchWithTimeout(...args),
}));

vi.mock("../../lib/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
}));

vi.mock("../../lib/report/personalReport", () => ({
  ensurePersonalReportForSubmission: vi.fn(),
  resolveSubmissionAccessContext: vi.fn(),
}));

import {
  getDiscountAdjustment,
  getReportPriceQuoteForContext,
} from "../../lib/pricing/reportPricing";
import {
  ensurePersonalReportForSubmission,
  resolveSubmissionAccessContext,
} from "../../lib/report/personalReport";

function createJsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  } as Response;
}

describe("reportPricing", () => {
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    vi.mocked(resolveSubmissionAccessContext).mockResolvedValue({
      submissionId: 42,
      userEmail: "user@example.com",
      userId: 7,
    });
    vi.mocked(ensurePersonalReportForSubmission).mockResolvedValue({
      id: 9,
    });
  });

  afterEach(() => {
    process.env.SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
  });

  describe("getDiscountAdjustment", () => {
    const initialPriceTimestamp = "2026-04-14T10:00:00.000Z";

    it.each([
      { now: "2026-04-14T10:00:00.000Z", step: 0, multiplier: 1 },
      { now: "2026-04-15T10:00:00.000Z", step: 1, multiplier: 0.75 },
      { now: "2026-04-17T10:00:00.000Z", step: 2, multiplier: 0.5 },
      { now: "2026-04-21T10:00:00.000Z", step: 3, multiplier: 0.35 },
      { now: "2026-04-28T10:00:00.000Z", step: 4, multiplier: 0.25 },
    ])("uses the expected ladder step at $now", ({ now, step, multiplier }) => {
      expect(
        getDiscountAdjustment({
          initialPriceTimestamp,
          now: new Date(now),
        })
      ).toEqual(
        expect.objectContaining({
          step,
          multiplier,
        })
      );
    });
  });

  it("recalculates the token quote on a later revisit and persists the new backend discount", async () => {
    const initialPriceTimestamp = "2026-04-14T10:00:00.000Z";
    const existingQuote = {
      id: 77,
      personal_report_id: 9,
      survey_submission_id: 42,
      user_id: 7,
      plan: "full_report",
      currency: "EUR",
      experiment_group: "B",
      base_price_bucket: "full_center",
      base_price: 29.99,
      current_price: 29.99,
      initial_price: 29.99,
      discount_step: 0,
      discount_multiplier: 1,
      pricing_cluster_id: "B-full_report-full_center-tier_2-desktop-google-serious-engaged-d0",
      country_tier: "tier_2",
      country_multiplier: 1,
      device_type: "Desktop",
      device_multiplier: 1.05,
      traffic_source: "google",
      traffic_multiplier: 1.1,
      behavioral_bucket: "serious",
      behavioral_multiplier: 1.2,
      engagement_score: 40,
      engagement_multiplier: 1.1,
      report_preview_views: 1,
      fantasy_signal_count: 1,
      survey_duration_ms: 600000,
      initial_price_timestamp: initialPriceTimestamp,
      expires_at: "2026-05-05T10:00:00.000Z",
      checkout_started_at: null,
      purchased_at: null,
      metadata: null,
      view_count: 1,
    };
    let patchedPayload: Record<string, unknown> | null = null;

    mockFetchWithTimeout.mockImplementation(
      async (url: string, options?: { body?: string; method?: string }) => {
        if (url.includes("/rest/v1/survey_submission?id=eq.42")) {
          return createJsonResponse([
            {
              id: 42,
              user_id: 7,
              utm_tracker: "utm_source=google",
              duration_ms: 600000,
              app_user: {
                id: 7,
                email: "user@example.com",
                utm_tracker: null,
                user_profile: {
                  location_primary: "Germany",
                },
              },
            },
          ]);
        }

        if (url.includes("/rest/v1/survey_submission_answer?survey_submission_id=eq.42")) {
          return createJsonResponse([
            {
              answer_option: { option_text: "Germany" },
              answer_text: null,
              normalized_value: null,
              survey_question: { frontend_qid: "15001" },
            },
            {
              answer_option: { option_text: "I want to seriously invest in my sex life" },
              answer_text: null,
              normalized_value: null,
              survey_question: { frontend_qid: "16012" },
            },
          ]);
        }

        if (url.includes("/rest/v1/report_session?personal_report_id=eq.9")) {
          return createJsonResponse([{ id: 1 }]);
        }

        if (
          url.includes("/rest/v1/report_price_quote?personal_report_id=eq.9&plan=eq.full_report")
        ) {
          return createJsonResponse([existingQuote]);
        }

        if (options?.method === "PATCH" && url.includes("/rest/v1/report_price_quote?id=eq.77")) {
          patchedPayload = JSON.parse(options.body ?? "{}") as Record<string, unknown>;
          return createJsonResponse([{ ...existingQuote, ...patchedPayload }]);
        }

        throw new Error(`Unexpected fetch call: ${options?.method ?? "GET"} ${url}`);
      }
    );

    const quote = await getReportPriceQuoteForContext({
      now: new Date("2026-04-15T10:00:00.000Z"),
      plan: "full_report",
      pricingSessionId: "550e8400-e29b-41d4-a716-446655440001",
      reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
    });

    expect(quote).toEqual(
      expect.objectContaining({
        currentPriceCents: 2249,
        discountMultiplier: 0.75,
        discountStep: 1,
        initialPriceCents: 2999,
        initialPriceTimestamp,
      })
    );
    expect(patchedPayload).toEqual(
      expect.objectContaining({
        current_price: 22.49,
        discount_multiplier: 0.75,
        discount_step: 1,
      })
    );
    expect(patchedPayload?.metadata).toEqual(
      expect.objectContaining({
        reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
        sessionLocks: [
          expect.objectContaining({
            pricingSessionId: "550e8400-e29b-41d4-a716-446655440001",
            currentPriceCents: 2249,
            discountMultiplier: 0.75,
            discountStep: 1,
          }),
        ],
      })
    );
  });

  it("reuses the original same-session quote during checkout validation even after the ladder has stepped down", async () => {
    const pricingSessionId = "550e8400-e29b-41d4-a716-446655440010";
    const storedQuote = {
      id: 77,
      personal_report_id: 9,
      survey_submission_id: 42,
      user_id: 7,
      plan: "full_report",
      currency: "EUR",
      experiment_group: "B",
      base_price_bucket: "full_center",
      base_price: 29.99,
      current_price: 22.49,
      initial_price: 29.99,
      discount_step: 1,
      discount_multiplier: 0.75,
      pricing_cluster_id: "B-full_report-full_center-tier_2-desktop-google-serious-engaged-d1",
      country_tier: "tier_2",
      country_multiplier: 1,
      device_type: "Desktop",
      device_multiplier: 1.05,
      traffic_source: "google",
      traffic_multiplier: 1.1,
      behavioral_bucket: "serious",
      behavioral_multiplier: 1.2,
      engagement_score: 40,
      engagement_multiplier: 1.1,
      report_preview_views: 1,
      fantasy_signal_count: 1,
      survey_duration_ms: 600000,
      initial_price_timestamp: "2026-04-14T10:00:00.000Z",
      expires_at: "2026-05-05T10:00:00.000Z",
      checkout_started_at: null,
      purchased_at: null,
      metadata: {
        sessionLocks: [
          {
            pricingSessionId,
            currentPriceCents: 2999,
            discountMultiplier: 1,
            discountStep: 0,
            lockedAt: "2026-04-14T10:00:00.000Z",
          },
        ],
      },
      view_count: 2,
    };

    mockFetchWithTimeout.mockImplementation(
      async (url: string, _options?: { body?: string; method?: string }) => {
        if (url.includes("/rest/v1/survey_submission?id=eq.42")) {
          return createJsonResponse([
            {
              id: 42,
              user_id: 7,
              utm_tracker: "utm_source=google",
              duration_ms: 600000,
              app_user: {
                id: 7,
                email: "user@example.com",
                utm_tracker: null,
                user_profile: {
                  location_primary: "Germany",
                },
              },
            },
          ]);
        }

        if (url.includes("/rest/v1/survey_submission_answer?survey_submission_id=eq.42")) {
          return createJsonResponse([]);
        }

        if (url.includes("/rest/v1/report_session?personal_report_id=eq.9")) {
          return createJsonResponse([{ id: 1 }]);
        }

        if (url.includes("/rest/v1/report_price_quote?id=eq.77&select=*&limit=1")) {
          return createJsonResponse([storedQuote]);
        }

        throw new Error(`Unexpected fetch call: ${url}`);
      }
    );

    const quote = await getReportPriceQuoteForContext({
      plan: "full_report",
      pricingSessionId,
      quoteId: 77,
      reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
    });

    expect(quote).toEqual(
      expect.objectContaining({
        currentPriceCents: 2999,
        discountMultiplier: 1,
        discountStep: 0,
      })
    );
  });
});
