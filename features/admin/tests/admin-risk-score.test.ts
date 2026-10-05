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

const mockSupabaseFetch = vi.fn();
const mockFetchAllRows = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
  fetchAllRows: (...args: unknown[]) => mockFetchAllRows(...args),
}));

const mockLogError = vi.fn();
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: (...a: unknown[]) => mockLogError(...a) },
}));

import { GET } from "@/app/api/admin/risk-score/route";

describe("admin risk-score route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
  });

  it("returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/risk-score"));
    expect(res.status).toBe(401);
  });

  it("allows viewer role (read-only at-risk dashboard)", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
    mockFetchAllRows.mockResolvedValue([]);
    const res = await GET(new Request("http://localhost/api/admin/risk-score"));
    expect(res.status).toBe(200);
  });

  it("reads a recent window of behaviour events, newest first", async () => {
    // It used to read the table with no filter and `order=event_time.asc`.
    // PostgREST caps a response at 1,000 rows silently, so the fraud dashboard
    // scored the OLDEST thousand events — a fixed nine-day slice from launch,
    // and nothing since. The repeat-IP rule counted over 1,000 of 133,753
    // events, so recent fraud could not trip it.
    mockFetchAllRows.mockResolvedValue([]);
    await GET(new Request("http://localhost/api/admin/risk-score"));

    const behaviour = mockFetchAllRows.mock.calls
      .map((c) => String(c[0]))
      .find((p) => p.includes("survey_behavior_event"));
    expect(behaviour).toBeDefined();
    expect(behaviour, "must be windowed").toMatch(/event_time=gte\./);
    expect(behaviour, "newest first, so any shortfall drops the oldest").toContain(
      "order=event_time.desc"
    );
  });

  it("honours a days parameter, clamped", async () => {
    mockFetchAllRows.mockResolvedValue([]);
    await GET(new Request("http://localhost/api/admin/risk-score?days=9999"));
    const behaviour = mockFetchAllRows.mock.calls
      .map((c) => String(c[0]))
      .find((p) => p.includes("survey_behavior_event"))!;
    const since = new Date(decodeURIComponent(/event_time=gte\.([^&]+)/.exec(behaviour)![1]));
    const days = (Date.now() - since.getTime()) / 86_400_000;
    // Clamped to 90, not 9999: an unbounded window is how this broke.
    expect(days).toBeGreaterThan(89);
    expect(days).toBeLessThan(91);
  });

  it("fails loudly when a page cannot be read, rather than scoring a partial set", async () => {
    // Asserting only on the 500 was vacuous: with the null check removed the
    // route crashes on `for (const e of events)` and the outer catch returns
    // 500 too, so the test passed against a mutant that deleted the guard.
    // The guard has its own log line; the crash path logs "Risk score error".
    mockFetchAllRows.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/risk-score"));

    expect(res.status).toBe(500);
    expect(mockLogError).toHaveBeenCalledWith("Risk score: Supabase query failed");
    expect(mockLogError).not.toHaveBeenCalledWith(expect.anything(), "Risk score error");
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(new Request("http://localhost/api/admin/risk-score"));
    expect(res.status).toBe(429);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("returns 200 with empty risk set when no behavior events exist", async () => {
    mockFetchAllRows.mockResolvedValue([]);
    const res = await GET(new Request("http://localhost/api/admin/risk-score"));
    expect(res.status).toBe(200);
  });
});
