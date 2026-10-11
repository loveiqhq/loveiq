import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---- the corpus, answered per query -------------------------------------------
type Row = {
  source: string;
  source_id: string;
  title: string | null;
  body: string | null;
  period_end: string | null;
  meta?: Record<string, unknown> | null;
};
let linkRows: Row[] = [];
let untitledRows: Row[] = [];
let indexedIds: string[] = [];
let previousOpen: string[] | null = null;
let failCorpus = false;
const dbPaths: string[] = [];

vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async (path: string) => {
    dbPaths.push(path);
    const ok = (rows: unknown) =>
      new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    if (failCorpus) return new Response("boom", { status: 500 });
    const offset = Number(/offset=(\d+)/.exec(path)?.[1] ?? 0);
    if (path.includes("fts=fts(simple)")) return ok(offset === 0 ? linkRows : []);
    if (path.includes("fts=fts(english).untitled")) return ok(offset === 0 ? untitledRows : []);
    if (path.includes("source=eq.notion&order=source_id.asc"))
      return ok(offset === 0 ? indexedIds.map((source_id) => ({ source_id })) : []);
    if (path.includes("noticed_by=eq.notion-reach"))
      return ok(previousOpen ? [{ meta: { reach_open: previousOpen } }] : []);
    return ok([]);
  }),
}));

// ---- Notion, answered per id ----------------------------------------------------
/** HTTP status Notion gives for GET /blocks/<id>; absent = 200. */
let pageStatus: Record<string, number> = {};
let pageBlocks: Record<string, unknown[]> = {};
let sharedDatabases: string[] = [];
const notionPaths: string[] = [];

vi.mock("@features/brain/server/ingest/notion", () => ({
  notionGet: vi.fn(async (_token: string, path: string) => {
    notionPaths.push(path);
    const children = /^\/blocks\/([^/?]+)\/children/.exec(path);
    if (children) return { results: pageBlocks[children[1]!] ?? [], has_more: false };
    const id = /^\/blocks\/([^/?]+)$/.exec(path)?.[1] ?? "";
    const status = pageStatus[id] ?? 200;
    if (status !== 200) throw new Error(`Notion ${path} failed (${status}): x`);
    return { object: "block", id };
  }),
  notionPost: vi.fn(async () => ({
    results: sharedDatabases.map((id) => ({ id, object: "database" })),
    has_more: false,
  })),
  attachChildren: vi.fn(async () => undefined),
}));

const recorded: Array<{ headline: string; detail: string; meta?: Record<string, unknown> }> = [];
let recordOk = true;
vi.mock("@features/brain/server/notice", () => ({
  NOTICE_SOURCE: "notice",
  recordNotice: vi.fn(
    async (n: { headline: string; detail: string; meta?: Record<string, unknown> }) => {
      recorded.push(n);
      return recordOk;
    }
  ),
}));

import {
  buildReachNotice,
  checkNotionReach,
  diffReach,
  isLiving,
  notionIdsInBlocks,
  notionLinksIn,
  toNotionId,
  type Gap,
  type Reach,
} from "@features/brain/server/notion-reach";

const A = "3dde0cbe-f1a3-80d8-8ab6-e05a56eecd8c";
const B = "6860b617-d5a9-4663-8570-5872d2bb2e99";
const C = "316e0cbe-f1a3-8079-9c76-ce4ad7b61646";
const D = "35500a24-0f11-4911-92dd-ff15ff499d1d";
const E = "29ce0cbe-f1a3-8033-80fd-c0098d2d71ae";
const F = "3f3e0cbe-f1a3-8071-b8e5-f7c60402022f";
const flat = (id: string) => id.replace(/-/g, "");

describe("toNotionId", () => {
  it("reads every spelling as the API's dashed lowercase", () => {
    expect(toNotionId(flat(A))).toBe(A);
    expect(toNotionId(A.toUpperCase())).toBe(A);
    expect(toNotionId(`Review-KPI-Sheet-${flat(A)}`)).toBe(A);
    expect(toNotionId("no id here")).toBeNull();
  });
});

