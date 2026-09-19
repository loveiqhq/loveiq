import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const mockFetch = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...a: unknown[]) => mockFetch(...(a as [])),
}));

import {
  buildProperties,
  clearNotionCache,
  createNotionPage,
  NotionTargetError,
  resolveDatabase,
  toBlocks,
} from "@features/brain/server/act/notion";

const prop = (type: string, options?: string[]) => ({
  type,
  ...(options ? { [type]: { options: options.map((name) => ({ name })) } } : {}),
});

/**
 * The two boards are REAL and this is what makes them dangerous: "Board" and "Board "
 * differ by a trailing space, are indistinguishable to a person, and both hold 100+ rows.
 */
const DATABASES = [
  {
    id: "398e0cbe-f1a3-8060-bba4-e2e14e170454",
    title: [{ plain_text: "Board" }],
    properties: {
      Name: prop("title"),
      Status: prop("select", ["Done", "WIP", "Backlog"]),
      Priority: prop("select", ["Low", "High"]),
      "Due Date": prop("date"),
      Assign: prop("people"),
      "Date Created": prop("created_time"),
      Tags: prop("multi_select", ["a", "b"]),
      Done: prop("checkbox"),
      Score: prop("number"),
      Link: prop("url"),
      Notes: prop("rich_text"),
    },
  },
  {
    id: "296e0cbe-f1a3-80e4-844d-c0ee3f313974",
    title: [{ plain_text: "Board " }],
    properties: { Name: prop("title") },
  },
  {
    id: "303e0cbe-f1a3-808b-8d23-d167366039d9",
    title: [{ plain_text: "Growth Board" }],
    properties: { Name: prop("title") },
  },
];

function wire(over?: { create?: Record<string, unknown>; createFails?: string }) {
  mockFetch.mockImplementation(async (url: string, init?: { method?: string }) => {
    const u = String(url);
    if (u.endsWith("/search")) {
      return { ok: true, json: async () => ({ results: DATABASES, has_more: false }) };
    }
    if (u.endsWith("/pages") && init?.method === "POST") {
      if (over?.createFails) {
        return { ok: false, json: async () => ({ message: over.createFails }) };
      }
      return {
        ok: true,
        json: async () => over?.create ?? { id: "new-page-id", url: "https://notion.so/new" },
      };
    }
    return { ok: false, json: async () => ({ message: "unexpected" }) };
  });
}

beforeEach(() => {
  clearNotionCache();
  mockFetch.mockReset();
  process.env.NOTION_TOKEN = "secret_test";
  wire();
});

describe("finding the right database", () => {
  it("resolves an unambiguous name, whatever the casing", async () => {
    expect((await resolveDatabase("growth board")).id).toBe("303e0cbe-f1a3-808b-8d23-d167366039d9");
  });

  it("resolves an id with or without dashes", async () => {
    expect((await resolveDatabase("398e0cbe-f1a3-8060-bba4-e2e14e170454")).title).toBe("Board");
    expect((await resolveDatabase("398e0cbef1a38060bba4e2e14e170454")).title).toBe("Board");
  });

  /**
   * THE GUARD THAT WAS DEAD CODE UNTIL IT WAS MEASURED.
   *
   * The input was trimmed and the stored title was not, so "Board" never matched
   * "Board " and the second database was unreachable by name entirely — while the
   * ambiguity check below could not fire on any real data. Both boards have 100+ rows,
   * so choosing one silently puts a task where a different set of people are looking.
   */
  it("refuses two databases whose names differ only by a trailing space", async () => {
    for (const given of ["Board", "board ", "  BOARD  "]) {
      const err = await resolveDatabase(given).catch((e: Error) => e);
      expect(err, given).toBeInstanceOf(NotionTargetError);
      expect((err as Error).message, given).toMatch(/More than one database/);
      // Both ids, and the exact titles, so the difference is visible.
      expect((err as Error).message).toContain("398e0cbe-f1a3-8060-bba4-e2e14e170454");
      expect((err as Error).message).toContain("296e0cbe-f1a3-80e4-844d-c0ee3f313974");
      expect((err as Error).message).toContain('"Board "');
    }
  });

  it("lists every database, quoted, when the name matches none", async () => {
    const err = await resolveDatabase("Nope").catch((e: Error) => e);
    // Quoted, or the two boards read as a duplicated line rather than two databases.
    expect((err as Error).message).toContain('"Board "');
    expect((err as Error).message).toContain('"Growth Board"');
  });

  it("reads the database list once, not once per call", async () => {
    await resolveDatabase("Growth Board");
    const first = mockFetch.mock.calls.length;
    await resolveDatabase("Growth Board");
    expect(mockFetch.mock.calls.length).toBe(first);
  });
});

