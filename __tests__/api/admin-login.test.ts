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

const mockResendSend = vi.fn().mockResolvedValue({ id: "msg_123" });
vi.mock("resend", () => {
  return {
    Resend: class MockResend {
      emails = { send: (...args: unknown[]) => mockResendSend(...args) };
    },
  };
});

vi.mock("../../lib/emails/admin-magic-link", () => ({
  adminMagicLinkEmail: vi.fn().mockReturnValue({
    subject: "Your LoveIQ admin login link",
    html: "<p>Sign in</p>",
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
    mockSupabaseFetch.mockImplementation((path: string) => {
      if (path.includes("/admin_users")) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ email: "admin@test.com" }],
        });
      }
      if (path.includes("/admin/generate_link")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ hashed_token: "test-hashed-token" }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    mockResendSend.mockResolvedValue({ id: "msg_123" });
  });

  it("returns success and sends magic link for allowed email", async () => {
    const res = await POST(makeRequest({ email: "admin@test.com" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toContain("check your inbox");
    // Should have called generate_link
    expect(mockSupabaseFetch).toHaveBeenCalledWith(
      "/auth/v1/admin/generate_link",
      expect.objectContaining({ method: "POST" })
    );
    // Should have sent email via Resend
    expect(mockResendSend).toHaveBeenCalledOnce();
  });

  it("returns same generic response for non-allowed email (no enumeration)", async () => {
    mockSupabaseFetch.mockImplementation((path: string) => {
      if (path.includes("/admin_users")) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });

    const res = await POST(makeRequest({ email: "nobody@test.com" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toContain("check your inbox");
    // Should NOT have called generate_link or Resend
    expect(mockResendSend).not.toHaveBeenCalled();
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

  it("returns 500 when generate_link fails", async () => {
    mockSupabaseFetch.mockImplementation((path: string) => {
      if (path.includes("/admin_users")) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ email: "admin@test.com" }],
        });
      }
      if (path.includes("/admin/generate_link")) {
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: "Internal server error" }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });

    const res = await POST(makeRequest({ email: "admin@test.com" }));
    expect(res.status).toBe(500);
  });
});
