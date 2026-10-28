import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/**
 * A fake `brain_chunk` holding one source. Writes land in it and reads page through it, so
 * a second run compares against exactly what the first one stored.
 */
type Stored = Record<string, unknown> & { source_id: string; meta: Record<string, unknown> };
const table = new Map<string, Stored>();
const calls: Array<{ path: string; method: string; body?: string }> = [];
let storedRead: "ok" | "503" | "unreadable" = "ok";

const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
/** jsonb does not keep key order (shorter keys first), so neither does the fake. */
const jsonbOrder = (meta: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(meta).sort(([a], [b]) => a.length - b.length || (a < b ? -1 : 1))
  );
/** The ids a request names in its `source_id=in.(…)` list. */
const idsIn = (path: string) =>
  [
    ...decodeURIComponent(/source_id=in\.\((.*)\)$/.exec(path)?.[1] ?? "").matchAll(
      /"((?:[^"]|"")*)"/g
    ),
  ].map((m) => m[1]!.replace(/""/g, '"'));

vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ path, method, body: init?.body as string | undefined });
    if (path.includes("/brain_person")) {
      return json([{ canonical: "Mark Oldenburg", aliases: ["Mark"], kind: "person" }]);
    }
    if (method === "POST") {
      for (const r of JSON.parse(String(init?.body)) as Stored[]) {
        table.set(r.source_id, { ...r, meta: jsonbOrder(r.meta) });
      }
      return new Response("", { status: 201 });
    }
    if (method === "DELETE") {
      return json(idsIn(path).filter((id) => table.delete(id)));
    }
    if (path.includes("select=source_id,title,url,body,meta,period_end")) {
      if (storedRead === "503") return new Response("", { status: 503 });
      if (storedRead === "unreadable") return new Response("[{", { status: 200 });
    }
    let rows = [...table.values()].sort((a, b) => (a.source_id < b.source_id ? -1 : 1));
    if (path.includes("source_id=like.")) rows = rows.filter((r) => r.source_id.includes("#"));
    const offset = Number(/offset=(\d+)/.exec(path)?.[1] ?? 0);
    const limit = Number(/limit=(\d+)/.exec(path)?.[1] ?? 1000);
    return json(rows.slice(offset, offset + limit));
  }),
}));

import { syncSource, type BrainRow } from "@features/brain/server/ingest/upsert";

/**
 * A report-like build: one single-part document, one in two parts. `faq:a` is NOT stored as
 * built: its link token is redacted, `meta.people` is derived from `author`, and the
 * `undefined` key is dropped. A comparison against the raw build would rewrite it every run.
 */
function build(change: { id?: string; to?: Partial<BrainRow> } = {}): BrainRow[] {
  const row = (source_id: string, body: string, meta: Record<string, unknown>): BrainRow => ({
    source: "report",
    source_id,
    title: `title of ${source_id}`,
    url: null,
    body,
    meta,
    updated_at: "2026-10-27T12:00:00.000Z",
    ...(change.id === source_id ? change.to : {}),
  });
  return [
    row("faq:a", "Answered at https://x.test/r?token=abc123 for good.", {
      kind: "shipped",
      author: "Mark",
      unset: undefined,
    }),
    row("chapter:b", "Part one.", { kind: "shipped", part: 1 }),
    row("chapter:b#2", "Part two.", { kind: "shipped", part: 2 }),
  ];
}

const written = () =>
  calls
    .filter((c) => c.method === "POST")
    .flatMap((c) => (JSON.parse(c.body!) as BrainRow[]).map((r) => r.source_id))
    .sort();
const deleted = () =>
  calls
    .filter((c) => c.method === "DELETE")
    .flatMap((c) => idsIn(c.path))
    .sort();

/** Store the build once, then forget that run's requests. */
async function seeded(): Promise<void> {
  await syncSource("report", build());
  expect(table.size).toBe(3);
  calls.length = 0;
}

describe("syncSource: a source rebuilt whole every run", () => {
  beforeEach(() => {
    table.clear();
    calls.length = 0;
    storedRead = "ok";
  });

  it("writes nothing and deletes nothing when every row is stored as built", async () => {
    await seeded();
    // Stored as the write normalised it, not as built.
    expect(table.get("faq:a")).toMatchObject({
      body: expect.stringContaining("token=[redacted]"),
      meta: { people: ["Mark Oldenburg"] },
    });
    expect(await syncSource("report", build())).toEqual({ rows: 3, swept: 0 });
    expect(written()).toEqual([]);
    expect(deleted()).toEqual([]);
  });

  it.each<[string, string, Partial<BrainRow>, string[]]>([
    ["a part's body", "chapter:b#2", { body: "Part two, edited." }, ["chapter:b", "chapter:b#2"]],
    ["the title", "faq:a", { title: "A new title" }, ["faq:a"]],
    ["the link", "faq:a", { url: "https://x.test/moved" }, ["faq:a"]],
    ["the metadata", "faq:a", { meta: { kind: "shipped", author: "Mark", n: 2 } }, ["faq:a"]],
    ["the period", "faq:a", { period_end: "2026-10-27" }, ["faq:a"]],
  ])(
    "rewrites a document whose %s changed, every part of it and nothing else",
    async (_, id, to, ids) => {
      await seeded();
      expect(await syncSource("report", build({ id, to }))).toEqual({ rows: 3, swept: 0 });
      expect(written()).toEqual(ids);
      expect(deleted()).toEqual([]);
    }
  );

  it("deletes a document the build no longer holds", async () => {
    await seeded();
    const without = build().filter((r) => r.source_id !== "faq:a");
    expect(await syncSource("report", without)).toEqual({ rows: 2, swept: 1 });
    expect(deleted()).toEqual(["faq:a"]);
    expect(written()).toEqual([]);
  });

  it("removes the part a document no longer has, at once", async () => {
    await seeded();
    await syncSource(
      "report",
      build().filter((r) => r.source_id !== "chapter:b#2")
    );
    expect(written()).toEqual(["chapter:b"]);
    expect(deleted()).toEqual(["chapter:b#2"]);
  });

  it.each(["503", "unreadable"] as const)(
    "writes every row and deletes nothing when the stored rows cannot be read (%s)",
    async (failure) => {
      await seeded();
      // A row the build no longer holds: a sweep would delete it.
      table.set("faq:old", { source_id: "faq:old", meta: {} });
      storedRead = failure;
      expect(await syncSource("report", build())).toEqual({ rows: 3, swept: 0 });
      expect(written()).toEqual(["chapter:b", "chapter:b#2", "faq:a"]);
      expect(deleted()).toEqual([]);
      expect(table.has("faq:old")).toBe(true);
    }
  );

  it("sweeps nothing after a partial run, or a run that indexed nothing", async () => {
    await seeded();
    const partial = build().filter((r) => r.source_id !== "faq:a");
    expect(await syncSource("report", partial, { sweep: false })).toEqual({ rows: 2, swept: 0 });
    // Every row refused for a credential: stored as markers, which count as nothing indexed.
    const refused = partial.map((r) => ({ ...r, body: `${r.body} ghp_${"x".repeat(20)}` }));
    expect(await syncSource("report", refused)).toEqual({ rows: 0, swept: 0 });
    expect(await syncSource("report", [])).toEqual({ rows: 0, swept: 0 });
    expect(deleted()).toEqual([]);
    expect(table.has("faq:a")).toBe(true);
  });
});
