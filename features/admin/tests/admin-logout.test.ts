import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCheckRateLimit = vi.fn();
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockVerifyCsrfToken = vi.fn();
vi.mock("@shared/http/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockVerifyCsrfToken(...(args as [])),
}));

// vi.mock factories are hoisted above top-level variables; use vi.hoisted to
// share the same mock function with the test body.
const { mockSignOut } = vi.hoisted(() => ({
  mockSignOut: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock("@features/admin/server/supabase-server", () => ({
  createSupabaseServer: vi.fn().mockResolvedValue({
    auth: { signOut: mockSignOut },
  }),
}));

import { POST } from "@/app/api/admin/logout/route";

function makeRequest(): Request {
  return new Request("http://localhost/api/admin/logout", { method: "POST" });
}

describe("admin logout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
    mockVerifyCsrfToken.mockResolvedValue(true);
  });

  it("returns 403 when CSRF token is invalid", async () => {
    mockVerifyCsrfToken.mockResolvedValue(false);
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("calls Supabase signOut and redirects to /admin/login on success", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(307); // NextResponse.redirect default
    expect(res.headers.get("location")).toMatch(/\/admin\/login$/);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("clears the legacy admin_session cookie on logout", async () => {
    const res = await POST(makeRequest());
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/admin_session=/);
    expect(setCookie).toMatch(/Max-Age=0/i);
  });
});
