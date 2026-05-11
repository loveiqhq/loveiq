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

vi.mock("../../lib/admin/supabase", () => ({
  supabaseFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: 1 }] }),
}));

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { PATCH } from "../../app/api/admin/actions/[id]/route";

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeReq(body: unknown) {
  return new Request("http://localhost/api/admin/actions/1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin actions/[id] PATCH", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
    mockVerifyCsrfToken.mockResolvedValue(true);
  });

  it("returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await PATCH(makeReq({ title: "Updated" }), makeParams("1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewer role", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
    const res = await PATCH(makeReq({ title: "Updated" }), makeParams("1"));
    expect(res.status).toBe(403);
  });

  it("returns 403 when CSRF token invalid", async () => {
    mockVerifyCsrfToken.mockResolvedValue(false);
    const res = await PATCH(makeReq({ title: "Updated" }), makeParams("1"));
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await PATCH(makeReq({ title: "Updated" }), makeParams("1"));
    expect(res.status).toBe(429);
  });

  it("returns 400 when id is non-numeric", async () => {
    const res = await PATCH(makeReq({ title: "Updated" }), makeParams("abc"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when priority is not in enum", async () => {
    const res = await PATCH(makeReq({ priority: "urgent" }), makeParams("1"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body has no fields", async () => {
    const res = await PATCH(makeReq({}), makeParams("1"));
    expect(res.status).toBe(400);
  });
});
