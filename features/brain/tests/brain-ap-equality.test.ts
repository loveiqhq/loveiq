import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * get_business_numbers against the DASHBOARD'S OWN ROUTE (/api/admin/ap/assessment), both fed
 * the same facts at the database: every headline figure Jarvis prints, and its change, must be
 * the one the dashboard returns for the link Jarvis gives. Nothing here builds an expected value
 * with the code under test; it is read off the route's JSON.
 *
 * The facts age: half the finishers open their report ten days after finishing, and every
 * third day's first finisher pays three days later, so a "so far" figure read at the wrong age
 * differs from the dashboard's.
 */
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  getClientIp: () => "1.2.3.4",
}));
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: async () => ({ email: "ap-check@example.com", role: "admin" }),
}));
vi.mock("@features/ux-review/server/review", () => ({
  hogqlTable: async () => ({ ok: false, error: "PostHog is not read in this test" }),
}));
const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...a: unknown[]) => mockSupabaseFetch(...(a as [])),
  fetchAllRows: vi.fn(),
  countRows: vi.fn(),
  POSTGREST_MAX_ROWS: 1000,
}));
const ad = { byDay: new Map<string, number>(), from: "2026-06-01", to: "2026-10-15" };
vi.mock("@features/brain/server/ingest/analytics", () => ({
  brainDailyRollup: async () => [],
  adCostByDay: async () => ad,
  adCovers: (a: { from: string | null; to: string | null }, day: string) =>
    a.from !== null && a.to !== null && day >= a.from && day <= a.to,
}));

import { GET as dashboardGet } from "@/app/api/admin/ap/assessment/route";
import { POST } from "@/app/api/mcp/route";
import { addDays } from "@features/admin/server/ap/days";
import { clearFactsCache } from "@features/admin/server/ap/facts";
import { delta, fmt } from "@features/admin/server/ap/format";

const TOKEN = "test-token-ap-equality";
const NOW = new Date("2026-10-16T10:00:00Z");
// From the first records (DATA_START), so a period can reach back before them.
const FIRST = "2026-03-21";
for (let d = "2026-06-01"; d <= "2026-10-15"; d = addDays(d, 1)) ad.byDay.set(d, 40);

const at = (day: string, hhmm: string) => `${day}T${hhmm}:00Z`;
const happened = (t: string) => Date.parse(t) <= NOW.getTime();

/** What ap_facts answers for [from, to]: the days' visits, starts and finishers, and the payments made on them. */
function factsJson(from: string, to: string) {
  const subs: unknown[] = [];
  const money: unknown[] = [];
  const days: string[] = [];
  for (let d = FIRST, i = 0; d <= "2026-10-16"; d = addDays(d, 1), i++) {
    const paysOn = addDays(d, 3);
    const pays = i % 3 === 0 && happened(at(paysOn, "12:00"));
    if (pays && paysOn >= from && paysOn <= to)
      money.push({ day: paysOn, sid: 2 * i + 1, amount: 29, plan: "full_report", device: "iOS" });
    if (d < from || d > to) continue;
    days.push(d);
    const opensLate = at(addDays(d, 10), "09:00");
    subs.push(
      {
        id: 2 * i + 1,
        day: d,
        at: at(d, "10:00"),
        openedAt: at(d, "10:05"),
        paidAt: pays ? at(paysOn, "12:00") : null,
        sales: pays ? 1 : 0,
        revenue: pays ? 29 : 0,
        device: "iOS",
        uid: 2 * i + 1,
        userFirstAt: at(d, "10:00"),
      },
      {
        id: 2 * i + 2,
        day: d,
        at: at(d, "11:00"),
        openedAt: happened(opensLate) ? opensLate : null,
        device: "Desktop",
        uid: 2 * i + 2,
        userFirstAt: at(d, "11:00"),
      }
    );
  }
  return {
    visits: days.map((day, k) => ({ day, arm: "white_video", src: null, n: 100 + (k % 7) * 10 })),
    starts: days.flatMap((day) => [
      { day, known: true, src: null, med: null, ads: false, device: "iOS", finished: true, n: 2 },
      { day, known: true, src: null, med: null, ads: false, device: "iOS", finished: false, n: 18 },
    ]),
    subs,
    money,
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

interface RouteTile {
  key: string;
  label: string;
  unit: Parameters<typeof fmt>[0];
  value: number | null;
  prev: number | null;
  goodWhen: "up" | "down" | "either";
  deltaAs?: "abs";
  blocked: string | null;
}

interface RoutePayload {
  tiles: RouteTile[];
  journey: Array<{ label: string; value: number | null }>;
  scorecard: Array<{ label: string; value: number | null }>;
}

/** The dashboard's route, as its page calls it for a link's query. */
async function payload(query: string): Promise<RoutePayload> {
  const res = await dashboardGet(new Request(`http://localhost/api/admin/ap/assessment?${query}`));
  expect(res.status).toBe(200);
  return (await res.json()) as RoutePayload;
}
const dashboard = async (query: string) => (await payload(query)).tiles;

async function tool(args: Record<string, unknown>, name = "get_business_numbers"): Promise<string> {
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
  expect(r.isError, r.content[0]!.text).toBeFalsy();
  return r.content[0]!.text;
}

/** The query of the dashboard link the answer gives. */
const linkQuery = (text: string) =>
  new URL(/https:\/\/www\.loveiq\.org\/admin\/ap\/assessment-a\S*/.exec(text)![0]).search.slice(1);

/** The tile as the answer prints it: its value, then its change, if any. */
const printed = (text: string, label: string) =>
  text
    .split("\n")
    .find((l) => l.startsWith(`- ${label}: `))!
    .slice(`- ${label}: `.length)
    .split(" · ")[0];

/** The same, written from the route's tile: the dashboard's value and change. */
const expected = (t: RouteTile, prev = t.prev) => {
  if (t.blocked) return `no figure (${t.blocked})`;
  const d = delta(t.unit, t.value, prev, t.goodWhen, t.deltaAs);
  return `${fmt(t.unit, t.value)}${d ? ` (${d.text})` : ""}`;
};

/** The tiles counting finishers "so far": comparable only at the same age. */
const AGE = new Set(["pay-cvr", "open-rate"]);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  process.env.LOVEIQ_MCP_TOKEN = TOKEN;
  clearFactsCache();
  mockSupabaseFetch.mockReset().mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/rest/v1/rpc/ap_facts") {
      const { p_from, p_to } = JSON.parse(String(init?.body));
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => factsJson(p_from, p_to),
      };
    }
    return { ok: true, status: 200, headers: new Headers(), json: async () => [] };
  });
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.LOVEIQ_MCP_TOKEN;
});

