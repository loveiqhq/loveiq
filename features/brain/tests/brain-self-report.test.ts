import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...a: unknown[]) => mockSupabaseFetch(...(a as [])),
}));

import {
  jobHealth,
  parseBatteryRun,
  renderSelfReport,
  selfReport,
  windowStats,
  type CallRow,
  type SelfReport,
} from "@features/brain/server/self-report";
import { CRON_MAX_AGE_MS } from "@features/cron/server/cron-stall";

const FLOOR = 1.85;
const NOW = Date.parse("2026-09-28T06:00:00Z");

const row = (over: Partial<CallRow> = {}): CallRow => ({
  created_at: "2026-09-27T10:00:00Z",
  surface: "mcp",
  tool: "fetch_document",
  query: null,
  source_count: 1,
  content_score: null,
  latency_ms: 1000,
  error: null,
  ...over,
});
const search = (query: string, score: number | null, count = 5, over: Partial<CallRow> = {}) =>
  row({
    tool: "search_company_context",
    query,
    content_score: score,
    source_count: count,
    ...over,
  });

describe("windowStats", () => {
  it("calls a search weak only when it found something and scored under the floor on content", () => {
    const s = windowStats(
      [
        search("pricing", 3.1),
        search("kpi targets", 1.2),
        search("KPI targets ", 1.4),
        search("nothing at all", null, 0),
        search("old row without a content score", null),
        row(),
      ],
      FLOOR
    );
    expect(s).toMatchObject({ calls: 6, searches: 5, weak: 2, empty: 1 });
    // Same question however it is cased or spaced; asked most first, then the worst match.
    expect(s.unanswered).toEqual([
      { query: "kpi targets", times: 2, best: 1.4 },
      { query: "nothing at all", times: 1, best: null },
    ]);
  });

  /**
   * Live rows: the route stores an empty search as source_count 0 WITH content_score 0, so
   * without the found-something test every empty search would count as weak as well.
   */
  it("counts an empty search as empty only, with no best match, and the floor itself as not weak", () => {
    const s = windowStats(
      [search("nothing here", 0, 0), search("exactly at the floor", FLOOR)],
      FLOOR
    );
    expect(s).toMatchObject({ searches: 2, weak: 0, empty: 1 });
    expect(s.unanswered).toEqual([{ query: "nothing here", times: 1, best: null }]);
  });

  it("tells an outage from a failed call from an error message, and groups the reasons", () => {
    const s = windowStats(
      [
        row({ error: "The company knowledge base is unreachable right now." }),
        row({ tool: "query_product_data", error: "That lookup failed. Try again." }),
        row({ error: 'Query failed (400): {"code":"42703","message":"column a does not exist"}' }),
        row({ error: 'Query failed (400): {"code":"42703","message":"column b does not exist"}' }),
        row({ error: 'github returned 401:\n{\n  "message": "Requires authentication"}' }),
      ],
      FLOOR
    );
    expect(s).toMatchObject({ outages: 1, failures: 1, refusals: 3 });
    // Each error is counted once: an outage that also says the lookup failed is an outage.
    const both = windowStats(
      [row({ error: "The knowledge base is unreachable. That lookup failed." })],
      FLOOR
    );
    expect(both).toMatchObject({ outages: 1, failures: 0, refusals: 0 });
    expect(s.failuresByTool).toEqual([
      ["fetch_document", 1],
      ["query_product_data", 1],
    ]);
    expect(s.topRefusals).toEqual([
      ["Query failed (400)", 2],
      ["github returned 401", 1],
    ]);
  });

  it("reads speed as percentiles, and names the slowest tools only once they have ten calls", () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => row({ tool: "show_design", latency_ms: 10_000 + i })),
      ...Array.from({ length: 9 }, () => row({ tool: "rare_tool", latency_ms: 60_000 })),
      ...Array.from({ length: 81 }, () => row({ latency_ms: 500 })),
    ];
    const s = windowStats(rows, FLOOR);
    expect(s.p50).toBe(500);
    expect(s.p95).toBeGreaterThan(9_000);
    expect(s.slowest.map(([t]) => t)).toEqual(["show_design", "fetch_document"]);
  });
});

