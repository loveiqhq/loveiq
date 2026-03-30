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

import { GET } from "../../app/api/admin/search/semantic/route";

describe("admin semantic search route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() });
    mockSupabaseFetch.mockImplementation((path: string) => {
      if (path.includes("survey_submission_answer")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              survey_submission_id: 77,
              answer_text: "I feel uncertain and want more confidence.",
              survey_question: { frontend_qid: "q12" },
              answer_option: null,
            },
          ],
        });
      }
      if (path.includes("admin_note")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              id: 1,
              submission_id: 77,
              content: "Confidence theme shows up repeatedly.",
              admin_email: "admin@test.com",
              updated_at: "2026-03-30T12:00:00.000Z",
            },
          ],
        });
      }
      if (path.includes("admin_investigation_case")) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }
      if (path.includes("product_changelog")) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }
      if (path.includes("admin_decision_entry")) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }
      if (path.includes("admin_experiment")) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }

      return Promise.resolve({ ok: true, json: async () => [] });
    });
  });

  it("returns semantic matches and page suggestions", async () => {
    const res = await GET(new Request("http://localhost/api/admin/search/semantic?q=confidence"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.results.length).toBeGreaterThan(0);
    expect(json.results.some((item: { type: string }) => item.type === "response")).toBe(true);
    expect(json.results.some((item: { type: string }) => item.type === "note")).toBe(true);
  });

  it("returns default pages for short queries", async () => {
    const res = await GET(new Request("http://localhost/api/admin/search/semantic?q=c"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.results).toEqual([]);
    expect(json.pages.length).toBeGreaterThan(0);
  });
});
