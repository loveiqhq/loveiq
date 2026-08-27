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
