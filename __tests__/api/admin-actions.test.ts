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

vi.mock("../../lib/admin/audit", () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET, POST } from "../../app/api/admin/actions/route";

function makeRequest(body?: unknown, method: "GET" | "POST" = "GET"): Request {
  return new Request("https://example.test/api/admin/actions", {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("admin actions route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
    mockVerifyCsrfToken.mockResolvedValue(true);
  });

  describe("GET", () => {
    it("returns 401 without admin session", async () => {
      mockVerifyAdminSession.mockResolvedValue(null);
      const res = await GET(makeRequest());
      expect(res.status).toBe(401);
    });

    it("returns 429 when rate-limited", async () => {
      mockVerifyAdminSession.mockResolvedValue({ email: "a@test.com", role: "admin" });
      mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
      const res = await GET(makeRequest());
      expect(res.status).toBe(429);
    });

    it("returns 200 with empty list when Supabase has no rows", async () => {
      mockVerifyAdminSession.mockResolvedValue({ email: "a@test.com", role: "viewer" });
      mockSupabaseFetch.mockResolvedValue({
        ok: true,
        headers: { get: () => "0-0/0" },
        json: async () => [],
      });
      const res = await GET(makeRequest());
      expect(res.status).toBe(200);
    });
  });

  describe("POST", () => {
    it("returns 401 without admin session", async () => {
      mockVerifyAdminSession.mockResolvedValue(null);
      const res = await POST(makeRequest({ title: "Test action item" }, "POST"));
      expect(res.status).toBe(401);
    });

    it("returns 403 when CSRF token invalid", async () => {
      mockVerifyAdminSession.mockResolvedValue({ email: "a@test.com", role: "admin" });
      mockVerifyCsrfToken.mockResolvedValue(false);
      const res = await POST(makeRequest({ title: "Test action item" }, "POST"));
      expect(res.status).toBe(403);
    });

    it("returns 400 when Zod schema fails (title too short)", async () => {
      mockVerifyAdminSession.mockResolvedValue({ email: "a@test.com", role: "admin" });
      const res = await POST(makeRequest({ title: "ab" }, "POST"));
      expect(res.status).toBe(400);
    });

    it("returns 400 when Zod schema fails (priority out of enum)", async () => {
      mockVerifyAdminSession.mockResolvedValue({ email: "a@test.com", role: "admin" });
      const res = await POST(
        makeRequest({ title: "Valid title here", priority: "URGENT" }, "POST")
      );
      expect(res.status).toBe(400);
    });
  });
});
