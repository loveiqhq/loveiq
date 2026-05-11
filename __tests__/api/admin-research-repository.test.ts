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

vi.mock("../../lib/admin/audit", () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("../../lib/admin/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

vi.mock("../../lib/admin/research-repository", () => ({
  buildResearchRepositorySnapshot: vi.fn().mockResolvedValue({ entries: [] }),
}));

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET, POST } from "../../app/api/admin/research-repository/route";

function makeRequest(body?: unknown, method: "GET" | "POST" = "GET"): Request {
  return new Request("http://localhost/api/admin/research-repository", {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

const validBody = {
  title: "Pain in chapter 3",
  entry_type: "pain-point",
};

describe("admin research-repository route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
    mockVerifyCsrfToken.mockResolvedValue(true);
    mockSupabaseFetch.mockResolvedValue({ ok: true, json: async () => [{ id: 1 }] });
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

  it("POST returns 403 for viewer role (writes require editor)", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
    const res = await POST(makeRequest(validBody, "POST"));
    expect(res.status).toBe(403);
  });

  it("POST returns 403 when CSRF token invalid", async () => {
    mockVerifyCsrfToken.mockResolvedValue(false);
    const res = await POST(makeRequest(validBody, "POST"));
    expect(res.status).toBe(403);
  });

  it("POST returns 400 when title is too short", async () => {
    const res = await POST(makeRequest({ ...validBody, title: "ab" }, "POST"));
    expect(res.status).toBe(400);
  });

  it("POST returns 400 when entry_type is not in the enum", async () => {
    const res = await POST(makeRequest({ ...validBody, entry_type: "random-thing" }, "POST"));
    expect(res.status).toBe(400);
  });
});