describe("parseBatteryRun", () => {
  const at = "2026-09-28T06:10:00Z";
  it("reads a recorded run, and never mistakes an unreadable one for a clean one", () => {
    expect(
      parseBatteryRun({
        started_at: at,
        status: "success",
        error_message: '{"total":229,"clean":224,"failing":["a"],"flaky":["b","c"],"known":2}',
      })
    ).toEqual({
      at,
      ok: true,
      total: 229,
      clean: 224,
      failing: ["a"],
      flaky: ["b", "c"],
      known: 2,
    });
    expect(
      parseBatteryRun({
        started_at: at,
        status: "error",
        error_message: "LOVEIQ_MCP_TOKEN is not set",
      })
    ).toMatchObject({ ok: false, error: "LOVEIQ_MCP_TOKEN is not set" });
    expect(
      parseBatteryRun({ started_at: at, status: "success", error_message: '{"total":229,' })
    ).toMatchObject({
      ok: false,
      error: "its result could not be read",
    });
    expect(
      parseBatteryRun({ started_at: at, status: "success", error_message: '{"clean":5}' })
    ).toMatchObject({ ok: false });
  });
});

describe("jobHealth", () => {
  it("covers exactly the brain jobs the stall watcher knows, with its limits", () => {
    const jobs = jobHealth([], new Map(), NOW);
    expect(jobs.map((j) => j.name).sort()).toEqual(
      Object.keys(CRON_MAX_AGE_MS)
        .filter((n) => n.startsWith("brain-"))
        .sort()
    );
    expect(jobs.find((j) => j.name === "brain-fast")!.maxAgeMs).toBe(CRON_MAX_AGE_MS["brain-fast"]);
  });

  it("counts runs and errors, keeps the last error, and flags a job quiet past its limit", () => {
    const runs = [
      {
        cron_name: "brain-gmail",
        status: "error",
        started_at: "2026-09-27T01:00:00Z",
        error_message: "first",
      },
      {
        cron_name: "brain-gmail",
        status: "error",
        started_at: "2026-09-27T02:00:00Z",
        error_message: "second",
      },
      {
        cron_name: "brain-gmail",
        status: "success",
        started_at: "2026-09-28T05:30:00Z",
        error_message: null,
      },
      {
        cron_name: "brain-brief",
        status: "success",
        started_at: "2026-09-25T06:00:00Z",
        error_message: null,
      },
    ];
    const lastRuns = new Map([["brain-mine", "2026-09-10T08:00:00Z"]]);
    const jobs = new Map(jobHealth(runs, lastRuns, NOW).map((j) => [j.name, j]));
    expect(jobs.get("brain-gmail")).toMatchObject({
      runs: 3,
      errors: 2,
      lastError: { at: "2026-09-27T02:00:00Z", message: "second" },
      stale: false,
    });
    // 72 hours against a 26-hour limit.
    expect(jobs.get("brain-brief")).toMatchObject({ runs: 1, stale: true });
    // Quiet all window: its last run comes from the lookup, and a never-run job is stale.
    expect(jobs.get("brain-mine")).toMatchObject({
      runs: 0,
      lastRunAt: "2026-09-10T08:00:00Z",
      stale: true,
    });
    expect(jobs.get("brain-health")).toMatchObject({ lastRunAt: null, stale: true });
  });
});

const ok = (body: unknown, range?: string) => ({
  ok: true,
  status: 200,
  headers: new Headers(range ? { "content-range": range } : {}),
  json: async () => body,
});
const down = { ok: false, status: 503, headers: new Headers(), json: async () => ({}) };

