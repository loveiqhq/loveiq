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
  getPricingBucketsForPlan,
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

  describe("getDiscountAdjustment per plan (Pricing.xlsx)", () => {
    const initialPriceTimestamp = "2026-04-14T10:00:00.000Z";

    it.each([
      { now: "2026-04-14T10:00:00.000Z", step: 0, multiplier: 1 },
      { now: "2026-04-15T10:00:00.000Z", step: 1, multiplier: 0.9 },
      { now: "2026-04-17T10:00:00.000Z", step: 2, multiplier: 0.7 },
      { now: "2026-04-21T10:00:00.000Z", step: 3, multiplier: 0.5 },
      { now: "2026-04-28T10:00:00.000Z", step: 4, multiplier: 0.3 },
    ])("full_report ladder at $now → step $step ×$multiplier", ({ now, step, multiplier }) => {
      expect(
        getDiscountAdjustment({ initialPriceTimestamp, now: new Date(now), plan: "full_report" })
      ).toEqual(expect.objectContaining({ step, multiplier }));
    });

    it.each([
      { now: "2026-04-14T10:00:00.000Z", step: 0, multiplier: 1 },
      { now: "2026-04-15T10:00:00.000Z", step: 1, multiplier: 0.9 },
      { now: "2026-04-17T10:00:00.000Z", step: 2, multiplier: 0.7 },
      { now: "2026-04-21T10:00:00.000Z", step: 3, multiplier: 0.5 },
      { now: "2026-04-28T10:00:00.000Z", step: 4, multiplier: 0.3 },
    ])("essentials ladder at $now → step $step ×$multiplier", ({ now, step, multiplier }) => {
      expect(
        getDiscountAdjustment({ initialPriceTimestamp, now: new Date(now), plan: "essentials" })
      ).toEqual(expect.objectContaining({ step, multiplier }));
    });

    it.each([
      { now: "2026-04-14T10:00:00.000Z", step: 0, multiplier: 1 },
      { now: "2026-04-15T10:00:00.000Z", step: 1, multiplier: 0.9 },
      { now: "2026-04-17T10:00:00.000Z", step: 2, multiplier: 0.7 },
      // All Reports caps at -30% past 72h per Pricing.xlsx column H.
      { now: "2026-04-21T10:00:00.000Z", step: 3, multiplier: 0.7 },
      { now: "2026-04-28T10:00:00.000Z", step: 4, multiplier: 0.7 },
    ])("all_reports ladder at $now → step $step ×$multiplier", ({ now, step, multiplier }) => {
      expect(
        getDiscountAdjustment({ initialPriceTimestamp, now: new Date(now), plan: "all_reports" })
      ).toEqual(expect.objectContaining({ step, multiplier }));
    });
  });

  describe("bucket catalogue (Pricing.xlsx)", () => {
    it("essentials buckets match xlsx MSRP / starting-sale pairs", () => {
      expect(getPricingBucketsForPlan("essentials")).toEqual([
        { code: "A", weight: 20, msrpCents: 2999, startingCents: 1999 },
        { code: "B", weight: 10, msrpCents: 1999, startingCents: 1499 },
        { code: "C", weight: 70, msrpCents: 999, startingCents: 499 },
      ]);
    });

    it("full_report buckets match xlsx MSRP / starting-sale pairs", () => {
      expect(getPricingBucketsForPlan("full_report")).toEqual([
        { code: "A", weight: 20, msrpCents: 6999, startingCents: 3499 },
        { code: "B", weight: 10, msrpCents: 5999, startingCents: 2999 },
        { code: "C", weight: 70, msrpCents: 4999, startingCents: 899 },
      ]);
    });

    it("all_reports buckets match xlsx MSRP / starting-sale pairs", () => {
      expect(getPricingBucketsForPlan("all_reports")).toEqual([
        { code: "A", weight: 20, msrpCents: 35900, startingCents: 17950 },
        { code: "B", weight: 10, msrpCents: 25900, startingCents: 12950 },
        { code: "C", weight: 70, msrpCents: 15900, startingCents: 4999 },
      ]);
    });

    it("weights sum to 100 per plan", () => {
      for (const plan of ["essentials", "full_report", "all_reports"] as const) {
        const total = getPricingBucketsForPlan(plan).reduce((s, b) => s + b.weight, 0);
        expect(total).toBe(100);
      }
    });
  });

  it("applies the new ladder to the starting-sale price when revisiting a legacy quote", async () => {
    // Legacy row — pre-2026-04 migration, so msrp/starting_price are null.
    // Engine falls back to `base_price` as both the msrp and starting
    // anchor, then applies the new full_report ladder at step 1 (24h = 0.9).
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
      msrp: null,
      starting_price: null,
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

    // Starting anchor = €29.99 (base_price fallback) × 0.9 = €26.99.
    expect(quote).toEqual(
      expect.objectContaining({
        currentPriceCents: 2699,
        discountMultiplier: 0.9,
        discountStep: 1,
        initialPriceCents: 2999,
        initialPriceTimestamp,
        msrpCents: 2999,
        startingPriceCents: 2999,
      })
    );
    expect(patchedPayload).toEqual(
      expect.objectContaining({
        current_price: 26.99,
        discount_multiplier: 0.9,
        discount_step: 1,
      })
    );
    expect(patchedPayload?.metadata).toEqual(
      expect.objectContaining({
        reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
        sessionLocks: [
          expect.objectContaining({
            pricingSessionId: "550e8400-e29b-41d4-a716-446655440001",
            currentPriceCents: 2699,
            discountMultiplier: 0.9,
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
      base_price_bucket: "B",
      base_price: 59.99,
      msrp: 59.99,
      starting_price: 29.99,
      current_price: 26.99,
      initial_price: 29.99,
      discount_step: 1,
      discount_multiplier: 0.9,
      pricing_cluster_id: "B-full_report-B-tier_2-desktop-google-serious-engaged-d1",
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

    mockFetchWithTimeout.mockImplementation(async (url: string) => {
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
    });

    const quote = await getReportPriceQuoteForContext({
      plan: "full_report",
      pricingSessionId,
      quoteId: 77,
      reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
    });

    // Session lock pins the original 29.99 price — ladder progress is ignored
    // within the same pricingSessionId.
    expect(quote).toEqual(
      expect.objectContaining({
        currentPriceCents: 2999,
        discountMultiplier: 1,
        discountStep: 0,
        msrpCents: 5999,
        startingPriceCents: 2999,
      })
    );
  });

  it("persists new msrp + starting_price columns when creating a fresh quote", async () => {
    let createdPayload: Record<string, unknown> | null = null;

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
                user_profile: { location_primary: "Germany" },
              },
            },
          ]);
        }

        if (url.includes("/rest/v1/survey_submission_answer?survey_submission_id=eq.42")) {
          return createJsonResponse([]);
        }

        if (url.includes("/rest/v1/report_session?personal_report_id=eq.9")) {
          return createJsonResponse([]);
        }

        if (
          url.includes("/rest/v1/report_price_quote?personal_report_id=eq.9&plan=eq.full_report")
        ) {
          return createJsonResponse([]);
        }

        if (options?.method === "POST" && url.includes("/rest/v1/report_price_quote")) {
          createdPayload = JSON.parse(options.body ?? "{}") as Record<string, unknown>;
          return createJsonResponse([
            {
              id: 91,
              personal_report_id: 9,
              survey_submission_id: 42,
              user_id: 7,
              ...createdPayload,
              checkout_started_at: null,
              purchased_at: null,
            },
          ]);
        }

        throw new Error(`Unexpected fetch call: ${options?.method ?? "GET"} ${url}`);
      }
    );

    const quote = await getReportPriceQuoteForContext({
      plan: "full_report",
      pricingSessionId: "550e8400-e29b-41d4-a716-446655440111",
      reportSessionId: "550e8400-e29b-41d4-a716-446655440222",
    });

    expect(quote.experimentGroup).toMatch(/^[AB]$/);
    expect(quote.basePriceBucket).toMatch(/^[ABC]$/);
    expect(quote.msrpCents).toBeGreaterThan(0);
    expect(quote.startingPriceCents).toBeGreaterThan(0);
    // MSRP is always ≥ starting (xlsx: ratio is 0.5 or 0.75 depending on plan).
    expect(quote.msrpCents).toBeGreaterThan(quote.startingPriceCents);
    expect(createdPayload).toEqual(
      expect.objectContaining({
        experiment_group: quote.experimentGroup,
        base_price_bucket: quote.basePriceBucket,
        msrp: quote.msrpCents / 100,
        starting_price: quote.startingPriceCents / 100,
      })
    );
  });
});
