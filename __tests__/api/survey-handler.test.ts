import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks (must be before imports) ---

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockVerifyCsrf = vi.fn<() => Promise<boolean>>();
vi.mock("../../lib/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockVerifyCsrf(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
const mockCheckCooldown = vi.fn();
const mockGetClientIp = vi.fn();
vi.mock("../../lib/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  checkCooldown: (...args: unknown[]) => mockCheckCooldown(...args),
  getClientIp: (...args: unknown[]) => mockGetClientIp(...args),
}));

const mockFetchWithTimeout = vi.fn();
vi.mock("../../lib/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

vi.mock("../../lib/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
  CircuitOpenError: class CircuitOpenError extends Error {},
}));

// Set env vars before importing the handler
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";

import { POST } from "../../app/api/survey/route";

// --- Helpers ---

function makeRequest(body: unknown = validBody()) {
  return new Request("http://localhost:3000/api/survey", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody() {
  return {
    email: "alice@example.com",
    firstName: "Alice",
    answers: { q1: "yes", q2: 3, q3: ["a", "b"] },
    startedAt: new Date().toISOString(),
    durationMs: 120000,
  };
}

function allowCsrf() {
  mockVerifyCsrf.mockResolvedValue(true);
}

function allowRateLimit() {
  mockCheckRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 2,
    resetAt: new Date(Date.now() + 60_000),
  });
}

function allowCooldown() {
  mockCheckCooldown.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
}

function mockSupabaseRpcOk(result: unknown = { success: true }) {
  mockFetchWithTimeout.mockResolvedValueOnce({
    ok: true,
    json: async () => result,
  });
}

// --- Tests ---

describe("POST /api/survey", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
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
      resetAt: new Date(Date.now() + 30_000),
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(429);

    const json = await res.json();
    expect(json.error).toBe("Please try again later.");
    expect(res.headers.get("Retry-After")).toBeDefined();
  });

  it("returns 400 when email is missing", async () => {
    allowCsrf();
    allowRateLimit();

    const { email: _email, ...bodyWithoutEmail } = validBody();
    const res = await POST(makeRequest(bodyWithoutEmail));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("Invalid input");
  });

  it("returns 400 when email is invalid", async () => {
    allowCsrf();
    allowRateLimit();

    const res = await POST(makeRequest({ ...validBody(), email: "not-an-email" }));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("Invalid input");
  });

  it("returns 400 when body is malformed JSON", async () => {
    allowCsrf();
    allowRateLimit();

    const req = new Request("http://localhost:3000/api/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when honeypot field is filled", async () => {
    allowCsrf();
    allowRateLimit();

    const res = await POST(makeRequest({ ...validBody(), website: "http://spam.bot" }));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("Invalid input");
  });

  it("returns 429 when email cooldown is active", async () => {
    allowCsrf();
    allowRateLimit();
    mockCheckCooldown.mockResolvedValue({
      allowed: false,
      retryAfterMs: 270_000,
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(429);

    const json = await res.json();
    expect(json.error).toBe("Please wait before retrying.");
    expect(res.headers.get("Retry-After")).toBeDefined();
  });

  it("returns 503 when SUPABASE_URL is missing", async () => {
    allowCsrf();
    allowRateLimit();
    allowCooldown();

    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const res = await POST(makeRequest());
    expect(res.status).toBe(503);

    const json = await res.json();
    expect(json.error).toBe("Service unavailable.");
  });

  it("returns 503 when Supabase fetch throws a network error", async () => {
    allowCsrf();
    allowRateLimit();
    allowCooldown();

    mockFetchWithTimeout.mockRejectedValueOnce(new Error("Network failure"));

    const res = await POST(makeRequest());
    expect(res.status).toBe(503);

    const json = await res.json();
    expect(json.error).toBe("Service temporarily unavailable.");
  });

  it("returns 500 when Supabase RPC returns a non-ok HTTP status", async () => {
    allowCsrf();
    allowRateLimit();
    allowCooldown();

    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error).toBe("Unable to process request.");
  });

  it("returns 500 when Supabase RPC body contains success: false", async () => {
    allowCsrf();
    allowRateLimit();
    allowCooldown();

    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false, error: "duplicate email" }),
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error).toBe("Unable to process request.");
  });

  it("returns 200 with success: true on the happy path", async () => {
    allowCsrf();
    allowRateLimit();
    allowCooldown();
    mockSupabaseRpcOk();

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("forwards utmTracker to Supabase RPC when provided", async () => {
    allowCsrf();
    allowRateLimit();
    allowCooldown();
    mockSupabaseRpcOk();

    const utmJson = JSON.stringify({ utm_source: "google", utm_medium: "cpc" });
    await POST(makeRequest({ ...validBody(), utmTracker: utmJson }));

    const rpcCall = mockFetchWithTimeout.mock.calls[0];
    const rpcBody = JSON.parse(rpcCall[1].body);
    expect(rpcBody.p_utm_tracker).toBe(utmJson);
  });

  it("sends p_utm_tracker as null when utmTracker is omitted", async () => {
    allowCsrf();
    allowRateLimit();
    allowCooldown();
    mockSupabaseRpcOk();

    await POST(makeRequest());

    const rpcCall = mockFetchWithTimeout.mock.calls[0];
    const rpcBody = JSON.parse(rpcCall[1].body);
    expect(rpcBody.p_utm_tracker).toBeNull();
  });

  it("normalizes email to lowercase before calling checkCooldown", async () => {
    allowCsrf();
    allowRateLimit();
    allowCooldown();
    mockSupabaseRpcOk();

    await POST(makeRequest({ ...validBody(), email: "ALICE@EXAMPLE.COM" }));

    expect(mockCheckCooldown).toHaveBeenCalledWith(
      "alice@example.com",
      "survey-email",
      expect.any(Number)
    );
  });

  it("calls checkRateLimit with the client IP and correct bucket config", async () => {
    allowCsrf();
    mockGetClientIp.mockReturnValue("10.0.0.1");
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000),
    });

    await POST(makeRequest());

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "10.0.0.1",
      expect.objectContaining({ bucket: "survey", limit: 3 })
    );
  });
});
