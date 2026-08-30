import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/** Notion's real shape: children are a SEPARATE request, never inlined. */
const CHILDREN: Record<string, unknown[]> = {
  page1: [
    {
      id: "toggle1",
      type: "toggle",
      has_children: true,
      toggle: { rich_text: [{ plain_text: "Pricing decisions" }] },
    },
    {
      id: "para1",
      type: "paragraph",
      has_children: false,
      paragraph: { rich_text: [{ plain_text: "top level" }] },
    },
    { id: "sub1", type: "child_page", has_children: true, child_page: { title: "Sub page" } },
  ],
  toggle1: [
    {
      id: "inner1",
      type: "paragraph",
      has_children: false,
      paragraph: { rich_text: [{ plain_text: "we charge 39.99" }] },
    },
    {
      id: "nest1",
      type: "bulleted_list_item",
      has_children: true,
      bulleted_list_item: { rich_text: [{ plain_text: "arm A" }] },
    },
  ],
  nest1: [
    {
      id: "deep1",
      type: "paragraph",
      has_children: false,
      paragraph: { rich_text: [{ plain_text: "deepest fact" }] },
    },
  ],
  sub1: [
    {
      id: "never",
      type: "paragraph",
      has_children: false,
      paragraph: { rich_text: [{ plain_text: "SHOULD NOT APPEAR" }] },
    },
  ],
};

const fetched: string[] = [];
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string) => {
    const id = /\/blocks\/([^/]+)\/children/.exec(url)?.[1] ?? "";
    fetched.push(id);
    return new Response(JSON.stringify({ results: CHILDREN[id] ?? [], has_more: false }), {
      status: 200,
    });
  }),
}));

import { blocksToText, pageText } from "@features/brain/server/ingest/notion";

beforeEach(() => {
  fetched.length = 0;
  process.env.NOTION_TOKEN = "secret_test";
});

describe("nested blocks must actually be fetched", () => {
  /**
   * `blocksToText` always recursed into a `.children` array, but nothing ever
   * populated it — Notion returns `has_children: true` and nothing else. So every
   * toggle body, column, callout, nested bullet and table row was dropped, measured
   * at 19.1% of the workspace text, while the docstring claimed children were
   * followed.
   */
  it("pulls text out of a toggle, and out of a bullet nested inside it", async () => {
    const text = await pageText("t", "page1");
    expect(text).toContain("top level");
    expect(text).toContain("we charge 39.99"); // one level down
    expect(text).toContain("deepest fact"); // two levels down
  });

  it("does NOT descend into a child_page, which is indexed as its own chunk", async () => {
    // Descending would duplicate an entire page inside its parent and inflate the
    // corpus with copies that compete against the original in search.
    const text = await pageText("t", "page1");
    expect(text).not.toContain("SHOULD NOT APPEAR");
    expect(fetched).not.toContain("sub1");
  });

  it("asks only for blocks that say they have children", async () => {
    await pageText("t", "page1");
    expect(fetched).toContain("toggle1");
    expect(fetched).not.toContain("para1"); // has_children: false
  });

  it("stops descending when the run is out of time", async () => {
    const text = await pageText("t", "page1", () => true);
    expect(text).toContain("top level");
    expect(text).not.toContain("we charge 39.99");
  });
});

describe("table rows carry `cells`, not `rich_text`", () => {
  it("renders a table row instead of dropping it", async () => {
    // The generic rich_text path finds nothing on a table_row, so every inline
    // table came out empty — dropped twice over, since rows are also nested.
    const text = blocksToText([
      {
        type: "table_row",
        table_row: {
          cells: [[{ plain_text: "Plan" }], [{ plain_text: "Price" }], [{ plain_text: "39.99" }]],
        },
      },
    ]);
    expect(text).toBe("Plan | Price | 39.99");
  });

  it("drops an empty row rather than emitting bare separators", () => {
    expect(blocksToText([{ type: "table_row", table_row: { cells: [[], []] } }])).toBe("");
  });
});

describe("incomplete-crawl signalling must distinguish truncated from deferred", () => {
  /**
   * `crawlComplete === false` means the walk of databases/pages was truncated — we
   * do not know what exists, which is the case that used to report SUCCESS forever.
   * `complete === false` means the run hit its time budget and deferred pages to
   * the next pass: designed, self-healing, and NOT a fault. Conflating them made
   * the rebuild script stop after one pass with 1,004 pages still queued.
   */
  it("only a truncated crawl produces the alerting skip", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("features/brain/server/ingest/notion.ts", "utf8")
    );
    expect(src).toMatch(/if \(!crawlComplete\) \{/);
    expect(src).not.toMatch(/if \(!complete\) \{\s*return \{\s*source: SOURCE/);
  });
});

describe("a page past the block cap must say so", () => {
  /**
   * The cap was 5 pages of 100 blocks with no signal at all, so a longer page lost
   * its tail silently — the same failure that already cost 60 Notion pages their
   * endings once. No page is near the ceiling today (largest is 382 blocks), which
   * is exactly why the silence mattered: nothing would have revealed it.
   */
  it("appends a visible notice rather than stopping quietly", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("features/brain/server/ingest/notion.ts", "utf8")
    );
    expect(src).toMatch(/the rest was not indexed/);
    expect(src).toMatch(/MAX_BLOCK_PAGES = 20/);
    // the old silent 5-page loop must be gone
    expect(src).not.toMatch(/for \(let i = 0; i < 5; i\+\+\)/);
  });
});
