import { describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const mockFetch = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...a: unknown[]) => mockFetch(...(a as [])),
}));

import {
  blocksToText,
  isExcluded,
  notionHumans,
  pageToRow,
  propertyToText,
  taskToRow,
} from "@features/brain/server/ingest/notion";

/**
 * Fixtures copied from the shapes the real LoveIQ workspace returns — the
 * `👷🏻‍♂️ Board` database has Status, Priority and Impact as `select`, Assign as
 * `person`, and Due Date / Date Completed as `date`. Getting these shapes wrong
 * is the whole risk in this ingester, because Notion returns a different object
 * per property type.
 */
const TASK = {
  id: "3cae0cbe-f1a3-380e-b483-d94fc5a2e2fb",
  url: "https://app.notion.com/3cae0cbef1a380e3b483d94fc5a2e2fb",
  created_time: "2026-08-28T07:32:00.000Z",
  last_edited_time: "2026-08-28T09:15:00.000Z",
  properties: {
    Name: {
      type: "title",
      title: [{ plain_text: "Remove timer, skip the stripe redirect page" }],
    },
    Status: { type: "select", select: { name: "WIP" } },
    Priority: { type: "select", select: { name: "High 🔥" } },
    Impact: { type: "select", select: null },
    Assign: { type: "people", people: [{ name: "Eman Cickusic" }] },
    "Due Date": { type: "date", date: { start: "2026-08-28" } },
    "Date Completed": { type: "date", date: null },
  },
};

describe("propertyToText — one shape per Notion property type", () => {
  it.each([
    ["title", { type: "title", title: [{ plain_text: "Hello" }] }, "Hello"],
    ["select", { type: "select", select: { name: "WIP" } }, "WIP"],
    ["select (empty)", { type: "select", select: null }, ""],
    ["status", { type: "status", status: { name: "Done" } }, "Done"],
    [
      "multi_select",
      { type: "multi_select", multi_select: [{ name: "a" }, { name: "b" }] },
      "a, b",
    ],
    ["people", { type: "people", people: [{ name: "Eman" }, { name: "Iman" }] }, "Eman, Iman"],
    ["date", { type: "date", date: { start: "2026-08-28" } }, "2026-08-28"],
    [
      "date range",
      { type: "date", date: { start: "2026-08-01", end: "2026-08-28" } },
      "2026-08-01 to 2026-08-28",
    ],
    ["checkbox true", { type: "checkbox", checkbox: true }, "yes"],
    ["number 0", { type: "number", number: 0 }, "0"],
    ["formula", { type: "formula", formula: { type: "string", string: "x" } }, "x"],
  ])("reads %s", (_name, prop, expected) => {
    expect(propertyToText(prop)).toBe(expected);
  });

  it("returns empty for an unknown or malformed property rather than throwing", () => {
    // A property type added in the Notion UI must not break a nightly ingest.
    expect(propertyToText({ type: "some_future_type", whatever: 1 })).toBe("");
    expect(propertyToText(null)).toBe("");
    expect(propertyToText("nonsense")).toBe("");
  });
});

describe("taskToRow", () => {
  it("puts status, priority and assignee in the BODY, not only in meta", () => {
    // So "what is still open about pricing" is answerable from text retrieval
    // without a structured query — same reason the Jira ingester did it.
    const row = taskToRow(TASK, "2026-08-28T10:00:00.000Z");
    expect(row).not.toBeNull();
    expect(row?.body).toContain("Status: WIP");
    expect(row?.body).toContain("Priority: High 🔥");
    expect(row?.body).toContain("Assigned to: Eman Cickusic");
    expect(row?.body).toContain("Due: 2026-08-28");
  });

  it("omits properties that are empty rather than printing blanks", () => {
    const row = taskToRow(TASK, "s");
    expect(row?.body).not.toContain("Impact:");
    expect(row?.body).not.toContain("Completed:");
  });

  it("dates period_end from the last edit, so a stale backlog item cannot outrank today's work", () => {
    expect(taskToRow(TASK, "s")?.period_end).toBe("2026-08-28");
  });

  it("uses a task-prefixed id, so a task and a page can never collide", () => {
    const task = taskToRow(TASK, "s");
    const page = pageToRow({ ...TASK }, "body", "s");
    expect(task?.source_id).toBe(`task:${TASK.id}`);
    expect(page?.source_id).toBe(`page:${TASK.id}`);
    expect(task?.source_id).not.toBe(page?.source_id);
  });

  it("skips a row with no title, which Notion allows", () => {
    expect(taskToRow({ ...TASK, properties: {} }, "s")).toBeNull();
    expect(taskToRow({ ...TASK, id: undefined }, "s")).toBeNull();
  });
});

