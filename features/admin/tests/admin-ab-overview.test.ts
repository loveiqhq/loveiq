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

/** A funnel_event exact-count reply: the route reads the total off content-range. */
function countReply(total: number) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-range": `0-0/${total}` }),
    json: async () => [],
  } as unknown as Response;
}

/** Per-question reach, newest-first as the RPC returns it. */
const DROPOUT = {
  questions: [
    { question_index: 0, q_id: "00000", sessions: 250 },
    { question_index: 1, q_id: "00001", sessions: 200 },
    { question_index: 2, q_id: "01002", sessions: 100 },
    { question_index: 3, q_id: "01005", sessions: 3 }, // below the reach floor
  ],
};

/** submissions then quotes; each collection returns one short page (< 1000) so paging stops. */
function routeData(submissions: unknown[], quotes: unknown[], intro = 300) {
  mockSupabaseFetch.mockImplementation(async (path: string) => {
    if (path.includes("/survey_submission?")) return page(submissions);
    if (path.includes("/report_price_quote?")) return page(quotes);
    if (path.includes("/rpc/get_dropout_funnel"))
      return { ok: true, status: 200, json: async () => DROPOUT } as Response;
    if (path.includes("/funnel_event?")) return countReply(intro);
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
    checkout_started_at: paid ? "2026-08-21T00:00:00.000Z" : null,
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
      step: "Visits to the site",
      count: 1000,
      pctOfTop: 100,
      dropFromPrev: 0,
    });
    // 1000 → 500 is half of them lost
    expect(steps[1]!.step).toBe("Opened the survey page");
    expect(steps[1]!.pctOfTop).toBe(50);
    expect(steps[1]!.dropFromPrev).toBe(50);
    expect(steps.at(-1)!.step).toBe("Paid");

    /*
     * Drop-off is never reported as negative, however the counts fall out.
     *
     * Deliberately NOT asserting that each step is <= the one before it. That
     * looks like it should hold but does not: the landing page asks one survey
     * question inline, and answering it there means the survey skips it — so a
     * visitor can be absent from Q1's reach and still present in completions.
     * `survey_behavior_event`, which the reach curve is built from, is also
     * client-posted and therefore lossy. What must never happen is the UI showing
     * a nonsense negative drop.
     */
    for (const step of steps) {
      expect(step.dropFromPrev).toBeGreaterThanOrEqual(0);
      expect(step.pctOfTop).toBeGreaterThanOrEqual(0);
    }
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
    // The pricing axis was CONCLUDED on 2026-08-31 by retiring the higher-priced
    // arm, so it must not appear as a live experiment however many quotes carry
    // an arm — the stored arms are historical, and comparing them now compares
    // two time periods rather than two randomly-assigned groups.
    expect(body.experiments.map((e: { axis: string }) => e.axis)).not.toContain("pricing");
    expect(
      body.concluded.map((c: { title: string }) => c.title),
      "a finished price test must still be listed, or it silently vanishes"
    ).toContain("Report pricing (A vs B)");
    // The one live axis is still attributed and rated from the same fixture.
    const landing = body.experiments.find((e: { axis: string }) => e.axis === "landing");
    expect(landing.arms.find((x: { arm: string }) => x.arm === "white")).toMatchObject({ n: 100 });
    expect(landing.arms.find((x: { arm: string }) => x.arm === "white_prev")).toMatchObject({
      n: 100,
    });
    expect(landing.unattributed).toBe(0);
  });

  it("labels every arm in plain English and never leaks a raw code", async () => {
    routeData([submission(1, "white_prev", "dark")], [quote(1, "B", false)]);
    const text = JSON.stringify(await (await GET(req())).json());
    expect(text).toContain("Landing Page V1 (First Design)");
    // No "Dark survey" — the survey theme axis concluded 2026-08-25 and left the
    // live experiments list, so no arm of it is presented for analysis here.
    expect(text).not.toContain("Dark survey");
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

  it("drops retired arms entirely and counts them as unattributable", async () => {
    // A retired arm is not being assigned to anyone, so a row for it invites a
    // comparison against a dead arm. Its people still have to be accounted for.
    routeData([submission(1, "white", null), submission(2, "control", null)], []);
    const body = await (await GET(req(32))).json();
    const landing = body.experiments.find((e: { axis: string }) => e.axis === "landing");
    expect(landing.arms.map((a: { arm: string }) => a.arm)).not.toContain("control");
    expect(landing.unattributed).toBe(1); // the retired-arm person, still counted
  });

  it("returns the worst positions first, labelled by position rather than question", async () => {
    routeData([submission(1, "white", null)], []);
    const body = await (await GET(req(41))).json();
    // 250→200 = 20%, 200→100 = 50%, 100→3 = 97%. Sorted worst first.
    expect(body.questionDropoff).toEqual([
      { position: "Question 3 of 4", reached: 100, dropPct: 97 },
      { position: "Question 2 of 4", reached: 200, dropPct: 50 },
      { position: "Question 1 of 4", reached: 250, dropPct: 20 },
    ]);
    // never a question NAME: the email question moved first→last and the landing
    // page skips one, so position cannot be mapped to a question.
    expect(JSON.stringify(body.questionDropoff)).not.toMatch(/email|satisfied/i);
    expect(body.dropoffCaveats.length).toBeGreaterThan(0);
  });

  it("never reports a negative drop, even where reach increases", async () => {
    // survey_behavior_event is client-posted and lossy, so a later position can
    // legitimately show MORE sessions than an earlier one.
    mockSupabaseFetch.mockImplementation(async (path: string) => {
      if (path.includes("/survey_submission?")) return page([submission(1, "white", null)]);
      if (path.includes("/report_price_quote?")) return page([]);
      if (path.includes("/rpc/get_dropout_funnel"))
        return {
          ok: true,
          status: 200,
          json: async () => ({
            questions: [
              { question_index: 0, q_id: "a", sessions: 100 },
              { question_index: 1, q_id: "b", sessions: 140 }, // reach goes UP
              { question_index: 2, q_id: "c", sessions: 90 },
            ],
          }),
        } as Response;
      if (path.includes("/funnel_event?")) return countReply(300);
      throw new Error(`unexpected path ${path}`);
    });
    const body = await (await GET(req(43))).json();
    for (const d of body.questionDropoff) expect(d.dropPct).toBeGreaterThanOrEqual(0);
    for (const f of body.funnel) expect(f.dropFromPrev).toBeGreaterThanOrEqual(0);
  });

  it("uses the first question's real reach as the 'answered question 1' step", async () => {
    routeData([submission(1, "white", null)], []);
    const body = await (await GET(req(42))).json();
    const step = body.funnel.find((f: { step: string }) => f.step === "Answered question 1");
    expect(step.count).toBe(250);
  });

  it("counts paid the same way in the funnel and in the headline", async () => {
    // The funnel used to take Paid from distinct succeeded payment.user_id (36)
    // while the headline counted submissions with a purchased quote (37) — two
    // different numbers for one thing on one page.
    routeData(
      [submission(1, "white", null), submission(2, "white", null)],
      [quote(1, "A", true), quote(2, "B", false)]
    );
    const body = await (await GET(req(44))).json();
    const paidStep = body.funnel.find((f: { step: string }) => f.step === "Paid");
    expect(paidStep.count).toBe(body.totals.purchases);
  });

  it("measures checkout server-side instead of the consent-gated paywall event", async () => {
    routeData([submission(1, "white", null)], [quote(1, "A", true)]);
    const body = await (await GET(req(45))).json();
    const labels = body.funnel.map((f: { step: string }) => f.step);
    // paywall_initiated saw 41 submissions against 37 purchases in production —
    // a 96.9% "drop" that was missing data, not behaviour.
    expect(labels).not.toContain("Reached the paywall");
    expect(labels).toContain("Started checkout");
    expect(body.funnelCaveats.join(" ")).toContain("our own servers");
  });

  it("does not present a concluded experiment as a live A/B test", async () => {
    // Three axes have finished. The paywall concluded in favour of forced and was
    // then removed from the product entirely. The survey theme concluded
    // 2026-08-25 in favour of white. The price test was settled on 2026-08-31 by
    // retiring the higher-priced arm, so its two arms are two time periods rather
    // than a randomised split. All three are listed under `concluded`, which
    // carries prose and no rates.
    //
    // The fixture deliberately supplies a dark survey arm and an arm-A quote:
    // this asserts the axis list is what removes them, not absent values.
    routeData([submission(1, "white", "dark")], [quote(1, "A", false)]);
    const body = await (await GET(req(36))).json();
    expect(body.experiments.map((e: { axis: string }) => e.axis)).toEqual(["landing"]);
    const titles = body.concluded.map((c: { title: string }) => c.title);
    expect(titles).toContain("Paywall style");
    expect(titles.join(" ")).toContain("Survey design");
    expect(titles.join(" ")).toContain("Report pricing");
    // and neither may carry a rate anyone could read a winner into
    expect(JSON.stringify(body.concluded)).not.toMatch(/\d+(\.\d+)?%/);
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
