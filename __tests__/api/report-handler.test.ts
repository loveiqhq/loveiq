import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockVerifyCsrf = vi.fn<() => Promise<boolean>>();
vi.mock("../../lib/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockVerifyCsrf(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
const mockGetClientIp = vi.fn();
vi.mock("../../lib/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: (...args: unknown[]) => mockGetClientIp(...args),
}));

const mockFetchWithTimeout = vi.fn();
vi.mock("../../lib/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

vi.mock("../../lib/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
  CircuitOpenError: class CircuitOpenError extends Error {},
}));

vi.mock("../../lib/report/personalReport", () => ({
  ensurePersonalReportForSubmission: vi.fn().mockResolvedValue({ id: 99 }),
  getReportAccessPlanForSubmission: vi.fn().mockResolvedValue({
    accessPlan: null,
    personalReportId: 99,
  }),
  recordReportSessionView: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/pricing/reportPricing", () => ({
  getReportPriceQuotesForContext: vi.fn().mockResolvedValue(null),
}));

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";

import { GET } from "../../app/api/report/route";
import { getReportAccessPlanForSubmission } from "../../lib/report/personalReport";
import { getReportPriceQuotesForContext } from "../../lib/pricing/reportPricing";

function makeRequest(sessionId = "550e8400-e29b-41d4-a716-446655440000") {
  return new Request(`http://localhost:3000/api/report?sessionId=${sessionId}`);
}

function allowCsrf() {
  mockVerifyCsrf.mockResolvedValue(true);
}

function allowRateLimit() {
  mockCheckRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetAt: new Date(Date.now() + 60_000),
  });
}

