import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { GET } from "@/app/api/admin/funnels/landing-variant/route";
import { LANDING_TEST_START_AT } from "@shared/experiments/landingVariant";

const rpcRows = (rows: unknown[]) =>
  mockSupabaseFetch.mockResolvedValueOnce({ ok: true, json: async () => rows });

const get = async () => {
  const res = await GET(new Request("http://localhost/api/admin/funnels/landing-variant?days=30"));
  expect(res.status).toBe(200);
  return (await res.json()) as {
    rows: Array<{ variant: string; label: string; retired: boolean; completed: number }>;
  };
};

/**
 * The "Landing A/B" funnels tab. get_landing_variant_funnel always returns rows for
 * round 2's arms (white, white_prev, control) and for anything else only once it has a
 * finished survey or a payment — so in round 3's first days its two live arms were not
 * on the screen at all.
 */
describe("GET /api/admin/funnels/landing-variant", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
    // A 30-day window wholly after the landing test's restart: one read serves every row.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-12-01T10:00:00Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts the live arms from the restart, and earlier rounds over the whole window", async () => {
    vi.setSystemTime(new Date("2026-10-20T10:00:00Z"));
    // The window's read: round 3's arms with their readers from before the restart too.
    rpcRows([
      { variant: "white_card", completed: 40, paid: 2, revenue: 13.98 },
      { variant: "white_video", completed: 38, paid: 0, revenue: 0 },
      { variant: "white", completed: 900, paid: 40, revenue: 1200 },
    ]);
    // From the restart.
    rpcRows([
      { variant: "white_card", completed: 9, paid: 0, revenue: 0 },
      { variant: "white_video", completed: 11, paid: 1, revenue: 6.99 },
    ]);
    const { rows } = await get();
    expect(mockSupabaseFetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(mockSupabaseFetch.mock.calls[1]![1].body)).toEqual({
      since_ts: LANDING_TEST_START_AT,
    });
    const by = (v: string) => rows.find((r) => r.variant === v)!.completed;
    expect([by("white_card"), by("white_video"), by("white")]).toEqual([9, 11, 900]);
  });

  it("refuses a half-read rather than mixing windows", async () => {
    vi.setSystemTime(new Date("2026-10-20T10:00:00Z"));
    rpcRows([{ variant: "white", completed: 900, paid: 40, revenue: 1200 }]);
    mockSupabaseFetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    const res = await GET(
      new Request("http://localhost/api/admin/funnels/landing-variant?days=30")
    );
    expect(res.status).toBe(500);
  });

  it("shows both live arms first, at zero, before either has a finished survey", async () => {
    rpcRows([
      { variant: "control", completed: 53, paid: 0, revenue: 0 },
      { variant: "white", completed: 900, paid: 40, revenue: 1200 },
      { variant: "white_prev", completed: 34, paid: 2, revenue: 60 },
    ]);
    const { rows } = await get();
    expect(rows.slice(0, 2).map((r) => [r.variant, r.retired, r.completed])).toEqual([
      ["white_card", false, 0],
      ["white_video", false, 0],
    ]);
    expect(rows[0]!.label).toBe("Landing Page V2 (Survey in Hero)");
    expect(rows[1]!.label).toBe("Landing Page V3 (Video in Hero)");
    // Earlier rounds stay, as history.
    expect(rows.slice(2).every((r) => r.retired)).toBe(true);
  });

  it("adds no second row for an arm the RPC already returned", async () => {
    rpcRows([
      { variant: "white_video", completed: 3, paid: 1, revenue: 19.99 },
      { variant: "white", completed: 900, paid: 40, revenue: 1200 },
    ]);
    const { rows } = await get();
    expect(rows.filter((r) => r.variant === "white_video")).toHaveLength(1);
    expect(rows.find((r) => r.variant === "white_video")!.completed).toBe(3);
    expect(rows.filter((r) => r.variant === "white_card")).toHaveLength(1);
  });
});
