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

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

vi.mock("@features/admin/server/audit", () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@features/admin/server/metric-library", () => ({
  fetchMetricValue: vi.fn().mockResolvedValue(42),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET, POST } from "@/app/api/admin/goals/route";

function makeRequest(body?: unknown, method: "GET" | "POST" = "GET"): Request {
  return new Request("http://localhost/api/admin/goals", {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("admin goals route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
    mockVerifyCsrfToken.mockResolvedValue(true);
  });

  describe("GET", () => {
    it("returns 401 without admin session", async () => {
      mockVerifyAdminSession.mockResolvedValue(null);
      const res = await GET(makeRequest());
      expect(res.status).toBe(401);
    });

    it("allows viewer role (read-only)", async () => {
      mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
      mockSupabaseFetch.mockResolvedValue({ ok: true, json: async () => [] });
      const res = await GET(makeRequest());
      expect(res.status).toBe(200);
    });

    it("returns 429 when rate-limited", async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
      const res = await GET(makeRequest());
      expect(res.status).toBe(429);
    });
  });

  describe("POST", () => {
    const validGoal = {
      label: "Increase completion rate",
      metric_key: "completion_rate",
      target_value: 80,
      deadline: "2026-12-31",
    };

    it("returns 401 without admin session", async () => {
      mockVerifyAdminSession.mockResolvedValue(null);
      const res = await POST(makeRequest(validGoal, "POST"));
      expect(res.status).toBe(401);
    });

    it("returns 403 for viewer role (write requires editor)", async () => {
      mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
      const res = await POST(makeRequest(validGoal, "POST"));
      expect(res.status).toBe(403);
    });

    it("returns 403 when CSRF token is invalid", async () => {
      mockVerifyCsrfToken.mockResolvedValue(false);
      const res = await POST(makeRequest(validGoal, "POST"));
      expect(res.status).toBe(403);
    });

    it("returns 429 when rate-limited", async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
      const res = await POST(makeRequest(validGoal, "POST"));
      expect(res.status).toBe(429);
    });

    it("returns 400 when label is empty", async () => {
      const res = await POST(makeRequest({ ...validGoal, label: "" }, "POST"));
      expect(res.status).toBe(400);
    });
  });
});
