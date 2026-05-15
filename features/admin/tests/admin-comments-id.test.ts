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

import { DELETE, PATCH } from "@/app/api/admin/comments/[id]/route";

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });
const makeReq = (body: unknown, method: "PATCH" | "DELETE" = "PATCH") =>
  new Request("http://localhost/api/admin/comments/1", {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

describe("admin comments/[id] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
    mockVerifyCsrfToken.mockResolvedValue(true);
  });

  it("PATCH returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await PATCH(makeReq({ content: "hi" }), makeParams("1"));
    expect(res.status).toBe(401);
  });

  it("PATCH returns 403 for viewer role", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
    const res = await PATCH(makeReq({ content: "hi" }), makeParams("1"));
    expect(res.status).toBe(403);
  });

  it("PATCH returns 403 when CSRF invalid", async () => {
    mockVerifyCsrfToken.mockResolvedValue(false);
    const res = await PATCH(makeReq({ content: "hi" }), makeParams("1"));
    expect(res.status).toBe(403);
  });

  it("PATCH returns 400 when id is non-numeric", async () => {
    const res = await PATCH(makeReq({ content: "hi" }), makeParams("abc"));
    expect(res.status).toBe(400);
  });

  it("PATCH returns 400 when content is empty", async () => {
    const res = await PATCH(makeReq({ content: "" }), makeParams("1"));
    expect(res.status).toBe(400);
  });

  it("PATCH returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await PATCH(makeReq({ content: "hi" }), makeParams("1"));
    expect(res.status).toBe(429);
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
