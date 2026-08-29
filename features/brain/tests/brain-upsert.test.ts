import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const posted: string[] = [];
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async (_path: string, init?: RequestInit) => {
    posted.push(String(init?.body));
    return new Response("", { status: 201 });
  }),
}));

import { upsertChunks, type BrainRow } from "@features/brain/server/ingest/upsert";

function row(over: Partial<BrainRow> = {}): BrainRow {
  return {
    source: "test",
    source_id: `id-${Math.random()}`,
    title: "t",
    url: null,
    body: "b",
    meta: {},
    updated_at: "2026-08-27T00:00:00.000Z",
    ...over,
  };
}

describe("upsertChunks payload shape", () => {
  beforeEach(() => {
    posted.length = 0;
  });

  /**
   * PostgREST answers 400 PGRST102 "All object keys must match" and fails the
   * WHOLE batch when the objects in a bulk insert do not carry identical keys.
   * `period_end` is optional and JSON.stringify drops `undefined`, so one row
   * without it used to break every other row in the batch — the nightly cron
   * died on exactly this.
   */
  it("sends identical keys for every row even when period_end is omitted", async () => {
    await upsertChunks([
      row({ period_end: "2026-08-27" }),
      row(), // omitted entirely
      row({ period_end: null }), // explicit null
    ]);

    const objects = JSON.parse(posted[0]) as Record<string, unknown>[];
    expect(objects).toHaveLength(3);
    const keySets = new Set(objects.map((o) => Object.keys(o).sort().join(",")));
    expect(keySets.size).toBe(1);
    expect(objects.every((o) => "period_end" in o)).toBe(true);
    expect(objects[1].period_end).toBeNull();
  });

  it("keeps a supplied period_end untouched", async () => {
    await upsertChunks([row({ period_end: "2026-08-25" })]);
    expect((JSON.parse(posted[0]) as Record<string, unknown>[])[0].period_end).toBe("2026-08-25");
  });
});

describe("a failed touch must never let the sweep run", () => {
  /**
   * The most dangerous line the audit found. `touchChunks` used to `continue` past
   * a non-2xx PATCH, which left that batch's rows with a stale `updated_at` AND
   * excluded them from `touched` — so `sweepStale`, later in the SAME run, deleted
   * them as orphans. The majority guard only refuses losses above ~50%, so one
   * transient PostgREST 5xx could silently delete up to half a source.
   *
   * The circuit breaker is no help: it counts THROWN errors, and `fetchWithTimeout`
   * resolves normally with a 503 Response, so a run of 5xx looks like successes.
   */
  it("throws instead of silently leaving rows to be swept", async () => {
    const { supabaseFetch } = await import("@features/admin/server/supabase");
    vi.mocked(supabaseFetch).mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers(),
      json: async () => ({}),
      text: async () => "",
    } as unknown as Response);

    const { touchChunks } = await import("@features/brain/server/ingest/upsert");
    await expect(touchChunks("gsc", ["a", "b"], "2026-08-29T00:00:00Z")).rejects.toThrow(
      /aborting before the sweep/
    );
  });

  it("still returns a count when every batch succeeds", async () => {
    const { supabaseFetch } = await import("@features/admin/server/supabase");
    vi.mocked(supabaseFetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-range": "*/2" }),
      json: async () => [],
      text: async () => "",
    } as unknown as Response);

    const { touchChunks } = await import("@features/brain/server/ingest/upsert");
    await expect(touchChunks("gsc", ["a", "b"], "2026-08-29T00:00:00Z")).resolves.toBe(2);
  });
});

describe("every known-chunk read must fail closed", () => {
  /**
   * All three ingesters answered an unreadable corpus list with an empty Map, which
   * reads as "nothing is indexed": existing rows are then neither written nor
   * confirmed, and the sweep in the SAME run deletes them. For notion that meant
   * every continuation part (`#2`, `#3`, …) of every page it did not refetch,
   * silently, with the run reporting success and never rebuilding them.
   */
  it.each(["notion", "drive", "slack"])(
    "%s aborts instead of treating the corpus as empty",
    async (src) => {
      const fs = await import("node:fs");
      const code = fs.readFileSync(`features/brain/server/ingest/${src}.ts`, "utf8");
      expect(code).toMatch(/aborting before the sweep rather than treating the corpus as empty/);
      // and the old fail-open must be gone
      expect(code).not.toMatch(/if \(!res\.ok\) return new Map\(\);/);
    }
  );
});
