import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCheckRateLimit = vi.fn();
const mockCheckCooldown = vi.fn();
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  checkCooldown: (...args: unknown[]) => mockCheckCooldown(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockVerifyCsrfToken = vi.fn();
vi.mock("@shared/http/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockVerifyCsrfToken(...(args as [])),
}));

const mockScheduleAfterResponse = vi.fn();
vi.mock("@shared/http/after-response", () => ({
  scheduleAfterResponse: (...args: unknown[]) => mockScheduleAfterResponse(...args),
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ error: null }) },
  })),
}));

const mockTestLinkEmail = vi.fn().mockReturnValue({ subject: "s", html: "<p>h</p>", text: "t" });
vi.mock("@features/survey/server/emails/test-link", () => ({
  testLinkEmail: (...args: unknown[]) => mockTestLinkEmail(...args),
}));

vi.mock("@shared/emails/unsubscribe-token", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/emails/unsubscribe-token")>()),
  buildUnsubscribeUrl: vi.fn().mockReturnValue("https://example.test/unsub"),
}));

vi.mock("@shared/emails/suppression", () => ({
  isEmailSuppressed: vi.fn().mockResolvedValue(false),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from "@/app/api/test-link/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/test-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/test-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyCsrfToken.mockResolvedValue(true);
    mockCheckRateLimit.mockResolvedValue({ allowed: true, resetAt: new Date(Date.now() + 60_000) });
    mockCheckCooldown.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    process.env.RESEND_API_KEY = "re_test";
  });

  it("rejects a missing CSRF token", async () => {
    mockVerifyCsrfToken.mockResolvedValue(false);
    const res = await POST(makeRequest({ email: "you@example.test" }));
    expect(res.status).toBe(403);
    expect(mockScheduleAfterResponse).not.toHaveBeenCalled();
  });

  it("rejects an invalid email", async () => {
    const res = await POST(makeRequest({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(mockScheduleAfterResponse).not.toHaveBeenCalled();
  });

  it("returns 429 when the IP rate limit is hit", async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      resetAt: new Date(Date.now() + 30_000),
    });
    const res = await POST(makeRequest({ email: "you@example.test" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("queues the email and normalizes the address", async () => {
    const res = await POST(makeRequest({ email: "  YOU@Example.TEST " }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mockCheckCooldown).toHaveBeenCalledWith(
      "you@example.test",
      "test-link-recipient",
      expect.any(Number)
    );
    expect(mockScheduleAfterResponse).toHaveBeenCalledTimes(1);
  });

  it("looks successful but sends nothing while the recipient is in cooldown", async () => {
    mockCheckCooldown.mockResolvedValue({ allowed: false, retryAfterMs: 1000 });
    const res = await POST(makeRequest({ email: "you@example.test" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    // No send scheduled — and no distinguishable response, so the endpoint
    // can't be used to probe whether an address already asked for a link.
    expect(mockScheduleAfterResponse).not.toHaveBeenCalled();
  });

  it("returns 503 when Resend is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    const res = await POST(makeRequest({ email: "you@example.test" }));
    expect(res.status).toBe(503);
    expect(mockScheduleAfterResponse).not.toHaveBeenCalled();
  });
});
