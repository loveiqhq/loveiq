import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));
const mockCsrf = vi.fn();
vi.mock("@shared/http/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockCsrf(...(args as [])),
}));
const mockRate = vi.fn();
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockRate(...(args as [])),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

import { GET, POST } from "@/app/api/admin/ap/team-browser/route";

const ROUTE = "http://localhost/api/admin/ap/team-browser";
const get = (cookie = "") => GET(new Request(ROUTE, { headers: { cookie } }));
const post = (body: unknown, cookie = "") =>
  POST(
    new Request(ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyAdminSession.mockResolvedValue({ email: "mb@loveiq.org", role: "viewer" });
  mockCsrf.mockResolvedValue(true);
  mockRate.mockResolvedValue({ allowed: true });
});

describe("GET /api/admin/ap/team-browser", () => {
  it("needs an admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    expect((await get("loveiq_team=1")).status).toBe(401);
  });

  it("says whether this browser counts as team: its own cookie or our probes'", async () => {
    expect(await (await get("loveiq_team=1")).json()).toEqual({ team: true });
    expect(await (await get("loveiq_probe=1")).json()).toEqual({ team: true });
    expect(await (await get("loveiq_team=0; a=1")).json()).toEqual({ team: false });
    expect((await get()).headers.get("Cache-Control")).toMatch(/no-store/);
  });
});

describe("POST /api/admin/ap/team-browser", () => {
  it("marks the browser as team for two years", async () => {
    const res = await post({ team: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ team: true });
    expect(res.cookies.get("loveiq_team")).toMatchObject({
      value: "1",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 2 * 365 * 24 * 60 * 60,
    });
  });

  it("clears it; a probe's cookie still counts", async () => {
    const res = await post({ team: false }, "loveiq_team=1");
    expect(await res.json()).toEqual({ team: false });
    expect(res.cookies.get("loveiq_team")).toMatchObject({ value: "", path: "/", maxAge: 0 });
    expect(await (await post({ team: false }, "loveiq_probe=1")).json()).toEqual({ team: true });
  });

  it("refuses without the CSRF token, past the rate limit, without a session or with bad input", async () => {
    mockCsrf.mockResolvedValueOnce(false);
    expect((await post({ team: true })).status).toBe(403);
    mockRate.mockResolvedValueOnce({ allowed: false });
    expect((await post({ team: true })).status).toBe(429);
    mockVerifyAdminSession.mockResolvedValueOnce(null);
    expect((await post({ team: true })).status).toBe(401);
    for (const bad of [{}, { team: "yes" }, { team: 1 }, null]) {
      const res = await post(bad);
      expect(res.status).toBe(400);
      expect(res.cookies.get("loveiq_team")).toBeUndefined();
    }
  });
});
