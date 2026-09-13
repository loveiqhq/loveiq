import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const calls: Array<{ path: string; method: string }> = [];
/** stale = rows older than the stamp (what the DELETE would remove); total = all rows. */
let rows = { stale: 0, total: 0 };
let countable = true;

vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ path, method });
    if (method === "DELETE") {
      const deleted = Array.from({ length: rows.stale }, (_, i) => ({ id: i }));
      return new Response(JSON.stringify(deleted), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (!countable) return new Response("", { status: 500 });
    // `countChunks` asks the same question twice, separated only by the predicate.
    const n = path.includes("updated_at=lt.") ? rows.stale : rows.total;
    return new Response("", { status: 200, headers: { "content-range": `0-0/${n}` } });
  }),
}));

import { sweepStale } from "@features/brain/server/ingest/upsert";

const STAMP = "2026-09-01T00:00:00.000Z";
const deletes = () => calls.filter((c) => c.method === "DELETE");

/**
 * `sweepStale` is the live delete path for analytics, slack, calendar, ga4, gsc and
 * jira, and `analytics.ts` calls it with no completeness gate at all — so its two
 * refusals are the only thing standing between a truncated collection and losing the
 * source that feeds dated business numbers into search.
 *
 * Both refusals were executed by NO test. Deleting the `wroteRows <= 0` block and the
 * majority guard outright left all 3,527 tests green, because the one file that
 * mentioned this function replaced the whole module with `vi.fn(async () => 0)` and
 * never ran a line of it. The runbook described the same guard as "mutation-tested
 * four ways".
 *
 * These call the real function. Each test below fails if its guard is removed.
 */
describe("sweepStale — the guards that decide whether a source survives a bad read", () => {
  beforeEach(() => {
    calls.length = 0;
    rows = { stale: 3, total: 10 };
    countable = true;
  });

  it("deletes the stale minority when the run actually wrote something", async () => {
    // POSITIVE CONTROL. Without it every refusal below is satisfied by a function
    // that deletes nothing, ever — which is exactly how the old tests passed.
    const swept = await sweepStale("analytics", STAMP, 7);
    expect(swept).toBe(3);
    expect(deletes()).toHaveLength(1);
    expect(deletes()[0].path).toContain("updated_at=lt.");
    expect(deletes()[0].path).toContain("source=eq.analytics");
  });

  it("refuses when the run wrote no rows, and issues no DELETE at all", async () => {
    // An empty run means the collection failed, not that the source is empty.
    const swept = await sweepStale("analytics", STAMP, 0);
    expect(swept).toBe(0);
    expect(deletes()).toHaveLength(0);
  });

  it("refuses when it would delete the majority of the source", async () => {
    // The likelier, nearly-as-damaging case: a GA4 report truncated to 5 of 90 days
    // writes 5 chunks, clears the zero check, and would remove the other 85.
    rows = { stale: 85, total: 90 };
    const swept = await sweepStale("ga4", STAMP, 5);
    expect(swept).toBe(0);
    expect(deletes()).toHaveLength(0);
  });

  it("draws the majority line where it says it does", async () => {
    // Exactly half is allowed; one more than half is not. A guard nobody probes at
    // the boundary is a guard nobody can refactor safely.
    rows = { stale: 5, total: 10 };
    expect(await sweepStale("slack", STAMP, 5)).toBe(5);
    calls.length = 0;
    rows = { stale: 6, total: 10 };
    expect(await sweepStale("slack", STAMP, 4)).toBe(0);
    expect(deletes()).toHaveLength(0);
  });

  it("refuses when it cannot count what it is about to delete", async () => {
    countable = false;
    const swept = await sweepStale("calendar", STAMP, 12);
    expect(swept).toBe(0);
    expect(deletes()).toHaveLength(0);
  });

  it("does nothing, quietly, when there is nothing stale", async () => {
    rows = { stale: 0, total: 10 };
    expect(await sweepStale("gsc", STAMP, 10)).toBe(0);
    expect(deletes()).toHaveLength(0);
  });
});