describe("notionLinksIn", () => {
  it("takes the id and the title a page link spells out", () => {
    expect(notionLinksIn(`see https://www.notion.so/Review-KPI-Sheet-${flat(A)} please`)).toEqual([
      { id: A, hint: "Review KPI Sheet" },
    ]);
  });

  it("reads app.notion.com links, a workspace path, and decodes the title", () => {
    expect(notionLinksIn(`https://app.notion.com/p/${flat(B)}`)).toEqual([{ id: B, hint: null }]);
    expect(
      notionLinksIn(`https://www.notion.so/loveiq/Grants-%26-Funding-${flat(C)}?pvs=4`)
    ).toEqual([{ id: C, hint: "Grants & Funding" }]);
  });

  it("counts the page open in a side peek, and the database, but never the view", () => {
    const view = "22cd139d9c8c47d88ec592024878b55c";
    const ids = notionLinksIn(
      `https://app.notion.com/p/${flat(B)}?v=${view}&p=${flat(D)}&pm=s`
    ).map((l) => l.id);
    expect(ids.sort()).toEqual([B, D].sort());
    expect(ids).not.toContain(toNotionId(view));
  });

  it("ignores Notion's own pages and API addresses", () => {
    expect(notionLinksIn(`https://www.notion.so/notion/Privacy-Policy-${flat(C)}`)).toEqual([]);
    expect(notionLinksIn(`https://api.notion.com/v1/blocks/${A}`)).toEqual([]);
    expect(notionLinksIn(`https://developers.notion.com/x-${flat(A)}`)).toEqual([]);
    expect(notionLinksIn(`https://www.figma.com/file/${flat(A)}`)).toEqual([]);
  });

  it("survives the punctuation and brackets text puts around a link, once per page", () => {
    const text = `(https://www.notion.so/Glossary-${flat(F)}). Again: https://www.notion.so/Glossary-${flat(F)}…`;
    expect(notionLinksIn(text)).toEqual([{ id: F, hint: "Glossary" }]);
  });
});

describe("notionIdsInBlocks", () => {
  it("finds @-mentions, links, link-to-page blocks, table cells, captions and nested blocks", () => {
    const blocks = [
      {
        type: "paragraph",
        paragraph: {
          rich_text: [
            { type: "mention", mention: { type: "page", page: { id: A } }, plain_text: "Untitled" },
            {
              type: "text",
              text: { content: "x", link: { url: `https://www.notion.so/${flat(C)}` } },
            },
          ],
        },
      },
      { type: "link_to_page", link_to_page: { type: "page_id", page_id: D } },
      {
        type: "table_row",
        table_row: {
          cells: [[{ type: "mention", mention: { type: "database", database: { id: B } } }]],
        },
      },
      {
        type: "image",
        image: { caption: [{ type: "mention", mention: { type: "page", page: { id: E } } }] },
      },
      {
        type: "toggle",
        toggle: { rich_text: [] },
        children: [{ type: "link_to_page", link_to_page: { type: "database_id", database_id: F } }],
      },
    ];
    expect(notionIdsInBlocks(blocks).sort()).toEqual([A, B, C, D, E, F].sort());
  });

  it("ignores user and date mentions", () => {
    const blocks = [
      {
        type: "paragraph",
        paragraph: {
          rich_text: [
            { type: "mention", mention: { type: "user", user: { id: A } } },
            { type: "mention", mention: { type: "date", date: { start: "2026-10-11" } } },
          ],
        },
      },
    ];
    expect(notionIdsInBlocks(blocks)).toEqual([]);
  });
});

describe("isLiving", () => {
  it("keeps links in documents current, but a message or a finished task ages", () => {
    expect(isLiving({ source: "notion" })).toBe(true);
    expect(isLiving({ source: "drive" })).toBe(true);
    expect(isLiving({ source: "notion", meta: { state: "done" } })).toBe(false);
    expect(isLiving({ source: "whatsapp" })).toBe(false);
    expect(isLiving({ source: "gmail" })).toBe(false);
  });
});

describe("diffReach", () => {
  const reach = (entries: Array<[string, Reach]>) => new Map(entries);

  it("separates new from already reported, and only a page CHECKED readable is fixed", () => {
    const out = diffReach(
      new Set([A, B, C]),
      reach([
        [A, "missing"],
        [D, "missing"],
        [B, "visible"],
      ]),
      new Set([A, B, C, D])
    );
    expect(out.fresh).toEqual([D]);
    expect(out.still).toEqual([A]);
    expect(out.fixed).toEqual([B]);
    // C was reported, is still linked, and got no answer this run: carried, not fixed.
    expect(out.carried).toEqual([C]);
  });

  it("lets a page nobody links any more age out instead of listing it forever", () => {
    const out = diffReach(new Set([A]), reach([[A, "missing"]]), new Set());
    expect(out.listed).toEqual([]);
    expect(out.still).toEqual([]);
    expect(out.carried).toEqual([]);
  });
});

