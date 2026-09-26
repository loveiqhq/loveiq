import { beforeEach, describe, expect, it, vi } from "vitest";

// The switch in lockedBlurCopy.ts decides what rides under the blur. These tests run
// in its decoy position (nothing paid past the wall) unless one says otherwise; the
// default since review 26.09 is the real copy, pinned at the boundary below and in
// lockedBlurCopy2609.test.ts.
const blurCopy = vi.hoisted(() => ({ mode: "decoy" as "real" | "decoy" }));
vi.mock("@features/report/server/lockedBlurCopy", () => ({
  get LOCKED_BLUR_COPY() {
    return blurCopy.mode;
  },
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockVerifyCsrf = vi.fn<() => Promise<boolean>>();
vi.mock("@shared/http/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockVerifyCsrf(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
const mockGetClientIp = vi.fn();
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: (...args: unknown[]) => mockGetClientIp(...args),
}));

const mockFetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

// F-12 paywall kill switch. Default ENFORCED (true) so existing tests see
// normal gating; the kill-switch test flips it to false.
const mockIsFeatureEnabled = vi.fn<() => Promise<boolean>>();
vi.mock("@shared/flags/system-flags", () => ({
  isFeatureEnabled: (...args: unknown[]) => mockIsFeatureEnabled(...(args as [])),
}));

vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
  CircuitOpenError: class CircuitOpenError extends Error {},
}));

vi.mock("@features/report/server/personalReport", () => ({
  ensurePersonalReportForSubmission: vi.fn().mockResolvedValue({ id: 99 }),
  getReportAccessPlanForSubmission: vi.fn().mockResolvedValue({
    accessPlan: null,
    archetypeTiers: {},
    personalReportId: 99,
    unlockedArchetypeColumn: [],
  }),
  recordReportSessionView: vi.fn().mockResolvedValue(undefined),
  resolveUnlockedArchetypeTiers: vi.fn(() => ({})),
  resolveUnlockedArchetypes: vi.fn(() => []),
}));

vi.mock("@features/pricing/logic/reportPricing", () => ({
  getReportPriceQuotesForContext: vi.fn().mockResolvedValue(null),
}));

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";

import { GET } from "@/app/api/report/route";
import {
  getReportAccessPlanForSubmission,
  recordReportSessionView,
} from "@features/report/server/personalReport";
import { getReportPriceQuotesForContext } from "@features/pricing/logic/reportPricing";

