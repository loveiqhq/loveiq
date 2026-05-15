import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/admin/comparisons/segment/route";

function makeRequest(queryString = "") {
  return new Request(`http://localhost/api/admin/comparisons/segment${queryString}`);
}

describe("GET /api/admin/comparisons/segment", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
  });

  it("evaluates saved segments through snapshot RPCs", async () => {
    mockSupabaseFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 1,
            name: "Paid Spark",
            rules: {
              logic: "and",
              conditions: [
                { field: "archetype", operator: "eq", value: "Spark Seeker" },
                { field: "has_payment", operator: "eq", value: true },
              ],
            },
          },
          {
            id: 2,
            name: "TikTok Traffic",
            rules: {
              logic: "and",
              conditions: [{ field: "utm_source", operator: "eq", value: "tiktok" }],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total_submissions: 1,
          completed: 1,
          avg_duration_ms: 100000,
          archetype_distribution: [{ archetype: "Spark Seeker", count: 1 }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total_submissions: 1,
          completed: 1,
          avg_duration_ms: 70000,
          archetype_distribution: [{ archetype: "Romantic Idealist", count: 1 }],
        }),
      });

    const res = await GET(makeRequest("?savedSegmentA=1&savedSegmentB=2"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.segmentA.total_submissions).toBe(1);
    expect(json.segmentA.completed).toBe(1);
    expect(json.segmentB.total_submissions).toBe(1);
    expect(json.trust).toEqual({
      source: "materialized_snapshot",
      refreshCadenceMinutes: 5,
      segmentCount: 2,
    });
    expect(mockSupabaseFetch.mock.calls[0][0]).toContain(
      "or=(admin_email.eq.admin%40test.com,is_shared.eq.true)"
    );
    expect(mockSupabaseFetch.mock.calls[1][0]).toBe("/rest/v1/rpc/get_segment_metrics_by_rules");
    expect(mockSupabaseFetch.mock.calls[2][0]).toBe("/rest/v1/rpc/get_segment_metrics_by_rules");
  });

  it("requires two saved segments for saved-segment comparison", async () => {
    const res = await GET(makeRequest("?savedSegmentA=1"));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("Select two saved segments to compare.");
  });

  it("uses snapshot metrics RPC for session state comparisons", async () => {
    mockSupabaseFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total_submissions: 4,
          completed: 3,
          avg_duration_ms: 91000,
          archetype_distribution: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total_submissions: 6,
          completed: 4,
          avg_duration_ms: 102000,
          archetype_distribution: [],
        }),
      });

    const res = await GET(makeRequest("?sessionStateA=fresh&sessionStateB=resumed"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.segmentA.total_submissions).toBe(4);
    expect(json.segmentB.total_submissions).toBe(6);
    expect(json.trust).toEqual({
      source: "materialized_snapshot",
      refreshCadenceMinutes: 5,
    });
    expect(mockSupabaseFetch.mock.calls[0][0]).toBe("/rest/v1/rpc/get_segment_metrics_snapshot");
    expect(mockSupabaseFetch.mock.calls[1][0]).toBe("/rest/v1/rpc/get_segment_metrics_snapshot");
    expect(mockSupabaseFetch.mock.calls[0][1].body).toContain('"p_session_state":"fresh"');
    expect(mockSupabaseFetch.mock.calls[1][1].body).toContain('"p_session_state":"resumed"');
  });

  it("returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(makeRequest("?savedSegmentA=1&savedSegmentB=2"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(makeRequest("?savedSegmentA=1&savedSegmentB=2"));
    expect(res.status).toBe(429);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });
});
