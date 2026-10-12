import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const mockFetch = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...a: unknown[]) => mockFetch(...(a as [])),
}));

import {
  archiveNotionPage,
  buildProperties,
  clearNotionCache,
  createDatabaseRow,
  createNotionPage,
  NotionTargetError,
  queryNotionDatabase,
  resolveDatabase,
  toBlocks,
  updateNotionPage,
  uploadNotionPng,
  upsertMarkedCallout,
  upsertMarkedImage,
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

  it("adds raw properties from code, such as a relation, and refuses them on a page", async () => {
    await createNotionPage({
      parent: "398e0cbef1a38060bba4e2e14e170454",
      title: "Kiu Cortes - Follow-up",
      properties: { Status: "Backlog" },
      rawProperties: { Therapist: { relation: [{ id: "page-kiu" }] } },
    });
    const [, init] = mockFetch.mock.calls.find(([u]) => String(u).endsWith("/pages"))!;
    const body = JSON.parse(String((init as { body: string }).body));
    expect(body.properties.Therapist).toEqual({ relation: [{ id: "page-kiu" }] });
    expect(body.properties.Status).toEqual({ select: { name: "Backlog" } });
    await expect(
      createNotionPage({
        parent: "11111111-2222-3333-4444-555555555555",
        title: "x",
        rawProperties: { Therapist: { relation: [] } },
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

describe("reading and updating rows", () => {
  it("reads every row, a page at a time, and refuses a read that never ends", async () => {
    mockFetch.mockReset();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ id: "a", properties: {} }],
          has_more: true,
          next_cursor: "c1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ id: "b", properties: {} }], has_more: false }),
      });
    expect((await queryNotionDatabase("db1")).map((r) => r.id)).toEqual(["a", "b"]);
    const second = JSON.parse(String((mockFetch.mock.calls[1]![1] as { body: string }).body));
    expect(second).toEqual({ page_size: 100, start_cursor: "c1" });
    mockFetch.mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [], has_more: true, next_cursor: "again" }),
    });
    await expect(queryNotionDatabase("db1")).rejects.toThrow(/notion_query_too_large/);
  });

  it("updates a page's properties with a PATCH", async () => {
    mockFetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({ id: "p1" }) });
    await updateNotionPage("p1", { "Last touch": { date: { start: "2026-09-29" } } });
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(String(url)).toBe("https://api.notion.com/v1/pages/p1");
    expect((init as { method: string }).method).toBe("PATCH");
    expect(JSON.parse(String((init as { body: string }).body))).toEqual({
      properties: { "Last touch": { date: { start: "2026-09-29" } } },
    });
  });
});

