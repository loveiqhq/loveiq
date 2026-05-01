import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetchWithTimeout = vi.fn();
vi.mock("../../lib/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

import { GET } from "../../app/api/health/route";

// `/api/health` is publicly reachable (uptime monitors, load balancers).
// The response body must NOT reveal which env vars are missing or which
// services are configured — that's a deployment-fingerprinting leak. The
// tests below pin the minimal `{ ok: boolean }` contract; diagnostic detail
// must stay in server logs only.

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    process.env.RESEND_API_KEY = "re_test";
  });

  it("returns 200 with only { ok: true } when all checks pass", async () => {
    mockFetchWithTimeout.mockResolvedValue({ ok: true, status: 200 });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");

    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });

  it("returns 503 with only { ok: false } when Supabase returns non-ok status", async () => {
    mockFetchWithTimeout.mockResolvedValue({ ok: false, status: 503 });

    const res = await GET();
    expect(res.status).toBe(503);

    const json = await res.json();
    expect(json).toEqual({ ok: false });
  });

  it("returns 503 with only { ok: false } when Supabase ping throws", async () => {
    mockFetchWithTimeout.mockRejectedValue(new Error("Network error"));

    const res = await GET();
    expect(res.status).toBe(503);

    const json = await res.json();
    expect(json).toEqual({ ok: false });
  });

  it("does NOT leak which env var is missing in the public response", async () => {
    delete process.env.RESEND_API_KEY;
    mockFetchWithTimeout.mockResolvedValue({ ok: true, status: 200 });

    const res = await GET();
    expect(res.status).toBe(503);

    const json = await res.json();
    expect(json).toEqual({ ok: false });
    // Response must contain no env var names, no service-status fields.
    expect(JSON.stringify(json)).not.toMatch(/RESEND|SUPABASE|env|resend|supabase/i);
  });

  it("returns 503 with only { ok: false } when SUPABASE_URL is absent", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const res = await GET();
    expect(res.status).toBe(503);

    const json = await res.json();
    expect(json).toEqual({ ok: false });
  });
});
