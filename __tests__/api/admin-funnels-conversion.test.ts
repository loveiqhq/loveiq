import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("../../lib/admin/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("../../lib/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("../../lib/admin/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "../../app/api/admin/funnels/conversion/route";

function makeRequest(queryString = "") {
  return new Request(`http://localhost/api/admin/funnels/conversion${queryString}`);
}

describe("GET /api/admin/funnels/conversion", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
  });

  it("returns funnel anomalies and trust warnings", async () => {
    mockSupabaseFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          stages: [
            { name: "survey_started", count: 10 },
            { name: "survey_completed", count: 5 },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          stages: [
            { name: "survey_started", count: 25 },
            { name: "survey_completed", count: 15 },
          ],
        }),
      });

    const res = await GET(makeRequest("?days=30&utm=google"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.stages).toHaveLength(2);
    expect(json.previousStages).toEqual([
      { name: "survey_started", count: 15 },
      { name: "survey_completed", count: 10 },
    ]);
    expect(json.anomalies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "survey_completed",
          deltaPct: -50,
          severity: "warning",
        }),
      ])
    );
    expect(json.trust).toEqual({
      sampleSize: 10,
      warning: "Funnel deltas are based on a small current-window sample.",
      comparisonAvailable: true,
      comparisonMessage: null,
    });
  });

  it("disables change detection in all-time mode", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        stages: [
          { name: "survey_started", count: 100 },
          { name: "survey_completed", count: 60 },
        ],
      }),
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.previousStages).toEqual([]);
    expect(json.anomalies).toEqual([]);
    expect(json.trust.comparisonAvailable).toBe(false);
    expect(json.trust.comparisonMessage).toContain("bounded time window");
    expect(mockSupabaseFetch).toHaveBeenCalledTimes(1);
  });

  it("accepts mixed RPC payload shapes without throwing", async () => {
    mockSupabaseFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          stages: [
            { name: "waitlist_signups", count: 40 },
            { name: "survey_started", count: 20 },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { name: "waitlist_signups", count: 70 },
          { name: "survey_started", count: 35 },
        ],
      });

    const res = await GET(makeRequest("?days=30"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.stages).toEqual([
      { name: "waitlist_signups", count: 40 },
      { name: "survey_started", count: 20 },
    ]);
    expect(json.previousStages).toEqual([
      { name: "waitlist_signups", count: 30 },
      { name: "survey_started", count: 15 },
    ]);
  });

  it("falls back safely when the RPC returns malformed data", async () => {
    mockSupabaseFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stages: [{ name: "survey_started", count: "bad" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ unexpected: true }),
      });

    const res = await GET(makeRequest("?days=30"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.stages).toEqual([{ name: "survey_started", count: 0 }]);
    expect(json.previousStages).toEqual([]);
    expect(json.anomalies).toEqual([]);
    expect(json.trust).toEqual({
      sampleSize: 0,
      warning: "Funnel deltas are based on a small current-window sample.",
      comparisonAvailable: true,
      comparisonMessage: null,
    });
  });

  it("returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });
});