describe("the KPI chart image", () => {
  type Call = [string, { method?: string; body?: unknown; headers?: Record<string, string> }];
  const calls = () => mockFetch.mock.calls as Call[];
  const json = (body: unknown, ok = true) => ({ ok, json: async () => body });
  const image = (id: string, caption: string) => ({
    id,
    type: "image",
    image: { caption: [{ plain_text: caption }] },
  });

  beforeEach(() => {
    process.env.NOTION_TOKEN = "secret_test";
    mockFetch.mockReset();
  });

  it("uploads the PNG in two steps and lets fetch set the multipart boundary", async () => {
    mockFetch
      .mockResolvedValueOnce(json({ id: "up-1", status: "pending" }))
      .mockResolvedValueOnce(json({ id: "up-1", status: "uploaded" }));
    expect(await uploadNotionPng(new Uint8Array([1, 2, 3]), "chart.png")).toBe("up-1");
    const [createUrl, create] = calls()[0]!;
    expect(createUrl).toBe("https://api.notion.com/v1/file_uploads");
    expect(JSON.parse(String(create.body))).toEqual({
      filename: "chart.png",
      content_type: "image/png",
    });
    const [sendUrl, send] = calls()[1]!;
    expect(sendUrl).toBe("https://api.notion.com/v1/file_uploads/up-1/send");
    expect(send.body).toBeInstanceOf(FormData);
    expect(send.headers?.["content-type"]).toBeUndefined();
    expect(send.headers?.authorization).toBe("Bearer secret_test");
  });

  it("fails loudly when Notion did not accept the bytes", async () => {
    mockFetch
      .mockResolvedValueOnce(json({ id: "up-1", status: "pending" }))
      .mockResolvedValueOnce(json({ id: "up-1", status: "pending" }));
    await expect(uploadNotionPng(new Uint8Array([1]), "c.png")).rejects.toThrow();
  });

  it("replaces only the image carrying its marker, even on the second page of blocks", async () => {
    mockFetch
      .mockResolvedValueOnce(
        json({ results: [image("theirs", "Marcus's sketch")], has_more: true, next_cursor: "c2" })
      )
      .mockResolvedValueOnce(
        json({ results: [image("ours", "Updated 11 Oct by the kpi-dropoff job")], has_more: false })
      )
      .mockResolvedValueOnce(json({ id: "ours" }));
    const action = await upsertMarkedImage("page-1", {
      marker: "kpi-dropoff job",
      caption: "Updated 12 Oct by the kpi-dropoff job",
      heading: "Drop-off per question, week by week",
      fileUploadId: "up-2",
    });
    expect(action).toBe("updated");
    expect(calls()[1]![0]).toContain("start_cursor=c2");
    const [url, init] = calls()[2]!;
    expect(url).toBe("https://api.notion.com/v1/blocks/ours");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body)).image.file_upload).toEqual({ id: "up-2" });
    // Notion refuses `type` on an update (checked live 2026-10-11).
    expect(JSON.parse(String(init.body)).image.type).toBeUndefined();
    expect(calls().some(([u]) => u.includes("/blocks/theirs"))).toBe(false);
  });

  it("adds a heading and the image at the end the first time", async () => {
    mockFetch
      .mockResolvedValueOnce(json({ results: [image("theirs", "no marker")], has_more: false }))
      .mockResolvedValueOnce(json({ results: [] }));
    const action = await upsertMarkedImage("page-1", {
      marker: "kpi-dropoff job",
      caption: "Updated 12 Oct by the kpi-dropoff job",
      heading: "Drop-off per question, week by week",
      fileUploadId: "up-3",
    });
    expect(action).toBe("created");
    const [url, init] = calls()[1]!;
    expect(url).toBe("https://api.notion.com/v1/blocks/page-1/children");
    const children = JSON.parse(String(init.body)).children;
    expect(children.map((c: { type: string }) => c.type)).toEqual(["heading_3", "image"]);
    expect(children[1].image.file_upload).toEqual({ id: "up-3" });
    expect(children[1].image.type).toBe("file_upload");
  });
});

