import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/csrf", () => ({
  verifyCsrfToken: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../lib/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockSupabaseFetch = vi.fn();
vi.mock("../../lib/admin/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

const mockSignInWithOtp = vi.fn();
vi.mock("../../lib/admin/supabase-server", () => ({
  createSupabaseServer: vi.fn().mockResolvedValue({
    auth: {
      signInWithOtp: (...args: unknown[]) => mockSignInWithOtp(...args),
    },
  }),
}));

import { POST } from "../../app/api/admin/login/route";
import { verifyCsrfToken } from "../../lib/csrf";
import { checkRateLimit } from "../../lib/ratelimit";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": "valid",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/login (magic link)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyCsrfToken).mockResolvedValue(true);
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: new Date(),
    });
    // Default: email is in allowlist
    mockSupabaseFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ email: "admin@test.com" }],
    });
    mockSignInWithOtp.mockResolvedValue({ error: null });
  });

  it("returns success and sends magic link for allowed email", async () => {
    const res = await POST(makeRequest({ email: "admin@test.com" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toContain("check your inbox");
    expect(mockSignInWithOtp).toHaveBeenCalledOnce();
  });

  it("returns same generic response for non-allowed email (no enumeration)", async () => {
    mockSupabaseFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const res = await POST(makeRequest({ email: "nobody@test.com" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toContain("check your inbox");
    // Should NOT have called signInWithOtp
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid email", async () => {
    const res = await POST(makeRequest({ email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when email is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 403 when CSRF fails", async () => {
    vi.mocked(verifyCsrfToken).mockResolvedValue(false);
    const res = await POST(makeRequest({ email: "admin@test.com" }));
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000),
    });
    const res = await POST(makeRequest({ email: "admin@test.com" }));
    expect(res.status).toBe(429);
  });

  it("returns 500 when admin_users check fails", async () => {
    mockSupabaseFetch.mockRejectedValue(new Error("DB error"));

    const res = await POST(makeRequest({ email: "admin@test.com" }));
    expect(res.status).toBe(500);
  });

  it("returns 500 when magic link send fails", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: { message: "SMTP error" } });

    const res = await POST(makeRequest({ email: "admin@test.com" }));
    expect(res.status).toBe(500);
  });
});
