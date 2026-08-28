import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/** Every Supabase call the ingester makes, so a test can assert on the PATCHes. */
const dbCalls: Array<{ path: string; method: string; body: string }> = [];
let existingChunks: Array<{ source_id: string; meta: { edited: string; v?: number } }> = [];

vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    dbCalls.push({ path, method, body: String(init?.body ?? "") });

    // knownNotionEdits()
    if (method === "GET" && path.includes("select=source_id,meta")) {
      const offset = Number(/offset=(\d+)/.exec(path)?.[1] ?? 0);
      return new Response(JSON.stringify(offset === 0 ? existingChunks : []), { status: 200 });
    }
    // touchChunks()
    if (method === "PATCH") {
      const n = (path.match(/%22/g)?.length ?? 0) / 2; // quoted ids
      return new Response("", { status: 200, headers: { "content-range": `*/${n}` } });
    }
    // countChunks() inside sweepStale, then the DELETE
    if (method === "GET") {
      return new Response("[]", { status: 200, headers: { "content-range": "0-0/0" } });
    }
    return new Response("", { status: 201 });
  }),
}));

/** Notion HTTP, driven per endpoint. */
const notionCalls: string[] = [];
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string, init?: RequestInit) => {
    notionCalls.push(url);
    const body = JSON.parse(String(init?.body ?? "{}")) as { filter?: { value?: string } };

    if (url.endsWith("/search") && body.filter?.value === "database") {
      return json({
        results: [
          { id: "db-board", object: "database", title: [{ plain_text: "Board" }] },
          { id: "db-lit", object: "database", title: [{ plain_text: "Literature" }] },
        ],
      });
    }
    if (url.endsWith("/search") && body.filter?.value === "page") {
      return json({ results: [PAGE_STANDALONE] });
    }
    if (url.includes("/databases/db-board/query")) return json({ results: [ROW_BOARD] });
    if (url.includes("/databases/db-lit/query")) return json({ results: [ROW_LIT] });
    if (url.includes("/blocks/")) {
      return json({
        results: [{ type: "paragraph", paragraph: { rich_text: [{ plain_text: "page body text" }] } }],
      });
    }
    return json({ results: [] });
  }),
}));

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const ROW_BOARD = {
  id: "row-board-1",
  url: "https://notion.so/row-board-1",
  last_edited_time: "2026-08-28T09:00:00.000Z",
  parent: { type: "database_id", database_id: "db-board" },
  properties: {
    Name: { type: "title", title: [{ plain_text: "Ship the paywall" }] },
    Status: { type: "select", select: { name: "WIP" } },
  },
};

const ROW_LIT = {
  id: "row-lit-1",
  url: "https://notion.so/row-lit-1",
  last_edited_time: "2026-08-20T09:00:00.000Z",
  parent: { type: "database_id", database_id: "db-lit" },
  properties: {
    Name: { type: "title", title: [{ plain_text: "Attachment theory review" }] },
    Authors: { type: "rich_text", rich_text: [{ plain_text: "Bowlby" }] },
    Year: { type: "number", number: 1969 },
  },
};

const PAGE_STANDALONE = {
  id: "page-1",
  url: "https://notion.so/page-1",
  last_edited_time: "2026-08-27T09:00:00.000Z",
  parent: { type: "workspace" },
  properties: { title: { type: "title", title: [{ plain_text: "Positioning" }] } },
};

import { ingestNotion, taskToRow } from "@features/brain/server/ingest/notion";

const STAMP = "2026-08-28T12:00:00.000Z";

/** Read from a real built row, so bumping BUILDER_VERSION cannot quietly turn the
 *  "unchanged" tests into tests of a stale version. */
const CURRENT_V = (taskToRow(ROW_LIT, STAMP, "Literature", "")!.meta as { v: number }).v;

function written(): Array<{ source_id: string; title: string; body: string }> {
  return dbCalls
    .filter((c) => c.method === "POST" && c.path.includes("on_conflict"))
    .flatMap((c) => JSON.parse(c.body) as Array<{ source_id: string; title: string; body: string }>);
}