describe("Notion's limits: 429 and 409 are retried, a 5xx only when it is safe", () => {
  const reply = (body: unknown, status = 200, retryAfter: string | null = null) => ({
    ok: status < 400,
    status,
    headers: { get: (k: string) => (k === "retry-after" ? retryAfter : null) },
    json: async () => body,
  });

  beforeEach(() => {
    process.env.NOTION_TOKEN = "secret_test";
    mockFetch.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("waits out a 429 for as long as Notion asks, then goes on", async () => {
    mockFetch
      .mockResolvedValueOnce(reply({ message: "rate limited" }, 429, "2"))
      .mockResolvedValueOnce(reply({ id: "p1" }));
    const done = createDatabaseRow("db1", { Name: { title: [] } });
    await vi.advanceTimersByTimeAsync(1999);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await done).toBe("p1");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries a write that collided with another (409)", async () => {
    mockFetch
      .mockResolvedValueOnce(
        reply({ message: "Conflict occurred while saving. Please try again." }, 409)
      )
      .mockResolvedValueOnce(reply({ id: "p2" }));
    const done = createDatabaseRow("db1", {});
    await vi.advanceTimersByTimeAsync(1000);
    expect(await done).toBe("p2");
  });

  it("retries a 502 on an update, but never on a create that may already have happened", async () => {
    mockFetch.mockResolvedValueOnce(reply({}, 502)).mockResolvedValueOnce(reply({ id: "p1" }));
    const updated = updateNotionPage("p1", {});
    await vi.advanceTimersByTimeAsync(1000);
    await updated;
    expect(mockFetch).toHaveBeenCalledTimes(2);

    mockFetch.mockReset().mockResolvedValueOnce(reply({ message: "bad gateway" }, 502));
    await expect(createDatabaseRow("db1", {})).rejects.toThrow("bad gateway");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries a 503 when the picture is replaced, but not when it is first added", async () => {
    const marked = {
      id: "ours",
      type: "image",
      image: { caption: [{ plain_text: "Updated 11 Oct by the kpi-dropoff job" }] },
    };
    const opts = {
      marker: "kpi-dropoff job",
      caption: "Updated 12 Oct by the kpi-dropoff job",
      heading: "Drop-off per question, week by week",
      fileUploadId: "up-2",
    };
    mockFetch
      .mockResolvedValueOnce(reply({ results: [marked], has_more: false }))
      .mockResolvedValueOnce(reply({ message: "unavailable" }, 503))
      .mockResolvedValueOnce(reply({ id: "ours" }));
    const replaced = upsertMarkedImage("page-1", opts);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await replaced).toBe("updated");
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Appending twice would put two pictures on the page.
    mockFetch
      .mockReset()
      .mockResolvedValueOnce(reply({ results: [], has_more: false }))
      .mockResolvedValueOnce(reply({ message: "unavailable" }, 503));
    await expect(upsertMarkedImage("page-1", opts)).rejects.toThrow("unavailable");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("gives up after four rate limits in a row", async () => {
    mockFetch.mockResolvedValue(reply({ message: "rate limited" }, 429));
    const failed = expect(createDatabaseRow("db1", {})).rejects.toThrow("rate limited");
    await vi.advanceTimersByTimeAsync(10_000);
    await failed;
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it("never sleeps more than 30 seconds in all for one request", async () => {
    // Notion asks for 30s, then 30s again: the second wait would pass the cap, so it stops.
    mockFetch.mockResolvedValue(reply({ message: "rate limited" }, 429, "30"));
    const failed = expect(createDatabaseRow("db1", {})).rejects.toThrow("rate limited");
    await vi.advanceTimersByTimeAsync(30_000);
    await failed;
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("uses a job's own token when given one, and NOTION_TOKEN otherwise", async () => {
    mockFetch.mockResolvedValue(reply({ id: "p1" }));
    await createDatabaseRow("db1", {}, "ntn_kpi");
    await createDatabaseRow("db1", {});
    const auth = (i: number) =>
      (mockFetch.mock.calls[i]![1] as { headers: Record<string, string> }).headers.authorization;
    expect(auth(0)).toBe("Bearer ntn_kpi");
    expect(auth(1)).toBe("Bearer secret_test");
  });

  it("reports a gateway's HTML error page by its status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: { get: () => null },
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    });
    await expect(createDatabaseRow("db1", {})).rejects.toThrow("notion_400");
  });
});

describe("rows of the KPI data table", () => {
  beforeEach(() => {
    process.env.NOTION_TOKEN = "secret_test";
    mockFetch.mockReset();
  });

  it("queries with a filter, and refuses a read longer than it allows", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ id: "a", properties: {} }],
        has_more: true,
        next_cursor: "n",
      }),
    });
    const filter = { property: "Week", date: { on_or_after: "2026-09-21" } };
    await expect(queryNotionDatabase("db1", { filter, maxRows: 200 })).rejects.toThrow(
      /notion_query_too_large/
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const body = JSON.parse(String((mockFetch.mock.calls[1]![1] as { body: string }).body));
    expect(body).toEqual({ page_size: 100, filter, start_cursor: "n" });
  });

  it("refuses a read its caller's clock cut short, instead of returning part of it", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ id: "a", properties: {} }],
        has_more: true,
        next_cursor: "n",
      }),
    });
    let reads = 0;
    await expect(queryNotionDatabase("db1", { isOutOfTime: () => reads++ >= 2 })).rejects.toThrow(
      /notion_query_out_of_time/
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("creates a row under the database and archives one by id", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: "row-1" }) });
    expect(await createDatabaseRow("db1", { Key: { rich_text: [] } })).toBe("row-1");
    const [createUrl, create] = mockFetch.mock.calls[0] as [
      string,
      { method: string; body: string },
    ];
    expect(createUrl).toBe("https://api.notion.com/v1/pages");
    expect(JSON.parse(create.body)).toEqual({
      parent: { database_id: "db1" },
      properties: { Key: { rich_text: [] } },
    });
    await archiveNotionPage("row-1");
    const [archiveUrl, archive] = mockFetch.mock.calls[1] as [
      string,
      { method: string; body: string },
    ];
    expect(archiveUrl).toBe("https://api.notion.com/v1/pages/row-1");
    expect(archive.method).toBe("PATCH");
    expect(JSON.parse(archive.body)).toEqual({ archived: true });
  });
});

