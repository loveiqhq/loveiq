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

import { POST } from "../../app/api/staging-login/route";
import { verifyCsrfToken } from "../../lib/csrf";
import { checkRateLimit } from "../../lib/ratelimit";

// --- Helpers ---

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/staging-login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": "valid",
    },
    body: JSON.stringify(body),
  });
}

// --- Tests ---

describe("POST /api/staging-login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STAGING_PASSWORD = "test-staging-pw";
    vi.mocked(verifyCsrfToken).mockResolvedValue(true);
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: new Date(),
    });
  });

  it("returns 404 when STAGING_PASSWORD is not set", async () => {
    delete process.env.STAGING_PASSWORD;

    const res = await POST(makeRequest({ password: "anything" }));
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.error).toBe("Not found.");
  });

  it("returns 400 when password is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("Invalid input.");
  });

  it("returns 400 when password is not a string", async () => {
    const res = await POST(makeRequest({ password: 12345 }));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("Invalid input.");
  });

  it("returns 401 on wrong password", async () => {
    const res = await POST(makeRequest({ password: "wrong-password" }));
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toBe("Incorrect password.");
  });

  it("returns 200 and sets staging_session cookie on correct password", async () => {
    const res = await POST(makeRequest({ password: "test-staging-pw" }));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);

    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("staging_session=");
    expect(setCookie?.toLowerCase()).toContain("samesite=strict");
  });

  it("returns 400 when body is malformed JSON", async () => {
    const req = new Request("http://localhost/api/staging-login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": "valid",
      },
      body: "not-json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 403 when CSRF fails", async () => {
    vi.mocked(verifyCsrfToken).mockResolvedValue(false);
    const res = await POST(makeRequest({ password: "test-staging-pw" }));
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000),
    });
    const res = await POST(makeRequest({ password: "test-staging-pw" }));
    expect(res.status).toBe(429);
  });
});
