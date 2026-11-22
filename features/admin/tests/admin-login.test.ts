import { createHmac } from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@shared/http/csrf", () => ({
  verifyCsrfToken: vi.fn().mockResolvedValue(true),
}));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));
const mockAudit = vi.fn();
vi.mock("@features/admin/server/audit", () => ({
  logAdminAction: (...args: unknown[]) => mockAudit(...args),
}));
const mockSlack = vi.fn();
vi.mock("@shared/observability/slack", () => ({
  notifySlack: (...args: unknown[]) => mockSlack(...args),
  escapeSlack: (s: string) => s,
  maskEmail: (s: string) => s,
}));

/** Supabase Auth as the route meets it: the password check, and the session cookie it writes. */
const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: {
      cookies: { setAll: (c: Array<{ name: string; value: string; options: object }>) => void };
    }
  ) => ({
    auth: {
      signInWithPassword: async (creds: { email: string; password: string }) => {
        const result = await auth.signInWithPassword(creds);
        if (!result.error)
          opts.cookies.setAll([
            {
              name: "sb-test-auth-token",
              value: "session",
              options: { path: "/", httpOnly: true },
            },
          ]);
        return result;
      },
      signOut: (...args: unknown[]) => auth.signOut(...args),
    },
  }),
}));

import { POST } from "@/app/api/admin/login/route";
import { ADMIN_TEAM_EMAIL } from "@features/admin/server/sign-in";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit } from "@shared/http/ratelimit";
import { ADMIN_HOME } from "@shared/url/admin-next";

const request = (body: unknown) =>
  new NextRequest("http://localhost/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": "valid" },
    body: JSON.stringify(body),
  });

const RIGHT = "the-team-password";
const SECRET = "s".repeat(40);
/** What Supabase holds: the team password mixed with the server's secret, never the password itself. */
const HELD = createHmac("sha256", SECRET).update(RIGHT).digest("base64url");

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("ADMIN_TEAM_PASSWORD_SECRET", SECRET);
  vi.mocked(verifyCsrfToken).mockResolvedValue(true);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 4, resetAt: new Date() });
  auth.signInWithPassword.mockImplementation(async ({ password }: { password: string }) =>
    password === HELD
      ? { data: { user: { id: "user-team", email: ADMIN_TEAM_EMAIL } }, error: null }
      : { data: { user: null }, error: { status: 400, message: "Invalid login credentials" } }
  );
  auth.signOut.mockResolvedValue({ error: null });
  mockSupabaseFetch.mockResolvedValue({
    ok: true,
    json: async () => [{ email: ADMIN_TEAM_EMAIL }],
  });
});

describe("POST /api/admin/login (the team password, 22 Nov 2026)", () => {
  it("signs in the team account with the right password, as an ordinary admin session", async () => {
    const res = await POST(request({ password: RIGHT }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, next: ADMIN_HOME });
    // Supabase gets the password mixed with the server's secret, so the team password alone
    // opens nothing at Supabase's own (public) sign-in.
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: ADMIN_TEAM_EMAIL,
      password: HELD,
    });
    expect(JSON.stringify(auth.signInWithPassword.mock.calls)).not.toContain(RIGHT);
    const set = (name: string) => res.cookies.get(name);
    expect(set("sb-test-auth-token")?.value).toBe("session");
    expect(set("sb-test-auth-token")).toMatchObject({ sameSite: "lax", httpOnly: true });
    // R-03: the CSRF token is really replaced: a __Host- cookie only goes with Secure, Path=/.
    expect(res.headers.getSetCookie().find((c) => c.startsWith("__Host-csrf="))).toMatch(
      /^__Host-csrf=;.*Path=\/;.*Max-Age=0;.*Secure/
    );
    expect(set("admin_posthog_distinct_id")?.value).toBe("user-team");
    expect(set("__admin_activity")?.value).toMatch(/^\d+$/);
    expect(mockAudit).toHaveBeenCalledWith({
      admin_email: ADMIN_TEAM_EMAIL,
      action: "login",
      ip: "127.0.0.1",
    });
    expect(mockSlack).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "admin_login",
        text: ":lock: Admin login with the team password",
      })
    );
    // One shared account: a sign-in never ends the teammates' sessions.
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("opens the admin page the sign-in was for, and nothing outside the admin", async () => {
    const ok = await POST(
      request({ password: RIGHT, next: "/admin/ap/assessment-a/survey?period=7d" })
    );
    expect((await ok.json()).next).toBe("/admin/ap/assessment-a/survey?period=7d");
    for (const next of ["https://evil.example/admin", "//evil.example", "/survey"]) {
      const res = await POST(request({ password: RIGHT, next }));
      expect((await res.json()).next, next).toBe(ADMIN_HOME);
    }
  });

  it("refuses a wrong password with one plain answer, and records nothing", async () => {
    const res = await POST(request({ password: "wrong" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Incorrect password." });
    expect(res.cookies.get("sb-test-auth-token")).toBeUndefined();
    expect(mockAudit).not.toHaveBeenCalled();
    expect(mockSlack).not.toHaveBeenCalled();
  });

  it("refuses an empty or missing password before asking Supabase", async () => {
    for (const body of [{}, { password: "" }, { password: 7 }]) {
      const res = await POST(request(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("ends the new session when the team account is no longer an admin, answering as for a wrong password", async () => {
    mockSupabaseFetch.mockResolvedValue({ ok: true, json: async () => [] });
    const res = await POST(request({ password: RIGHT }));
    // The same answer as a wrong guess, headers included: it never tells a guesser they were right.
    const guess = await POST(request({ password: "wrong" }));
    expect(res.status).toBe(guess.status);
    expect(await res.json()).toEqual(await guess.json());
    expect(res.headers.getSetCookie()).toEqual(guess.headers.getSetCookie());
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mockAudit).not.toHaveBeenCalled();
    expect(mockSlack).toHaveBeenCalledWith(expect.objectContaining({ kind: "admin_login_denied" }));
  });

  it("checks CSRF first, then the rate limit, before any password check", async () => {
    vi.mocked(verifyCsrfToken).mockResolvedValueOnce(false);
    expect((await POST(request({ password: RIGHT }))).status).toBe(403);
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 30_000),
    });
    const limited = await POST(request({ password: RIGHT }));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(checkRateLimit).toHaveBeenCalledWith(
      "127.0.0.1",
      expect.objectContaining({ bucket: "admin-login", limit: 5 })
    );
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("says it can't when Supabase Auth isn't configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect((await POST(request({ password: RIGHT }))).status).toBe(500);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("says it can't, and never sends the bare password, when the server's secret is missing or short", async () => {
    for (const secret of ["", "too-short-a-secret"]) {
      vi.stubEnv("ADMIN_TEAM_PASSWORD_SECRET", secret);
      expect((await POST(request({ password: RIGHT }))).status, secret).toBe(500);
    }
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });
});