function makeRequest(sessionId = "550e8400-e29b-41d4-a716-446655440000", query = "") {
  return new Request(`http://localhost:3000/api/report?sessionId=${sessionId}${query}`);
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
    vi.mocked(getReportAccessPlanForSubmission).mockResolvedValue({
      accessPlan: null,
      archetypeTiers: {},
      personalReportId: 99,
      unlockedArchetypeColumn: [],
    });
    vi.mocked(getReportPriceQuotesForContext).mockResolvedValue(null);
    vi.mocked(recordReportSessionView).mockResolvedValue(undefined);
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    // Default: paywall ENFORCED. Individual tests override to false.
    mockIsFeatureEnabled.mockResolvedValue(true);
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
            utm_tracker: "utm_source=google",
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
            app_user: { first_name: "Eman", email: "eman@example.com" },
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
    expect(json).toMatchObject({
      userName: "Eman",
      userEmail: "eman@example.com",
      ownerFirstName: null,
      viewMode: "owner",
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
      unlockedArchetypes: [],
    });
    expect("ownerToken" in json).toBe(true);

    const submissionLookupUrl = mockFetchWithTimeout.mock.calls[0][0] as string;
    const snapshotAnswerLookupUrl = mockFetchWithTimeout.mock.calls[2][0] as string;
    expect(submissionLookupUrl).toContain("created_date_time");
    expect(submissionLookupUrl).toContain("utm_tracker");
    expect(submissionLookupUrl).toContain("app_user!fk_survey_submission_user(first_name,email)");
    expect(submissionLookupUrl).not.toContain("select=id,first_name,created_at");
    expect(snapshotAnswerLookupUrl).toContain("survey_question!inner(frontend_qid)");
    expect(snapshotAnswerLookupUrl).toContain("survey_question.frontend_qid=in.(01002,16013)");
    expect(recordReportSessionView).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddress: "1.2.3.4",
        personalReportId: 99,
        userAgent: null,
        userId: 77,
      })
    );
  });

  it("F-12: unlocks the whole report (accessPlan=all_reports) when report_paywall_enforced is off", async () => {
    allowCsrf();
    allowRateLimit();
    // getReportAccessPlanForSubmission resolves to a free/no-plan user...
    vi.mocked(getReportAccessPlanForSubmission).mockResolvedValue({
      accessPlan: null,
      archetypeTiers: {},
      personalReportId: 99,
      unlockedArchetypeColumn: [],
    });
    // ...but the kill switch is OFF → the route overrides to all_reports.
    mockIsFeatureEnabled.mockResolvedValue(false);
    mockFetchWithTimeout
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 55,
            user_id: 77,
            created_date_time: "2026-04-07T22:23:16.851299+00:00",
            app_user: { first_name: "Eman", email: "eman@example.com" },
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
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    const res = await GET(makeRequest("02d88f31-eceb-4402-940d-c8cd98d01848"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.accessPlan).toBe("all_reports");
    expect(mockIsFeatureEnabled).toHaveBeenCalledWith("report_paywall_enforced", true);
  });

  it("F-12: keeps the paywall (accessPlan stays null) when the flag is enforced", async () => {
    allowCsrf();
    allowRateLimit();
    vi.mocked(getReportAccessPlanForSubmission).mockResolvedValue({
      accessPlan: null,
      archetypeTiers: {},
      personalReportId: 99,
      unlockedArchetypeColumn: [],
    });
    mockIsFeatureEnabled.mockResolvedValue(true); // enforced (default)
    mockFetchWithTimeout
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 55,
            user_id: 77,
            created_date_time: "2026-04-07T22:23:16.851299+00:00",
            app_user: { first_name: "Eman", email: "eman@example.com" },
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
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    const res = await GET(makeRequest("02d88f31-eceb-4402-940d-c8cd98d01848"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.accessPlan).toBeNull();
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
      archetypeTiers: {},
      personalReportId: 99,
      unlockedArchetypeColumn: [],
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
        chargedPriceCents: 11499,
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
        chargedPriceCents: 1499,
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
        chargedPriceCents: 2749,
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

/**
 * Report 3.0's Accelerator & Brakes chapter at the HTTP boundary — what the route
 * actually ships. Gated on the same `accelUnlocked` as V2's `accelCopy`, so a
 * locked Spark Seeker receives the chapter with nothing paid past the wall, a paid
 * one receives all of it, and an archetype nobody has written yet receives null.
 */
describe("GET /api/report — Accelerator & Brakes (Report 3.0)", () => {
  const AB_PROBES = [
    "Control and possessiveness",
    "Spontaneity and controlled unpredictability",
    "A suggestive message on Wednesday",
    "Respect brakes that are protecting something real.",
  ];

  const queueSubmission = (primary: string) => {
    mockFetchWithTimeout
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 55,
            user_id: 77,
            created_date_time: "2026-04-07T22:23:16.851299+00:00",
            app_user: { first_name: "Eman", email: "eman@example.com" },
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            primary_archetype: primary,
            v5_primary_archetype: primary,
            percentages: { [primary]: 43 },
            v5_percentages: { [primary]: 43 },
            diagnostics: null,
          },
        ],
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });
  };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    mockGetClientIp.mockReturnValue("1.2.3.4");
    vi.mocked(getReportPriceQuotesForContext).mockResolvedValue(null);
    vi.mocked(recordReportSessionView).mockResolvedValue(undefined);
    mockIsFeatureEnabled.mockResolvedValue(true);
    allowCsrf();
    allowRateLimit();
  });

  it("ships a locked Spark Seeker the chapter with nothing paid past the wall", async () => {
    vi.mocked(getReportAccessPlanForSubmission).mockResolvedValue({
      accessPlan: null,
      archetypeTiers: {},
      personalReportId: 99,
      unlockedArchetypeColumn: [],
    });
    queueSubmission("Spark Seeker");
    const res = await GET(makeRequest("02d88f31-eceb-4402-940d-c8cd98d01848", "&v4=1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.accelerators.lockedFrom).toBe(2);
    expect(json.accelerators.practice.locked).toBe(true);
    expect(json.acceleratorsArticle.locked).toBe(true);
    const body = JSON.stringify(json);
    for (const probe of AB_PROBES) expect(body, probe).not.toContain(probe);
  });

  // Review 26.09 — Mark: "This should always be the unlocked content but blurred";
  // Fatih's call. In the switch's real position the locked chapter carries the copy
  // it draws blurred, still marked locked, so the page blurs it.
  it("ships a locked Spark Seeker the blurred rows and passages as written (real)", async () => {
    blurCopy.mode = "real";
    try {
      vi.mocked(getReportAccessPlanForSubmission).mockResolvedValue({
        accessPlan: null,
        archetypeTiers: {},
        personalReportId: 99,
        unlockedArchetypeColumn: [],
      });
      queueSubmission("Spark Seeker");
      const res = await GET(makeRequest("02d88f31-eceb-4402-940d-c8cd98d01848", "&v4=1"));
      const json = await res.json();
      expect(json.accelerators.lockedFrom).toBe(2);
      expect(json.accelerators.practice.locked).toBe(true);
      const body = JSON.stringify(json);
      for (const probe of AB_PROBES) expect(body, probe).toContain(probe);
    } finally {
      blurCopy.mode = "decoy";
    }
  });

  // Final review 26.09: the four V4 chapters were built for every request, so with
  // the real copy under the blur a locked reader of the DEFAULT report — which draws
  // none of them — received their paid copy in this response. Only a V4 page, which
  // says so with `v4=1`, gets them now.
  it("sends a request that is not V4 none of the four V4 chapters, even with the real copy", async () => {
    blurCopy.mode = "real";
    try {
      vi.mocked(getReportAccessPlanForSubmission).mockResolvedValue({
        accessPlan: null,
        archetypeTiers: {},
        personalReportId: 99,
        unlockedArchetypeColumn: [],
      });
      queueSubmission("Spark Seeker");
      const json = await (await GET(makeRequest("02d88f31-eceb-4402-940d-c8cd98d01848"))).json();
      for (const key of [
        "typicalBeliefs",
        "typicalBeliefsArticle",
        "accelerators",
        "acceleratorsArticle",
        "partnership",
        "fantasy",
        "fantasyArticle",
      ]) {
        expect(json[key], key).toBeNull();
      }
      const body = JSON.stringify(json);
      for (const probe of AB_PROBES) expect(body, probe).not.toContain(probe);
      // V2's own sections, which that page does draw, are untouched.
      expect(json.accelCopy).not.toBeNull();
    } finally {
      blurCopy.mode = "decoy";
    }
  });

  it("ships a paid Spark Seeker every word", async () => {
    vi.mocked(getReportAccessPlanForSubmission).mockResolvedValue({
      accessPlan: "full_report",
      archetypeTiers: {},
      personalReportId: 99,
      unlockedArchetypeColumn: [],
    });
    queueSubmission("Spark Seeker");
    const res = await GET(makeRequest("02d88f31-eceb-4402-940d-c8cd98d01848", "&v4=1"));
    const json = await res.json();
    expect(json.accelerators.lockedFrom).toBeNull();
    expect(json.acceleratorsArticle.locked).toBe(false);
    const body = JSON.stringify(json);
    for (const probe of AB_PROBES) expect(body, probe).toContain(probe);
  });

  it("ships null for an archetype without Report 3.0 copy, so V2's section stays", async () => {
    vi.mocked(getReportAccessPlanForSubmission).mockResolvedValue({
      accessPlan: null,
      archetypeTiers: {},
      personalReportId: 99,
      unlockedArchetypeColumn: [],
    });
    queueSubmission("Emotional Voyeur");
    const res = await GET(makeRequest("02d88f31-eceb-4402-940d-c8cd98d01848", "&v4=1"));
    const json = await res.json();
    expect(json.accelerators).toBeNull();
    expect(json.acceleratorsArticle).toBeNull();
    expect(json.accelCopy).not.toBeNull();
  });
});

