import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
const mockSupabaseFetch = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockFetchFunnelStages = vi.fn();

vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@features/admin/server/digest-metrics", async () => {
  const actual = await vi.importActual<typeof import("@features/admin/server/digest-metrics")>(
    "@features/admin/server/digest-metrics"
  );
  return { ...actual, fetchFunnelStages: (...a: unknown[]) => mockFetchFunnelStages(...a) };
});

import { __resetAbOverviewCacheForTests, GET } from "@/app/api/admin/ab-overview/route";

function req(days = 90) {
  return new Request(`https://x.test/api/admin/ab-overview?days=${days}`);
}

function page(rows: unknown[]) {
  return { ok: true, status: 200, json: async () => rows } as Response;
}

/** submissions then quotes; each collection returns one short page (< 1000) so paging stops. */
function routeData(submissions: unknown[], quotes: unknown[]) {
  mockSupabaseFetch.mockImplementation(async (path: string) => {
    if (path.includes("/survey_submission?")) return page(submissions);
    if (path.includes("/report_price_quote?")) return page(quotes);
    throw new Error(`unexpected path ${path}`);
  });
}

const STAGES = {
  uniqueVisitors: 1000,
  engineMounts: 500,
  starts: 400,
  completions: 200,
  reportViewed: 100,
  paywallInitiated: 50,
  purchased: 10,
};

function submission(id: number, landing: string | null, survey: string | null) {
  const tracker: Record<string, string> = {};
  if (landing) tracker.landing_variant = landing;
  if (survey) tracker.survey_variant = survey;
  return {
    id,
    created_date_time: "2026-08-20T00:00:00.000Z",
    utm_tracker: Object.keys(tracker).length ? JSON.stringify(tracker) : null,
  };
}

function quote(subId: number, group: string, paid: boolean, price = 29) {
  return {
    survey_submission_id: subId,
    experiment_group: group,
    base_price_bucket: group,
    forced_paywall_arm: "treatment",
    current_price: price,
    purchased_at: paid ? "2026-08-21T00:00:00.000Z" : null,
  };
}

