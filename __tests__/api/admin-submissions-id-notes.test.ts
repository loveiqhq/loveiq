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

import { GET, POST } from "../../app/api/admin/submissions/[id]/notes/route";

function makeRequest(body?: unknown, method: "GET" | "POST" = "GET"): Request {
  return new Request("http://localhost/api/admin/submissions/1/notes", {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

const params = Promise.resolve({ id: "1" });

describe("admin submissions/[id]/notes route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
    mockVerifyCsrfToken.mockResolvedValue(true);
  });

  describe("GET", () => {
    it("returns 401 without admin session", async () => {
      mockVerifyAdminSession.mockResolvedValue(null);
      const res = await GET(makeRequest(), { params });
      expect(res.status).toBe(401);
    });

    it("allows viewer role (read-only)", async () => {
      mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
      mockSupabaseFetch.mockResolvedValue({ ok: true, json: async () => [] });
      const res = await GET(makeRequest(), { params });
      expect(res.status).toBe(200);
    });

    it("returns 429 when rate-limited", async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
      const res = await GET(makeRequest(), { params });
      expect(res.status).toBe(429);
    });

    it("returns 400 when submission id is not a positive integer", async () => {
      const badParams = Promise.resolve({ id: "abc" });
      const res = await GET(makeRequest(), { params: badParams });
      expect(res.status).toBe(400);
    });
  });

  describe("POST", () => {
    it("returns 401 without admin session", async () => {
      mockVerifyAdminSession.mockResolvedValue(null);
      const res = await POST(makeRequest({ content: "test note" }, "POST"), { params });
      expect(res.status).toBe(401);
    });

    it("returns 403 for viewer role (notes require editor)", async () => {
      mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
      const res = await POST(makeRequest({ content: "test note" }, "POST"), { params });
      expect(res.status).toBe(403);
    });

    it("returns 403 when CSRF token invalid", async () => {
      mockVerifyCsrfToken.mockResolvedValue(false);
      const res = await POST(makeRequest({ content: "test note" }, "POST"), { params });
      expect(res.status).toBe(403);
    });

    it("returns 400 when content is empty after trim", async () => {
      const res = await POST(makeRequest({ content: "   " }, "POST"), { params });
      expect(res.status).toBe(400);
    });

    it("returns 400 when content exceeds 2000 chars", async () => {
      const res = await POST(makeRequest({ content: "x".repeat(2001) }, "POST"), { params });
      expect(res.status).toBe(400);
    });
  });
});
