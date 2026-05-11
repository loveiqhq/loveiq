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

const mockSupabaseFetch = vi.fn();
vi.mock("../../lib/admin/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "../../app/api/admin/digest/route";

describe("admin digest route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() });
    mockSupabaseFetch.mockResolvedValue({ ok: true, json: async () => [] });
  });

  it("returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/digest"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewer role (digest is admin-only)", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
    const res = await GET(new Request("http://localhost/api/admin/digest"));
    expect(res.status).toBe(403);
  });

  it("returns 403 for editor role (digest is admin-only)", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "e@test.com", role: "editor" });
    const res = await GET(new Request("http://localhost/api/admin/digest"));
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(new Request("http://localhost/api/admin/digest"));
    expect(res.status).toBe(429);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });
});