describe("ingestNotion crawls every database", () => {
  beforeEach(() => {
    dbCalls.length = 0;
    notionCalls.length = 0;
    existingChunks = [];
    process.env.NOTION_TOKEN = "ntn_test";
    delete process.env.NOTION_EXCLUDE_TITLES;
  });

  it("indexes a row from a NON-board database, which the old single-database version dropped", async () => {
    // The regression: NOTION_BOARD_DATABASE_ID named one database, and the page
    // loop skipped anything whose parent was a database — so rows of every other
    // database fell through both loops. Measured: 859 of 1,027 rows invisible.
    await ingestNotion(STAMP);
    const ids = written().map((r) => r.source_id);
    expect(ids).toContain("task:row-lit-1");
    expect(ids).toContain("task:row-board-1");
    expect(ids).toContain("page:page-1");
  });

  it("carries properties the board never had, so a Literature row is more than a title", async () => {
    await ingestNotion(STAMP);
    const lit = written().find((r) => r.source_id === "task:row-lit-1");
    expect(lit?.body).toContain("Authors: Bowlby");
    expect(lit?.body).toContain("Year: 1969");
    // and the page's own block content, not only its properties
    expect(lit?.body).toContain("page body text");
  });

  it("drops a property whose NAME is blank, which Notion allows", async () => {
    // Rendered as ": 38" in the real Research Papers rows. A number with nothing
    // saying what it measures reads as meaningful to a model, so it is worse
    // than omitting it.
    const row = taskToRow(
      { ...ROW_LIT, properties: { ...ROW_LIT.properties, "  ": { type: "number", number: 38 } } },
      STAMP,
      "Literature",
      ""
    );
    expect(row?.body).not.toContain(": 38");
    expect(row?.body).toContain("Year: 1969");
  });

  it("names the database in the title, so a citation says where it came from", async () => {
    await ingestNotion(STAMP);
    expect(written().find((r) => r.source_id === "task:row-lit-1")?.title).toBe(
      "Literature: Attachment theory review"
    );
  });

  it("does not need NOTION_BOARD_DATABASE_ID at all", async () => {
    delete process.env.NOTION_BOARD_DATABASE_ID;
    const res = await ingestNotion(STAMP);
    expect(res.rows).toBeGreaterThan(0);
  });
});

describe("incremental: unchanged pages are touched, not re-downloaded", () => {
  beforeEach(() => {
    dbCalls.length = 0;
    notionCalls.length = 0;
    process.env.NOTION_TOKEN = "ntn_test";
  });

  it("skips the content fetch when last_edited_time is unchanged", async () => {
    // 1,070 pages x one content request is minutes of HTTP; the cron has 45s.
    existingChunks = [
      { source_id: "task:row-lit-1", meta: { edited: "2026-08-20T09:00:00.000Z", v: CURRENT_V } },
    ];
    await ingestNotion(STAMP);

    expect(notionCalls.filter((u) => u.includes("/blocks/row-lit-1"))).toHaveLength(0);
    const patched = dbCalls.filter((c) => c.method === "PATCH");
    expect(patched).toHaveLength(1);
    expect(patched[0].path).toContain("row-lit-1");
    expect(JSON.parse(patched[0].body)).toEqual({ updated_at: STAMP });
  });

  it("re-downloads when the page was edited again, even on the same day", async () => {
    // Compared on the full timestamp, not the date — a page edited twice in one
    // day must not be frozen at the morning's version.
    existingChunks = [
      { source_id: "task:row-lit-1", meta: { edited: "2026-08-20T08:00:00.000Z" } },
    ];
    await ingestNotion(STAMP);
    expect(notionCalls.filter((u) => u.includes("/blocks/row-lit-1")).length).toBeGreaterThan(0);
  });

  it("rebuilds a row whose BUILDER version is stale, even though the page never changed", async () => {
    // Without this, any change to how a row is built never reaches rows already
    // in the corpus: the page did not change, so it is touched and the old shape
    // survives forever. v2 shipped every database title as "Untitled database".
    existingChunks = [{ source_id: "task:row-lit-1", meta: { edited: "2026-08-20T09:00:00.000Z", v: 1 } as never }];
    await ingestNotion(STAMP);
    expect(notionCalls.filter((u) => u.includes("/blocks/row-lit-1")).length).toBeGreaterThan(0);
    expect(written().map((r) => r.source_id)).toContain("task:row-lit-1");
  });

  it("treats a row with no version as stale, so pre-versioning rows self-correct", async () => {
    existingChunks = [{ source_id: "task:row-lit-1", meta: { edited: "2026-08-20T09:00:00.000Z" } }];
    await ingestNotion(STAMP);
    expect(notionCalls.filter((u) => u.includes("/blocks/row-lit-1")).length).toBeGreaterThan(0);
  });

  it("counts touched rows toward the sweep, so a mostly-unchanged run is not treated as empty", async () => {
    existingChunks = [
      { source_id: "task:row-lit-1", meta: { edited: "2026-08-20T09:00:00.000Z", v: CURRENT_V } },
      { source_id: "task:row-board-1", meta: { edited: "2026-08-28T09:00:00.000Z", v: CURRENT_V } },
      { source_id: "page:page-1", meta: { edited: "2026-08-27T09:00:00.000Z", v: CURRENT_V } },
    ];
    const res = await ingestNotion(STAMP);
    // Nothing rewritten, three confirmed — must not report zero rows, or the
    // sweep refuses and the ops alert fires on a perfectly healthy run.
    expect(res.rows).toBe(3);
  });
});

