import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The page routes' own wiring: what each reads for the comparison and the visitor filter.
const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));
const mockCheckRateLimit = vi.fn();
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
  fetchAllRows: vi.fn(),
  countRows: vi.fn().mockResolvedValue(0),
  POSTGREST_MAX_ROWS: 1000,
}));
const mockHogql = vi.fn();
vi.mock("@features/ux-review/server/review", () => ({
  hogqlTable: (...args: unknown[]) => mockHogql(...args),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET as assessmentGet } from "@/app/api/admin/ap/assessment/route";
import { GET as focusGet } from "@/app/api/admin/ap/focus/route";
import { GET as paymentGet } from "@/app/api/admin/ap/payment/route";
import { GET as reportGet } from "@/app/api/admin/ap/report/route";
import { GET as surveyGet } from "@/app/api/admin/ap/survey/route";
import { clearFactsCache } from "@features/admin/server/ap/facts";

const json = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  headers: new Headers(),
  json: async () => body,
});

const finisher = (id: number, day: string) => ({
  id,
  day,
  at: `${day}T10:00:00Z`,
  // One person each, finishing for the first time.
  uid: 100 + id,
  userFirstAt: `${day}T10:00:00Z`,
  src: "google",
  med: "cpc",
  openedAt: `${day}T10:05:00Z`,
});
const facts = (subs: unknown[]) => ({
  visits: [],
  starts: [],
  subs,
  money: [],
  checkouts: [],
  intro: [],
  invites: [],
  quotes: [],
});
const extras = (skippers: number[]) => ({
  wizard: [],
  chapters: [],
  feedback: [],
  emails: [],
  wizard_skips: skippers.length ? [{ slide: 0, n: skippers.length, sids: skippers }] : [],
  wizard_skips_from: "2026-09-20",
});

// This week: 4 finishers, 1 pressed Skip Intro. The week before: 4, 2 pressed it.
const THIS = { from: "2026-10-06", subs: [1, 2, 3, 4], skippers: [1] };
const PREV = { from: "2026-09-29", subs: [11, 12, 13, 14], skippers: [11, 12] };
let extrasFails = false;

beforeEach(() => {
  vi.clearAllMocks();
  clearFactsCache();
  extrasFails = false;
  mockVerifyAdminSession.mockResolvedValue({ email: "mb@loveiq.org", role: "admin" });
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
  mockHogql.mockResolvedValue({ ok: false, error: "not in this test" });
  mockSupabaseFetch.mockImplementation(async (path: string, init?: { body?: string }) => {
    const { p_from } = JSON.parse(init?.body ?? "{}") as { p_from?: string };
    const range = p_from === THIS.from ? THIS : p_from === PREV.from ? PREV : null;
    if (path === "/rest/v1/rpc/ap_facts")
      return json(facts(range ? range.subs.map((id) => finisher(id, range.from)) : []));
    if (path === "/rest/v1/rpc/ap_report_extras") {
      if (range === PREV && extrasFails) return json({ message: "boom" }, 500);
      return json(extras(range ? range.skippers : []));
    }
    return json(null, 404);
  });
});

const skipped = async () => {
  const res = await reportGet(
    new Request(
      `http://localhost/api/admin/ap/report?period=custom&from=${THIS.from}&to=2026-10-12`
    )
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    wizard: { tiles: Array<{ key: string; value: number | null; prev: number | null }> };
  };
  return body.wizard.tiles.find((t) => t.key === "skipped")!;
};

describe("GET /api/admin/ap/report", () => {
  it("compares Skipped intro with the earlier period's own presses", async () => {
    expect(await skipped()).toMatchObject({ value: 1 / 4, prev: 2 / 4 });
    const extrasCalls = mockSupabaseFetch.mock.calls
      .filter(([path]) => path === "/rest/v1/rpc/ap_report_extras")
      .map(([, init]) => JSON.parse((init as { body: string }).body).p_from)
      .sort();
    expect(extrasCalls).toEqual([PREV.from, THIS.from]);
  });

  it("shows the tile uncompared when the earlier period's presses can't be read", async () => {
    extrasFails = true;
    expect(await skipped()).toMatchObject({ value: 1 / 4, prev: null });
  });
});