describe("GET /api/admin/ab-overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetAbOverviewCacheForTests();
    mockVerifyAdminSession.mockResolvedValue({ email: "a@loveiq.org", role: "viewer" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockFetchFunnelStages.mockResolvedValue(STAGES);
    routeData([], []);
  });

  it("401s without a session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
  });

  it("429s when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });
    expect((await GET(req())).status).toBe(429);
  });

  it("computes the funnel as a percentage of the top step, plus step-to-step drop-off", async () => {
    const body = await (await GET(req())).json();
    const steps = body.funnel as Array<{
      step: string;
      count: number;
      pctOfTop: number;
      dropFromPrev: number;
    }>;
    expect(steps[0]).toEqual({
      step: "Visited the site",
      count: 1000,
      pctOfTop: 100,
      dropFromPrev: 0,
    });
    // 1000 → 500 is half of them lost
    expect(steps[1]!.pctOfTop).toBe(50);
    expect(steps[1]!.dropFromPrev).toBe(50);
    // last step: 50 → 10 loses 80%
    expect(steps.at(-1)!.step).toBe("Paid");
    expect(steps.at(-1)!.dropFromPrev).toBe(80);
  });

  it("attributes each arm and computes its purchase rate", async () => {
    // 100 people per arm, B converts twice as often as A
    const subs = [
      ...Array.from({ length: 100 }, (_, i) => submission(i + 1, "white", "dark")),
      ...Array.from({ length: 100 }, (_, i) => submission(i + 101, "white_prev", "white")),
    ];
    const quotes = [
      ...Array.from({ length: 100 }, (_, i) => quote(i + 1, "A", i < 5)),
      ...Array.from({ length: 100 }, (_, i) => quote(i + 101, "B", i < 10)),
    ];
    routeData(subs, quotes);

    const body = await (await GET(req())).json();
    const pricing = body.experiments.find((e: { axis: string }) => e.axis === "pricing");
    const a = pricing.arms.find((x: { arm: string }) => x.arm === "A");
    const b = pricing.arms.find((x: { arm: string }) => x.arm === "B");
    expect(a).toMatchObject({ n: 100, purchases: 5, rate: 5 });
    expect(b).toMatchObject({ n: 100, purchases: 10, rate: 10 });
    expect(pricing.unattributed).toBe(0);
  });

  it("labels every arm in plain English and never leaks a raw code", async () => {
    routeData([submission(1, "white_prev", "dark")], [quote(1, "B", false)]);
    const text = JSON.stringify(await (await GET(req())).json());
    expect(text).toContain("Previous homepage");
    expect(text).toContain("Dark survey");
    // the raw code may appear as the `arm` key, but never inside a human label
    const body = JSON.parse(text);
    for (const exp of body.experiments) {
      for (const arm of exp.arms) expect(arm.label).not.toContain("white_prev");
      expect(exp.verdict).not.toContain("white_prev");
    }
  });

  it("refuses to call a winner off a tiny arm, even when the z-test says inconclusive", async () => {
    // 300 vs 9 clears the combined n>=50 rule on the big arm alone, so without the
    // small-arm guard this would read as a normal comparison.
    const subs = [
      ...Array.from({ length: 300 }, (_, i) => submission(i + 1, "white", null)),
      ...Array.from({ length: 9 }, (_, i) => submission(i + 400, "white_prev", null)),
    ];
    routeData(subs, []);
    const body = await (await GET(req())).json();
    const landing = body.experiments.find((e: { axis: string }) => e.axis === "landing");
    expect(landing.verdict).toContain("Too early to compare");
    expect(landing.verdict).toContain("9 people");
  });

  it("says so when there is not enough data at all", async () => {
    routeData([submission(1, "white", null), submission(2, "white_prev", null)], []);
    const body = await (await GET(req())).json();
    const landing = body.experiments.find((e: { axis: string }) => e.axis === "landing");
    expect(landing.verdict).toMatch(/Not enough data|Too early/);
  });

  it("counts submissions with no stamped arm as unattributed rather than guessing one", async () => {
    routeData([submission(1, null, null), submission(2, "white", "dark")], []);
    const body = await (await GET(req())).json();
    const landing = body.experiments.find((e: { axis: string }) => e.axis === "landing");
    expect(landing.unattributed).toBe(1);
    expect(landing.verdict).toContain("not attributable");
  });

  it("shows an actively-assigned arm at zero rather than omitting it", async () => {
    routeData([submission(1, "white", null)], []);
    const body = await (await GET(req())).json();
    const landing = body.experiments.find((e: { axis: string }) => e.axis === "landing");
    // white_prev has no data but is still assigned, so it must be visible
    expect(landing.arms.map((a: { arm: string }) => a.arm)).toContain("white_prev");
    expect(landing.arms.find((a: { arm: string }) => a.arm === "white_prev").n).toBe(0);
  });

  it("hides a retired arm that has no data, but keeps it when it does", async () => {
    routeData([submission(1, "white", null)], []);
    let body = await (await GET(req(31))).json();
    let landing = body.experiments.find((e: { axis: string }) => e.axis === "landing");
    expect(landing.arms.map((a: { arm: string }) => a.arm)).not.toContain("control");

    routeData([submission(1, "white", null), submission(2, "control", null)], []);
    body = await (await GET(req(32))).json();
    landing = body.experiments.find((e: { axis: string }) => e.axis === "landing");
    const retired = landing.arms.find((a: { arm: string }) => a.arm === "control");
    expect(retired).toMatchObject({ retired: true, n: 1 });
  });

  it("survives a source failing, returning zeros instead of a 500", async () => {
    mockSupabaseFetch.mockResolvedValue({ ok: false, status: 500 } as Response);
    const res = await GET(req(33));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totals.submissions).toBe(0);
  });

  it("caches within the window and re-queries for a different window", async () => {
    routeData([submission(1, "white", null)], []);
    await GET(req(34));
    const afterFirst = mockSupabaseFetch.mock.calls.length;
    await GET(req(34));
    expect(mockSupabaseFetch.mock.calls.length).toBe(afterFirst); // served from cache
    await GET(req(35));
    expect(mockSupabaseFetch.mock.calls.length).toBeGreaterThan(afterFirst);
  });
});
