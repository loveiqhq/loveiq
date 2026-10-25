import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));
const mockCheckRateLimit = vi.fn();
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
const mockFetchAllRows = vi.fn();
const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
  fetchAllRows: (...args: unknown[]) => mockFetchAllRows(...args),
  countRows: vi.fn(),
  POSTGREST_MAX_ROWS: 1000,
}));
const mockAds = vi.fn();
vi.mock("@shared/http/google-ads", () => ({
  googleAdsSearch: (...args: unknown[]) => mockAds(...args),
}));
const mockGateOn = vi.fn();
vi.mock("@features/report/server/initialGateState", () => ({
  isInitialUnlockGateEnabled: () => mockGateOn(),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/admin/ap/pay-to-start/route";
import { clearFactsCache } from "@features/admin/server/ap/facts";
import { clearTeamCache } from "@features/admin/server/ap/team";
import { freeAdsOnly, type PtsPayload } from "@features/admin/server/ap/pay-to-start";
import { spendBlocked } from "@features/admin/server/ap/metrics";

import { sub } from "./ap-fixtures";

const req = () =>
  new Request(
    "http://localhost/api/admin/ap/pay-to-start?period=custom&from=2026-10-20&to=2026-10-20"
  );

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), { status: 200, ...init });

const facts = (over: Record<string, unknown> = {}) => ({
  visits: [
    { day: "2026-10-20", arm: "white_card", src: null, n: 300 },
    // The pay-to-start pages' visits are that funnel's: never the free survey's.
    { day: "2026-10-20", arm: "pay_to_start", src: null, n: 40 },
  ],
  starts: [],
  subs: [
    sub({ id: 1, day: "2026-10-20", at: "2026-10-20T10:00:00Z" }),
    // Claimed by a pay-to-start purchase.
    sub({ id: 700, day: "2026-10-20", at: "2026-10-20T10:00:00Z" }),
    // Its tracker carries the journey: a claim that failed before it bound.
    sub({ id: 701, day: "2026-10-20", at: "2026-10-20T11:00:00Z" }),
  ],
  money: [],
  checkouts: [],
  intro: [],
  invites: [],
  quotes: [],
  ...over,
});

const JOURNEY = JSON.stringify({ utm_source: "google", gclid: "x", journey: "pay_to_start" });

const rows: Record<string, unknown[]> = {};
const respond = (path: string) => {
  const key = Object.keys(rows).find((k) => path.startsWith(k));
  return key ? rows[key] : [];
};

beforeEach(() => {
  vi.clearAllMocks();
  clearFactsCache();
  for (const k of Object.keys(rows)) delete rows[k];
  mockVerifyAdminSession.mockResolvedValue({ email: "ec@loveiq.org", role: "admin" });
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
  mockAds.mockResolvedValue([]);
  mockGateOn.mockResolvedValue(false);
  mockSupabaseFetch.mockImplementation(async (path: string) =>
    path === "/rest/v1/rpc/ap_facts"
      ? json(facts())
      : path.startsWith("/rest/v1/ap_team_user?")
        ? json(respond(path))
        : json(null, { status: 404 })
  );
  mockFetchAllRows.mockImplementation(async (path: string) => respond(path));
  clearTeamCache();
});

const paths = () => mockFetchAllRows.mock.calls.map(([p]) => String(p));

describe("GET /api/admin/ap/pay-to-start", () => {
  it("refuses without an admin session, before reading anything", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mockFetchAllRows).not.toHaveBeenCalled();
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });
    expect((await GET(req())).status).toBe(429);
  });

  it("reads the journey's purchases, its visits by page, and the free survey from ap_facts", async () => {
    const base = facts();
    mockSupabaseFetch.mockImplementation(async () =>
      json({
        ...base,
        subs: [
          ...base.subs,
          sub({ id: 702, day: "2026-10-20", at: "2026-10-20T10:00:00Z" }),
          sub({ id: 703, day: "2026-10-20", at: "2026-10-20T10:30:00Z" }),
          sub({ id: 704, day: "2026-10-20", at: "2026-10-20T10:30:00Z" }),
        ],
      })
    );
    rows["/rest/v1/prepaid_report_access?"] = [
      {
        id: 1,
        offer: "full",
        status: "succeeded",
        amount_cents: 2999,
        list_price_cents: 2999,
        is_test: false,
        customer_email: "reader@example.com",
        created_at: "2026-10-20T09:00:00Z",
        paid_at: "2026-10-20T09:02:00Z",
        consumed_submission_id: 700,
        utm_tracker: null,
      },
      // A 100% code: EUR 0, but the journey's, its report unlocked by the purchase.
      {
        id: 3,
        offer: "full",
        status: "succeeded",
        amount_cents: 0,
        list_price_cents: 2999,
        is_test: false,
        customer_email: "friend@example.com",
        created_at: "2026-10-20T09:30:00Z",
        paid_at: "2026-10-20T09:31:00Z",
        consumed_submission_id: 702,
        utm_tracker: null,
      },
      // Refunded before it was ever confirmed (no payment date): never the journey's.
      {
        id: 4,
        offer: "pre",
        status: "refunded",
        amount_cents: null,
        list_price_cents: 199,
        is_test: false,
        customer_email: null,
        created_at: "2026-10-20T10:20:00Z",
        paid_at: null,
        consumed_submission_id: 703,
        utm_tracker: null,
      },
      // Paid, then refunded: it bought first all the same.
      {
        id: 5,
        offer: "pre",
        status: "refunded",
        amount_cents: 199,
        list_price_cents: 199,
        is_test: false,
        customer_email: "back@example.com",
        created_at: "2026-10-20T10:25:00Z",
        paid_at: "2026-10-20T10:26:00Z",
        consumed_submission_id: 704,
        utm_tracker: null,
      },
      // A checkout opened and never paid: the claim binds it to the survey all the same.
      {
        id: 2,
        offer: "pre",
        status: "expired",
        amount_cents: null,
        list_price_cents: 199,
        is_test: false,
        customer_email: null,
        created_at: "2026-10-20T10:30:00Z",
        paid_at: null,
        consumed_submission_id: 701,
        utm_tracker: null,
      },
    ];
    rows["/rest/v1/funnel_event?"] = [
      { day: "2026-10-20", offer: "full", utm_source: "google" },
      { day: "2026-10-20", offer: "full", utm_source: "google" },
      { day: "2026-10-20", offer: "pre", utm_source: null },
    ];
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as PtsPayload;
    const by = (k: string) => body.funnels.find((f) => f.key === k)!;
    // 700 was paid for first, 702 bought with a 100% code and 704 paid then refunded: pay to
    // start's. 701's and 703's browsers never paid: free surveys like anyone's, with sub 1.
    expect(by("after").all).toMatchObject({ visits: 300, finished: 3 });
    // The 100% code's buyer came in and finished too; paying, only the EUR 29.99 one.
    expect(by("full").all).toMatchObject({ visits: 2, paid: 1, finished: 2, revenue: 29.99 });
    expect(by("full").steps.find((s) => s.label === "Paid €29.99")!.n).toBe(1);
    // The refunded EUR 1.99 buyer came in and finished, and kept nothing: no paying customer.
    expect(by("pre").all).toMatchObject({ visits: 1, paid: 0, finished: 1, revenue: 0 });
    expect(by("gate").live).toBe(false);

    const p = paths();
    expect(p.find((x) => x.startsWith("/rest/v1/prepaid_report_access?"))).toContain(
      "offer=not.is.null"
    );
    expect(p.find((x) => x.startsWith("/rest/v1/prepaid_report_access?"))).toContain("utm_tracker");
    const visits = p.find((x) => x.startsWith("/rest/v1/funnel_event?"))!;
    expect(visits).toContain("landing_variant=eq.pay_to_start");
    expect(visits).toContain("select=day,offer,utm_source");
    expect(mockSupabaseFetch.mock.calls[0]![0]).toBe("/rest/v1/rpc/ap_facts");
    // Google Ads by landing page and by day.
    expect(String(mockAds.mock.calls[0]![0])).toContain("segments.date");
    expect(String(mockAds.mock.calls[0]![0])).toContain("FROM landing_page_view");
  });

  it("takes paid buyers' survey starts out of the free survey's, as ap_facts counted them", async () => {
    mockSupabaseFetch.mockImplementation(async (path: string) =>
      path.startsWith("/rest/v1/ap_team_user?")
        ? json(respond(path))
        : json(
            facts({
              starts: [
                {
                  day: "2026-10-20",
                  known: true,
                  src: "google",
                  med: "cpc",
                  ads: true,
                  arm: null,
                  device: "iOS",
                  finished: true,
                  camp: null,
                  term: null,
                  cq: null,
                  email: true,
                  n: 10,
                },
              ],
            })
          )
    );
    const paid = (id: number, sid: number, email = "reader@example.com") => ({
      id,
      offer: "full",
      status: "succeeded",
      amount_cents: 2999,
      list_price_cents: 2999,
      is_test: false,
      customer_email: email,
      created_at: "2026-10-20T09:00:00Z",
      paid_at: "2026-10-20T09:02:00Z",
      consumed_submission_id: sid,
      utm_tracker: null,
    });
    rows["/rest/v1/prepaid_report_access?"] = [
      paid(1, 701),
      // Paid with a private address, the survey taken as staff: ap_facts never counted it.
      paid(2, 702, "someone@example.com"),
      // Never paid: a free survey, its start stays.
      { ...paid(3, 703), status: "pending", amount_cents: null, paid_at: null },
      // Our own check.
      paid(4, 704),
      // Started the day before the range.
      paid(5, 705),
    ];
    rows["/rest/v1/survey_submission?id=in."] = [
      {
        id: 701,
        user_id: 9001,
        start_date_time: "2026-10-20T10:40:00Z",
        created_date_time: "2026-10-20T11:00:00Z",
        utm_tracker: JOURNEY,
      },
      {
        id: 702,
        user_id: 9002,
        start_date_time: "2026-10-20T10:40:00Z",
        created_date_time: "2026-10-20T11:00:00Z",
        utm_tracker: null,
      },
      {
        id: 704,
        user_id: 9004,
        start_date_time: "2026-10-20T10:40:00Z",
        created_date_time: "2026-10-20T11:00:00Z",
        utm_tracker: JSON.stringify({ utm_source: "prod-verification" }),
      },
      {
        id: 705,
        user_id: 9005,
        start_date_time: "2026-10-19T10:00:00Z",
        created_date_time: "2026-10-20T08:00:00Z",
        utm_tracker: null,
      },
    ];
    // The team's accounts (ap_team_user): 9002 is fatih@loveiq.org.
    rows["/rest/v1/ap_team_user?"] = [{ id: 9002 }];
    const body = (await (await GET(req())).json()) as PtsPayload;
    const after = body.funnels.find((f) => f.key === "after")!;
    // 10 starts; only 701's is a paid buyer's that ap_facts counted.
    expect(after.steps.find((s) => s.label === "Survey started")!.n).toBe(9);
    // 702 (a staff survey) and 704 (our check) bought nothing that counts: 701 and 705 did.
    expect(body.funnels.find((f) => f.key === "full")!.all.paid).toBe(2);
    const p = paths();
    expect(p.find((x) => x.startsWith("/rest/v1/survey_submission?id=in."))).toContain(
      "id=in.(701,702,704,705)"
    );
    expect(
      mockSupabaseFetch.mock.calls.some(([x]) => String(x).startsWith("/rest/v1/ap_team_user?"))
    ).toBe(true);
  });

  it("counts what a buyer bought on the report afterwards, never the purchase twice", async () => {
    rows["/rest/v1/prepaid_report_access?"] = [
      {
        id: 2,
        offer: "pre",
        status: "succeeded",
        amount_cents: 199,
        list_price_cents: 199,
        is_test: false,
        customer_email: "reader@example.com",
        created_at: "2026-10-20T10:00:00Z",
        paid_at: "2026-10-20T10:02:00Z",
        consumed_submission_id: 700,
        utm_tracker: null,
      },
    ];
    rows["/rest/v1/personal_report?survey_submission_id=in."] = [
      { id: 9700, survey_submission_id: 700 },
    ];
    rows["/rest/v1/report_session?"] = [{ personal_report_id: 9700 }];
    rows["/rest/v1/payment?"] = [
      // The purchase itself, written on the report at the claim.
      { personal_report_id: 9700, amount: 1.99, plan: "initial", journey: "pay_to_start" },
      { personal_report_id: 9700, amount: 19.99, plan: "full_report", journey: null },
      // E07's gift and the feedback grant are EUR 0: never revenue.
      { personal_report_id: 9700, amount: 0, plan: "initial", journey: null },
    ];
    const body = (await (await GET(req())).json()) as PtsPayload;
    const pre = body.funnels.find((f) => f.key === "pre")!;
    expect(pre.all).toMatchObject({ paid: 1, finished: 1, revenue: 21.98 });
    expect(pre.steps.find((s) => s.label === "Report opened")!.n).toBe(1);
    expect(pre.steps.find((s) => s.label === "Bought the full report")!.n).toBe(1);
    const query = paths().find(
      (x) => x.startsWith("/rest/v1/payment?") && x.includes("personal_report_id=in.")
    )!;
    expect(query).toContain("is_test=is.false");
    expect(query).toContain("status=eq.succeeded");
    // E07's gift and the feedback grant are EUR 0: left out by the query itself.
    expect(query).toContain("amount=gt.0");
    expect(query).toContain("journey:metadata->>journey");
  });

  it("reads every real refund, in full or in part, for the Dashboard's refund rate", async () => {
    rows["/rest/v1/prepaid_report_access?"] = [
      {
        id: 3,
        offer: "full",
        status: "succeeded",
        amount_cents: 2999,
        list_price_cents: 2999,
        is_test: false,
        customer_email: "reader@example.com",
        created_at: "2026-10-20T10:00:00Z",
        paid_at: "2026-10-20T10:02:00Z",
        consumed_submission_id: 700,
        utm_tracker: null,
      },
    ];
    // 9700 (700's report) refunded in full; 9001 (1's report, the free survey) in part.
    rows["/rest/v1/payment?status=eq.refunded"] = [{ personal_report_id: 9700 }];
    rows["/rest/v1/payment?status=eq.succeeded"] = [{ personal_report_id: 9001 }];
    rows["/rest/v1/personal_report?id=in."] = [
      { survey_submission_id: 700 },
      { survey_submission_id: 1 },
    ];
    const body = (await (await GET(req())).json()) as PtsPayload;
    const p = paths();
    const full = p.find((x) => x.startsWith("/rest/v1/payment?status=eq.refunded"))!;
    const part = p.find((x) => x.startsWith("/rest/v1/payment?status=eq.succeeded"))!;
    for (const q of [full, part]) {
      expect(q).toContain("is_test=is.false");
      expect(q).toContain("amount=gt.0");
    }
    expect(part).toContain("refund_amount=gt.0");
    expect(p.find((x) => x.startsWith("/rest/v1/personal_report?id=in."))).toContain(
      "id=in.(9700,9001)"
    );
    expect(body.funnels.find((f) => f.key === "full")!.refunds).toEqual({ payers: 1, refunded: 1 });
    // A full refund took 1's sale away: it is counted back among those who paid.
    expect(body.funnels.find((f) => f.key === "after")!.refunds).toEqual({
      payers: 1,
      refunded: 1,
    });
  });

  it("reads the gate's cohort and switch, and its members leave pay after the report", async () => {
    mockGateOn.mockResolvedValue(true);
    rows["/rest/v1/personal_report?initial_gate_cohort_at"] = [
      {
        survey_submission_id: 1,
        initial_gate_cohort_at: "2026-10-20T10:00:04Z",
        initial_gate_seen_at: "2026-10-20T10:01:00Z",
      },
    ];
    const body = (await (await GET(req())).json()) as PtsPayload;
    const gate = body.funnels.find((f) => f.key === "gate")!;
    expect(gate.live).toBe(true);
    expect(gate.all.finished).toBe(1);
    expect(gate.steps.find((s) => s.label === "Saw the €1.99 page")!.n).toBe(1);
    // Sub 1 is the gate's; 700 and 701 (no purchase claims them here) stay.
    expect(body.funnels.find((f) => f.key === "after")!.all.finished).toBe(2);
    const q = paths().find((x) => x.startsWith("/rest/v1/personal_report?initial_gate_cohort_at"))!;
    expect(q).toContain("initial_gate_cohort_at=gte.");
  });

  it("still answers when only the visits can't be read, and says so", async () => {
    mockFetchAllRows.mockImplementation(async (path: string) =>
      path.startsWith("/rest/v1/funnel_event?") ? null : respond(path)
    );
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as PtsPayload;
    expect(body.notes).toContain("Pay to start's visits could not be read just now.");
    expect(body.funnels.find((f) => f.key === "full")!.all.visits).toBeNull();
  });

  it("answers a failed read with a generic 500, never a page of zeros", async () => {
    for (const failing of [
      "/rest/v1/prepaid_report_access?",
      "/rest/v1/personal_report?initial_gate_cohort_at",
    ]) {
      clearFactsCache();
      mockFetchAllRows.mockImplementation(async (path: string) =>
        path.startsWith(failing) ? null : respond(path)
      );
      const res = await GET(req());
      expect(res.status, failing).toBe(500);
      expect(await res.json()).toEqual({ error: "Unable to load the pay-to-start page." });
    }
    clearFactsCache();
    mockFetchAllRows.mockImplementation(async (path: string) => respond(path));
    mockSupabaseFetch.mockResolvedValue(json(null, { status: 500 }));
    expect((await GET(req())).status).toBe(500);
  });
});

