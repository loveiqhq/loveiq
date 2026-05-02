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

import { GET } from "../../app/api/admin/funnels/cohorts/route";

function makeRequest(queryString = "") {
  return new Request(`http://localhost/api/admin/funnels/cohorts${queryString}`);
}

describe("GET /api/admin/funnels/cohorts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
  });

  it("returns strongest and weakest cohort summaries with trust metadata", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          label: "google",
          total_users: 10,
          survey_started: 10,
          survey_completed: 8,
          scored: 7,
          invite_sent: 2,
        },
        {
          label: "tiktok",
          total_users: 5,
          survey_started: 5,
          survey_completed: 1,
          scored: 1,
          invite_sent: 0,
        },
      ],
    });

    const res = await GET(makeRequest("?groupBy=utm&days=30"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.summary).toEqual({
      strongestCompletionLabel: "google",
      strongestCompletionRate: 80,
      weakestCompletionLabel: "tiktok",
      weakestCompletionRate: 20,
    });
    expect(json.trust).toEqual({
      sampleSize: 15,
      warning: "Cohort analysis is directional only because the sample is small.",
    });
  });
});
