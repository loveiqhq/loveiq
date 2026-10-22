import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));
const mockCheckRateLimit = vi.fn();
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
const mockFetchAllRows = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(),
  fetchAllRows: (...args: unknown[]) => mockFetchAllRows(...args),
  countRows: vi.fn(),
  POSTGREST_MAX_ROWS: 1000,
}));
const mockAds = vi.fn();
vi.mock("@shared/http/google-ads", () => ({
  googleAdsSearch: (...args: unknown[]) => mockAds(...args),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/admin/ap/pay-to-start/route";

const req = () =>
  new Request(
    "http://localhost/api/admin/ap/pay-to-start?period=custom&from=2026-10-20&to=2026-10-20"
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyAdminSession.mockResolvedValue({ email: "ec@loveiq.org", role: "admin" });
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
  mockAds.mockResolvedValue([]);
});

describe("GET /api/admin/ap/pay-to-start", () => {
  it("refuses without an admin session, before reading anything", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mockFetchAllRows).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });
    expect((await GET(req())).status).toBe(429);
  });

  it("reads the journey's entitlements and visits, not June's prepaid rows", async () => {
    mockFetchAllRows.mockImplementation(async (path: string) => {
      if (path.startsWith("/rest/v1/prepaid_report_access?"))
        return [
          {
            id: 1,
            offer: "full",
            status: "succeeded",
            amount_cents: 2999,
            list_price_cents: 2999,
            is_test: false,
            customer_email: "reader@example.com",
            created_at: "2026-10-20T10:00:00Z",
            paid_at: "2026-10-20T10:02:00Z",
            consumed_submission_id: null,
          },
        ];
      if (path.startsWith("/rest/v1/funnel_event?")) return [{ day: "2026-10-20" }];
      return [];
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.arms.find((a: { offer: string }) => a.offer === "all").paid).toBe(1);
    expect(body.visits).toBe(1);
    const paths = mockFetchAllRows.mock.calls.map(([p]) => String(p));
    expect(paths.find((p) => p.startsWith("/rest/v1/prepaid_report_access?"))).toContain(
      "offer=not.is.null"
    );
    expect(paths.find((p) => p.startsWith("/rest/v1/funnel_event?"))).toContain(
      "landing_variant=eq.pay_to_start"
    );
  });

  it("answers a failed read with a generic 500", async () => {
    mockFetchAllRows.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Unable to load the pay-to-start page." });
  });
});