describe("Free survey's ad spend (freeAdsOnly)", () => {
  const row = (url: string, cost: number) => ({
    landingPageView: { unexpandedFinalUrl: url },
    segments: { date: "2026-10-23" },
    metrics: { costMicros: String(cost * 1_000_000), clicks: "1", impressions: "10" },
  });
  const scope = {
    assessment: "a",
    source: "all",
    device: "all",
    tier: "all",
    visitor: "all",
    funnel: "free",
  } as const;

  it("is the free survey's when no ad over the page's days landed on its pages", async () => {
    mockAds.mockResolvedValueOnce([row("https://www.loveiq.org/", 12.5)]);
    const free = await freeAdsOnly("2026-10-10", "2026-10-24");
    expect(free).toEqual({ ok: true });
    expect(spendBlocked(scope, free)).toBeNull();
    // Read from the launch at the earliest: no ad could land on its pages before.
    expect(String(mockAds.mock.calls.at(-1)![0])).toContain(
      "BETWEEN '2026-10-22' AND '2026-10-24'"
    );
    // A later range reads its own days only, so an earlier pay-to-start ad never blanks it.
    mockAds.mockResolvedValueOnce([]);
    await freeAdsOnly("2026-11-02", "2026-11-08");
    expect(String(mockAds.mock.calls.at(-1)![0])).toContain(
      "BETWEEN '2026-11-02' AND '2026-11-08'"
    );
  });

  it("stays blank, saying why, when an ad landed on a pay-to-start page or the ads can't be read", async () => {
    mockAds.mockResolvedValueOnce([
      row("https://www.loveiq.org/", 12.5),
      row("https://www.loveiq.org/sexual-archetype/initial", 3),
    ]);
    const some = await freeAdsOnly("2026-10-20", "2026-10-24");
    expect(spendBlocked(scope, some)).toMatch(
      /^Some ads in the days these figures cover landed on pay to start's pages/
    );
    mockAds.mockResolvedValueOnce(null);
    expect(spendBlocked(scope, await freeAdsOnly("2026-10-20", "2026-10-24"))).toMatch(
      /couldn't be read/
    );
    // Before the launch there's nothing to read.
    mockAds.mockClear();
    expect(await freeAdsOnly("2026-10-01", "2026-10-20")).toEqual({ ok: true });
    expect(mockAds).not.toHaveBeenCalled();
    // Without the check, still blank as before.
    expect(spendBlocked(scope)).toMatch(/whole Google Ads account's/);
  });
});