describe("blocksToText", () => {
  it("keeps an unticked to-do distinguishable from a ticked one", () => {
    // An outstanding checkbox IS the answer to "what is left to do", so losing
    // the tick state would lose the point of indexing the page.
    const text = blocksToText([
      { type: "to_do", to_do: { rich_text: [{ plain_text: "ship it" }], checked: false } },
      { type: "to_do", to_do: { rich_text: [{ plain_text: "done thing" }], checked: true } },
    ]);
    expect(text).toContain("[ ] ship it");
    expect(text).toContain("[x] done thing");
  });

  it("flattens headings, paragraphs and lists to one line each", () => {
    const text = blocksToText([
      { type: "heading_1", heading_1: { rich_text: [{ plain_text: "Pricing" }] } },
      { type: "paragraph", paragraph: { rich_text: [{ plain_text: "We charge 39.99" }] } },
      {
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ plain_text: "arm A" }] },
      },
    ]);
    expect(text.split("\n")).toEqual(["Pricing", "We charge 39.99", "arm A"]);
  });

  it("drops empty blocks and survives unknown block types", () => {
    expect(
      blocksToText([
        { type: "divider", divider: {} },
        { type: "paragraph", paragraph: { rich_text: [] } },
        { type: "some_future_block", some_future_block: { foo: 1 } },
      ])
    ).toBe("");
  });

  it("cannot recurse forever on a cyclic or very deep tree", () => {
    const deep: Record<string, unknown> = {
      type: "paragraph",
      paragraph: { rich_text: [{ plain_text: "x" }] },
    };
    deep.children = [deep]; // self-referential
    expect(() => blocksToText([deep])).not.toThrow();
  });
});

describe("isExcluded", () => {
  /**
   * Notion enforces per-page permissions; the brain does not. A page only some
   * people can open in Notion becomes readable by anyone who can ask the brain,
   * so this is the escape hatch for pages the team decides not to share.
   */
  it("matches on a substring, case-insensitively", () => {
    const excluded = ["performance management", "onboarding"];
    expect(isExcluded("Notion: Performance Management", excluded)).toBe(true);
    expect(isExcluded("Notion: Onboarding — Sanjin Kaćevac", excluded)).toBe(true);
    expect(isExcluded("Notion: Positioning", excluded)).toBe(false);
  });

  it("excludes nothing when the list is empty", () => {
    expect(isExcluded("anything at all", [])).toBe(false);
  });
});

describe("citation label", () => {
  /**
   * A board task and a written page are different kinds of evidence — one carries
   * a status and an owner, the other does not — and the label is what a reader
   * sees next to the answer. "notion" for both flattens that distinction.
   */
  it("distinguishes a board task from a page", async () => {
    const { labelForTest } = await import("@features/brain/server/answer");
    expect(labelForTest({ source: "notion", sourceId: "task:abc", meta: {} })).toBe("notion board");
    expect(labelForTest({ source: "notion", sourceId: "page:abc", meta: {} })).toBe("notion page");
  });
});

