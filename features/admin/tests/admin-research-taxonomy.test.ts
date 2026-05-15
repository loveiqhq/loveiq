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

vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: 1 }] }),
}));

vi.mock("@features/admin/server/research-taxonomy", () => ({
  buildResearchTaxonomySnapshot: vi.fn().mockResolvedValue({ terms: [] }),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET, POST } from "@/app/api/admin/research-taxonomy/route";

function makeRequest(body?: unknown, method: "GET" | "POST" = "GET"): Request {
  return new Request("http://localhost/api/admin/research-taxonomy", {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

const validCreate = {
  action: "create",
  label: "Trust signal",
  taxonomy_type: "theme",
};

describe("admin research-taxonomy route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
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

  it("POST returns 403 for viewer role", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
    const res = await POST(makeRequest(validCreate, "POST"));
    expect(res.status).toBe(403);
  });

  it("POST returns 403 when CSRF invalid", async () => {
    mockVerifyCsrfToken.mockResolvedValue(false);
    const res = await POST(makeRequest(validCreate, "POST"));
    expect(res.status).toBe(403);
  });

  it("POST returns 400 when taxonomy_type is not in enum", async () => {
    const res = await POST(makeRequest({ ...validCreate, taxonomy_type: "junk" }, "POST"));
    expect(res.status).toBe(400);
  });

  it("POST returns 400 when label is too short", async () => {
    const res = await POST(makeRequest({ ...validCreate, label: "a" }, "POST"));
    expect(res.status).toBe(400);
  });

  it("POST returns 403 when editor tries to delete (delete requires admin)", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "e@test.com", role: "editor" });
    const res = await POST(makeRequest({ action: "delete", id: 7 }, "POST"));
    expect(res.status).toBe(403);
  });

  it("POST returns 400 when action discriminator is missing", async () => {
    const res = await POST(makeRequest({ label: "x", taxonomy_type: "theme" }, "POST"));
    expect(res.status).toBe(400);
  });
});
