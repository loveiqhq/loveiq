import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * get_business_numbers gives the AP-Analytics dashboard's numbers (ap-numbers.ts): read
 * through the real route, with the dashboard's facts mocked at the database and its counting
 * left real, so a figure here is the figure the dashboard's own code makes of the same facts.
 */
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  getClientIp: () => "1.2.3.4",
}));
const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...a: unknown[]) => mockSupabaseFetch(...(a as [])),
}));
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: async () => ({ email: "ap-check@example.com", role: "admin" }),
}));
vi.mock("@features/ux-review/server/review", () => ({
  hogqlTable: async () => ({ ok: false, error: "PostHog is not read in this test" }),
}));
const mockRollup = vi.fn();
let mockAdCost: { byDay: Map<string, number>; from: string | null; to: string | null };
vi.mock("@features/brain/server/ingest/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/brain/server/ingest/analytics")>()),
  brainDailyRollup: (...a: unknown[]) => mockRollup(...(a as [])),
  adCostByDay: async () => mockAdCost,
  adCovers: (ad: { from: string | null; to: string | null }, day: string) =>
    ad.from !== null && ad.to !== null && day >= ad.from && day <= ad.to,
}));

import { GET as dashboardGet } from "@/app/api/admin/ap/assessment/route";
import { POST } from "@/app/api/mcp/route";
import { addDays } from "@features/admin/server/ap/days";
import { clearFactsCache } from "@features/admin/server/ap/facts";
import { parseFilters } from "@features/admin/server/ap/filters";
import { fmt } from "@features/admin/server/ap/format";
import { CircuitOpenError } from "@shared/http/circuit-breaker";

const TOKEN = "test-token-ap-numbers";
const NOW = new Date("2026-10-16T10:00:00Z");
const TODAY = "2026-10-16";

/** What ap_facts answers for a range: every day the same, a sale on the 14th, a comp on the 15th. */
function factsJson(from: string, to: string) {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const sub = (day: string, id: number, read: boolean) => ({
    id,
    day,
    at: `${day}T10:00:00Z`,
    startAt: `${day}T09:40:00Z`,
    durationMs: 900_000,
    src: null,
    med: null,
    ads: false,
    device: "iOS",
    openedAt: read ? `${day}T10:05:00Z` : null,
    paidAt: read && day === "2026-10-14" ? `${day}T10:20:00Z` : null,
    sales: read && day === "2026-10-14" ? 1 : 0,
    revenue: read && day === "2026-10-14" ? 29.99 : 0,
    uid: id,
    userFirstAt: `${day}T10:00:00Z`,
    userSubs: 1,
    userPays: [],
  });
  return {
    visits: days.flatMap((day) => [
      { day, arm: "white_video", src: null, n: 100 },
      // Our own probe: the dashboard leaves it out of the visits.
      { day, arm: "white_video", src: "prod-verification", n: 5 },
    ]),
    starts: days.flatMap((day) => [
      { day, known: true, src: null, med: null, ads: false, device: "iOS", finished: true, n: 2 },
      { day, known: true, src: null, med: null, ads: false, device: "iOS", finished: false, n: 18 },
    ]),
    subs: days.flatMap((day, i) => [sub(day, 100 + 2 * i, true), sub(day, 101 + 2 * i, false)]),
    money: [
      ...(days.includes("2026-10-14")
        ? [
            {
              day: "2026-10-14",
              sid: 1,
              amount: 29.99,
              plan: "full_report",
              src: "google",
              med: "cpc",
              device: "iOS",
              tier: "tier_1",
              priceArm: "B3",
            },
          ]
        : []),
      ...(days.includes("2026-10-15")
        ? [
            {
              day: "2026-10-15",
              sid: 2,
              amount: 0,
              plan: "full_report",
              src: null,
              med: null,
              device: "Desktop",
              tier: "tier_2",
              priceArm: "B3",
            },
          ]
        : []),
    ],
    checkouts: [],
    intro: days.map((day) => ({
      day,
      step: "intro_slide_4",
      n: 15,
      ms: [],
      skipped: 0,
      direct: 0,
    })),
    invites: [],
    quotes: [],
  };
}

