import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("../../lib/admin/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("../../lib/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockVerifyCsrfToken = vi.fn();
vi.mock("../../lib/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockVerifyCsrfToken(...(args as [])),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("../../lib/admin/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET, POST } from "../../app/api/admin/annotations/route";

function makeRequest(body?: unknown, method: "GET" | "POST" = "GET"): Request {
  return new Request("https://example.test/api/admin/annotations", {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("admin annotations route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
    mockVerifyCsrfToken.mockResolvedValue(true);
  });

  it("GET returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("GET allows 'viewer' role (read-only)", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
    mockSupabaseFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => "0-0/0" },
      json: async () => [],
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });

  it("POST returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await POST(
      makeRequest({ chart_key: "test", annotation_date: "2026-05-10", note: "test note" }, "POST")
    );
    expect(res.status).toBe(401);
  });

  it("POST returns 403 when CSRF token invalid", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "a@test.com", role: "admin" });
    mockVerifyCsrfToken.mockResolvedValue(false);
    const res = await POST(
      makeRequest({ chart_key: "test", annotation_date: "2026-05-10", note: "test note" }, "POST")
    );
    expect(res.status).toBe(403);
  });

  it("POST returns 400 when annotation_date is not ISO YYYY-MM-DD", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "a@test.com", role: "admin" });
    const res = await POST(
      makeRequest({ chart_key: "test", annotation_date: "May 10, 2026", note: "test note" }, "POST")
    );
    expect(res.status).toBe(400);
  });

  it("POST returns 400 when note exceeds 500 chars", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "a@test.com", role: "admin" });
    const res = await POST(
      makeRequest(
        { chart_key: "test", annotation_date: "2026-05-10", note: "x".repeat(501) },
        "POST"
      )
    );
    expect(res.status).toBe(400);
  });

  it("GET returns 429 when rate-limited", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "a@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("POST returns 429 when rate-limited", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "a@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await POST(
      makeRequest({ chart_key: "test", annotation_date: "2026-05-10", note: "test note" }, "POST")
    );
    expect(res.status).toBe(429);
  });

  it("POST returns 403 for viewer role (annotations require editor)", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
    const res = await POST(
      makeRequest({ chart_key: "test", annotation_date: "2026-05-10", note: "test note" }, "POST")
    );
    expect(res.status).toBe(403);
  });
});
