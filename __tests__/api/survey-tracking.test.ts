import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
const mockFetchWithTimeout = vi.fn();
vi.mock("../../lib/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

vi.mock("../../lib/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
  CircuitOpenError: class CircuitOpenError extends Error {},
}));

vi.mock("../../lib/csrf", () => ({
  verifyCsrfToken: vi.fn().mockResolvedValue(true),
  verifyCsrfTokenFromBody: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../lib/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from "../../app/api/survey-tracking/route";
import { verifyCsrfToken } from "../../lib/csrf";
import { checkRateLimit } from "../../lib/ratelimit";

function makeRequest(body: unknown, csrfHeader = "valid-token") {
  return new Request("http://localhost/api/survey-tracking", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrfHeader,
    },
    body: JSON.stringify(body),
  });
}

function validEvent() {
  return {
    sessionId: "550e8400-e29b-41d4-a716-446655440000",
    qId: "00001",
    chapter: "Background",
    questionIndex: 0,
    timeSpentMs: 5000,
    answered: true,
    direction: "forward",
    timestamp: new Date().toISOString(),
  };
}

describe("POST /api/survey-tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    vi.mocked(verifyCsrfToken).mockResolvedValue(true);
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 29,
      resetAt: new Date(),
    });
    mockFetchWithTimeout.mockResolvedValue({ ok: true });
  });

  it("returns 200 with valid batch of events", async () => {
    const res = await POST(makeRequest({ events: [validEvent()] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("returns 403 when CSRF fails", async () => {
    vi.mocked(verifyCsrfToken).mockResolvedValue(false);
    const { verifyCsrfTokenFromBody } = await import("../../lib/csrf");
    vi.mocked(verifyCsrfTokenFromBody).mockResolvedValue(false);

    const res = await POST(makeRequest({ events: [validEvent()] }));
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000),
    });
    const res = await POST(makeRequest({ events: [validEvent()] }));
    expect(res.status).toBe(429);
  });

  it("returns 400 with invalid event schema", async () => {
    const res = await POST(makeRequest({ events: [{ bad: "data" }] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 with empty events array", async () => {
    const res = await POST(makeRequest({ events: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 503 when Supabase is not configured", async () => {
    delete process.env.SUPABASE_URL;
    const res = await POST(makeRequest({ events: [validEvent()] }));
    expect(res.status).toBe(503);
  });

  it("returns 500 when Supabase insert fails", async () => {
    mockFetchWithTimeout.mockResolvedValue({ ok: false, status: 500 });
    const res = await POST(makeRequest({ events: [validEvent()] }));
    expect(res.status).toBe(500);
  });
});