/** The old rollup: other numbers on purpose, so a row shows which counting it came from. */
function rollupDays(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    day: addDays(TODAY, -i),
    unique_visitors: 999,
    survey_starts: 3,
    intro_completed: 15,
    submissions: 9,
    reports_created: 7,
    reports_paid: 0,
    revenue: 1,
    report_opens: 8,
    invites_sent: 4,
    top_sources: { direct: 999 },
  }));
}

let apFails = false;
let ga4Fails = false;
async function call(args: Record<string, unknown>) {
  const res = await POST(
    new Request("https://www.loveiq.org/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "get_business_numbers", arguments: args },
      }),
    })
  );
  const r = (await res.json()).result as { isError?: boolean; content: Array<{ text: string }> };
  return { isError: r.isError, text: r.content[0]!.text };
}
async function callTool(name: string, args: Record<string, unknown>) {
  const res = await POST(
    new Request("https://www.loveiq.org/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    })
  );
  const r = (await res.json()).result as { isError?: boolean; content: Array<{ text: string }> };
  return { isError: r.isError, text: r.content[0]!.text };
}
/** The day rows: the JSON array the answer ends with. */
const rowsOf = (text: string) =>
  JSON.parse(text.slice(text.lastIndexOf("\n[") + 1)) as Array<Record<string, unknown>>;
const apCalls = () =>
  mockSupabaseFetch.mock.calls.filter(([p]) => String(p) === "/rest/v1/rpc/ap_facts");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  process.env.LOVEIQ_MCP_TOKEN = TOKEN;
  clearFactsCache();
  apFails = false;
  ga4Fails = false;
  // As the database answers: one row per day, for as many days back as asked, 4,000 at most.
  mockRollup.mockReset().mockImplementation(async (n: number) => rollupDays(Math.min(n, 4000)));
  mockAdCost = { byDay: new Map([["2026-10-14", 40]]), from: "2026-06-01", to: "2026-10-15" };
  mockSupabaseFetch.mockReset().mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/rest/v1/rpc/ap_facts") {
      if (apFails) return { ok: false, status: 500, json: async () => ({}) };
      const { p_from, p_to } = JSON.parse(String(init?.body));
      return { ok: true, status: 200, json: async () => factsJson(p_from, p_to) };
    }
    if (ga4Fails && path.includes("source=eq.ga4"))
      return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => [] };
  });
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.LOVEIQ_MCP_TOKEN;
});

