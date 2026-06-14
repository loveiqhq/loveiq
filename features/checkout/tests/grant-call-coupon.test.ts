import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
const mockHasRole = vi.fn();
const mockLogAdminAction = vi.fn();
const mockSupabaseFetch = vi.fn();
const mockVerifyCsrf = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockGetCouponIdForStage = vi.fn();
const mockMintUserPromoCode = vi.fn();
const mockGetQuoteForContext = vi.fn();
const mockBuildUnsubscribeUrl = vi.fn();
const mockPostCallCouponEmail = vi.fn();
const mockInsertBookingEvent = vi.fn();
const mockResendSend = vi.fn();

vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: () => mockVerifyAdminSession(),
}));
vi.mock("@features/admin/server/roles", () => ({
  hasRole: (...args: unknown[]) => mockHasRole(...args),
}));
vi.mock("@features/admin/server/audit", () => ({
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
}));
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));
vi.mock("@shared/http/csrf", () => ({
  verifyCsrfToken: () => mockVerifyCsrf(),
}));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/checkout/server/promoCodes", () => ({
  getCouponIdForStage: (...args: unknown[]) => mockGetCouponIdForStage(...args),
  mintUserPromoCode: (...args: unknown[]) => mockMintUserPromoCode(...args),
}));
vi.mock("@features/pricing/logic/reportPricing", () => ({
  getReportPriceQuoteForContext: (...args: unknown[]) => mockGetQuoteForContext(...args),
}));
vi.mock("@shared/emails/site-url", () => ({
  getEmailSiteUrl: () => "https://www.loveiq.org",
}));
vi.mock("@shared/emails/unsubscribe-token", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/emails/unsubscribe-token")>()),
  buildUnsubscribeUrl: (...args: unknown[]) => mockBuildUnsubscribeUrl(...args),
}));
vi.mock("@features/report/server/emails/nurture/post-call-coupon", () => ({
  postCallCouponEmail: (...args: unknown[]) => mockPostCallCouponEmail(...args),
}));
vi.mock("@features/booking/server/calendly", () => ({
  insertBookingEvent: (...args: unknown[]) => mockInsertBookingEvent(...args),
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mockResendSend };
  },
}));

import { POST } from "@/app/api/admin/submissions/[id]/grant-call-coupon/route";

const ORIGINAL_ENV = { ...process.env };

function makeRequest(): Request {
  return new Request("https://example.test/api/admin/submissions/123/grant-call-coupon", {
    method: "POST",
    headers: { "x-csrf-token": "valid" },
  });
}
const ctx = { params: Promise.resolve({ id: "123" }) };

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function routeSupabase(quoteMetadata: Record<string, unknown>, patchSpy?: () => void) {
  mockSupabaseFetch.mockImplementation((path: string, init?: { method?: string }) => {
    if (path.includes("/rest/v1/survey_submission?id=eq")) {
      return Promise.resolve(
        jsonResponse([{ id: 123, app_user: { email: "u@example.com", first_name: "U" } }])
      );
    }
    if (path.includes("/rest/v1/report_access_token")) {
      return Promise.resolve(jsonResponse([{ token: "rpt_x" }]));
    }
    if (path.includes("/rest/v1/personal_report")) {
      return Promise.resolve(jsonResponse([{ id: 999 }]));
    }
    if (path.includes("/rest/v1/report_price_quote") && init?.method !== "PATCH") {
      return Promise.resolve(jsonResponse([{ id: 55, metadata: quoteMetadata }]));
    }
    if (init?.method === "PATCH") {
      patchSpy?.();
      return Promise.resolve(jsonResponse({}, 204));
    }
    return Promise.resolve(jsonResponse([]));
  });
}

describe("POST /api/admin/submissions/[id]/grant-call-coupon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      RESEND_API_KEY: "re_test",
      UNSUBSCRIBE_SECRET: "x".repeat(32),
    };
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@loveiq.org", role: "editor" });
    mockHasRole.mockReturnValue(true);
    mockVerifyCsrf.mockResolvedValue(true);
    mockCheckRateLimit.mockResolvedValue({ allowed: true, resetAt: new Date() });
    mockGetCouponIdForStage.mockReturnValue("nurture_100");
    mockMintUserPromoCode.mockResolvedValue({
      code: "LIQ-100-Ab7K9xQ2",
      stripePromotionCodeId: "promo_free",
      percentOff: 100,
      expiresAt: "2026-06-15T00:00:00.000Z",
    });
    mockBuildUnsubscribeUrl.mockReturnValue("https://www.loveiq.org/api/unsubscribe?token=x");
    mockPostCallCouponEmail.mockReturnValue({ subject: "S", html: "<p>H</p>", text: "T" });
    mockInsertBookingEvent.mockResolvedValue(true);
    mockResendSend.mockResolvedValue({ data: { id: "msg" }, error: null });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("401 when not an admin", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await POST(makeRequest(), ctx);
    expect(res.status).toBe(401);
  });

  it("403 without the editor role", async () => {
    mockHasRole.mockReturnValue(false);
    const res = await POST(makeRequest(), ctx);
    expect(res.status).toBe(403);
  });

  it("503 when the 100%-off coupon is not configured", async () => {
    mockGetCouponIdForStage.mockReturnValue(null);
    const res = await POST(makeRequest(), ctx);
    expect(res.status).toBe(503);
    expect(mockMintUserPromoCode).not.toHaveBeenCalled();
  });

  it("mints + stores + emails + records the coupon", async () => {
    let patched = false;
    routeSupabase({ nurtureEmailsSent: [] }, () => {
      patched = true;
    });

    const res = await POST(makeRequest(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(
      expect.objectContaining({ success: true, code: "LIQ-100-Ab7K9xQ2", emailed: true })
    );

    expect(mockMintUserPromoCode).toHaveBeenCalledWith(
      expect.objectContaining({ percentOff: 100, couponId: "nurture_100" })
    );
    expect(patched).toBe(true);
    expect(mockResendSend).toHaveBeenCalledTimes(1);
    expect(mockInsertBookingEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "call_coupon_sent", submissionId: 123 })
    );
    // CTA carries the promo code.
    const emailArgs = mockPostCallCouponEmail.mock.calls[0][0];
    expect(emailArgs.ctaUrl).toContain("promo=LIQ-100-Ab7K9xQ2");
    expect(emailArgs.ctaUrl).toContain("/report/rpt_x");
    // Email return ⇒ soft blurred-preview experience even for a forced-arm user.
    expect(emailArgs.ctaUrl).toContain("from=email");
  });

  it("409 (idempotent) when a post_call code already exists, without re-minting", async () => {
    routeSupabase({
      nurturePromoCodes: { post_call: { code: "LIQ-100-EXISTING1" } },
    });
    const res = await POST(makeRequest(), ctx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("LIQ-100-EXISTING1");
    expect(mockMintUserPromoCode).not.toHaveBeenCalled();
  });

  it("still succeeds (emailed:false) when the email send fails", async () => {
    routeSupabase({ nurtureEmailsSent: [] });
    mockResendSend.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await POST(makeRequest(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.code).toBe("LIQ-100-Ab7K9xQ2");
    expect(body.emailed).toBe(false);
  });
});
