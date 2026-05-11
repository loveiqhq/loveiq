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

import { DELETE, PATCH } from "../../app/api/admin/changelog/[id]/route";

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });
const makeReq = (body: unknown, method: "PATCH" | "DELETE" = "PATCH") =>
  new Request("http://localhost/api/admin/changelog/1", {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

describe("admin changelog/[id] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() });
    mockVerifyCsrfToken.mockResolvedValue(true);
  });

  it("PATCH returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await PATCH(makeReq({ title: "x" }), makeParams("1"));
    expect(res.status).toBe(401);
  });

  it("PATCH returns 403 for viewer role", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
    const res = await PATCH(makeReq({ title: "x" }), makeParams("1"));
    expect(res.status).toBe(403);
  });

  it("PATCH returns 403 when CSRF invalid", async () => {
    mockVerifyCsrfToken.mockResolvedValue(false);
    const res = await PATCH(makeReq({ title: "x" }), makeParams("1"));
    expect(res.status).toBe(403);
  });

  it("PATCH returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await PATCH(makeReq({ title: "x" }), makeParams("1"));
    expect(res.status).toBe(429);
  });

  it("PATCH returns 400 when id is non-numeric", async () => {
    const res = await PATCH(makeReq({ title: "x" }), makeParams("abc"));
    expect(res.status).toBe(400);
  });

  it("PATCH returns 400 when category is not in enum", async () => {
    const res = await PATCH(makeReq({ category: "junk" }), makeParams("1"));
    expect(res.status).toBe(400);
  });

  it("PATCH returns 400 with empty body (refine: at least one field)", async () => {
    const res = await PATCH(makeReq({}), makeParams("1"));
    expect(res.status).toBe(400);
  });

  it("DELETE returns 403 for editor role (delete requires admin)", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "e@test.com", role: "editor" });
    const res = await DELETE(makeReq(null, "DELETE"), makeParams("1"));
    expect(res.status).toBe(403);
  });

  it("DELETE returns 403 when CSRF invalid", async () => {
    mockVerifyCsrfToken.mockResolvedValue(false);
    const res = await DELETE(makeReq(null, "DELETE"), makeParams("1"));
    expect(res.status).toBe(403);
  });

  it("DELETE returns 400 when id is non-numeric", async () => {
    const res = await DELETE(makeReq(null, "DELETE"), makeParams("abc"));
    expect(res.status).toBe(400);
  });
});
