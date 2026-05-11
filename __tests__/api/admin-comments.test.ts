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

import { GET, POST } from "../../app/api/admin/comments/route";

function makeRequest(body?: unknown, method: "GET" | "POST" = "GET"): Request {
  return new Request("http://localhost/api/admin/comments", {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("admin comments route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 49, resetAt: new Date() });
    mockVerifyCsrfToken.mockResolvedValue(true);
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

  it("POST returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await POST(
      makeRequest({ resourceType: "decision-entry", resourceId: 1, content: "Test" }, "POST")
    );
    expect(res.status).toBe(401);
  });

  it("POST returns 403 when CSRF token is invalid", async () => {
    mockVerifyCsrfToken.mockResolvedValue(false);
    const res = await POST(
      makeRequest({ resourceType: "decision-entry", resourceId: 1, content: "Test" }, "POST")
    );
    expect(res.status).toBe(403);
  });

  it("POST returns 400 when content is empty after trim", async () => {
    const res = await POST(
      makeRequest({ resourceType: "decision-entry", resourceId: 1, content: "   " }, "POST")
    );
    expect(res.status).toBe(400);
  });

  it("POST returns 400 when resourceType is not in the allowed enum", async () => {
    const res = await POST(
      makeRequest({ resourceType: "random-thing", resourceId: 1, content: "Hi" }, "POST")
    );
    expect(res.status).toBe(400);
  });

  it("POST returns 400 when resourceId is not a positive integer", async () => {
    const res = await POST(
      makeRequest({ resourceType: "decision-entry", resourceId: -5, content: "Hi" }, "POST")
    );
    expect(res.status).toBe(400);
  });
});
