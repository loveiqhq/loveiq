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

import { GET } from "@/app/api/admin/executive-memo/route";

describe("admin executive memo route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() });
    mockSupabaseFetch.mockImplementation((path: string) => {
      if (path.includes("survey_submission")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 1, status: "completed", created_date_time: "2026-03-29T12:00:00.000Z" },
            { id: 2, status: "started", created_date_time: "2026-02-20T12:00:00.000Z" },
          ],
        });
      }
      if (path.includes("waitlist_user")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 10, created_date_time: "2026-03-28T12:00:00.000Z" },
            { id: 11, created_date_time: "2026-02-25T12:00:00.000Z" },
          ],
        });
      }
      if (path.includes("admin_investigation_case")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              id: 6,
              title: "Slow mobile path",
              status: "open",
              root_cause: "ux",
              updated_at: "2026-03-30T12:00:00.000Z",
            },
          ],
        });
      }
      if (path.includes("admin_experiment")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              id: 3,
              name: "Intro framing",
              status: "active",
              decision_date: "2026-03-29",
              updated_at: "2026-03-30T12:00:00.000Z",
            },
          ],
        });
      }
      if (path.includes("admin_decision_entry")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              id: 9,
              title: "Ship v5.3",
              entry_type: "decision",
              status: "approved",
              updated_at: "2026-03-30T12:00:00.000Z",
            },
          ],
        });
      }
      if (path.includes("personal_report")) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (path.includes("payment")) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
  });

  it("returns a memo payload with headline and sections", async () => {
    const res = await GET(new Request("http://localhost/api/admin/executive-memo?days=30"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(typeof json.headline).toBe("string");
    expect(json.headline.length).toBeGreaterThan(0);
    expect(json.metrics.activeExperiments).toBe(1);
    expect(json.sections.actions.length).toBeGreaterThan(0);
    // Trust descriptor must contain the source identifier + mode the route builds.
    // (staleAfterHours is consumed internally to derive `warning`; not echoed back.)
    expect(json.trust).toMatchObject({
      source: "executive-memo",
      mode: "derived",
      sampleSize: expect.any(Number),
    });
    expect(json.trust).toHaveProperty("freshnessHours");
    expect(json.trust).toHaveProperty("warning");
  });

  it("returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/executive-memo"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(new Request("http://localhost/api/admin/executive-memo"));
    expect(res.status).toBe(429);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });
});
