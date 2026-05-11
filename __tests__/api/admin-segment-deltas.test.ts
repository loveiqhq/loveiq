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

import { GET } from "../../app/api/admin/segments/deltas/route";

describe("GET /api/admin/segments/deltas", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
  });

  it("uses scored archetype buckets from embedded objects and disables caching", async () => {
    const now = Date.now();
    mockSupabaseFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 1,
          status: "completed",
          utm_tracker: JSON.stringify({ utm_source: "google" }),
          created_date_time: new Date(now - 2 * 86_400_000).toISOString(),
          scoring_result: {
            primary_archetype: "Spark Seeker",
          },
        },
        {
          id: 2,
          status: "completed",
          utm_tracker: JSON.stringify({ utm_source: "google" }),
          created_date_time: new Date(now - 12 * 60 * 60 * 1000).toISOString(),
          scoring_result: {
            primary_archetype: "Approval Seeker",
          },
        },
      ],
    });

    const res = await GET(new Request("http://localhost/api/admin/segments/deltas?days=3"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0");

    const json = await res.json();
    expect(json.watchlist).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dimension: "archetype",
          key: "Approval Seeker",
        }),
      ])
    );
    expect(json.watchlist).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dimension: "archetype",
          key: "Unscored",
        }),
      ])
    );
  });

  it("returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/segments/deltas"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(new Request("http://localhost/api/admin/segments/deltas"));
    expect(res.status).toBe(429);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });
});
