import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockVerifyCsrfToken = vi.fn();
vi.mock("@/lib/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockVerifyCsrfToken(...(args as [])),
}));

vi.mock("@features/admin/server/audit", () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { DELETE, GET, POST } from "@/app/api/admin/analytics/marketing-spend/route";

function makeRequest(
  body?: unknown,
  method: "GET" | "POST" | "DELETE" = "GET",
  path = ""
): Request {
  return new Request(`http://localhost/api/admin/analytics/marketing-spend${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

const validRow = {
  date: "2026-05-10",
  channel: "google",
  spend_eur: 1000,
  clicks: 5000,
  impressions: 100000,
  unique_visitors: 8000,
};

describe("admin marketing-spend route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
    mockVerifyCsrfToken.mockResolvedValue(true);
    mockSupabaseFetch.mockResolvedValue({ ok: true, json: async () => [] });
  });

  it("GET returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("GET returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("POST returns 403 when CSRF token invalid", async () => {
    mockVerifyCsrfToken.mockResolvedValue(false);
    const res = await POST(makeRequest(validRow, "POST"));
    expect(res.status).toBe(403);
  });

  it("POST returns 403 for viewer role (write requires admin)", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
    const res = await POST(makeRequest(validRow, "POST"));
    expect(res.status).toBe(403);
  });

  it("POST returns 400 when date format is not YYYY-MM-DD", async () => {
    const res = await POST(makeRequest({ ...validRow, date: "May 10, 2026" }, "POST"));
    expect(res.status).toBe(400);
  });

  it("POST returns 400 when spend_eur is negative", async () => {
    const res = await POST(makeRequest({ ...validRow, spend_eur: -5 }, "POST"));
    expect(res.status).toBe(400);
  });

  it("DELETE returns 400 when id is missing", async () => {
    const res = await DELETE(makeRequest(undefined, "DELETE"));
    expect(res.status).toBe(400);
  });

  it("DELETE returns 403 for viewer role", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
    const res = await DELETE(makeRequest(undefined, "DELETE", "?id=42"));
    expect(res.status).toBe(403);
  });
});