describe("a run cut short must confirm what it could not refresh", () => {
  beforeEach(() => {
    dbCalls.length = 0;
    notionCalls.length = 0;
    existingChunks = [];
    process.env.NOTION_TOKEN = "ntn_test";
  });

  /** Out of time only AFTER the first page-content fetch, so the crawl completes
   *  and the fetch loop is the thing that gets cut short. */
  const outOfTimeAfterFirstFetch = () =>
    notionCalls.filter((u) => u.includes("/blocks/")).length >= 1;

  /** Every source_id named in a PATCH, decoded out of the in.() list. */
  function touchedIds(): string[] {
    return dbCalls
      .filter((c) => c.method === "PATCH")
      .flatMap((c) => (decodeURIComponent(c.path).match(/"([^"]+)"/g) ?? []).map((q) => q.slice(1, -1)));
  }

  it("touches the pages the clock did not reach, instead of abandoning them", async () => {
    // MEASURED: a page's content costs ~1.9s, so 45s buys ~24 pages. A run that
    // walked the list in order spent its whole budget on the first 30 and touched
    // NOTHING, so it could not sweep — and after a BUILDER_VERSION bump, when
    // every page needs rebuilding, that meant ~36 nights with no sweep at all.
    await ingestNotion(STAMP, outOfTimeAfterFirstFetch);

    const fetched = notionCalls.filter((u) => u.includes("/blocks/")).length;
    expect(fetched).toBe(1);
    // Three candidates, one fetched, so the other two must be CONFIRMED.
    expect(touchedIds().length).toBe(2);
  });

  it("sweeps anyway, because every page is either rewritten or confirmed", async () => {
    // Refusing to sweep on a cut-short run would let pages deleted in Notion
    // linger in the corpus indefinitely.
    await ingestNotion(STAMP, outOfTimeAfterFirstFetch);
    const sweepProbe = dbCalls.filter(
      (c) => c.method === "GET" && c.path.includes("updated_at=lt.")
    );
    expect(sweepProbe.length).toBeGreaterThan(0);
  });

  it("does NOT sweep when a database could not be queried", async () => {
    // Then its rows are missing from the candidate list entirely, and a sweep
    // would read that absence as deletion.
    const realFetch = vi.mocked(
      (await import("@shared/http/fetch-with-timeout")).fetchWithTimeout
    );
    const original = realFetch.getMockImplementation()!;
    realFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/databases/db-lit/query")) {
        return new Response("boom", { status: 500 }) as never;
      }
      return original(url, init) as never;
    });

    await ingestNotion(STAMP, () => false);

    const sweepProbe = dbCalls.filter(
      (c) => c.method === "GET" && c.path.includes("updated_at=lt.")
    );
    expect(sweepProbe.length).toBe(0);
    realFetch.mockImplementation(original);
  });
});