/**
 * Report 3.0's Fantasy vs. Reality chapter at the HTTP boundary. Gated on the same
 * `fantasyUnlocked` as V2's `fantasyCopy` (section 27, full report only), so a
 * locked Spark Seeker receives the chapter with nothing paid past the wall, a paid
 * one receives all of it, and an archetype nobody has written yet receives null.
 */
describe("GET /api/report — Fantasy vs. Reality (Report 3.0)", () => {
  // "Common challenges" and the practice past its ramp: only ever seen blurred.
  const FVR_PROBES = [
    "Imagine being watched. In fantasy, the attention is flattering",
    "Reality cannot assume any of it.",
    "Finally, think in terms of translation rather than reproduction.",
    "A fantasy does not have to become reality to improve reality.",
  ];

  const queueSubmission = (primary: string) => {
    mockFetchWithTimeout
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 55,
            user_id: 77,
            created_date_time: "2026-04-07T22:23:16.851299+00:00",
            app_user: { first_name: "Eman", email: "eman@example.com" },
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            primary_archetype: primary,
            v5_primary_archetype: primary,
            percentages: { [primary]: 43 },
            v5_percentages: { [primary]: 43 },
            diagnostics: null,
          },
        ],
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });
  };

  const withPlan = (accessPlan: "essentials" | "full_report" | null) =>
    vi.mocked(getReportAccessPlanForSubmission).mockResolvedValue({
      accessPlan,
      archetypeTiers: {},
      personalReportId: 99,
      unlockedArchetypeColumn: [],
    });

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    mockGetClientIp.mockReturnValue("1.2.3.4");
    vi.mocked(getReportPriceQuotesForContext).mockResolvedValue(null);
    vi.mocked(recordReportSessionView).mockResolvedValue(undefined);
    mockIsFeatureEnabled.mockResolvedValue(true);
    allowCsrf();
    allowRateLimit();
  });

  it("ships a locked Spark Seeker the chapter with nothing paid past the wall", async () => {
    withPlan(null);
    queueSubmission("Spark Seeker");
    const res = await GET(makeRequest("02d88f31-eceb-4402-940d-c8cd98d01848", "&v4=1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fantasy.locked).toBe(true);
    expect(json.fantasy.table.locked).toBe(true);
    expect(json.fantasy.practice.locked).toBe(true);
    expect(json.fantasyArticle.locked).toBe(true);
    expect(json.fantasyCopy.locked).toBe(true);
    // The map's dots come from paid scores: none travel to a locked reader, V4's or
    // V2's (final review 2).
    expect(json.fantasy.mapDots).toBeNull();
    expect(json.fantasyDots).toBeNull();
    const body = JSON.stringify(json);
    for (const probe of FVR_PROBES) expect(body, probe).not.toContain(probe);
  });

  it("ships a locked Spark Seeker the blurred rows, the map's dots and the copy as written (real)", async () => {
    blurCopy.mode = "real";
    try {
      withPlan(null);
      queueSubmission("Spark Seeker");
      const res = await GET(makeRequest("02d88f31-eceb-4402-940d-c8cd98d01848", "&v4=1"));
      const json = await res.json();
      expect(json.fantasy.locked).toBe(true);
      expect(json.fantasy.table.locked).toBe(true);
      // V4's map draws its real dots blurred; V2's section keeps its own rule.
      expect(json.fantasy.mapDots).not.toBeNull();
      expect(json.fantasyDots).toBeNull();
      const body = JSON.stringify(json);
      for (const probe of FVR_PROBES) expect(body, probe).toContain(probe);
    } finally {
      blurCopy.mode = "decoy";
    }
  });

  // Final review 26.09: the default report draws no V4 chapter, so neither its copy
  // nor the map's dots (final review 2) may travel on a request that is not V4.
  it("keeps the chapter and the map's dots off a request that is not V4, even with the real copy", async () => {
    blurCopy.mode = "real";
    try {
      withPlan(null);
      queueSubmission("Spark Seeker");
      const json = await (await GET(makeRequest("02d88f31-eceb-4402-940d-c8cd98d01848"))).json();
      expect(json.fantasy).toBeNull();
      expect(json.fantasyArticle).toBeNull();
      expect(json.fantasyDots).toBeNull();
      const body = JSON.stringify(json);
      for (const probe of FVR_PROBES) expect(body, probe).not.toContain(probe);
    } finally {
      blurCopy.mode = "decoy";
    }
  });

  it("keeps it locked on essentials — it is a full-report chapter", async () => {
    withPlan("essentials");
    queueSubmission("Spark Seeker");
    const json = await (
      await GET(makeRequest("02d88f31-eceb-4402-940d-c8cd98d01848", "&v4=1"))
    ).json();
    expect(json.fantasy.locked).toBe(true);
    expect(json.fantasyArticle.locked).toBe(true);
    expect(json.fantasy.mapDots).toBeNull();
  });

  it("ships a paid Spark Seeker every word", async () => {
    withPlan("full_report");
    queueSubmission("Spark Seeker");
    const json = await (
      await GET(makeRequest("02d88f31-eceb-4402-940d-c8cd98d01848", "&v4=1"))
    ).json();
    expect(json.fantasy.locked).toBe(false);
    expect(json.fantasyArticle.locked).toBe(false);
    expect(json.fantasyCopy.locked).toBe(false);
    expect(json.fantasy.mapDots).toHaveLength(16);
    expect(json.fantasyDots).toHaveLength(16);
    const body = JSON.stringify(json);
    for (const probe of FVR_PROBES) expect(body, probe).toContain(probe);
  });

  it("ships null for an archetype without Report 3.0 copy, so V2's section stays", async () => {
    withPlan(null);
    queueSubmission("Emotional Voyeur");
    const json = await (
      await GET(makeRequest("02d88f31-eceb-4402-940d-c8cd98d01848", "&v4=1"))
    ).json();
    expect(json.fantasy).toBeNull();
    expect(json.fantasyArticle).toBeNull();
    expect(json.fantasyCopy).not.toBeNull();
  });
});