describe("pageToRow records who wrote the page", () => {
  /**
   * MEASURED 2026-09-09: 163 of 1,446 Notion chunks were attributed — 11%. Tasks had an
   * `assignee`; pages had no identity field at all. So 1,283 chunks of the company's
   * written workspace answered "what has X written" with nothing.
   */
  const HUMANS = new Map([
    ["2a0d872b", "Eman Cickusic"],
    ["3c9d872b", "Sanjin Kacevac"],
  ]);
  const page = (over: Record<string, unknown> = {}) => ({
    id: "p1",
    url: "https://notion.so/p1",
    created_time: "2026-09-01T10:00:00.000Z",
    last_edited_time: "2026-09-02T10:00:00.000Z",
    properties: { title: { type: "title", title: [{ plain_text: "A page" }] } },
    ...over,
  });

  it("attributes a page to whoever created it", () => {
    const row = pageToRow(page({ created_by: { id: "2a0d872b" } }), "body", "stamp", HUMANS)!;
    // `author` is a scalar identity field to `peopleIn`, so the shared upsert path turns
    // this into `meta.people` with no second copy of the matching rules.
    expect(row.meta.author).toBe("Eman Cickusic");
  });

  /**
   * A THIRD OF THIS WORKSPACE'S NOTION USERS ARE BOTS, several called "Notion MCP".
   * Attributing their pages to them makes "who writes the most" answer with a robot —
   * and an unknown bot NAME would sail past the registry as an unrecognised person, so
   * filtering on Notion's own `type` at the source is the reliable cut.
   */
  it("does not attribute a page created by a bot", () => {
    // The map holds humans only, so a bot id simply is not in it.
    const row = pageToRow(page({ created_by: { id: "324e0cbe" } }), "body", "stamp", HUMANS)!;
    expect(row.meta).not.toHaveProperty("author");
  });

  /** Absent rather than null, matching `peopleIn`: a null author asserts "written by
   *  nobody", which of a page somebody typed is never true. */
  it("leaves the field off when there is nobody to name", () => {
    expect(pageToRow(page(), "body", "stamp", HUMANS)!.meta).not.toHaveProperty("author");
    expect(
      pageToRow(page({ created_by: { id: "unknown" } }), "b", "s", HUMANS)!.meta
    ).not.toHaveProperty("author");
  });

  /**
   * THE AUTHOR, NOT THE LAST EDITOR. `last_edited_by` is frequently the integration
   * itself or whoever fixed a typo, and crediting them would quietly reassign every page
   * anyone has ever touched.
   */
  it("uses the creator rather than the last editor", () => {
    const row = pageToRow(
      page({ created_by: { id: "2a0d872b" }, last_edited_by: { id: "3c9d872b" } }),
      "body",
      "stamp",
      HUMANS
    )!;
    expect(row.meta.author).toBe("Eman Cickusic");
  });

  it("still builds a page when the user list could not be read", () => {
    const row = pageToRow(page({ created_by: { id: "2a0d872b" } }), "body", "stamp")!;
    expect(row.source_id).toBe("page:p1");
    expect(row.meta).not.toHaveProperty("author");
  });
});

describe("notionHumans — the directory the attribution depends on", () => {
  /** Shapes taken from what this workspace's /v1/users actually returns. */
  const USERS = [
    { id: "2a0d872b", name: "Eman Cickusic", type: "person", person: { email: "ec@loveiq.org" } },
    { id: "3d5d872b", name: "Fatih Hadzic", type: "person", person: { email: "fh@loveiq.org" } },
    { id: "324e0cbe", name: "Notion MCP", type: "bot" },
    { id: "39ee0cbe", name: "Notion MCP", type: "bot" },
    { id: "nameless", type: "person" },
  ];

  /**
   * A THIRD OF THIS WORKSPACE'S NOTION USERS ARE BOTS — three of the ten are called
   * "Notion MCP". Pages they create would be attributed to them, and "who writes the
   * most" would answer with a robot. Filtering on Notion's own `type` is the reliable
   * cut: an unknown bot NAME would pass the person registry as an unrecognised person.
   */
  it("keeps people and drops bots", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: USERS, has_more: false }),
    });
    const humans = await notionHumans("secret");
    expect([...humans.values()].sort()).toEqual(["Eman Cickusic", "Fatih Hadzic"]);
    expect(humans.has("324e0cbe")).toBe(false);
  });

  it("pages through a directory bigger than one response", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [USERS[0]], has_more: true, next_cursor: "c1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [USERS[1]], has_more: false }),
      });
    expect((await notionHumans("secret")).size).toBe(2);
  });

  /** Best-effort: a failure leaves pages unattributed, which is what happened before
   *  they carried an author at all — it must never fail the whole ingest. */
  it("returns an empty directory rather than throwing", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    expect((await notionHumans("secret")).size).toBe(0);
  });
});