describe("selfReport", () => {
  beforeEach(() => {
    mockSupabaseFetch.mockReset();
  });

  const route = (over: { calls?: unknown; runs?: unknown; batteries?: unknown } = {}) =>
    mockSupabaseFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/rest/v1/brain_query?select=id&surface=eq.mcp-battery")) {
        return ok([], "0-0/42");
      }
      if (path.startsWith("/rest/v1/brain_query?")) return over.calls ?? ok([]);
      if (path.includes("cron_name=in.(brain-battery-retrieval,brain-battery-mcp)")) {
        return over.batteries ?? ok([]);
      }
      if (path.includes("cron_name=in.(")) return over.runs ?? ok([]);
      if (path.includes("cron_name=eq.")) return ok([]);
      throw new Error(`unexpected ${path}`);
    });

  it("reads people's calls only, splits the two windows, and counts the batteries apart", async () => {
    route({
      calls: ok([
        row({ created_at: "2026-09-19T00:00:00Z" }),
        row({ created_at: "2026-09-22T00:00:00Z" }),
        row({ created_at: "2026-09-27T00:00:00Z" }),
      ]),
    });
    const r = await selfReport(7, FLOOR, NOW);
    expect(r).toMatchObject({ days: 7, since: "2026-09-21", until: "2026-09-28", testCalls: 42 });
    expect(r.now!.calls).toBe(2);
    expect(r.before!.calls).toBe(1);
    const calls = mockSupabaseFetch.mock.calls.map((c) => String(c[0]));
    const usage = calls.find((p) => p.startsWith("/rest/v1/brain_query?select=created_at"))!;
    expect(usage).toContain("&surface=neq.mcp-battery");
    expect(usage).toContain(`created_at=gte.${encodeURIComponent("2026-09-14T06:00:00.000Z")}`);
    expect(usage).toContain("query:args->>query");
  });

  it("says a part could not be read instead of reporting it as zero", async () => {
    route({ calls: down, runs: down, batteries: down });
    const r = await selfReport(7, FLOOR, NOW);
    expect(r).toMatchObject({ now: null, before: null, jobs: null, batteries: null });
    const text = renderSelfReport(r, FLOOR, { withQuestions: true, nowMs: NOW });
    expect(text).toContain("the usage log (brain_query) could not be read");
    expect(text).toContain("the test battery results could not be read");
    expect(text).toContain("the job log (cron_run) could not be read");
  });

  it("does not judge the jobs when a quiet job's last run could not be looked up", async () => {
    route();
    const quiet = mockSupabaseFetch.getMockImplementation()!;
    mockSupabaseFetch.mockImplementation(async (path: string) =>
      path.includes("cron_name=eq.") ? down : quiet(path)
    );
    expect((await selfReport(7, FLOOR, NOW)).jobs).toBeNull();
  });

  it("reads the batteries newest first, each on its own", async () => {
    route({
      batteries: ok([
        {
          cron_name: "brain-battery-mcp",
          status: "success",
          started_at: "2026-09-28T06:05:00Z",
          error_message: '{"total":48,"clean":48,"failing":[],"flaky":[],"known":0}',
        },
        {
          cron_name: "brain-battery-retrieval",
          status: "success",
          started_at: "2026-09-28T06:02:00Z",
          error_message: '{"total":229,"clean":222,"failing":["x"],"flaky":[],"known":2}',
        },
      ]),
    });
    const r = await selfReport(7, FLOOR, NOW);
    expect(r.batteries!["brain-battery-retrieval"].map((b) => b.clean)).toEqual([222]);
    expect(r.batteries!["brain-battery-mcp"].map((b) => b.clean)).toEqual([48]);
  });
});

