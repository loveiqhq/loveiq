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

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { PATCH } from "@/app/api/admin/research-repository/[id]/route";

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });
const makeReq = (body: unknown) =>
  new Request("http://localhost/api/admin/research-repository/1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("admin research-repository/[id] PATCH", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() });
    mockVerifyCsrfToken.mockResolvedValue(true);
  });

  it("returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await PATCH(makeReq({ title: "x update" }), makeParams("1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewer role", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
    const res = await PATCH(makeReq({ title: "x update" }), makeParams("1"));
    expect(res.status).toBe(403);
  });

  it("returns 403 when CSRF invalid", async () => {
    mockVerifyCsrfToken.mockResolvedValue(false);
    const res = await PATCH(makeReq({ title: "x update" }), makeParams("1"));
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await PATCH(makeReq({ title: "x update" }), makeParams("1"));
    expect(res.status).toBe(429);
  });

  it("returns 400 when id is non-numeric", async () => {
    const res = await PATCH(makeReq({ title: "x update" }), makeParams("abc"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when title is too short", async () => {
    const res = await PATCH(makeReq({ title: "ab" }), makeParams("1"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when entry_type is not in enum", async () => {
    const res = await PATCH(makeReq({ entry_type: "junk" }), makeParams("1"));
    expect(res.status).toBe(400);
  });

  it("returns 400 with empty body (refine: at least one field)", async () => {
    const res = await PATCH(makeReq({}), makeParams("1"));
    expect(res.status).toBe(400);
  });
});