describe("buildReachNotice", () => {
  const gaps = new Map<string, Gap>([
    [
      A,
      {
        id: A,
        hint: "Email Marketing Playbook",
        refs: [{ where: "Marketing Channels: Email", day: "2026-03-01" }],
      },
    ],
    [
      B,
      {
        id: B,
        hint: null,
        refs: [
          { where: "WhatsApp: LoveIQ — 2026-10-05 09:33", day: "2026-10-05" },
          { where: "Slack #all-loveiq — 2026-10-07", day: "2026-10-07" },
        ],
      },
    ],
    [C, { id: C, hint: "Glossary", refs: [] }],
  ]);
  const base = { gaps, linked: 82, checked: 19, day: "2026-10-12" };

  it("says what is new, what is still open, and how to fix it, in plain words", () => {
    const n = buildReachNotice({ ...base, fresh: [B], still: [A], fixed: [] });
    expect(n.headline).toBe("Jarvis cannot open 2 Notion pages the team links to (1 new)");
    expect(n.detail).toContain("New since the last check:");
    expect(n.detail).toContain("Still not shared:");
    // The freshest place it was linked leads, with the count of the others.
    expect(n.detail).toContain(
      `• A page linked in Slack #all-loveiq — 2026-10-07 and 1 other place (the link carries no title): https://www.notion.so/${flat(B)}`
    );
    expect(n.detail).toContain('"Email Marketing Playbook", linked in Marketing Channels: Email');
    expect(n.detail).toContain('add "Claude connection"');
    expect(n.detail).toContain("disconnect it and add it again");
    expect(n.kind).toBe("notion-reach");
    expect(n.meta).toEqual({ reach_open: [A, B].sort() });
  });

  it("names one page in the singular and leaves out the count when everything is new", () => {
    const n = buildReachNotice({ ...base, fresh: [A], still: [], fixed: [] });
    expect(n.headline).toBe("Jarvis cannot open 1 Notion page the team links to");
  });

  it("reports fixes on their own, without repair instructions", () => {
    const n = buildReachNotice({ ...base, fresh: [], still: [], fixed: [C] });
    expect(n.headline).toBe("Jarvis can now open 1 Notion page it could not before");
    expect(n.detail).toContain(`"Glossary" https://www.notion.so/${flat(C)}`);
    expect(n.detail).not.toContain("Connections");
    expect(n.meta).toEqual({ reach_open: [] });
  });

  it("keeps a page it could not re-check in the reported set", () => {
    const n = buildReachNotice({ ...base, fresh: [A], still: [], fixed: [], carried: [C, A] });
    expect(n.meta).toEqual({ reach_open: [A, C].sort() });
  });
});

// ---- the whole check ------------------------------------------------------------

const NOW = new Date("2026-10-11T05:20:00Z"); // a Sunday
const MONDAY = new Date("2026-10-12T05:20:00Z");
const row = (over: Partial<Row>): Row => ({
  source: "whatsapp",
  source_id: "wa:1",
  title: "WhatsApp: LoveIQ — 2026-10-05 09:33",
  body: "",
  period_end: "2026-10-05",
  meta: null,
  ...over,
});

