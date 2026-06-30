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
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@features/survey/server/server", () => ({
  isSurveyClosed: vi.fn().mockResolvedValue(false),
}));

// next/headers cookies() — drives the email-position A/B arm stamp. Default
// returns no cookie (arm omitted), matching pre-experiment traffic.
const { mockCookieGet } = vi.hoisted(() => ({ mockCookieGet: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: mockCookieGet })),
}));

import { POST } from "@/app/api/survey-partial/route";
import { verifyCsrfHeaderOrBody } from "@shared/http/csrf";
import { checkRateLimit } from "@shared/http/ratelimit";
import { isSurveyClosed } from "@features/survey/server/server";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/survey-partial", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": "valid-token",
    },
    body: JSON.stringify(body),
  });
}

function validBody() {
  return {
    sessionId: "550e8400-e29b-41d4-a716-446655440000",
    answers: { "00000": "alice@test.com", "00001": "Alice" },
    currentIndex: 2,
    startedAt: new Date().toISOString(),
  };
}

describe("POST /api/survey-partial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    vi.mocked(verifyCsrfHeaderOrBody).mockResolvedValue(true);
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 19,
      resetAt: new Date(),
    });
    mockFetchWithTimeout.mockResolvedValue({ ok: true });
    mockCookieGet.mockReturnValue(undefined);
  });

  it("returns 200 with valid partial save", async () => {
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("returns 403 when CSRF fails", async () => {
    vi.mocked(verifyCsrfHeaderOrBody).mockResolvedValue(false);
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000),
    });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(429);
  });

  it("returns 400 with invalid session ID", async () => {
    const res = await POST(makeRequest({ ...validBody(), sessionId: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 with missing answers", async () => {
    const { answers: _a, ...body } = validBody();
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });

  it("F-04: returns 409 when survey is closed", async () => {
    vi.mocked(isSurveyClosed).mockResolvedValueOnce(true);
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(409);
    // No Supabase upsert should have happened.
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it("returns 503 when Supabase is not configured", async () => {
    delete process.env.SUPABASE_URL;
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(503);
  });

  it("returns 500 when Supabase upsert fails", async () => {
    mockFetchWithTimeout.mockResolvedValue({ ok: false, status: 500 });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(500);
  });

  it("sends upsert with merge-duplicates Prefer header", async () => {
    await POST(makeRequest(validBody()));

    const call = mockFetchWithTimeout.mock.calls[0];
    expect(call[0]).toContain("/rest/v1/survey_partial_save?on_conflict=session_id");
    expect(call[1].headers.Prefer).toBe("resolution=merge-duplicates");
  });

  it("includes utmTracker when provided", async () => {
    const utmJson = JSON.stringify({ utm_source: "google" });
    await POST(makeRequest({ ...validBody(), utmTracker: utmJson }));

    const call = mockFetchWithTimeout.mock.calls[0];
    const row = JSON.parse(call[1].body);
    expect(row.utm_tracker).toBe(utmJson);
  });

  it("sets utm_tracker to null when utmTracker is omitted", async () => {
    await POST(makeRequest(validBody()));

    const call = mockFetchWithTimeout.mock.calls[0];
    const row = JSON.parse(call[1].body);
    expect(row.utm_tracker).toBeNull();
  });

  it("stamps email_position from the A/B cookie", async () => {
    mockCookieGet.mockReturnValue({ value: "last" });
    await POST(makeRequest(validBody()));

    const call = mockFetchWithTimeout.mock.calls[0];
    const row = JSON.parse(call[1].body);
    expect(row.email_position).toBe("last");
  });

  it("omits email_position when no A/B cookie is present", async () => {
    await POST(makeRequest(validBody()));

    const call = mockFetchWithTimeout.mock.calls[0];
    const row = JSON.parse(call[1].body);
    expect(row.email_position).toBeUndefined();
  });

  it("ignores an invalid email_position cookie value", async () => {
    mockCookieGet.mockReturnValue({ value: "sideways" });
    await POST(makeRequest(validBody()));

    const call = mockFetchWithTimeout.mock.calls[0];
    const row = JSON.parse(call[1].body);
    expect(row.email_position).toBeUndefined();
  });
});
