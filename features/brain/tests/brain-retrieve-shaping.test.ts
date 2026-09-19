import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...a: unknown[]) => mockSupabaseFetch(...(a as [])),
}));
vi.mock("@features/brain/server/embed", () => ({ embedQuery: async () => null }));

import { retrieve, type RetrieveShaping } from "@features/brain/server/retrieve";

/** A scored row as `brain_search` returns it. */
const row = (source: string, i: number, score: number) => ({
  id: `${source}-${i}`,
  source,
  source_id: `${source}:${i}`,
  title: `${source} item ${i}`,
  url: null,
  body: "text",
  meta: {},
  updated_at: "2026-09-09T00:00:00Z",
  period_end: "2026-09-01",
  score,
});

function wire(rows: unknown[]) {
  mockSupabaseFetch.mockImplementation(async () => ({
    ok: true,
    headers: new Headers(),
    json: async () => rows,
  }));
}

beforeEach(() => mockSupabaseFetch.mockReset());

describe("what the per-source cap cut", () => {
  /**
   * THE CAPS ARE RIGHT AND THEY ARE INVISIBLE, which is the problem.
   *
   * One source is not allowed to fill the whole result set — without that, measured, ga4
   * took 12 of 14 slots and squeezed the revenue row out entirely. But the consequence is
   * that a source with twenty good matches is represented by three, and NOTHING
   * distinguishes that from the source genuinely having three. A reader concludes the
   * corpus is thin on something it is not thin on.
   */
  it("reports the source and the count when the cap cuts matches", async () => {
    // 20 strong ga4 rows and 4 weak ones from elsewhere: the cap must bite.
    wire([
      ...Array.from({ length: 20 }, (_, i) => row("ga4", i, 3 - i * 0.01)),
      ...Array.from({ length: 4 }, (_, i) => row("commit", i, 1 - i * 0.01)),
    ]);
    const shaping: RetrieveShaping = {};
    const out = await retrieve("anything", 6, {}, shaping);
    expect(out).toHaveLength(6);
    expect(shaping.heldBack?.get("ga4")).toBeGreaterThan(0);
  });

  /** Silence must mean "nothing was cut", not "nobody looked". */
  it("says nothing when the result is the whole picture", async () => {
    wire([row("commit", 1, 2), row("drive", 2, 1)]);
    const shaping: RetrieveShaping = {};
    await retrieve("anything", 12, {}, shaping);
    expect(shaping.heldBack).toBeUndefined();
  });

  /**
   * A ROW THE BACKFILL REACHED WAS NOT CUT. The caps defer first and fill any unused
   * slots afterwards, so counting every deferred row would claim matches were dropped
   * that are sitting in the result the reader is looking at.
   */
  it("does not count rows the backfill put back", async () => {
    // Only ga4 has candidates, so every deferred row is backfilled into the result.
    wire(Array.from({ length: 5 }, (_, i) => row("ga4", i, 3 - i * 0.01)));
    const shaping: RetrieveShaping = {};
    const out = await retrieve("anything", 12, {}, shaping);
    expect(out).toHaveLength(5);
    expect(shaping.heldBack).toBeUndefined();
  });

  /** The out-parameter is optional, so every existing caller keeps working unchanged. */
  it("works without being asked for the shaping at all", async () => {
    wire([row("commit", 1, 2)]);
    expect(await retrieve("anything", 12)).toHaveLength(1);
  });
});

describe("paging a ranked list", () => {
  const many = Array.from({ length: 40 }, (_, i) => row("commit", i, 5 - i * 0.01));

  it("returns the next page, in score order", async () => {
    wire(many);
    const page1 = await retrieve("anything", 5);
    const page2 = await retrieve("anything", 5, { offset: 5 });
    expect(page1.map((r) => r.sourceId)).not.toEqual(page2.map((r) => r.sourceId));
    // Page 2 starts where page 1 ended, so scores keep descending across the boundary.
    expect(page2[0]!.score).toBeLessThanOrEqual(page1[page1.length - 1]!.score);
  });

  /**
   * SLICED AFTER SORTING, so page 2 is genuinely the next-most-relevant rather than
   * whatever the per-source cap happened to defer. The caps run over the whole window
   * being fetched, not over each page separately.
   */
  it("keeps the whole sequence in score order across pages", async () => {
    wire(many);
    const all = [
      ...(await retrieve("anything", 5)),
      ...(await retrieve("anything", 5, { offset: 5 })),
    ];
    const scores = all.map((r) => r.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  /** Paging past the ranked candidates is the end of the RANKING, not of the corpus —
   *  the tool says so rather than reporting an empty result. */
  it("returns nothing past the end rather than wrapping around", async () => {
    wire(many);
    expect(await retrieve("anything", 5, { offset: 500 })).toHaveLength(0);
  });

  it("is unchanged when no offset is given", async () => {
    wire(many);
    expect(await retrieve("anything", 5)).toHaveLength(5);
    expect(await retrieve("anything", 5, {})).toHaveLength(5);
  });
});

/**
 * PAGING MUST BE A CONTINUATION, NOT A RE-RANKING.
 *
 * Measured 2026-09-09 at limit 6: offsets 0/6/12 returned 18 slots holding only 12
 * distinct documents -- page 3 repeated 5 of page 2's 6 -- and 6 documents were
 * unreachable by paging at all. Two causes, both about the window: the per-source cap
 * was sized from `limit + offset`, so it grew with the page number and each page shaped
 * a different set; and the whole window was sorted BEFORE slicing, so a backfilled row
 * scoring above an earlier capped pick moved into page 1's positions as the window grew
 * and page 2 showed it again.
 */
/**
 * PAGING MUST BE A CONTINUATION, NOT A RE-RANKING.
 *
 * Measured 2026-09-09 at limit 6: offsets 0/6/12 returned 18 slots holding only 12
 * distinct documents -- page 3 repeated 5 of page 2's 6 -- and 6 documents were
 * unreachable by paging at all. Two causes, both about the window: the per-source cap
 * was sized from `limit + offset`, so it grew with the page number and each page shaped
 * a different set; and the whole window was sorted BEFORE slicing, so a backfilled row
 * scoring above an earlier capped pick moved into page 1's positions as the window grew
 * and page 2 showed it again.
 */
describe("retrieve — paging returns each document once", () => {
  it("never repeats a document across pages", async () => {
    // `bulk` owns the whole top of the ranking; four other sources sit below it. That is
    // what makes the cap reorder anything, and an evenly-spread fixture does not.
    const rows = [
      ...Array.from({ length: 12 }, (_, i) => row("bulk", i, 3 - i * 0.01)),
      ...["b", "c", "d", "e"].map((src, i) => row(src, i, 2)),
    ];
    const seen: string[] = [];
    for (const offset of [0, 4, 8]) {
      wire(rows);
      const page = await retrieve("anything", 4, { offset });
      expect(page).toHaveLength(4);
      seen.push(...page.map((r) => `${r.source}:${r.sourceId}`));
    }
    const repeated = seen.filter((id, i) => seen.indexOf(id) !== i);
    expect(repeated).toEqual([]);
  });

  it("orders each page by score, so citation [1] is the best thing on that page", async () => {
    wire(Array.from({ length: 20 }, (_, i) => row(`s${i % 5}`, i, 3 - i * 0.01)));
    const page = await retrieve("anything", 5, { offset: 5 });
    const scores = page.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});
