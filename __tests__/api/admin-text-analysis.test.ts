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

import { GET } from "../../app/api/admin/text-analysis/route";

describe("GET /api/admin/text-analysis", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 14, resetAt: new Date() });
  });

  it("reads embedded scoring objects and disables caching", async () => {
    mockSupabaseFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 1,
          answer_text: "I want more trust and honesty.",
          survey_question: {
            id: 10,
            frontend_qid: "01002",
            question_text: "What feels hardest right now?",
          },
          survey_submission: {
            scoring_result: {
              primary_archetype: "Approval Seeker",
            },
          },
        },
      ],
    });

    const res = await GET(new Request("http://localhost/api/admin/text-analysis"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0");

    const json = await res.json();
    expect(json.responses).toEqual([
      expect.objectContaining({
        id: 1,
        archetype: "Approval Seeker",
      }),
    ]);
  });

  it("returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/text-analysis"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(new Request("http://localhost/api/admin/text-analysis"));
    expect(res.status).toBe(429);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });
});
