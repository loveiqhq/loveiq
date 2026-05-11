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

import { DELETE } from "../../app/api/admin/views/[id]/route";

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });
const makeReq = () => new Request("http://localhost/api/admin/views/1", { method: "DELETE" });

describe("admin views/[id] DELETE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() });
    mockVerifyCsrfToken.mockResolvedValue(true);
    mockSupabaseFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ admin_email: "admin@test.com" }],
    });
  });

  it("returns 403 when CSRF invalid", async () => {
    mockVerifyCsrfToken.mockResolvedValue(false);
    const res = await DELETE(makeReq(), makeParams("1"));
    expect(res.status).toBe(403);
  });

  it("returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await DELETE(makeReq(), makeParams("1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewer role", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
    const res = await DELETE(makeReq(), makeParams("1"));
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await DELETE(makeReq(), makeParams("1"));
    expect(res.status).toBe(429);
  });

  it("returns 400 when id is non-numeric", async () => {
    const res = await DELETE(makeReq(), makeParams("abc"));
    expect(res.status).toBe(400);
  });

  it("returns 403 when admin is not the view owner", async () => {
    mockSupabaseFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ admin_email: "someone-else@test.com" }],
    });
    const res = await DELETE(makeReq(), makeParams("1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when view does not exist", async () => {
    mockSupabaseFetch.mockResolvedValue({ ok: true, json: async () => [] });
    const res = await DELETE(makeReq(), makeParams("1"));
    expect(res.status).toBe(404);
  });
});