describe("the KPI summary callout", () => {
  type Call = [string, { method?: string; body?: unknown }];
  const calls = () => mockFetch.mock.calls as Call[];
  const json = (body: unknown) => ({ ok: true, json: async () => body });
  const callout = (id: string, text: string) => ({
    id,
    type: "callout",
    callout: { rich_text: [{ plain_text: text }] },
  });
  const lines = [
    [{ text: "Last full week: ", bold: true }, { text: "314 people." }],
    [{ text: "Refreshed by the kpi-dropoff job.", italic: true }],
  ];

  beforeEach(() => {
    process.env.NOTION_TOKEN = "secret_test";
    mockFetch.mockReset();
  });

  it("rewrites only the callout carrying its marker, where it stands", async () => {
    mockFetch
      .mockResolvedValueOnce(
        json({
          results: [
            callout("theirs", "A note Marcus wrote"),
            callout("ours", "Old text, kpi-dropoff job"),
          ],
          has_more: false,
        })
      )
      .mockResolvedValueOnce(json({ id: "ours" }));
    expect(
      await upsertMarkedCallout("page-1", { marker: "kpi-dropoff job", lines, emoji: "📉" })
    ).toBe("updated");
    const [url, init] = calls()[1]!;
    expect(url).toBe("https://api.notion.com/v1/blocks/ours");
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(String(init.body)).callout;
    expect(body.icon).toEqual({ type: "emoji", emoji: "📉" });
    expect(body.rich_text.map((t: { text: { content: string } }) => t.text.content)).toEqual([
      "Last full week: ",
      "314 people.",
      "\n",
      "Refreshed by the kpi-dropoff job.",
    ]);
    expect(body.rich_text[0].annotations).toEqual({ bold: true, italic: false });
    expect(body.rich_text[3].annotations).toEqual({ bold: false, italic: true });
    expect(calls().some(([u]) => u.includes("/blocks/theirs"))).toBe(false);
  });

  it("adds the callout at the end the first time", async () => {
    mockFetch
      .mockResolvedValueOnce(json({ results: [], has_more: false }))
      .mockResolvedValueOnce(json({}));
    expect(
      await upsertMarkedCallout("page-1", { marker: "kpi-dropoff job", lines, emoji: "📉" })
    ).toBe("created");
    const [url, init] = calls()[1]!;
    expect(url).toBe("https://api.notion.com/v1/blocks/page-1/children");
    expect(JSON.parse(String(init.body)).children[0].type).toBe("callout");
  });

  it("refuses text without the marker, which tomorrow's run could not find again", async () => {
    await expect(
      upsertMarkedCallout("page-1", {
        marker: "kpi-dropoff job",
        lines: [[{ text: "no marker" }]],
        emoji: "📉",
      })
    ).rejects.toThrow("marker");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
