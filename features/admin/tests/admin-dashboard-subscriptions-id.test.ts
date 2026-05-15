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

import { PATCH } from "@/app/api/admin/dashboard-subscriptions/[id]/route";

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });
const makeReq = (body: unknown) =>
  new Request("http://localhost/api/admin/dashboard-subscriptions/1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("admin dashboard-subscriptions/[id] PATCH", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() });
    mockVerifyCsrfToken.mockResolvedValue(true);
  });

  it("returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await PATCH(makeReq({ is_active: false }), makeParams("1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewer role", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
    const res = await PATCH(makeReq({ is_active: false }), makeParams("1"));
    expect(res.status).toBe(403);
  });

  it("returns 403 when CSRF invalid", async () => {
    mockVerifyCsrfToken.mockResolvedValue(false);
    const res = await PATCH(makeReq({ is_active: false }), makeParams("1"));
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await PATCH(makeReq({ is_active: false }), makeParams("1"));
    expect(res.status).toBe(429);
  });

  it("returns 400 when id is non-numeric", async () => {
    const res = await PATCH(makeReq({ is_active: false }), makeParams("abc"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when cadence is not in enum", async () => {
    const res = await PATCH(makeReq({ cadence: "annual" }), makeParams("1"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when subscriber_emails contains non-email string", async () => {
    const res = await PATCH(makeReq({ subscriber_emails: ["not-an-email"] }), makeParams("1"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when dashboard_key is unknown (post-Zod runtime check)", async () => {
    const res = await PATCH(makeReq({ dashboard_key: "totally-not-real" }), makeParams("1"));
    expect(res.status).toBe(400);
  });
});
