import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
const mockFetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
  CircuitOpenError: class CircuitOpenError extends Error {},
}));

vi.mock("@shared/http/csrf", () => ({
  verifyCsrfToken: vi.fn().mockResolvedValue(true),
  verifyCsrfTokenFromBody: vi.fn().mockResolvedValue(true),
  verifyCsrfHeaderOrBody: vi.fn().mockResolvedValue(true),
}));

vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from "@/app/api/survey-tracking/route";
import { verifyCsrfHeaderOrBody } from "@shared/http/csrf";
import { checkRateLimit } from "@shared/http/ratelimit";

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
    vi.mocked(verifyCsrfHeaderOrBody).mockResolvedValue(true);
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 29,
      resetAt: new Date(),
    });
    mockFetchWithTimeout.mockResolvedValue({ ok: true });
  });

  it("keeps a slow question's event instead of failing the whole batch", async () => {
    // A question left open past ten minutes used to 400 the batch, losing the events
    // sent with it (often the quit or finish event).
    const slow = { ...validEvent(), timeSpentMs: 15 * 60_000 };
    const res = await POST(makeRequest({ events: [validEvent(), slow] }));
    expect(res.status).toBe(200);
    const rows = JSON.parse(mockFetchWithTimeout.mock.calls[0]![1].body);
    expect(rows).toHaveLength(2);
    expect(rows[1].time_spent_ms).toBe(15 * 60_000);
  });

  it("clamps an impossible time spent instead of refusing it", async () => {
    const res = await POST(
      makeRequest({
        events: [
          { ...validEvent(), timeSpentMs: -5 },
          { ...validEvent(), timeSpentMs: 3 * 86_400_000 },
        ],
      })
    );
    expect(res.status).toBe(200);
    const rows = JSON.parse(mockFetchWithTimeout.mock.calls[0]![1].body);
    expect(rows.map((r: { time_spent_ms: number }) => r.time_spent_ms)).toEqual([0, 86_400_000]);
  });

  it("returns 200 with valid batch of events", async () => {
    const res = await POST(makeRequest({ events: [validEvent()] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("returns 403 when CSRF fails", async () => {
    vi.mocked(verifyCsrfHeaderOrBody).mockResolvedValue(false);
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
