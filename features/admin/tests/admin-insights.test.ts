import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/admin/insights/route";

function makeRequest(queryString = "") {
  return new Request(`http://localhost/api/admin/insights${queryString}`);
}

describe("GET /api/admin/insights", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() });
  });

  it("returns prioritized triage insights with summary counts", async () => {
    mockSupabaseFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          period_comparison: {
            current_submissions: 12,
            previous_submissions: 24,
            current_completion_rate: 45,
            previous_completion_rate: 60,
            current_avg_duration_min: 13,
            previous_avg_duration_min: 9,
            current_waitlist: 8,
            previous_waitlist: 5,
          },
          high_friction_questions: [{ q_id: "01002", avg_time_sec: 28, backtrack_count: 6 }],
          top_drop_off_questions: [{ q_id: "01002", abandon_count: 5 }],
          fastest_growing_archetype: {
            archetype: "Spark Seeker",
            current: 7,
            previous: 3,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 1, status: "completed", utm_tracker: "google" },
          { id: 2, status: "completed", utm_tracker: "google" },
          { id: 3, status: "completed", utm_tracker: "google" },
          { id: 4, status: "flagged", utm_tracker: "tiktok" },
          { id: 5, status: "archived", utm_tracker: "tiktok" },
          { id: 6, status: "archived", utm_tracker: "tiktok" },
        ],
      });

    const res = await GET(makeRequest("?days=30"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.insights.length).toBeGreaterThan(3);
    expect(json.summary.attentionCount).toBeGreaterThan(0);
    expect(json.summary.opportunityCount).toBeGreaterThan(0);
    expect(json.insights[0]).toHaveProperty("priority");
    expect(json.insights[0]).toHaveProperty("confidence");
    expect(
      json.insights.some((insight: { category: string }) => insight.category === "acquisition")
    ).toBe(true);
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
