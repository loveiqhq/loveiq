import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/csrf", () => ({
  verifyCsrfToken: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  checkCooldown: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@features/admin/server/supabase-server", () => ({
  createSupabaseServer: vi.fn().mockResolvedValue({
    auth: {
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}));

import { POST as adminLogout } from "@/app/api/admin/logout/route";
import { POST as stagingLogout } from "@/app/api/staging-logout/route";

// --- Helpers ---

function makeRequest(url: string) {
  return new Request(url, {
    method: "POST",
    headers: { "x-csrf-token": "valid-token" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Tests ---

describe("POST /api/admin/logout", () => {
  it("redirects to /admin/login", async () => {
    const res = await adminLogout(makeRequest("http://localhost/api/admin/logout"));

    expect(res.status).toBe(307);
    const location = res.headers.get("location") || "";
    expect(location).toContain("/admin/login");
  });

  it("clears admin_session cookie", async () => {
    const res = await adminLogout(makeRequest("http://localhost/api/admin/logout"));

    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain("admin_session=");
    expect(setCookie).toContain("Max-Age=0");
  });
});

describe("POST /api/staging-logout", () => {
  it("redirects to /login", async () => {
    const res = await stagingLogout(makeRequest("http://localhost/api/staging-logout"));

    expect(res.status).toBe(307);
    const location = res.headers.get("location") || "";
    expect(location).toContain("/login");
  });

  it("clears staging_session cookie", async () => {
    const res = await stagingLogout(makeRequest("http://localhost/api/staging-logout"));

    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain("staging_session=");
    expect(setCookie).toContain("Max-Age=0");
  });
});
