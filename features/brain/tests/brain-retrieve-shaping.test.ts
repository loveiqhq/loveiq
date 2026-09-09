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