describe("mapping plain values onto a live schema", () => {
  const board = async () => resolveDatabase("398e0cbef1a38060bba4e2e14e170454");

  it("sets the title on whatever property is the title, not on a name it assumed", async () => {
    expect(buildProperties(await board(), "Fix the paywall", {})).toEqual({
      Name: { title: [{ text: { content: "Fix the paywall" } }] },
    });
  });

  it.each([
    ["select", { Status: "Backlog" }, { Status: { select: { name: "Backlog" } } }],
    ["date", { "Due Date": "2026-09-20" }, { "Due Date": { date: { start: "2026-09-20" } } }],
    ["checkbox", { Done: true }, { Done: { checkbox: true } }],
    ["number", { Score: 7 }, { Score: { number: 7 } }],
    ["url", { Link: "https://x.dev" }, { Link: { url: "https://x.dev" } }],
    [
      "multi_select",
      { Tags: ["a", "b"] },
      { Tags: { multi_select: [{ name: "a" }, { name: "b" }] } },
    ],
  ])("maps a %s", async (_t, given, expected) => {
    expect(buildProperties(await board(), "T", given)).toMatchObject(expected);
  });

  /**
   * NOTION SILENTLY CREATES AN UNKNOWN `select` OPTION rather than rejecting it, so one
   * typo permanently adds "Backlogg" to a board's vocabulary and it reads as a real
   * status forever. Refusing WITH the accepted values is the only behaviour that is
   * right for both `select` (which would invent) and `status` (which would 400).
   */
  it("refuses a select value the board does not have, and says which it has", async () => {
    const err = await Promise.resolve()
      .then(async () => buildProperties(await board(), "T", { Status: "Backlogg" }))
      .catch((e: Error) => e);
    expect(err).toBeInstanceOf(NotionTargetError);
    expect((err as Error).message).toContain("Done | WIP | Backlog");
  });

  it("refuses an unknown property, and lists the real ones", async () => {
    const b = await board();
    expect(() => buildProperties(b, "T", { Statuss: "WIP" })).toThrow(
      /no property called "Statuss"/
    );
    expect(() => buildProperties(b, "T", { Statuss: "WIP" })).toThrow(/Status/);
  });

  /**
   * ASSERTED ON THE REASON, NOT ON THE TYPE NAME. Matching /created_time/ passed whether
   * the field was recognised as read-only or fell through to the catch-all — both
   * messages name the type — so the test held while the guard it was written for was
   * removed. Only the sentence unique to the read-only branch proves which fired.
   */
  it("refuses a field Notion fills in itself, as a read-only field", async () => {
    const b = await board();
    expect(() => buildProperties(b, "T", { "Date Created": "2026-09-09" })).toThrow(
      /Notion fills it in itself/
    );
  });

  /** A wrong person id assigns work to the wrong colleague, and looks entirely correct. */
  it("refuses a people field rather than guessing an id", async () => {
    const b = await board();
    expect(() => buildProperties(b, "T", { Assign: "Eman" })).toThrow(/internal ids/);
  });

  it("refuses a date that is not one", async () => {
    const b = await board();
    expect(() => buildProperties(b, "T", { "Due Date": "next friday" })).toThrow(/2026-09-09/);
  });

  it("does not overwrite the title from a properties entry", async () => {
    const b = await board();
    expect(buildProperties(b, "real title", { Name: "sneaky" }).Name).toEqual({
      title: [{ text: { content: "real title" } }],
    });
  });
});

describe("turning text into blocks", () => {
  it("splits paragraphs on blank lines", () => {
    expect(toBlocks("one\n\ntwo").blocks).toHaveLength(2);
  });

  it("splits a paragraph longer than Notion's per-block limit", () => {
    expect(toBlocks("x".repeat(4500)).blocks).toHaveLength(3);
  });

  /**
   * REPORTED, NEVER SWALLOWED. Notion takes 100 blocks per create; sending the first 100
   * and saying nothing writes a page that looks complete and is not.
   */
  it("says how many paragraphs did not fit", () => {
    const r = toBlocks(Array.from({ length: 120 }, (_, i) => `p${i}`).join("\n\n"));
    expect(r.blocks).toHaveLength(100);
    expect(r.dropped).toBe(20);
  });

  it("drops nothing when everything fits", () => {
    expect(toBlocks("one\n\ntwo").dropped).toBe(0);
  });
});

describe("creating the page", () => {
  it("creates a database row with mapped properties and body blocks", async () => {
    const page = await createNotionPage({
      parent: "398e0cbef1a38060bba4e2e14e170454",
      title: "Fix the paywall",
      content: "first\n\nsecond",
      properties: { Status: "Backlog" },
    });
    expect(page.id).toBe("new-page-id");
    expect(page.parentLabel).toContain("Board");
    const [, init] = mockFetch.mock.calls.find(([u]) => String(u).endsWith("/pages"))!;
    const body = JSON.parse(String((init as { body: string }).body));
    expect(body.parent).toEqual({ database_id: "398e0cbe-f1a3-8060-bba4-e2e14e170454" });
    expect(body.properties.Status).toEqual({ select: { name: "Backlog" } });
    expect(body.children).toHaveLength(2);
  });

  it("nests under a page when the id is not a database", async () => {
    const page = await createNotionPage({
      parent: "11111111-2222-3333-4444-555555555555",
      title: "A write-up",
    });
    expect(page.parentLabel).toBe("page");
    const [, init] = mockFetch.mock.calls.find(([u]) => String(u).endsWith("/pages"))!;
    expect(JSON.parse(String((init as { body: string }).body)).parent).toEqual({
      page_id: "11111111-2222-3333-4444-555555555555",
    });
  });

  /** A page has a title and nothing else, so a dropped `Status` would look like it stuck. */
  it("refuses properties aimed at a page rather than silently dropping them", async () => {
    await expect(
      createNotionPage({
        parent: "11111111-2222-3333-4444-555555555555",
        title: "x",
        properties: { Status: "WIP" },
      })
    ).rejects.toThrow(/only apply to a database row/);
  });

  it("reports the paragraphs Notion's limit left out", async () => {
    const page = await createNotionPage({
      parent: "398e0cbef1a38060bba4e2e14e170454",
      title: "long",
      content: Array.from({ length: 120 }, (_, i) => `p${i}`).join("\n\n"),
    });
    expect(page.droppedBlocks).toBe(20);
  });

  it("surfaces Notion's own message when the create fails", async () => {
    wire({ createFails: "body.properties.Status.select should be defined" });
    await expect(
      createNotionPage({ parent: "398e0cbef1a38060bba4e2e14e170454", title: "x" })
    ).rejects.toThrow(/body.properties/);
  });
});
