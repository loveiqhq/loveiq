import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/** Every request `upsertChunks` makes, and a fake table that answers the lookups. */
const calls: Array<{ path: string; method: string }> = [];
let stored: string[] = [];
let writeOk = true;
let lookupOk = true;
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ path, method });
    if (path.includes("/brain_person")) return new Response("[]", { status: 200 });
    if (method === "POST") return new Response("", { status: writeOk ? 201 : 500 });
    if (method === "GET") {
      if (!lookupOk) return new Response("", { status: 503 });
      const offset = Number(/offset=(\d+)/.exec(path)?.[1] ?? 0);
      const limit = Number(/limit=(\d+)/.exec(path)?.[1] ?? 1000);
      const page = stored.slice(offset, offset + limit).map((source_id) => ({ source_id }));
      return new Response(JSON.stringify(page), { status: 200 });
    }
    return new Response("", { status: 204 });
  }),
}));

import {
  leftoverParts,
  partBase,
  upsertChunks,
  type BrainRow,
} from "@features/brain/server/ingest/upsert";

const row = (source_id: string, source = "gmail"): BrainRow => ({
  source,
  source_id,
  title: "t",
  url: null,
  body: "b",
  meta: {},
  updated_at: "2026-09-24T00:00:00.000Z",
});

/** The ids the DELETE requests removed, read back out of their `in.(…)` lists. */
function deleted(): string[] {
  return calls
    .filter((c) => c.method === "DELETE")
    .flatMap((c) => {
      const list = decodeURIComponent(/source_id=in\.\((.*)\)$/.exec(c.path)![1]!);
      return [...list.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1]!.replace(/""/g, '"'));
    });
}

const X = "thread:19b6e580f090ce20";

describe("partBase", () => {
  it("strips a numeric part suffix and nothing else", () => {
    expect(partBase(`${X}#3`)).toBe(X);
    expect(partBase(X)).toBe(X);
    // WhatsApp uses `#` for the day and speaker, and `-2` for its own parts.
    expect(partBase("wa:group#wa-2026-09-23-4917-2")).toBe("wa:group#wa-2026-09-23-4917-2");
  });
});

describe("leftoverParts", () => {
  it("drops the tail of a document that re-chunked shorter", () => {
    const now = new Set([X, `${X}#2`, `${X}#3`]);
    expect(leftoverParts([X, `${X}#2`, `${X}#3`, `${X}#4`, `${X}#5`, `${X}#6`], now)).toEqual([
      `${X}#4`,
      `${X}#5`,
      `${X}#6`,
    ]);
  });

  /** Part 1 keeps the bare id (gmail, drive, notion), so growing leaves nothing behind. */
  it("keeps the bare id of a document that grew, because part 1 is written under it", () => {
    expect(leftoverParts([X], new Set([X, `${X}#2`]))).toEqual([]);
  });

  it("drops every numbered part of a document that shrank to a single part", () => {
    expect(leftoverParts([X, `${X}#2`, `${X}#3`], new Set([X]))).toEqual([`${X}#2`, `${X}#3`]);
  });

  /**
   * The lookup matches parts by prefix and LIKE treats `_` as a wildcard, so it can
   * return rows of OTHER documents. Only an exact base match may be deleted.
   */
  it("never touches another document, even one whose id starts the same way", () => {
    const storedIds = ["doc:ab", "doc:ab#2", "doc:abc", "doc:abc#2", "doc:a_b#2", "doc:aXb#2"];
    expect(leftoverParts(storedIds, new Set(["doc:ab", "doc:a_b"]))).toEqual([
      "doc:ab#2",
      "doc:a_b#2",
    ]);
  });

  it("leaves WhatsApp's own numbering alone", () => {
    const w = "wa:group#wa-2026-09-23-4917";
    expect(leftoverParts([w, `${w}-2`], new Set([w]))).toEqual([]);
  });

  it("ignores documents this write did not include", () => {
    expect(leftoverParts(["page:q", "page:q#2"], new Set([X]))).toEqual([]);
  });
});

describe("upsertChunks removes leftover parts", () => {
  beforeEach(() => {
    calls.length = 0;
    stored = [];
    writeOk = true;
    lookupOk = true;
  });

  it("deletes exactly the stale tail after a successful write, within the same source", async () => {
    stored = [X, `${X}#2`, `${X}#3`, `${X}#4`];
    await upsertChunks([row(X), row(`${X}#2`)]);
    expect(deleted()).toEqual([`${X}#3`, `${X}#4`]);
    const touching = calls.filter((c) => c.method !== "POST" && !c.path.includes("brain_person"));
    expect(touching.length).toBeGreaterThan(0);
    for (const c of touching) expect(c.path).toContain("source=eq.gmail");
  });

  it("deletes nothing when the write itself fails", async () => {
    writeOk = false;
    stored = [X, `${X}#2`, `${X}#3`];
    await expect(upsertChunks([row(X)])).rejects.toThrow(/upsert failed/);
    expect(calls.filter((c) => c.method === "DELETE")).toEqual([]);
  });

  it("deletes nothing, and still reports the write, when the lookup fails", async () => {
    lookupOk = false;
    stored = [X, `${X}#2`];
    expect(await upsertChunks([row(X)])).toBe(1);
    expect(deleted()).toEqual([]);
  });

  it("reads every page of stored ids before judging", async () => {
    // 1,000 unrelated rows fill the first page; the stale part is only on the second.
    stored = [X, ...Array.from({ length: 1000 }, (_, i) => `thread:other${i}`), `${X}#2`];
    await upsertChunks([row(X)]);
    expect(deleted()).toEqual([`${X}#2`]);
  });
});