describe("GET /api/report", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    mockGetClientIp.mockReturnValue("1.2.3.4");
    vi.mocked(getReportPriceQuotesForContext).mockResolvedValue(null);
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: async () => [],
    });
  });

  it("returns 403 when CSRF token is invalid", async () => {
    mockVerifyCsrf.mockResolvedValue(false);

    const res = await GET(makeRequest());
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.error).toBe("Invalid request.");
  });

  it("returns 429 when rate limited", async () => {
    allowCsrf();
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 20_000),
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(429);

    const json = await res.json();
    expect(json.error).toBe("Please try again later.");
    expect(res.headers.get("Retry-After")).toBeDefined();
  });

  it("returns 400 when sessionId is not a valid UUID", async () => {
    allowCsrf();
    allowRateLimit();

    const res = await GET(makeRequest("not-a-uuid"));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("Invalid input");
  });

  it("returns 404 when no submission matches the session id", async () => {
    allowCsrf();
    allowRateLimit();
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.error).toBe("Report not found.");
  });

  it("returns 404 when the submission exists but scoring is missing", async () => {
    allowCsrf();
    allowRateLimit();
    mockFetchWithTimeout
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 55,
            user_id: 77,
            created_date_time: "2026-04-07T22:23:16.851299+00:00",
            app_user: { first_name: "Eman" },
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

    const res = await GET(makeRequest("02d88f31-eceb-4402-940d-c8cd98d01848"));
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.error).toBe("Report not found.");
  });

  it("returns the report using the live submission schema shape", async () => {
    allowCsrf();
    allowRateLimit();
    mockFetchWithTimeout
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 55,
            user_id: 77,
            created_date_time: "2026-04-07T22:23:16.851299+00:00",
            app_user: { first_name: "Eman" },
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            primary_archetype: "Spark Seeker",
            v5_primary_archetype: "Emotional Voyeur",
            percentages: { "Spark Seeker": 41 },
            v5_percentages: { "Emotional Voyeur": 63 },
            diagnostics: { overlaysEnum: { sexual_stage: "exploring" } },
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            normalized_value: 3,
            survey_question: { frontend_qid: "01002" },
          },
          {
            normalized_value: 5,
            survey_question: { frontend_qid: "16013" },
          },
        ],
      });

    const res = await GET(makeRequest("02d88f31-eceb-4402-940d-c8cd98d01848"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual({
      userName: "Eman",
      accessPlan: null,
      primaryArchetype: "Emotional Voyeur",
      percentages: { "Emotional Voyeur": 63 },
      reportDate: "2026-04-07T22:23:16.851299+00:00",
      diagnostics: { overlaysEnum: { sexual_stage: "exploring" } },
      snapshotAnswers: {
        currentSexualSatisfaction: 3,
        importanceOfSex: 5,
      },
      pricingQuotes: null,
    });

    const submissionLookupUrl = mockFetchWithTimeout.mock.calls[0][0] as string;
    const snapshotAnswerLookupUrl = mockFetchWithTimeout.mock.calls[2][0] as string;
    expect(submissionLookupUrl).toContain("created_date_time");
    expect(submissionLookupUrl).toContain("app_user!fk_survey_submission_user(first_name)");
    expect(submissionLookupUrl).not.toContain("select=id,first_name,created_at");
    expect(snapshotAnswerLookupUrl).toContain("survey_question!inner(frontend_qid)");
    expect(snapshotAnswerLookupUrl).toContain("survey_question.frontend_qid=in.(01002,16013)");
  });

  it("returns a null satisfaction snapshot answer when question 01002 is missing", async () => {
    allowCsrf();
    allowRateLimit();
    mockFetchWithTimeout
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 55,
            user_id: 77,
            created_date_time: "2026-04-07T22:23:16.851299+00:00",
            app_user: { first_name: "Eman" },
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            primary_archetype: "Spark Seeker",
            v5_primary_archetype: "Emotional Voyeur",
            percentages: { "Spark Seeker": 41 },
            v5_percentages: { "Emotional Voyeur": 63 },
            diagnostics: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

    const res = await GET(makeRequest("02d88f31-eceb-4402-940d-c8cd98d01848"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.snapshotAnswers).toEqual({
      currentSexualSatisfaction: null,
      importanceOfSex: null,
    });
  });

  it("returns the purchased backend access plan when the report has been paid", async () => {
    allowCsrf();
    allowRateLimit();
    vi.mocked(getReportAccessPlanForSubmission).mockResolvedValueOnce({
      accessPlan: "full_report",
      personalReportId: 99,
    });

    mockFetchWithTimeout
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 55,
            user_id: 77,
            created_date_time: "2026-04-07T22:23:16.851299+00:00",
            app_user: { first_name: "Eman" },
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            primary_archetype: "Spark Seeker",
            v5_primary_archetype: "Emotional Voyeur",
            percentages: { "Spark Seeker": 41 },
            v5_percentages: { "Emotional Voyeur": 63 },
            diagnostics: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

    const res = await GET(makeRequest("02d88f31-eceb-4402-940d-c8cd98d01848"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.accessPlan).toBe("full_report");
  });

  it("returns pricing quotes for unpaid reports", async () => {
    allowCsrf();
    allowRateLimit();
    vi.mocked(getReportPriceQuotesForContext).mockResolvedValueOnce({
      all_reports: {
        id: 3,
        plan: "all_reports",
        currency: "EUR",
        experimentGroup: "B",
        basePriceBucket: "all_center",
        basePriceCents: 12999,
        currentPriceCents: 11499,
        initialPriceCents: 12999,
        discountMultiplier: 1,
        discountStep: 0,
        pricingClusterId: "B-all_reports-all_center-tier_2-desktop-google-serious-engaged-d0",
        countryTier: "tier_2",
        countryMultiplier: 1,
        deviceType: "Desktop",
        deviceMultiplier: 1.05,
        trafficSource: "google",
        trafficMultiplier: 1.1,
        behavioralBucket: "serious",
        behavioralMultiplier: 1.2,
        engagementScore: 40,
        engagementMultiplier: 1.1,
        reportPreviewViews: 2,
        fantasySignalCount: 1,
        surveyDurationMs: 600000,
        initialPriceTimestamp: "2026-04-14T10:00:00.000Z",
        expiresAt: "2026-05-05T10:00:00.000Z",
        checkoutStartedAt: null,
        purchasedAt: null,
        viewCount: 1,
      },
      essentials: {
        id: 1,
        plan: "essentials",
        currency: "EUR",
        experimentGroup: "B",
        basePriceBucket: "essentials_center",
        basePriceCents: 1499,
        currentPriceCents: 1499,
        initialPriceCents: 1499,
        discountMultiplier: 1,
        discountStep: 0,
        pricingClusterId: "B-essentials-essentials_center-tier_2-desktop-google-serious-engaged-d0",
        countryTier: "tier_2",
        countryMultiplier: 1,
        deviceType: "Desktop",
        deviceMultiplier: 1.05,
        trafficSource: "google",
        trafficMultiplier: 1.1,
        behavioralBucket: "serious",
        behavioralMultiplier: 1.2,
        engagementScore: 40,
        engagementMultiplier: 1.1,
        reportPreviewViews: 2,
        fantasySignalCount: 1,
        surveyDurationMs: 600000,
        initialPriceTimestamp: "2026-04-14T10:00:00.000Z",
        expiresAt: "2026-05-05T10:00:00.000Z",
        checkoutStartedAt: null,
        purchasedAt: null,
        viewCount: 1,
      },
      full_report: {
        id: 2,
        plan: "full_report",
        currency: "EUR",
        experimentGroup: "B",
        basePriceBucket: "full_center",
        basePriceCents: 2999,
        currentPriceCents: 2749,
        initialPriceCents: 2999,
        discountMultiplier: 1,
        discountStep: 0,
        pricingClusterId: "B-full_report-full_center-tier_2-desktop-google-serious-engaged-d0",
        countryTier: "tier_2",
        countryMultiplier: 1,
        deviceType: "Desktop",
        deviceMultiplier: 1.05,
        trafficSource: "google",
        trafficMultiplier: 1.1,
        behavioralBucket: "serious",
        behavioralMultiplier: 1.2,
        engagementScore: 40,
        engagementMultiplier: 1.1,
        reportPreviewViews: 2,
        fantasySignalCount: 1,
        surveyDurationMs: 600000,
        initialPriceTimestamp: "2026-04-14T10:00:00.000Z",
        expiresAt: "2026-05-05T10:00:00.000Z",
        checkoutStartedAt: null,
        purchasedAt: null,
        viewCount: 1,
      },
    });

    mockFetchWithTimeout
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 55,
            user_id: 77,
            created_date_time: "2026-04-07T22:23:16.851299+00:00",
            app_user: { first_name: "Eman" },
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            primary_archetype: "Spark Seeker",
            v5_primary_archetype: "Emotional Voyeur",
            percentages: { "Spark Seeker": 41 },
            v5_percentages: { "Emotional Voyeur": 63 },
            diagnostics: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

    const res = await GET(makeRequest("02d88f31-eceb-4402-940d-c8cd98d01848"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pricingQuotes?.full_report?.currentPriceCents).toBe(2749);
  });
});
