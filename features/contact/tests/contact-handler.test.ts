import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// --- Mocks (must be before imports) ---

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockVerifyCsrf = vi.fn<() => Promise<boolean>>();
vi.mock("@shared/http/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockVerifyCsrf(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
const mockGetClientIp = vi.fn();
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: (...args: unknown[]) => mockGetClientIp(...args),
}));

const mockFetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

const mockEmailSend = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mockEmailSend };
  },
}));

// --- Dynamic import to ensure env vars are set before module-level reads ---

let POST: (request: Request) => Promise<Response>;

beforeAll(async () => {
  // These must be set BEFORE importing the contact route because it reads
  // recaptchaSecret and contactToEmail at module top level.
  process.env.RECAPTCHA_SECRET_KEY = "test-recaptcha-secret";
  process.env.CONTACT_TO_EMAIL = "team@loveiq.org";
  process.env.RESEND_API_KEY = "re_test_key";

  const mod = await import("@/app/api/contact/route");
  POST = mod.POST;
});

// --- Helpers ---

const validBody = {
  firstName: "John",
  lastName: "Doe",
  phone: "+1234567890",
  email: "john@example.com",
  message: "Hello, I would like to learn more about LoveIQ.",
  captcha: "03AGdBq24PBCgJ_valid_captcha_token",
};

function makeRequest(body: unknown = validBody) {
  return new Request("http://localhost:3000/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function allowCsrf() {
  mockVerifyCsrf.mockResolvedValue(true);
}

function allowRateLimit() {
  mockCheckRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 4,
    resetAt: new Date(Date.now() + 60000),
  });
}

function allowCaptcha() {
  mockFetchWithTimeout.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ success: true }),
  });
}

function mockSlackOk() {
  mockFetchWithTimeout.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => "ok",
  });
}

// --- Tests ---

describe("POST /api/contact", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetClientIp.mockReturnValue("1.2.3.4");
  });

  it("returns 403 when CSRF token is invalid", async () => {
    mockVerifyCsrf.mockResolvedValue(false);

    const res = await POST(makeRequest());
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.error).toBe("Invalid request.");
  });

  it("returns 429 when rate limited", async () => {
    allowCsrf();
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 30000),
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(429);

    const json = await res.json();
    expect(json.error).toBe("Please try again later.");
    expect(res.headers.get("Retry-After")).toBeDefined();
  });

  it("returns 400 for invalid body (missing required fields)", async () => {
    allowCsrf();
    allowRateLimit();

    const res = await POST(makeRequest({ email: "john@example.com" }));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("Invalid input.");
  });

  it("returns 400 for malformed JSON", async () => {
    allowCsrf();
    allowRateLimit();

    const req = new Request("http://localhost:3000/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when captcha fails", async () => {
    allowCsrf();
    allowRateLimit();

    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false }),
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("Captcha failed. Please try again.");
  });

  it("returns 400 when reCAPTCHA endpoint is unreachable", async () => {
    allowCsrf();
    allowRateLimit();

    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("Captcha failed. Please try again.");
  });

  it("returns success for full happy path", async () => {
    allowCsrf();
    allowRateLimit();
    allowCaptcha();
    mockEmailSend.mockResolvedValue({});
    mockSlackOk();

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("sends email to CONTACT_TO_EMAIL", async () => {
    allowCsrf();
    allowRateLimit();
    allowCaptcha();
    mockEmailSend.mockResolvedValue({});
    mockSlackOk();

    await POST(makeRequest());

    expect(mockEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "team@loveiq.org",
        replyTo: "john@example.com",
        subject: expect.stringContaining("John Doe"),
      })
    );
  });

  it("returns 500 when email sending throws", async () => {
    allowCsrf();
    allowRateLimit();
    allowCaptcha();
    mockEmailSend.mockRejectedValue(new Error("Resend API down"));

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error).toBe("Unable to send message. Please try later.");
  });

  it("rejects email with header injection characters", async () => {
    allowCsrf();
    allowRateLimit();

    const res = await POST(
      makeRequest({
        ...validBody,
        email: "evil@example.com\r\nBcc: attacker@evil.com",
      })
    );
    // Zod email validation rejects newline-containing emails
    expect(res.status).toBe(400);
  });

  it("calls checkRateLimit with client IP and contact bucket", async () => {
    allowCsrf();
    mockGetClientIp.mockReturnValue("10.0.0.1");
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 60000),
    });

    await POST(makeRequest());

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "10.0.0.1",
      expect.objectContaining({ bucket: "contact", limit: 5 })
    );
  });

  it("returns 400 for message shorter than 10 chars", async () => {
    allowCsrf();
    allowRateLimit();

    const res = await POST(makeRequest({ ...validBody, message: "Hi" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for captcha too short", async () => {
    allowCsrf();
    allowRateLimit();

    const res = await POST(makeRequest({ ...validBody, captcha: "short" }));
    expect(res.status).toBe(400);
  });
});
