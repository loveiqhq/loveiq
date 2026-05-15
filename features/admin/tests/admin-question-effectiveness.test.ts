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

import { GET } from "@/app/api/admin/question-effectiveness/route";

function makeRequest(queryString = "") {
  return new Request(`http://localhost/api/admin/question-effectiveness${queryString}`);
}

function makeRpcResponse(questions: unknown[], totalSessions: number) {
  return {
    ok: true,
    json: async () => ({
      questions,
      totalSessions,
    }),
  };
}

describe("GET /api/admin/question-effectiveness", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
  });

  it("returns a regression watchlist with real skip-rate data", async () => {
    mockSupabaseFetch
      .mockResolvedValueOnce(
        makeRpcResponse(
          [
            {
              q_id: "01002",
              chapter: "1",
              reach_n: 50,
              dropoff_n: 10,
              avg_active_time_s: 24,
              backtrack_n: 8,
            },
          ],
          50
        )
      )
      .mockResolvedValueOnce(
        makeRpcResponse(
          [
            {
              q_id: "01002",
              chapter: "1",
              reach_n: 200,
              dropoff_n: 12,
              avg_active_time_s: 11,
              backtrack_n: 6,
            },
          ],
          200
        )
      )
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { was_skipped: true, revision_count: 2, survey_question: { frontend_qid: "01002" } },
          { was_skipped: false, revision_count: 1, survey_question: { frontend_qid: "01002" } },
          { was_skipped: false, revision_count: 1, survey_question: { frontend_qid: "01002" } },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { was_skipped: false, revision_count: 0, survey_question: { frontend_qid: "01002" } },
          { was_skipped: false, revision_count: 0, survey_question: { frontend_qid: "01002" } },
          { was_skipped: false, revision_count: 1, survey_question: { frontend_qid: "01002" } },
        ],
      });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.questions).toHaveLength(1);
    expect(json.questions[0].skipRate).toBe(33.3);
    expect(json.questions[0].watchStatus).toBe("regressed");
    expect(json.questions[0].regressionReasons.length).toBeGreaterThan(0);
    expect(json.watchlist).toHaveLength(1);
    expect(json.summary.comparisonWindowDays).toBe(30);
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
