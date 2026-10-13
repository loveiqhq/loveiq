import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const auth = {
  verifyOtp: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
};
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth }) }));
const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));
vi.mock("@features/admin/server/audit", () => ({ logAdminAction: vi.fn() }));
vi.mock("@shared/http/ratelimit", () => ({ getClientIp: vi.fn().mockReturnValue("127.0.0.1") }));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@shared/observability/slack", () => ({
  notifySlack: vi.fn(),
  maskEmail: (e: string) => e,
  escapeSlack: (s: string) => s,
}));

import { GET } from "@/app/admin/auth/callback/route";

/** A browser coming back days later: its activity stamp is from an old, idle session. */
const callback = () =>
  GET(
    new NextRequest("http://localhost/admin/auth/callback?token_hash=abc&type=magiclink", {
      headers: { cookie: `__admin_activity=${Date.now() - 3 * 86_400_000}` },
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  auth.verifyOtp.mockResolvedValue({ error: null });
  auth.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "mb@loveiq.org" } } });
  auth.signOut.mockResolvedValue({ error: null });
  mockSupabaseFetch.mockResolvedValue({
    ok: true,
    json: async () => [{ email: "mb@loveiq.org", role: "admin" }],
  });
});

describe("GET /admin/auth/callback", () => {
  it("stamps fresh activity on a sign-in, so an old stamp cannot bounce it to 'idle timeout'", async () => {
    const before = Date.now();
    const res = await callback();
    expect(res.headers.get("location")).toBe("http://localhost/admin");
    const stamp = res.cookies.get("__admin_activity");
    expect(Number(stamp?.value)).toBeGreaterThanOrEqual(before);
    expect(stamp).toMatchObject({ httpOnly: true, path: "/", maxAge: 7 * 24 * 60 * 60 });
  });

  it("stamps nothing when the sign-in fails", async () => {
    auth.verifyOtp.mockResolvedValue({ error: { message: "expired" } });
    auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await callback();
    expect(res.headers.get("location")).toContain("error=auth_failed");
    expect(res.cookies.get("__admin_activity")).toBeUndefined();
  });

  it("stamps nothing for someone not on the admin list", async () => {
    mockSupabaseFetch.mockResolvedValue({ ok: true, json: async () => [] });
    const res = await callback();
    expect(res.headers.get("location")).toContain("error=not_authorized");
    expect(res.cookies.get("__admin_activity")).toBeUndefined();
  });
});
