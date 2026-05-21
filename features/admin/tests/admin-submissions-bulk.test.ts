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

const mockVerifyCsrfToken = vi.fn();
vi.mock("@shared/http/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockVerifyCsrfToken(...(args as [])),
}));

vi.mock("@features/admin/server/audit", () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { PATCH } from "@/app/api/admin/submissions/bulk/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/submissions/bulk", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin submissions/bulk PATCH route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
    mockVerifyCsrfToken.mockResolvedValue(true);
    mockSupabaseFetch.mockResolvedValue({ ok: true, json: async () => [{ id: 1 }, { id: 2 }] });
  });

  it("returns 403 when CSRF token invalid", async () => {
    mockVerifyCsrfToken.mockResolvedValue(false);
    const res = await PATCH(makeRequest({ ids: [1, 2], action: "flagged" }));
    expect(res.status).toBe(403);
  });

  it("returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ ids: [1, 2], action: "flagged" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewer role (writes require editor)", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
    const res = await PATCH(makeRequest({ ids: [1, 2], action: "flagged" }));
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await PATCH(makeRequest({ ids: [1, 2], action: "flagged" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 when ids array is empty", async () => {
    const res = await PATCH(makeRequest({ ids: [], action: "flagged" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when action is not in the enum", async () => {
    const res = await PATCH(makeRequest({ ids: [1], action: "deleted" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when ids exceed 100", async () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => i + 1);
    const res = await PATCH(makeRequest({ ids: tooMany, action: "flagged" }));
    expect(res.status).toBe(400);
  });
});