describe("checkNotionReach", () => {
  beforeEach(() => {
    process.env.NOTION_TOKEN = "ntn_test";
    linkRows = [];
    untitledRows = [];
    indexedIds = [];
    previousOpen = null;
    failCorpus = false;
    pageStatus = {};
    pageBlocks = {};
    sharedDatabases = [];
    recorded.length = 0;
    recordOk = true;
    dbPaths.length = 0;
    notionPaths.length = 0;
  });

  it("reports what the team links to and Jarvis cannot open, skipping what it already holds", async () => {
    linkRows = [
      row({ body: `KPI: https://app.notion.com/p/${flat(B)}` }), // shared database: skip
      row({ source_id: "wa:2", body: `https://www.notion.so/Glossary-${flat(F)}` }), // indexed: skip
      row({ source_id: "wa:3", body: `https://www.notion.so/Playbook-${flat(C)}` }), // 404
      row({ source_id: "wa:4", body: `https://www.notion.so/${flat(E)}` }), // 403
      row({ source_id: "wa:5", body: `https://www.notion.so/Busy-${flat(D)}` }), // 429: unknown
    ];
    sharedDatabases = [B];
    indexedIds = [`page:${F}`, `task:${F}#2`];
    pageStatus = { [C]: 404, [E]: 403, [D]: 429 };

    const r = await checkNotionReach(NOW);

    const asked = notionPaths.filter((p) => /^\/blocks\/[^/]+$/.test(p)).map((p) => p.slice(8));
    expect(asked.sort()).toEqual([C, D, E].sort());
    expect(r).toMatchObject({
      missing: 2,
      fresh: 2,
      fixed: 0,
      unknown: 1,
      checked: 3,
      noticed: true,
    });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.meta).toEqual({ reach_open: [C, E].sort() });
    expect(r.summary).toBe("2 linked Notion pages Jarvis cannot open (Playbook, untitled)");
  });

  it("only counts messages from the last 90 days, but a document's links while it exists", async () => {
    linkRows = [
      row({ body: `https://www.notion.so/Old-${flat(C)}`, period_end: "2026-04-01" }), // old message
      row({
        source: "notion",
        source_id: `task:${A}`,
        title: "Marketing Channels: Email",
        body: `https://www.notion.so/Playbook-${flat(D)}`,
        period_end: "2026-03-01",
      }), // old but living
      row({
        source: "notion",
        source_id: `task:${F}`,
        title: "Notion task (Done): Review Survey Update",
        body: `https://www.notion.so/${flat(E)}`,
        period_end: "2026-03-01",
        meta: { state: "done" },
      }), // finished task: ages like a message
    ];
    pageStatus = { [C]: 404, [D]: 404, [E]: 404 };
    const r = await checkNotionReach(NOW);
    expect(recorded[0]!.meta).toEqual({ reach_open: [D] });
    expect(r.missing).toBe(1);
  });

  it("reads an @-mention the stored text could only show as Untitled", async () => {
    untitledRows = [
      row({
        source: "notion",
        source_id: `task:${A}`,
        title: "Notion task: Review KPI Sheet > (part 3 of 4)",
        body: "Traffic: Untitled · Untitled",
      }),
      row({
        source: "notion",
        source_id: `page:${F}`,
        title: "Untitled thoughts",
        body: "Untitledness",
      }),
    ];
    pageBlocks = {
      [A]: [
        {
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "mention", mention: { type: "page", page: { id: D } } }],
          },
        },
      ],
    };
    pageStatus = { [D]: 404 };
    const r = await checkNotionReach(NOW);
    // Only the page whose text really carries the word was re-read.
    expect(notionPaths.some((p) => p.startsWith(`/blocks/${A}/children`))).toBe(true);
    expect(notionPaths.some((p) => p.startsWith(`/blocks/${F}/children`))).toBe(false);
    expect(r.mentionPages).toBe(1);
    expect(recorded[0]!.detail).toContain("linked in Notion task: Review KPI Sheet >");
  });

  it("says nothing on an unchanged day, and repeats the open list on Mondays", async () => {
    linkRows = [row({ body: `https://www.notion.so/Playbook-${flat(C)}` })];
    pageStatus = { [C]: 404 };
    previousOpen = [C];

    expect((await checkNotionReach(NOW)).noticed).toBe(false);
    expect(recorded).toHaveLength(0);

    const monday = await checkNotionReach(MONDAY);
    expect(monday.noticed).toBe(true);
    expect(recorded[0]!.detail).toContain("Still not shared:");
  });

  it("announces a fix, re-asking a reported page even when nobody links it now", async () => {
    previousOpen = [C, D];
    indexedIds = [`page:${D}`]; // D was connected and has since been indexed
    pageStatus = {}; // C answers 200 now
    const r = await checkNotionReach(NOW);
    expect(r.fixed).toBe(2);
    expect(recorded[0]!.headline).toBe("Jarvis can now open 2 Notion pages it could not before");
    expect(recorded[0]!.meta).toEqual({ reach_open: [] });
  });

  it("never calls a page fixed or new when it simply was not checked", async () => {
    linkRows = [row({ body: `https://www.notion.so/Playbook-${flat(C)}` })];
    previousOpen = [C];
    const r = await checkNotionReach(NOW, () => true); // out of time before the first check
    expect(r.checked).toBe(0);
    expect(r).toMatchObject({ fixed: 0, fresh: 0, missing: 0, noticed: false });
  });

  it("writes nothing in a dry run, but shows the notice it would have written", async () => {
    linkRows = [row({ body: `https://www.notion.so/Playbook-${flat(C)}` })];
    pageStatus = { [C]: 404 };
    const r = await checkNotionReach(NOW, undefined, { dryRun: true });
    expect(recorded).toHaveLength(0);
    expect(r.notice?.headline).toBe("Jarvis cannot open 1 Notion page the team links to");
    expect(r.noticeFailed).toBe(false);
  });

  it("flags a notice that was due but could not be written", async () => {
    linkRows = [row({ body: `https://www.notion.so/Playbook-${flat(C)}` })];
    pageStatus = { [C]: 404 };
    recordOk = false;
    expect((await checkNotionReach(NOW)).noticeFailed).toBe(true);
  });

  it("fails the run rather than reporting a clean bill when the corpus cannot be read", async () => {
    failCorpus = true;
    await expect(checkNotionReach(NOW)).rejects.toThrow();
  });

  it("does not ask Notion about a link to the page it sits on", async () => {
    linkRows = [
      row({
        source: "notion",
        source_id: `page:${C}`,
        body: `https://www.notion.so/Self-${flat(C)}`,
      }),
    ];
    pageStatus = { [C]: 404 };
    const r = await checkNotionReach(NOW);
    expect(r.checked).toBe(0);
    expect(r.linked).toBe(0);
  });
});