describe("renderSelfReport", () => {
  const stats = windowStats(
    [search("kpi framework targets", 1.2), search("pricing", 3), row({ error: "Nope. Really." })],
    FLOOR
  );
  const report = (over: Partial<SelfReport> = {}): SelfReport => ({
    days: 7,
    since: "2026-09-21",
    until: "2026-09-28",
    now: stats,
    before: windowStats([], FLOOR),
    testCalls: 12,
    batteries: {
      "brain-battery-retrieval": [
        {
          at: "2026-09-28T06:02:00Z",
          ok: true,
          total: 229,
          clean: 222,
          failing: ["dr-record"],
          flaky: ["ga4"],
          known: 2,
        },
        {
          at: "2026-09-21T06:02:00Z",
          ok: true,
          total: 229,
          clean: 224,
          failing: [],
          flaky: [],
          known: 2,
        },
      ],
      "brain-battery-mcp": [
        {
          at: "2026-09-28T06:05:00Z",
          ok: false,
          failing: [],
          flaky: [],
          error: "LOVEIQ_MCP_TOKEN is not set",
        },
      ],
    },
    jobs: jobHealth(
      [
        {
          cron_name: "brain-gmail",
          status: "error",
          started_at: "2026-09-28T05:30:00Z",
          error_message: "boom",
        },
      ],
      new Map(Object.keys(CRON_MAX_AGE_MS).map((n) => [n, "2026-09-28T05:59:00Z"])),
      NOW
    ),
    ...over,
  });

  it("says who used it once people sign in, and says nothing about it before", () => {
    const signedIn = windowStats(
      [
        row({ actor: "mo@loveiq.org" }),
        row({ actor: "mo@loveiq.org" }),
        row({ actor: "ec@loveiq.org" }),
        row({ actor: "shared" }),
        row({ actor: null }),
      ],
      FLOOR
    );
    expect(
      renderSelfReport(report({ now: signedIn }), FLOOR, { withQuestions: false, nowMs: NOW })
    ).toContain("By who: mo@loveiq.org 2, ec@loveiq.org 1, the shared token 1, not recorded 1.");
    const onlyShared = windowStats([row({ actor: "shared" }), row({})], FLOOR);
    expect(
      renderSelfReport(report({ now: onlyShared }), FLOOR, { withQuestions: false, nowMs: NOW })
    ).not.toContain("By who");
  });

  it("reports use, searches, errors, the batteries against their last run, and only the jobs in trouble", () => {
    const text = renderSelfReport(report(), FLOOR, { withQuestions: true, nowMs: NOW });
    expect(text).toContain(
      "How the brain did, 2026-09-21 to 2026-09-28 (7 days), against the 7 before."
    );
    expect(text).toContain(
      "Use: 3 calls from people, against 0 before. The test batteries made 12 more, not counted."
    );
    expect(text).toContain("1 came back weak (50%; before, none)");
    expect(text).toContain('- "kpi framework targets" (once, best match 1.20)');
    expect(text).toContain('most often: "Nope." 1');
    expect(text).toContain(
      "- Search: 222 of 229 clean on 2026-09-28 (1 failing, 2 known, 1 passed only on a retry); " +
        "the run before, 224 of 229 on 2026-09-21."
    );
    expect(text).toContain("Failing: dr-record.");
    expect(text).toContain(
      "- Tools: the last run (2026-09-28) did not finish: LOVEIQ_MCP_TOKEN is not set."
    );
    expect(text).toContain(
      '- brain-gmail: 1 of 1 runs failed, the last on 2026-09-28 05:30 UTC: "boom".'
    );
    expect(text).not.toContain("brain-fast:");
  });

  it("leaves the questions' text out of the stored notice, and says where to read them", () => {
    const text = renderSelfReport(report(), FLOOR, { withQuestions: false, nowMs: NOW });
    expect(text).not.toContain("kpi framework targets");
    expect(text).toContain(
      "Asked but not answered well: 1 distinct questions. The brain_health tool lists them."
    );
  });

  it("compares with the last run that finished, not a failed one in between", () => {
    const text = renderSelfReport(
      report({
        batteries: {
          "brain-battery-retrieval": [
            {
              at: "2026-09-28T06:02:00Z",
              ok: true,
              total: 229,
              clean: 224,
              failing: [],
              flaky: [],
              known: 5,
            },
            { at: "2026-09-21T06:02:00Z", ok: false, failing: [], flaky: [], error: "timed out" },
            {
              at: "2026-09-14T06:02:00Z",
              ok: true,
              total: 229,
              clean: 221,
              failing: [],
              flaky: [],
              known: 5,
            },
          ],
          "brain-battery-mcp": [],
        },
      }),
      FLOOR,
      { withQuestions: true, nowMs: NOW }
    );
    expect(text).toContain("the run before, 221 of 229 on 2026-09-14.");
  });

  it("says when no battery has run yet, and when a job has never run", () => {
    const text = renderSelfReport(
      report({
        batteries: { "brain-battery-retrieval": [], "brain-battery-mcp": [] },
        jobs: jobHealth([], new Map(), NOW),
      }),
      FLOOR,
      { withQuestions: true, nowMs: NOW }
    );
    expect(text).toContain("- Search: no run recorded yet.");
    expect(text).toContain(
      "- brain-health: has never recorded a run (it should run at least every 8 days)."
    );
  });
});
