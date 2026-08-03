import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.fn();
const mockIsEmailSuppressed = vi.fn();
const mockResendSend = vi.fn();
const mockStripePromoCreate = vi.fn();
const mockStripePromoUpdate = vi.fn();
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

vi.mock("@shared/emails/unsubscribe-token", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/emails/unsubscribe-token")>()),
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

// Bypass the prod-cron-host gate in unit tests.
vi.mock("@shared/http/is-prod-cron-host", () => ({
  isProdCronHost: () => true,
}));

import { GET } from "@/app/api/cron/nurture-sequence/route";
import { __resetSystemFlagsCacheForTests } from "@shared/flags/system-flags";

const ORIGINAL_ENV = { ...process.env };

function makeRequest(token?: string): Request {
  return new Request("https://example.test/api/cron/nurture-sequence", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

interface MockFetchCall {
  match: (url: string, init?: { method?: string }) => boolean;
  respond: () => unknown;
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
    // Reset the system-flags in-process cache (30s TTL) so a value cached by one
    // test can't leak into the next; seed nurture_sequence=enabled so the
    // kill-switch gate passes without depending on a mocked fetch round-trip.
    __resetSystemFlagsCacheForTests({ nurture_sequence: true });
    process.env = {
      ...ORIGINAL_ENV,
      CRON_SECRET: "test-cron-secret",
      RESEND_API_KEY: "re_test_key",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      STRIPE_COUPON_50: "nurture_50",
      NEXT_PUBLIC_SITE_URL: "https://test.loveiq.org",
    };
    mockGetReportPlan.mockResolvedValue(null);
    mockIsEmailSuppressed.mockResolvedValue(false);
    mockResendSend.mockResolvedValue({ data: { id: "msg_1" }, error: null });
    // Pricing 2.0: the single nurture discount stage is 72h → 50% off.
    mockGetCouponIdForStage.mockImplementation((stage: string) =>
      stage === "72h_no_unlock" ? "nurture_50" : null
    );
    mockGetStripeClient.mockReturnValue({
      promotionCodes: {
        create: (args: unknown) => mockStripePromoCreate(args),
        update: (id: string, args: unknown) => mockStripePromoUpdate(id, args),
      },
    });
    mockStripePromoCreate.mockResolvedValue({ id: "promo_xyz" });
    mockStripePromoUpdate.mockResolvedValue({});
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
    expect(body.summaries["72h_no_unlock"].sent).toBe(0);
  });

  // The 3 fetchCandidatesByAge calls are dispatched via Promise.all in fixed
  // order: 6h, 72h, 78h. We mock by call-index — robust against URL encoding
  // of the timestamp differences.
  function mockCandidateWindows({
    seventyTwoHour,
    seventyEightHour = [],
    quoteMetadata = {},
    accessToken = "rpt_AbCdEfGhIjKlMnOpQrSt",
    patchSpy,
  }: {
    seventyTwoHour: unknown[];
    seventyEightHour?: unknown[];
    quoteMetadata?: Record<string, unknown>;
    accessToken?: string | null;
    patchSpy?: () => unknown;
  }) {
    let personalReportCalls = 0;
    mockFetchWithTimeout.mockImplementation((url: string, init?: { method?: string }) => {
      if (url.includes("/rest/v1/personal_report")) {
        personalReportCalls += 1;
        // Promise.all order (pricing 2.0): 1 = 72h window, 2 = 78h window.
        if (personalReportCalls === 1) return Promise.resolve(jsonResponse(seventyTwoHour));
        if (personalReportCalls === 2) return Promise.resolve(jsonResponse(seventyEightHour));
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

  it("routes a 72h candidate through promo creation + send + metadata write", async () => {
    const candidate = {
      id: 42,
      survey_submission_id: 7,
      created_date_time: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
      survey_submission: { app_user: { email: "user@example.com", first_name: "Sam" } },
    };
    const patchSpy = vi.fn(() => jsonResponse({}, 204));

    mockCandidateWindows({
      seventyTwoHour: [candidate],
      quoteMetadata: { nurtureEmailsSent: [] },
      patchSpy,
    });

    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summaries["72h_no_unlock"].sent).toBe(1);

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
    // The report CTA carries from=email so a forced-paywall user who clicks it
    // gets the soft, dismissible blurred-preview experience, not the hard wall.
    expect(sent.html).toContain("from=email");

    expect(patchSpy).toHaveBeenCalled();
  });

  it("skips a candidate whose nurtureEmailsSent already includes the stage", async () => {
    const candidate = {
      id: 99,
      survey_submission_id: 9,
      created_date_time: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
      survey_submission: { app_user: { email: "already@example.com", first_name: "Al" } },
    };
    mockCandidateWindows({
      seventyTwoHour: [candidate],
      quoteMetadata: { nurtureEmailsSent: ["72h_no_unlock"] },
    });

    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summaries["72h_no_unlock"].sent).toBe(0);
    expect(body.summaries["72h_no_unlock"].skippedAlreadySent).toBe(1);
    expect(mockStripePromoCreate).not.toHaveBeenCalled();
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("skips a candidate who already has a paid plan", async () => {
    mockGetReportPlan.mockResolvedValueOnce("full_report");
    const candidate = {
      id: 50,
      survey_submission_id: 5,
      created_date_time: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
      survey_submission: { app_user: { email: "paid@example.com", first_name: "Pay" } },
    };
    mockCandidateWindows({
      seventyTwoHour: [candidate],
      quoteMetadata: {},
    });

    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();
    expect(body.summaries["72h_no_unlock"].skippedPaid).toBe(1);
    expect(mockStripePromoCreate).not.toHaveBeenCalled();
  });

  it("F-06: persists idempotency marker BEFORE Resend send", async () => {
    // Tracks the order of two operations: the PATCH on report_price_quote
    // (marker write) and the Resend send. The audit fix requires the PATCH
    // to land first so a crash mid-send does not double-deliver next hour.
    const callOrder: string[] = [];
    const patchSpy = vi.fn(() => {
      callOrder.push("patch");
      return jsonResponse({}, 204);
    });
    mockResendSend.mockImplementation(() => {
      callOrder.push("send");
      return Promise.resolve({ data: { id: "msg_1" }, error: null });
    });

    const candidate = {
      id: 7,
      survey_submission_id: 70,
      created_date_time: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
      survey_submission: { app_user: { email: "order@example.com", first_name: "Or" } },
    };
    mockCandidateWindows({
      seventyTwoHour: [candidate],
      quoteMetadata: { nurtureEmailsSent: [] },
      patchSpy,
    });

    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    expect(callOrder).toEqual(["patch", "send"]);
  });

  it("F-06: when Resend fails, marker is still persisted so retry does not double-send", async () => {
    // Simulates the "send fails after marker write" branch. Verifies:
    //  (a) the PATCH did fire (marker is written)
    //  (b) the candidate is counted in `failed`, not `sent`
    // A second cron run would now see nurtureEmailsSent include the stage and
    // skip it — the retry-safety guarantee F-06 was built for.
    const patchSpy = vi.fn(() => jsonResponse({}, 204));
    mockResendSend.mockResolvedValueOnce({
      data: null,
      error: { name: "ResendError", message: "boom" },
    });

    const candidate = {
      id: 8,
      survey_submission_id: 80,
      created_date_time: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
      survey_submission: { app_user: { email: "boom@example.com", first_name: "Bo" } },
    };
    mockCandidateWindows({
      seventyTwoHour: [candidate],
      quoteMetadata: { nurtureEmailsSent: [] },
      patchSpy,
    });

    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    expect(patchSpy).toHaveBeenCalledTimes(1);

    const body = await res.json();
    expect(body.summaries["72h_no_unlock"].sent).toBe(0);
    expect(body.summaries["72h_no_unlock"].failed).toBe(1);
  });

  it("time-budget guard: defers all candidates when the wall-clock budget is exhausted", async () => {
    // NURTURE_TIME_BUDGET_MS=0 makes the deadline equal startMs, so the first
    // loop iteration is already past budget → no candidate is processed. Proves
    // the guard prevents work (and the Vercel timeout 5xx) under load; deferred
    // rows roll to the next hourly run (2h-wide age windows keep them eligible).
    process.env.NURTURE_TIME_BUDGET_MS = "0";
    const candidate = {
      id: 11,
      survey_submission_id: 110,
      created_date_time: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
      survey_submission: { app_user: { email: "deferred@example.com", first_name: "De" } },
    };
    mockCandidateWindows({
      seventyTwoHour: [candidate],
      quoteMetadata: { nurtureEmailsSent: [] },
    });

    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Candidate counted (set before the loop) but never processed → no send/promo.
    expect(body.summaries["72h_no_unlock"].candidates).toBe(1);
    expect(body.summaries["72h_no_unlock"].sent).toBe(0);
    expect(mockStripePromoCreate).not.toHaveBeenCalled();
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("time-budget guard: invalid NURTURE_TIME_BUDGET_MS falls back to default (cron still runs)", async () => {
    // A misconfigured env must not brick the cron: a non-numeric value falls
    // back to the 42s default, so the candidate is processed normally.
    process.env.NURTURE_TIME_BUDGET_MS = "not-a-number";
    const candidate = {
      id: 12,
      survey_submission_id: 120,
      created_date_time: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
      survey_submission: { app_user: { email: "fallback@example.com", first_name: "Fa" } },
    };
    mockCandidateWindows({
      seventyTwoHour: [candidate],
      quoteMetadata: { nurtureEmailsSent: [] },
    });

    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summaries["72h_no_unlock"].sent).toBe(1);
  });

  it("78h candidate sends the Calendly call invite, mints NO promo, logs booking_event", async () => {
    // The 78h call-invite stage is gated off by default; enable it + provide the
    // operator Calendly URL (now env-driven, no longer hardcoded) for this test.
    process.env.NURTURE_78H_CALL_ENABLED = "true";
    process.env.NURTURE_78H_CALENDLY_URL = "https://calendly.com/loveiq-team/20min";
    const candidate = {
      id: 78,
      survey_submission_id: 780,
      created_date_time: new Date(Date.now() - 78 * 60 * 60 * 1000).toISOString(),
      survey_submission: { app_user: { email: "call@example.com", first_name: "Cal" } },
    };
    mockCandidateWindows({
      seventyTwoHour: [],
      seventyEightHour: [candidate],
      quoteMetadata: { nurtureEmailsSent: [] },
    });

    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summaries["78h_no_unlock"].sent).toBe(1);

    // No discount stage → no Stripe promo minted.
    expect(mockStripePromoCreate).not.toHaveBeenCalled();

    expect(mockResendSend).toHaveBeenCalledTimes(1);
    const sent = mockResendSend.mock.calls[0][0];
    expect(sent.to).toBe("call@example.com");
    expect(sent.headers["X-LoveIQ-Stage"]).toBe("78h_no_unlock");
    expect(sent.html).toContain("calendly.com/loveiq-team/20min");
    expect(sent.html).toContain("utm_campaign=78h_no_unlock");
    expect(sent.html).toContain("email=call%40example.com");

    // A booking_event call_invite_sent row was written.
    const bookingCall = mockFetchWithTimeout.mock.calls.find(
      ([url, init]) =>
        String(url).includes("/rest/v1/booking_event") &&
        (init as { method?: string } | undefined)?.method === "POST"
    );
    expect(bookingCall).toBeTruthy();
    const bookingBody = JSON.parse((bookingCall![1] as { body: string }).body);
    expect(bookingBody.event_type).toBe("call_invite_sent");
    expect(bookingBody.survey_submission_id).toBe(780);
    expect(bookingBody.personal_report_id).toBe(78);
  });

  it("78h candidate already sent is skipped (idempotent)", async () => {
    process.env.NURTURE_78H_CALL_ENABLED = "true";
    process.env.NURTURE_78H_CALENDLY_URL = "https://calendly.com/loveiq-team/20min";
    const candidate = {
      id: 79,
      survey_submission_id: 790,
      created_date_time: new Date(Date.now() - 78 * 60 * 60 * 1000).toISOString(),
      survey_submission: { app_user: { email: "again@example.com", first_name: "Ag" } },
    };
    mockCandidateWindows({
      seventyTwoHour: [],
      seventyEightHour: [candidate],
      quoteMetadata: { nurtureEmailsSent: ["78h_no_unlock"] },
    });

    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summaries["78h_no_unlock"].sent).toBe(0);
    expect(body.summaries["78h_no_unlock"].skippedAlreadySent).toBe(1);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("78h call invite is paused by default (NURTURE_78H_CALL_ENABLED unset)", async () => {
    // No product person to take the calls → the stage is gated off unless the
    // env flag is explicitly "true". A fresh 78h candidate must NOT be emailed.
    const candidate = {
      id: 81,
      survey_submission_id: 810,
      created_date_time: new Date(Date.now() - 78 * 60 * 60 * 1000).toISOString(),
      survey_submission: { app_user: { email: "paused@example.com", first_name: "Pz" } },
    };
    mockCandidateWindows({
      seventyTwoHour: [],
      seventyEightHour: [candidate],
      quoteMetadata: { nurtureEmailsSent: [] },
    });

    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summaries["78h_no_unlock"].sent).toBe(0);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("78h stays paused when enabled but NURTURE_78H_CALENDLY_URL is unset (no dead link)", async () => {
    // Belt-and-braces after the call host was offboarded: even with the stage
    // flag flipped on, a missing booking URL must NOT send an email pointing at
    // a dead/empty Calendly link. Set NURTURE_78H_CALENDLY_URL to re-enable.
    process.env.NURTURE_78H_CALL_ENABLED = "true";
    delete process.env.NURTURE_78H_CALENDLY_URL;
    const candidate = {
      id: 82,
      survey_submission_id: 820,
      created_date_time: new Date(Date.now() - 78 * 60 * 60 * 1000).toISOString(),
      survey_submission: { app_user: { email: "nourl@example.com", first_name: "No" } },
    };
    mockCandidateWindows({
      seventyTwoHour: [],
      seventyEightHour: [candidate],
      quoteMetadata: { nurtureEmailsSent: [] },
    });

    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summaries["78h_no_unlock"].sent).toBe(0);
    expect(mockResendSend).not.toHaveBeenCalled();
  });
});
