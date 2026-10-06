/**
 * The scorecard must be computed from every answer, not from a page of them.
 *
 * It read survey_submission_answer with no filter and no ORDER BY behind
 * `Range: "0-49999"`. PostgREST caps a response at 1,000 rows with no error,
 * so skip rate, average time and revision count were built from an arbitrary
 * 0.8% of 121,987 answers — about seventeen people out of 2,061 — and two of
 * the sixty-three questions never appeared at all.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));

vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/admin/scorecard/route";

const req = () => new Request("http://localhost/api/admin/scorecard");

describe("admin scorecard route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "a@test.com", role: "admin" });
  });

  function respond(totals: unknown[], questions: unknown[]): void {
    mockSupabaseFetch.mockImplementation(async (path: string) => ({
      ok: true,
      json: async () => (path.includes("rpc/get_question_scorecard") ? totals : questions),
    }));
  }

  it("aggregates in SQL rather than reading the answer rows", async () => {
    respond([], []);
    await GET(req());

    const paths = mockSupabaseFetch.mock.calls.map((c) => String(c[0]));
    expect(paths.some((p) => p.includes("rpc/get_question_scorecard"))).toBe(true);
    // The capped read is the bug; it must not come back.
    expect(paths.some((p) => p.includes("survey_submission_answer"))).toBe(false);
    expect(JSON.stringify(mockSupabaseFetch.mock.calls)).not.toContain("0-49999");
  });

  it("scores from the totals the database returns", async () => {
    // 200 answers, 20 skipped -> 10% skip; 100 timed answers totalling 3000s ->
    // 30s average; 50 revisions over 200 answers -> 0.25 average.
    respond(
      [
        {
          survey_question_id: 7,
          total_answers: 200,
          skipped: 20,
          total_time: 3000,
          time_count: 100,
          total_revisions: 50,
        },
      ],
      [{ id: 7, frontend_qid: "Q7", question_text: "How often do you talk about it?" }]
    );

    const body = (await (await GET(req())).json()) as {
      scorecard: Array<Record<string, number | string>>;
    };

    expect(body.scorecard).toHaveLength(1);
    expect(body.scorecard[0]).toMatchObject({
      questionId: 7,
      frontendQid: "Q7",
      totalAnswers: 200,
      skipRate: 10,
      avgTimeSec: 30,
      avgRevisions: 0.25,
    });
  });

  it("divides time by the TIMED count, not every answer", async () => {
    // The distinction the old loop made and a naive rewrite would lose: answers
    // with no recorded time must not drag the average down.
    respond(
      [
        {
          survey_question_id: 1,
          total_answers: 100,
          skipped: 0,
          total_time: 1000,
          time_count: 10,
          total_revisions: 0,
        },
      ],
      [{ id: 1, frontend_qid: "Q1", question_text: "q" }]
    );
    const body = (await (await GET(req())).json()) as { scorecard: Array<{ avgTimeSec: number }> };
    expect(body.scorecard[0]!.avgTimeSec).toBe(100);
  });
});