describe("get_business_numbers counts as the AP-Analytics dashboard does", () => {
  it("serves the dashboard's day rows, says they are the dashboard's, and links the view", async () => {
    const { isError, text } = await call({ since: "2026-10-13", until: "2026-10-15" });
    expect(isError).toBeFalsy();
    expect(text).toContain("AP-ANALYTICS NUMBERS for 2026-10-13 to 2026-10-15");
    expect(text).toContain("Quote them as the dashboard's.");
    expect(text).toContain(
      "https://www.loveiq.org/admin/ap/assessment-a?period=custom&from=2026-10-13&to=2026-10-15"
    );
    const rows = rowsOf(text);
    expect(rows.map((r) => r.day)).toEqual(["2026-10-15", "2026-10-14", "2026-10-13"]);
    // The dashboard's counts: the probe's 5 visits out, never the rollup's 999.
    expect(rows[1]).toMatchObject({
      day: "2026-10-14",
      unique_visitors: 100,
      survey_starts: 20,
      intro_completed: 15,
      submissions: 2,
      reports_opened: 1,
      paid_so_far: 1,
      paid_sales: 1,
      free_unlocks: 0,
      revenue: 29.99,
      ad_spend: 40,
    });
    expect(rows[0]).toMatchObject({ free_unlocks: 1, paid_sales: 0, revenue: 0 });
    // The figures the dashboard has none for keep the rollup's counting, and say so.
    expect(rows[0]).toMatchObject({
      reports_created: 7,
      invites_sent: 4,
      top_sources: { direct: 999 },
    });
    expect(rows[0]).not.toHaveProperty("report_opens");
    expect(text).toContain(
      "NOT ON THE DASHBOARD: reports_created, invites_sent, top_sources have no figure there"
    );
    expect(apCalls()).toHaveLength(1);
  });

  it("prints every headline figure as the dashboard's own route returns it for the link", async () => {
    const { text } = await call({ since: "2026-10-13", until: "2026-10-15" });
    const link = /https:\/\/www\.loveiq\.org\/admin\/ap\/assessment-a\?\S+/.exec(text)![0];
    const res = await dashboardGet(
      new Request(`http://localhost/api/admin/ap/assessment${new URL(link).search}`)
    );
    expect(res.status).toBe(200);
    const { tiles } = (await res.json()) as {
      tiles: Array<{ label: string; unit: "count"; value: number | null; blocked: string | null }>;
    };
    expect(tiles.length).toBeGreaterThan(5);
    for (const t of tiles) {
      expect(text, t.label).toContain(
        `- ${t.label}: ${t.blocked ? "no figure" : fmt(t.unit, t.value)}`
      );
    }
    // Checked by hand against the facts: 3 days of 20 starts over 100 visits (the probe's 5
    // left out), 2 finishers a day, the sale on the 14th and the free unlock on the 15th.
    expect(text).toContain("- Survey start CVR: 20.0% · 60 starts");
    expect(text).toContain("1 paid sale by 1 paying customer and 1 free unlock");
    const sum = (k: string) => rowsOf(text).reduce((n, r) => n + Number(r[k] ?? 0), 0);
    expect(
      [
        "unique_visitors",
        "survey_starts",
        "submissions",
        "paid_sales",
        "free_unlocks",
        "revenue",
      ].map(sum)
    ).toEqual([300, 60, 6, 1, 1, 29.99]);
  });

  it("reads `days` as the dashboard's Last N days, and links that preset", async () => {
    // The 7 whole days before today, as the bar's "Last 7 days": never today's part-day.
    const { text } = await call({ days: 7 });
    const link = /https:\/\/www\.loveiq\.org\/admin\/ap\/assessment-a\?\S+/.exec(text)![0];
    expect(link).toBe("https://www.loveiq.org/admin/ap/assessment-a?period=7d");
    const f = parseFilters(new URL(link).searchParams, TODAY);
    expect([f.period, f.from, f.to]).toEqual(["7d", "2026-10-09", "2026-10-15"]);
    expect(rowsOf(text).map((r) => r.day)).toEqual([
      "2026-10-15",
      "2026-10-14",
      "2026-10-13",
      "2026-10-12",
      "2026-10-11",
      "2026-10-10",
      "2026-10-09",
    ]);
    expect(text).not.toContain("Today is still running");
    // A range that is no preset stays a custom one; "Last 30 days" is the bar's default.
    expect((await call({ days: 5 })).text).toContain(
      "?period=custom&from=2026-10-11&to=2026-10-15"
    );
    expect((await call({ days: 30 })).text).toContain(
      "The same view: https://www.loveiq.org/admin/ap/assessment-a (team sign-in required)"
    );
  });

  it("compares two periods the dashboard's way, and leaves out starts it would not compare", async () => {
    const recent = await call({ since: "2026-10-08", until: "2026-10-14", compare_to: "previous" });
    expect(recent.text).toContain(
      "2026-10-08 to 2026-10-14 (7 days, 7 with data) versus 2026-10-01 to 2026-10-07 (7 days, 7 with data)"
    );
    expect(recent.text).toMatch(/ {2}survey_starts +140 {2}vs +140 {2}\+0/);
    expect(recent.text).toContain("from=2026-10-01&to=2026-10-07");
    // Both periods before 18 Sep 2026 and over 30 days old: their starts are incomplete.
    const old = await call({ since: "2026-09-01", until: "2026-09-07", compare_to: "previous" });
    expect(old.text).not.toMatch(/ {2}survey_starts /);
    expect(old.text).toContain("survey_starts is not compared");
    // A compared period before the records begin is said to be empty, and is not even read.
    const before = apCalls().length;
    const none = await call({
      since: "2026-10-13",
      until: "2026-10-15",
      compare_to: "2025-01-01..2025-01-03",
    });
    expect(none.text).toContain(
      "The compared period ends before LoveIQ's records start on 21 Mar 2026, so there is nothing to compare with."
    );
    expect(apCalls().length - before).toBe(1);
    // No comparison at all, never a column of zeroes beside that note: the day rows instead.
    expect(none.text).not.toContain(" versus ");
    expect(rowsOf(none.text).map((r) => r.day)).toEqual(["2026-10-15", "2026-10-14", "2026-10-13"]);
    const april = await call({
      since: "2026-04-01",
      until: "2026-04-30",
      compare_to: "2026-01-01..2026-01-31",
    });
    expect(april.text).toContain("so there is nothing to compare with.");
    expect(april.text).not.toMatch(/ vs +0 /);
  });

  it("sums weeks from the dashboard's days, and marks a week cut short", async () => {
    const { text } = await call({ since: "2026-10-05", until: "2026-10-15", granularity: "week" });
    expect(text).toContain("Days are SUMMED");
    expect(text).toMatch(/2026-10-05 {2}\{"unique_visitors":700,/);
    expect(text).toMatch(/2026-10-12 {2}\{"unique_visitors":400,.*PARTIAL \(4 of 7 days\)/);
  });

  it("splits sales as the dashboard counts them, each filterable group linked to its view", async () => {
    const { text } = await call({ group_by: ["device"], since: "2026-10-13", until: "2026-10-15" });
    expect(text).toContain(
      "Sales by device, 2026-10-13 to 2026-10-15 (Berlin days, by the day paid), as AP-Analytics counts them: 1 sale, €29.99, and 1 free unlock."
    );
    expect(text).toContain(
      "- Mobile: 1 sale, €29.99 (average €29.99) · on the dashboard: https://www.loveiq.org/admin/ap/assessment-a/payment?period=custom&from=2026-10-13&to=2026-10-15&device=phone"
    );
    expect(text).toContain("- Desktop: 0 sales, €0.00; 1 free unlock · on the dashboard:");
    expect(mockRollup).not.toHaveBeenCalled();
    // Plan is no dashboard filter: its groups carry no link of their own.
    const byPlan = await call({ group_by: ["plan"], since: "2026-10-13", until: "2026-10-15" });
    expect(byPlan.text).toMatch(
      /^- full_report: 1 sale, €29\.99 \(average €29\.99\); 1 free unlock$/m
    );
    // Two keys at once, and `days` as the dashboard's Last N days.
    const two = await call({ group_by: ["plan", "device"], days: 3 });
    expect(two.text).toContain("Sales by plan and device, 2026-10-13 to 2026-10-15 (Berlin days");
    expect(two.text).toMatch(/^- full_report · Mobile: 1 sale, €29\.99 \(average €29\.99\)$/m);
    expect(two.text).toMatch(/^- full_report · Desktop: 0 sales, €0\.00; 1 free unlock$/m);
  });

  it("says the dashboard's numbers could not be read, and serves none counted another way", async () => {
    apFails = true;
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.loveiq.org";
    const outage = (what: string) =>
      "The AP-Analytics dashboard's numbers could not be read right now, so there are none to " +
      `give, and none counted another way in their place. This is an outage, not ${what}. Ask ` +
      "again in a few minutes.";
    for (const args of [
      { since: "2026-10-13", until: "2026-10-15" },
      { days: 7 },
      { since: "2026-10-01", compare_to: "previous" },
      { since: "2026-09-01", until: "2026-10-15", granularity: "week" },
      { group_by: ["plan"], days: 7 },
    ]) {
      const { isError, text } = await call(args);
      expect(isError, JSON.stringify(args)).toBe(true);
      expect(text, JSON.stringify(args)).toBe(outage("a result"));
    }
    for (const [tool, what] of [
      ["explain_change", "a quiet day"],
      ["show_chart", "a flat line"],
      ["break_even", "a result"],
    ] as const) {
      const r = await callTool(tool, tool === "show_chart" ? { metrics: ["visitors"] } : {});
      expect(r.isError, tool).toBe(true);
      expect(r.text, tool).toBe(outage(what));
    }
  });

  it("reads an open circuit breaker as the outage in every tool, never as no data", async () => {
    // The breaker refuses every read before it is made; adCostByDay swallows it into no window.
    mockSupabaseFetch.mockReset().mockRejectedValue(new CircuitOpenError("supabase"));
    mockRollup.mockReset().mockRejectedValue(new CircuitOpenError("supabase"));
    mockAdCost = { byDay: new Map(), from: null, to: null };
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.loveiq.org";
    const outage = (what: string) =>
      "The AP-Analytics dashboard's numbers could not be read right now, so there are none to " +
      `give, and none counted another way in their place. This is an outage, not ${what}. Ask ` +
      "again in a few minutes.";
    for (const [tool, args, what] of [
      ["get_business_numbers", { days: 7 }, "a result"],
      ["get_business_numbers", { group_by: ["plan"], days: 7 }, "a result"],
      ["explain_change", {}, "a quiet day"],
      ["explain_change", { metric: "report_opens" }, "a quiet day"],
      ["show_chart", { metrics: ["visitors"] }, "a flat line"],
      ["show_chart", { metrics: ["ad_spend"] }, "a flat line"],
    ] as const) {
      const r = await callTool(tool, args);
      expect(r.isError, `${tool} ${JSON.stringify(args)}`).toBe(true);
      expect(r.text, `${tool} ${JSON.stringify(args)}`).toBe(outage(what));
    }
    // break_even meets the spend first, and names it.
    expect(await callTool("break_even", { days: 7 })).toEqual({
      isError: true,
      text:
        "Google Ads spend could not be read just now, so there is no break-even to work out. " +
        "This is an outage, not zero spend. Ask again in a few minutes.",
    });
    // The dashboard read, the rollup's failed: the outage too, never a row of missing figures.
    vi.setSystemTime(NOW);
    clearFactsCache();
    mockSupabaseFetch.mockReset().mockImplementation(async (path: string, init?: RequestInit) => {
      if (path !== "/rest/v1/rpc/ap_facts") return { ok: true, status: 200, json: async () => [] };
      const { p_from, p_to } = JSON.parse(String(init?.body));
      return { ok: true, status: 200, json: async () => factsJson(p_from, p_to) };
    });
    mockRollup.mockReset().mockRejectedValue(new Error("brain_daily_rollup failed (500)"));
    const rollupDown = await call({ since: "2026-10-13", until: "2026-10-15" });
    expect(rollupDown.isError).toBe(true);
    expect(rollupDown.text).toBe(outage("a result"));
  });

  it("gives the outage, not a failed lookup, when a read answers what is not a table", async () => {
    // The series cannot be built from it, so it throws past the reads' own catches.
    mockRollup.mockReset().mockResolvedValue({} as never);
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.loveiq.org";
    const outage = (what: string) =>
      "The AP-Analytics dashboard's numbers could not be read right now, so there are none to " +
      `give, and none counted another way in their place. This is an outage, not ${what}. Ask ` +
      "again in a few minutes.";
    const explained = await callTool("explain_change", {});
    expect(explained.isError).toBe(true);
    expect(explained.text).toBe(outage("a quiet day"));
    const charted = await callTool("show_chart", { metrics: ["visitors"] });
    expect(charted.isError).toBe(true);
    expect(charted.text).toBe(outage("a flat line"));
  });

  it("gives the dashboard's figures with Google Analytics down, and says GA4's are left out", async () => {
    ga4Fails = true;
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.loveiq.org";
    process.env.STRATEGY_DIGEST_SIGNING_SECRET = "a-test-secret-of-some-length";
    const ga4 =
      "Google Analytics could not be read just now, so its figures are left out: this is an " +
      "outage, not zero.";
    // explain_change: the dashboard's numbers, with the note first.
    const day = await callTool("explain_change", {});
    expect(day.isError).toBeFalsy();
    expect(day.text.startsWith(`${ga4}\n\nNothing on 2026-10-15 was outside its usual range`)).toBe(
      true
    );
    expect(day.text).toContain("- Visitors (our own count): 100 against a usual 100");
    expect(day.text).not.toContain("GA4 sessions:");
    // Asked for a GA4 figure itself, or a chart of nothing else: that outage.
    expect(await callTool("explain_change", { metric: "sessions" })).toEqual({
      isError: true,
      text: ga4,
    });
    expect(await callTool("show_chart", { metrics: ["sessions"] })).toEqual({
      isError: true,
      text: ga4,
    });
    // A chart of the dashboard's visitors still draws, and says nothing of GA4.
    const visitors = await callTool("show_chart", { metrics: ["visitors"] });
    expect(visitors.isError).toBeFalsy();
    expect(visitors.text).toContain("Over the 30 days: 3,000, 100 a day.");
    expect(visitors.text).not.toContain("Google Analytics");
    // Beside GA4's sessions: visitors drawn, sessions left out and said so, never "no record".
    const both = await callTool("show_chart", { metrics: ["visitors", "sessions"] });
    expect(both.isError).toBeFalsy();
    expect(both.text).toContain("Visitors: 3,000, 100 a day.\nGA4 sessions: could not be read.");
    expect(both.text).toContain(ga4);
    expect(both.text).not.toMatch(/nothing recorded/i);
    delete process.env.STRATEGY_DIGEST_SIGNING_SECRET;
  });

  it("takes the dashboard's Berlin day, not UTC's, between midnight in Berlin and in London", async () => {
    // 22:30 UTC on the 16th is 00:30 on the 17th in Berlin: the 17th is today, the 16th whole.
    vi.setSystemTime(new Date("2026-10-16T22:30:00Z"));
    const today = await call({ since: "2026-10-17" });
    expect(today.isError).toBeFalsy();
    expect(today.text).toContain("AP-ANALYTICS NUMBERS for 2026-10-17 to 2026-10-17");
    const compared = await call({ since: "2026-10-10", compare_to: "previous" });
    expect(compared.text).toMatch(
      /2026-10-10 to 2026-10-16 \(7 days, 7 with data\) versus 2026-10-03/
    );
    expect((await call({ days: 7 })).text).toContain("?period=7d");
    expect(rowsOf((await call({ days: 7 })).text)[0]!.day).toBe("2026-10-16");
  });

  it("does not ask the dashboard about days before LoveIQ's records begin", async () => {
    const { text } = await call({ since: "2000-01-01", until: "2000-01-31" });
    expect(text).toMatch(/outside the data/);
    expect(text).not.toContain("COULD NOT BE READ");
    expect(apCalls()).toHaveLength(0);
  });

  it("says a period before the records is no data, never a row of zeroes", async () => {
    // The old rollup has every one of these days, as zeroes: they must not be served.
    for (const args of [
      { since: "2026-01-01", until: "2026-01-31" },
      { since: "2026-01-01", until: "2026-01-31", granularity: "week" },
      { since: "2026-01-01", until: "2026-01-31", compare_to: "previous" },
      { group_by: ["plan"], since: "2026-01-01", until: "2026-01-31" },
    ]) {
      const { text } = await call(args);
      expect(text, JSON.stringify(args)).toContain(
        "No numbers for 2026-01-01 to 2026-01-31: that range is outside the data. LoveIQ's records start on 21 Mar 2026"
      );
      expect(text).not.toContain('"day":');
    }
  });

  it("compares only once there is a comparison to make, and says what it did", async () => {
    // A compared period with no whole day yet: nothing is compared, so the period is read as
    // asked, today included, with the one note that says why.
    const later = await call({ since: "2026-10-10", compare_to: "2026-10-16..2026-10-20" });
    expect(later.text).toContain("AP-ANALYTICS NUMBERS for 2026-10-10 to 2026-10-16");
    expect(later.text).toContain(
      "Nothing to compare with: the compared period has no whole day yet."
    );
    expect(later.text).toContain("Today is still running, so its figures are part of a day.");
    expect(later.text).not.toMatch(
      /compared over its whole days|the comparison is of the whole days/
    );
    expect(later.text).not.toContain(" versus ");
    // Another period: "this period is compared over its whole days", never "the same number
    // of days before", which only "previous" is.
    const other = await call({ since: "2026-10-01", compare_to: "2026-09-01..2026-09-30" });
    expect(other.text).toContain(
      "Today is still running, so this period is compared over its whole days, 2026-10-01 to 2026-10-15: today's part-day is left out."
    );
    expect(other.text).not.toContain("against the same number of days before");
    // The period just before, given as a range, is "previous": it moves with the cut.
    const before = await call({ since: "2026-10-10", compare_to: "2026-10-03..2026-10-09" });
    expect(before.text).toMatch(
      /2026-10-10 to 2026-10-15 \(6 days, 6 with data\) versus 2026-10-04 to 2026-10-09 \(6 days/
    );
    expect(before.text).toContain("against the same number of days before");
    expect(before.text).not.toContain("DIFFERENT LENGTHS");
  });

  it("links a year of days as the bar's Last 12 months while it reaches before the records", async () => {
    expect((await call({ days: 365 })).text).toContain(
      "https://www.loveiq.org/admin/ap/assessment-a?period=12m"
    );
  });

  it("says reports opened and paid are not in yet for a day still running in UTC", async () => {
    // 22:30 UTC on the 16th is 00:30 on the 17th in Berlin: explain_change's default day is the
    // 16th, whole for the dashboard, but the rollup's UTC 16th runs on.
    vi.setSystemTime(new Date("2026-10-16T22:30:00Z"));
    const utc16 =
      "Reports opened and paid are counted by UTC day, and 2026-10-16 is not over yet in UTC, " +
      "so their figures for it are not complete and are left out.";
    for (const [metric, label] of [
      ["report_opens", "Reports opened"],
      ["reports_paid", "Reports paid"],
      ["paid_rate", "Share of report openers who pay"],
    ]) {
      const { text } = await callTool("explain_change", { metric });
      expect(text).toBe(`${label} has no reading for 2026-10-16 yet. ${utc16}`);
    }
    // Without a metric those three drop out of the day, and it says why at the top.
    expect((await callTool("explain_change", {})).text.startsWith(`${utc16}\n\n`)).toBe(true);
    // The dashboard's own figures are whole that night, and a UTC day that has ended reads.
    const visitors = (await callTool("explain_change", { metric: "visitors" })).text;
    expect(visitors).toMatch(/^Within its usual range on 2026-10-16/);
    expect(visitors).not.toContain("not over yet in UTC");
    const ended = await callTool("explain_change", { metric: "report_opens", day: "2026-10-15" });
    expect(ended.text).toMatch(/^Within its usual range on 2026-10-15/);
  });
});