describe("get_business_numbers prints what the dashboard's own route returns", () => {
  it("a whole period against the one before: every figure and every change", async () => {
    const text = await tool({ since: "2026-10-06", until: "2026-10-12", compare_to: "previous" });
    expect(linkQuery(text)).toBe("period=custom&from=2026-10-06&to=2026-10-12");
    const tiles = await dashboard(linkQuery(text));
    // The dashboard compares this period with the one before, and so must the answer.
    expect(tiles.filter((t) => t.prev !== null).length).toBeGreaterThan(5);
    for (const t of tiles) expect(printed(text, t.label), t.label).toBe(expected(t));
    // The comparison's rows for the earlier period are read at the dashboard's same age too:
    // its open rate and Payment CVR are those counts over the same submissions.
    const row = (k: string) =>
      new RegExp(`^ {2}${k} +(\\d+) {2}vs +(\\d+) `, "m").exec(text)!.slice(1).map(Number);
    const before = row("submissions")[1]!;
    const prev = (key: string) => tiles.find((t) => t.key === key)!.prev!;
    expect(row("reports_opened")[1]).toBe(Math.round(prev("open-rate") * before));
    expect(row("paid_so_far")[1]).toBe(Math.round(prev("pay-cvr") * before));
    // Read at the same age, the earlier period's openers are fewer than they are by now.
    expect(row("reports_opened")[1]).toBeLessThan(before);
  });

  it("takes 'previous' from the period the dashboard reads, not the one asked for", async () => {
    // Asked to the 31st on the 16th: the dashboard reads 6 to 16 Oct, and compares the whole
    // days of it, 6 to 15 Oct, with the ten days before, as its own view of them does.
    const text = await tool({ since: "2026-10-06", until: "2026-10-31", compare_to: "previous" });
    expect(text).toMatch(/versus 2026-09-26 to 2026-10-05 \(10 days/);
    expect(text).toContain("the period just before, as the dashboard compares it");
    expect(linkQuery(text)).toBe("period=custom&from=2026-10-06&to=2026-10-15");
    for (const t of await dashboard(linkQuery(text)))
      expect(printed(text, t.label), t.label).toBe(expected(t));
  });

  it("compares with exactly the dashboard's period before, even where it predates the records", async () => {
    // 25 Mar to 10 Apr: the 17 days before start on 8 Mar, before LoveIQ's first records.
    const text = await tool({ since: "2026-03-25", until: "2026-04-10", compare_to: "previous" });
    expect(text).toMatch(/versus 2026-03-08 to 2026-03-24 \(17 days/);
    expect(text).toContain("The comparison period starts before LoveIQ's records");
    for (const t of await dashboard(linkQuery(text)))
      expect(printed(text, t.label), t.label).toBe(expected(t));
  });

  it("a period still running: the figures so far, and a comparison of its whole days only", async () => {
    // As it stands, today included: the dashboard's running view, which compares nothing.
    const running = await tool({ since: "2026-10-10" });
    expect(linkQuery(running)).toBe("period=custom&from=2026-10-10&to=2026-10-16");
    const now = await dashboard(linkQuery(running));
    expect(now.every((t) => t.prev === null)).toBe(true);
    for (const t of now) expect(printed(running, t.label), t.label).toBe(expected(t));
    // Compared: today's part-day is left out of both, and the dashboard's own view of those
    // whole days shows the same comparison.
    const compared = await tool({ since: "2026-10-10", compare_to: "previous" });
    expect(compared).toContain("Today is still running, so the comparison is of the whole days");
    expect(compared).toMatch(
      /2026-10-10 to 2026-10-15 \(6 days, 6 with data\) versus 2026-10-04 to 2026-10-09/
    );
    expect(linkQuery(compared)).toBe("period=custom&from=2026-10-10&to=2026-10-15");
    const whole = await dashboard(linkQuery(compared));
    expect(whole.filter((t) => t.prev !== null).length).toBeGreaterThan(5);
    for (const t of whole) expect(printed(compared, t.label), t.label).toBe(expected(t));
    // Only today: no whole day to compare, so none is, and the answer says so.
    const today = await tool({ since: "2026-10-16", compare_to: "previous" });
    expect(today).toContain("No comparison: the period is only today");
    expect(today).not.toContain(" versus ");
  });

  it("days: the dashboard's Last N days, figure for figure, as its preset link opens them", async () => {
    const text = await tool({ days: 7 });
    expect(linkQuery(text)).toBe("period=7d");
    // The preset view compares with the week before; the answer was asked for no comparison.
    for (const t of await dashboard("period=7d"))
      expect(printed(text, t.label), t.label).toBe(expected(t, null));
  });

  it("another period, earlier or later: the same figures, no change on a 'so far' one", async () => {
    for (const [args, other] of [
      [
        { since: "2026-10-08", until: "2026-10-14", compare_to: "2026-09-20..2026-10-01" },
        "period=custom&from=2026-09-20&to=2026-10-01",
      ],
      [
        { since: "2026-09-20", until: "2026-09-30", compare_to: "2026-10-01..2026-10-12" },
        "period=custom&from=2026-10-01&to=2026-10-12",
      ],
      // One that reaches today is read to yesterday, its whole days.
      [
        { since: "2026-09-26", until: "2026-10-05", compare_to: "2026-10-06..2026-10-16" },
        "period=custom&from=2026-10-06&to=2026-10-15",
      ],
    ] as const) {
      const text = await tool(args);
      const tiles = await dashboard(linkQuery(text));
      const theirs = new Map((await dashboard(other)).map((t) => [t.key, t.value]));
      for (const t of tiles) {
        // Its change, where it has one, is against that period's own dashboard figure.
        const want = expected(t, AGE.has(t.key) ? null : (theirs.get(t.key) ?? null));
        expect(printed(text, t.label), `${args.compare_to} ${t.label}`).toBe(want);
      }
      expect(text).toContain("Payment CVR and Report open rate are not compared");
      expect(text).not.toMatch(/ {2}(reports_opened|paid_so_far) /);
    }
  });
});

describe("break_even counts what the dashboard counts", () => {
  it("its visitors, finishers, average order and cost per paying customer are the dashboard's", async () => {
    const text = await tool({ days: 30 }, "break_even");
    // The 30 whole days to yesterday, which the ad data covers: the dashboard's Last 30 days.
    const link = /https:\/\/www\.loveiq\.org\/admin\/ap\/assessment-a\S*/.exec(text)![0];
    const { tiles, journey, scorecard } = await payload(new URL(link).search.slice(1));
    const num = (re: RegExp) => Number(re.exec(text)![1]!.replace(/,/g, ""));
    const round = (n: number) => Math.round(n * 100) / 100;
    const visitors = num(/- ([\d,]+) visitors \(each person once a day\)/);
    const finished = num(/- ([\d,]+) finished the survey/);
    const paid = num(/- ([\d,]+) paid:/);
    const spent = num(/Spent EUR ([\d,.]+) on Google Ads/);
    expect(paid).toBeGreaterThan(0);
    expect(visitors).toBe(tiles.find((t) => t.key === "visits")!.value);
    expect(finished).toBe(journey.find((j) => j.label === "Submitted")!.value);
    expect(num(/They paid EUR ([\d,.]+) on average/)).toBe(
      round(scorecard.find((r) => r.label === "CLV")!.value!)
    );
    expect(round(spent / paid)).toBe(round(tiles.find((t) => t.key === "cac")!.value!));
  });
});
