import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockVerifyCsrfToken = vi.fn();
vi.mock("@/lib/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockVerifyCsrfToken(...(args as [])),
}));

vi.mock("@/lib/after-response", () => ({
  scheduleAfterResponse: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ error: null }) },
  })),
}));

vi.mock("@features/invite/emails/invite", () => ({
  inviteEmail: vi.fn().mockReturnValue({ subject: "s", html: "<p>h</p>", text: "t" }),
}));

vi.mock("@features/invite/emails/invite-b", () => ({
  inviteBEmail: vi.fn().mockReturnValue({ subject: "s", html: "<p>h</p>", text: "t" }),
}));

vi.mock("@/lib/emails/unsubscribe-token", () => ({
  buildUnsubscribeUrl: vi.fn().mockReturnValue("https://example.test/unsub"),
}));

vi.mock("@/lib/emails/ab-variant", () => ({
  pickEmailVariant: vi.fn().mockReturnValue("a"),
}));

vi.mock("@/lib/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn().mockResolvedValue({ ok: true, status: 201 }),
}));

vi.mock("@/lib/circuit-breaker", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/circuit-breaker")>("@/lib/circuit-breaker");
  return {
    ...actual,
    getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
  };
});

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from "@/app/api/invite/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/invite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  recipientEmail: "friend@example.test",
  referrerEmail: "me@example.test",
  referrerName: "Eman",
};

describe("POST /api/invite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: new Date(Date.now() + 60_000),
    });
    mockVerifyCsrfToken.mockResolvedValue(true);
    process.env.RESEND_API_KEY = "re_test";
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  });

  it("returns 403 when CSRF token invalid", async () => {
    mockVerifyCsrfToken.mockResolvedValue(false);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 30_000),
    });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("returns 400 when recipientEmail is not a valid email", async () => {
    const res = await POST(makeRequest({ ...validBody, recipientEmail: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when recipientEmail is missing", async () => {
    const res = await POST(makeRequest({ referrerName: "Eman" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when personalMessage exceeds 1500 chars", async () => {
    const res = await POST(makeRequest({ ...validBody, personalMessage: "x".repeat(1501) }));
    expect(res.status).toBe(400);
  });

  it("returns 503 when RESEND_API_KEY is missing", async () => {
    delete process.env.RESEND_API_KEY;
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(503);
  });

  it("returns 200 success on valid input", async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("accepts a request without referrerEmail (optional field)", async () => {
    const res = await POST(makeRequest({ recipientEmail: "friend@example.test" }));
    expect(res.status).toBe(200);
  });
});
