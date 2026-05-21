import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.fn();
const mockIsEmailSuppressed = vi.fn();
const mockResendSend = vi.fn();
const mockStripePromoCreate = vi.fn();
const mockGetReportPlan = vi.fn();
const mockGetStripeClient = vi.fn();
const mockGetCouponIdForStage = vi.fn();

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
}));

vi.mock("@shared/emails/suppression", () => ({
  isEmailSuppressed: (...args: unknown[]) => mockIsEmailSuppressed(...args),
}));

vi.mock("@shared/emails/unsubscribe-token", () => ({
  buildUnsubscribeUrl: () => "https://test.loveiq.org/api/unsubscribe?token=x",
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@features/report/server/planAccess", () => ({
  getReportPlanByPersonalReportId: (...args: unknown[]) => mockGetReportPlan(...args),
}));

vi.mock("@features/checkout/server/stripeCheckout", () => ({
  getStripeServerClient: () => mockGetStripeClient(),
}));

vi.mock("@features/checkout/server/promoCodes", () => ({
  getCouponIdForStage: (...args: unknown[]) => mockGetCouponIdForStage(...args),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mockResendSend };
  },
}));

import { GET } from "@/app/api/cron/nurture-sequence/route";

const ORIGINAL_ENV = { ...process.env };

function makeRequest(token?: string): Request {
  return new Request("https://example.test/api/cron/nurture-sequence", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

interface MockFetchCall {
  match: (url: string, init?: { method?: string }) => boolean;
  respond: () => unknown;
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

/**
 * Build a fetch handler that scans `calls` for the first matching entry per
 * request. PATCH responses don't matter to the test (return-minimal).
 */
function buildFetchHandler(calls: MockFetchCall[]) {
  return (url: string, init?: { method?: string }) => {
    for (const c of calls) {
      if (c.match(url, init)) return Promise.resolve(c.respond());
    }
    // Default: empty list (lets the route harmlessly find "no candidates").
    return Promise.resolve(jsonResponse([]));
  };
}

describe("GET /api/cron/nurture-sequence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      CRON_SECRET: "test-cron-secret",
      RESEND_API_KEY: "re_test_key",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      STRIPE_COUPON_50: "nurture_50",
      STRIPE_COUPON_75: "nurture_75",
      NEXT_PUBLIC_SITE_URL: "https://test.loveiq.org",
    };
    mockGetReportPlan.mockResolvedValue(null);
    mockIsEmailSuppressed.mockResolvedValue(false);
    mockResendSend.mockResolvedValue({ data: { id: "msg_1" }, error: null });
    mockGetCouponIdForStage.mockImplementation((stage: string) =>
      stage === "30h_no_unlock" ? "nurture_50" : stage === "54h_no_unlock" ? "nurture_75" : null
    );
    mockGetStripeClient.mockReturnValue({
      promotionCodes: { create: (args: unknown) => mockStripePromoCreate(args) },
    });
    mockStripePromoCreate.mockResolvedValue({ id: "promo_xyz" });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns 401 when authorization is wrong", async () => {
    const res = await GET(makeRequest("wrong"));
    expect(res.status).toBe(401);
  });

  it("returns 503 without CRON_SECRET", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest("anything"));
    expect(res.status).toBe(503);
  });

  it("returns success with zero candidates across all windows", async () => {
    mockFetchWithTimeout.mockImplementation(buildFetchHandler([]));
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.summaries["6h_no_view"].sent).toBe(0);
    expect(body.summaries["30h_no_unlock"].sent).toBe(0);
  });

  // The 3 fetchCandidatesByAge calls are dispatched via Promise.all in fixed
  // order: 6h, 30h, 54h. We mock by call-index — robust against URL encoding
  // of the timestamp differences.
  function mockCandidateWindows({
    sixHour,
    thirtyHour,
    fiftyFourHour,
    quoteMetadata = {},
    accessToken = "rpt_AbCdEfGhIjKlMnOpQrSt",
    patchSpy,
  }: {
    sixHour: unknown[];
    thirtyHour: unknown[];
    fiftyFourHour: unknown[];
    quoteMetadata?: Record<string, unknown>;
    accessToken?: string | null;
    patchSpy?: () => unknown;
  }) {
    let personalReportCalls = 0;
    mockFetchWithTimeout.mockImplementation((url: string, init?: { method?: string }) => {
      if (url.includes("/rest/v1/personal_report")) {
        personalReportCalls += 1;
        if (personalReportCalls === 1) return Promise.resolve(jsonResponse(sixHour));
        if (personalReportCalls === 2) return Promise.resolve(jsonResponse(thirtyHour));
        if (personalReportCalls === 3) return Promise.resolve(jsonResponse(fiftyFourHour));
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes("/rest/v1/report_price_quote") && init?.method !== "PATCH") {
        return Promise.resolve(jsonResponse([{ id: 101, metadata: quoteMetadata }]));
      }
      if (url.includes("/rest/v1/report_access_token")) {
        return Promise.resolve(jsonResponse(accessToken ? [{ token: accessToken }] : []));
      }
      if (init?.method === "PATCH") {
        return Promise.resolve(patchSpy ? patchSpy() : jsonResponse({}, 204));
      }
      return Promise.resolve(jsonResponse([]));
    });
  }

  it("routes a 30h candidate through promo creation + send + metadata write", async () => {
    const candidate = {
      id: 42,
      survey_submission_id: 7,
      created_date_time: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
      survey_submission: { app_user: { email: "user@example.com", first_name: "Sam" } },
    };
    const patchSpy = vi.fn(() => jsonResponse({}, 204));

    mockCandidateWindows({
      sixHour: [],
      thirtyHour: [candidate],
      fiftyFourHour: [],
      quoteMetadata: { nurtureEmailsSent: [] },
      patchSpy,
    });

    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summaries["30h_no_unlock"].sent).toBe(1);

    expect(mockStripePromoCreate).toHaveBeenCalledTimes(1);
    const stripeArgs = mockStripePromoCreate.mock.calls[0][0];
    expect(stripeArgs.promotion).toEqual({ type: "coupon", coupon: "nurture_50" });
    expect(stripeArgs.max_redemptions).toBe(1);
    expect(stripeArgs.code).toMatch(/^LIQ-50-[A-Za-z0-9]{8}$/);

    expect(mockResendSend).toHaveBeenCalledTimes(1);
    const sent = mockResendSend.mock.calls[0][0];
    expect(sent.to).toBe("user@example.com");
    expect(sent.subject).toMatch(/50%.*expires/i);
    expect(sent.html).toContain(stripeArgs.code);

    expect(patchSpy).toHaveBeenCalled();
  });

  it("skips a candidate whose nurtureEmailsSent already includes the stage", async () => {
    const candidate = {
      id: 99,
      survey_submission_id: 9,
      created_date_time: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
      survey_submission: { app_user: { email: "already@example.com", first_name: "Al" } },
    };
    mockCandidateWindows({
      sixHour: [],
      thirtyHour: [candidate],
      fiftyFourHour: [],
      quoteMetadata: { nurtureEmailsSent: ["30h_no_unlock"] },
    });

    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summaries["30h_no_unlock"].sent).toBe(0);
    expect(body.summaries["30h_no_unlock"].skippedAlreadySent).toBe(1);
    expect(mockStripePromoCreate).not.toHaveBeenCalled();
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("skips a candidate who already has a paid plan", async () => {
    mockGetReportPlan.mockResolvedValueOnce("full_report");
    const candidate = {
      id: 50,
      survey_submission_id: 5,
      created_date_time: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
      survey_submission: { app_user: { email: "paid@example.com", first_name: "Pay" } },
    };
    mockCandidateWindows({
      sixHour: [],
      thirtyHour: [candidate],
      fiftyFourHour: [],
      quoteMetadata: {},
    });

    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();
    expect(body.summaries["30h_no_unlock"].skippedPaid).toBe(1);
    expect(mockStripePromoCreate).not.toHaveBeenCalled();
  });
});
