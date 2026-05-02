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

import { GET } from "../../app/api/admin/org/route";

describe("admin org directory route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() });
    mockSupabaseFetch.mockImplementation((_path: string, options?: { method?: string }) => {
      if (options?.method === "HEAD") {
        return Promise.resolve({
          ok: true,
          headers: new Headers({ "content-range": "0-0/5" }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => [
          {
            created_date_time: "2026-03-30T12:00:00.000Z",
            updated_at: "2026-03-30T12:00:00.000Z",
            scored_at: "2026-03-30T12:00:00.000Z",
            event_time: "2026-03-30T12:00:00.000Z",
            owner_email: "owner@test.com",
            admin_email: "owner@test.com",
          },
        ],
      });
    });
  });

  it("returns an org-level asset summary", async () => {
    const res = await GET(new Request("http://localhost/api/admin/org"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.summary.totalAssets).toBeGreaterThan(0);
    expect(json.assets[0].trust).toBeDefined();
    expect(json.assets.some((asset: { owner: string | null }) => asset.owner != null)).toBe(true);
  });
});
