import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockVerifyAdminSession = vi.fn<() => Promise<boolean>>();
vi.mock("../../lib/admin/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("../../lib/admin/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("../../lib/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "../../app/api/admin/stats/route";

// --- Helpers ---

function makeRequest(queryString = "") {
  return new Request(`http://localhost/api/admin/stats${queryString}`);
}

function mockAllQueriesOk() {
  // submissionsRes (with content-range header)
  mockSupabaseFetch.mockResolvedValueOnce({
    ok: true,
    headers: new Headers({ "content-range": "0-1/2" }),
    json: async () => [
      { id: 1, status: "completed", created_date_time: "2025-01-01T10:00:00Z" },
      { id: 2, status: "completed", created_date_time: "2025-01-02T14:00:00Z" },
    ],
  });
  // behaviorRes
  mockSupabaseFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => [{ q_id: "q1" }, { q_id: "q1" }, { q_id: "q2" }],
  });
  // recentRes
  mockSupabaseFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => [
      { created_date_time: "2025-01-01T10:00:00Z" },
      { created_date_time: "2025-01-02T14:00:00Z" },
    ],
  });
}

// --- Tests ---

describe("GET /api/admin/stats", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue(true);
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
  });

  it("returns 401 when not authenticated", async () => {
    mockVerifyAdminSession.mockResolvedValue(false);

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 500 when any Supabase query fails", async () => {
    mockSupabaseFetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error).toBe("Unable to load stats.");
  });

  it("returns stats object on success", async () => {
    mockAllQueriesOk();

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.totalSubmissions).toBe(2);
    expect(json.completionRate).toBe(100);
    expect(json.dropOff).toEqual([
      { qId: "q1", count: 2 },
      { qId: "q2", count: 1 },
    ]);
    expect(json.daily).toEqual([
      { date: "2025-01-01", count: 1 },
      { date: "2025-01-02", count: 1 },
    ]);
  });

  it("returns 0% completion rate when total is 0", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "content-range": "*/0" }),
      json: async () => [],
    });
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.totalSubmissions).toBe(0);
    expect(json.completionRate).toBe(0);
  });
});