describe("GET /api/admin/ap/report: the guided tour", () => {
  // A week from the day the tour is recorded, read the day after it ends.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T10:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  /** The page's tour, with ap_report_tour answering `tour` for a period (undefined: it fails). */
  const tourPage = async (from: string, to: string, tour: (from: string) => unknown) => {
    mockSupabaseFetch.mockImplementation(async (path: string, init?: { body?: string }) => {
      const { p_from } = JSON.parse(init?.body ?? "{}") as { p_from?: string };
      if (path === "/rest/v1/rpc/ap_facts") return json(facts([]));
      if (path === "/rest/v1/rpc/ap_report_extras") return json(extras([]));
      if (path === "/rest/v1/rpc/ap_report_tour") {
        const body = tour(p_from ?? "");
        return body === undefined ? json({ message: "boom" }, 500) : json(body);
      }
      return json(null, 404);
    });
    const res = await reportGet(
      new Request(`http://localhost/api/admin/ap/report?period=custom&from=${from}&to=${to}`)
    );
    expect(res.status).toBe(200);
    return (
      (await res.json()) as {
        tour: {
          audiences: Array<{
            tiles: Array<{ key: string; value: number | null; prev: number | null }>;
          }>;
        };
      }
    ).tour.audiences[0]!.tiles;
  };
  const tourReads = () =>
    mockSupabaseFetch.mock.calls
      .filter(([path]) => path === "/rest/v1/rpc/ap_report_tour")
      .map(([, init]) => JSON.parse((init as { body: string }).body).p_from)
      .sort();
  const week = (day: string, completed: number) => ({
    days: [
      { day, audience: "free", readers: 1, runs: 1, completed, skipped: 0, left: 0, unended: 0 },
    ],
    stops: [],
    placed: [],
  });

  it("reads it for the range and the period before, once each is recorded all through", async () => {
    const tiles = await tourPage("2026-10-27", "2026-11-02", (from) =>
      week(from, from === "2026-10-27" ? 1 : 0)
    );
    expect(tourReads()).toEqual(["2026-10-20", "2026-10-27"]);
    expect(tiles.find((t) => t.key === "tour-completed")).toMatchObject({ value: 1, prev: 0 });

    // A range before 20 Oct has no tour to read.
    mockSupabaseFetch.mockClear();
    await tourPage("2026-10-06", "2026-10-12", (from) => week(from, 1));
    expect(tourReads()).toEqual([]);
  });

  it("keeps the page when the tour cannot be read, and says so in its tiles", async () => {
    const tiles = await tourPage("2026-10-27", "2026-11-02", () => undefined);
    expect(tiles[0]).toMatchObject({
      blocked: "The guided tour could not be read just now. Try again in a minute.",
    });
  });
});

describe("the New & returning filter on every page route", () => {
  // A finished on their first visit and paid 6.99; B had visited the day before and paid 4.99;
  // C's visit PostHog never saw: in neither group.
  const A = "0192f0aa-a111-7000-8000-00000000000a";
  const B = "0192f0aa-b222-7000-8000-00000000000b";
  const C = "0192f0aa-c333-7000-8000-00000000000c";
  const day = "2026-10-07";
  const paidSub = (id: number, ph: string, revenue: number) => ({
    ...finisher(id, day),
    ph,
    paidAt: `${day}T11:00:00Z`,
    sales: 1,
    revenue,
    plan: "full_report",
    full: true,
  });
  const pay = (sid: number, ph: string, amount: number) => ({
    day,
    sid,
    amount,
    plan: "full_report",
    src: "google",
    med: "cpc",
    ph,
  });
  const visit = Date.parse(`${day}T09:55:00Z`);

  beforeEach(() => {
    mockSupabaseFetch.mockImplementation(async (path: string) => {
      if (path === "/rest/v1/rpc/ap_facts")
        return json({
          ...facts([paidSub(1, A, 6.99), paidSub(2, B, 4.99), { ...finisher(3, day), ph: C }]),
          money: [pay(1, A, 6.99), pay(2, B, 4.99)],
        });
      if (path === "/rest/v1/rpc/ap_report_extras") return json(extras([]));
      return json(null, 404);
    });
    // PostHog: each visit's start and its person's first event; anything else reads empty.
    mockHogql.mockImplementation(async (q: string) =>
      q.includes("AS started_ms")
        ? {
            ok: true,
            cut: null,
            rows: [
              [A, visit, visit],
              [B, visit, visit - 86_400_000],
            ],
          }
        : { ok: true, cut: null, rows: [] }
    );
  });

  const read = async (
    get: (r: Request) => Promise<Response>,
    page: string,
    visitor: string
  ): Promise<{ tiles: Array<{ key: string; value: number | null }> } & Record<string, unknown>> => {
    clearFactsCache();
    const res = await get(
      new Request(
        `http://localhost/api/admin/ap/${page}?period=custom&from=2026-10-06&to=2026-10-12&visitor=${visitor}`
      )
    );
    expect(res.status).toBe(200);
    return res.json();
  };
  const tile = (p: { tiles: Array<{ key: string; value: number | null }> }, key: string) =>
    p.tiles.find((t) => t.key === key)?.value;

  it("dashboard: new users and revenue by the payer's group", async () => {
    const all = await read(focusGet, "focus", "all");
    const fresh = await read(focusGet, "focus", "new");
    const back = await read(focusGet, "focus", "returning");
    expect([tile(all, "new-users"), tile(fresh, "new-users"), tile(back, "new-users")]).toEqual([
      3, 1, 1,
    ]);
    expect([tile(all, "revenue"), tile(fresh, "revenue"), tile(back, "revenue")]).toEqual([
      11.98, 6.99, 4.99,
    ]);
  });

  it("payment: paid sales by the payer's group", async () => {
    const sales = async (visitor: string) =>
      tile(await read(paymentGet, "payment", visitor), "sales");
    expect([await sales("all"), await sales("new"), await sales("returning")]).toEqual([2, 1, 1]);
  });

  it("assessment: revenue by the payer's group, and prices said not to split", async () => {
    const fresh = await read(assessmentGet, "assessment", "new");
    expect(tile(fresh, "revenue")).toBe(6.99);
    expect(tile(await read(assessmentGet, "assessment", "returning"), "revenue")).toBe(4.99);
    expect(fresh.pricesBlocked).toMatch(/new and returning can't split them/);
    expect((await read(assessmentGet, "assessment", "all")).pricesBlocked).toBeNull();
  });

  it("survey and report: the same people", async () => {
    expect(tile(await read(surveyGet, "survey", "returning"), "subs")).toBe(1);
    expect(tile(await read(reportGet, "report", "new"), "opened")).toBe(1);
    expect(tile(await read(reportGet, "report", "all"), "opened")).toBe(3);
  });
});
