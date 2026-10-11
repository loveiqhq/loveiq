/**
 * `design_changes` (features/brain/server/see/design-changes.ts): two saved versions of a
 * Figma design compared in one call, instead of a node-by-node walk that spends the whole
 * team's Figma allowance. Figma is a mocked fetch here and the cache a Map; the shapes are
 * the ones the live API returned on 2026-10-11.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const mockFetch = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...a: unknown[]) => mockFetch(...a),
}));
/** The shared cache every instance sees; `kvDown` makes it fail. */
const kv = new Map<string, unknown>();
const kvSets: Array<{ key: string; options: unknown }> = [];
const kvOptions: Array<Record<string, unknown>> = [];
let kvDown = false;
vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(options: Record<string, unknown>) {
      kvOptions.push(options);
    }
    async get(k: string) {
      if (kvDown) throw new Error("kv down");
      return kv.get(k) ?? null;
    }
    async set(k: string, v: unknown, options?: unknown) {
      if (kvDown) throw new Error("kv down");
      kv.set(k, v);
      kvSets.push({ key: k, options });
      return "OK";
    }
  },
}));
process.env.KV_REST_API_URL = "https://kv.test";
process.env.KV_REST_API_TOKEN = "kv-token";

import {
  designChanges,
  diffDesign,
  excerpt,
  renderChanges,
  sinceToMs,
  type DesignNode,
} from "@features/brain/server/see/design-changes";
import {
  figmaFetch,
  figmaNodeId,
  figmaTarget,
  parseFigmaLink,
} from "@features/brain/server/see/figma";

const KEY = "VpDMMtuN0JkxlMxQZDg86k";
const SINCE = sinceToMs("2026-10-04");

const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: new Headers(),
  text: async () => JSON.stringify(body),
});
const limited = (retryAfter: string) => ({
  ok: false,
  status: 429,
  headers: new Headers({ "retry-after": retryAfter, "x-figma-plan-tier": "pro" }),
  text: async () => '{"status":429}',
});
const version = (id: string, at: string, handle: string, label: string | null = null) => ({
  id,
  created_at: at,
  label,
  description: label ? "" : null,
  user: { handle, id: "u", img_url: "" },
  thumbnail_url: "",
});

/** Two pages of history, newest first, as Figma pages it: the second reached by `after`. */
const PAGE_1 = {
  versions: [
    version("v4", "2026-10-11T14:25:48Z", "Marcus Börner"),
    version("v3", "2026-10-10T13:41:44Z", "Marcus Börner"),
  ],
  pagination: { next_page: "https://api.figma.com/v1/files/x/versions?after=v3" },
};
const PAGE_2 = {
  versions: [
    version("v2", "2026-10-06T10:05:43Z", "Fatih Hadžić", "Ready for dev"),
    version("v1", "2026-10-03T10:52:47Z", "Sanjin"),
    version("v0", "2026-10-01T08:00:00Z", "Mark"),
  ],
  pagination: { next_page: "https://api.figma.com/v1/files/x/versions?after=v0" },
};

const OLD_PAGE: DesignNode = {
  id: "1:2",
  name: "Paygate",
  type: "CANVAS",
  children: [
    {
      id: "10:1",
      name: "Checkout",
      type: "FRAME",
      children: [
        { id: "10:2", name: "Price", type: "TEXT", characters: "Unlock for €9.99" },
        { id: "10:3", name: "Old badge", type: "TEXT", characters: "Old badge" },
        { id: "10:4", name: "Row", type: "FRAME", children: [] },
      ],
    },
    {
      id: "11:1",
      name: "Legacy",
      type: "FRAME",
      children: [{ id: "11:2", name: "x", type: "TEXT", characters: "x" }],
    },
  ],
};
const NEW_PAGE: DesignNode = {
  id: "1:2",
  name: "Paygate",
  type: "CANVAS",
  children: [
    {
      id: "10:1",
      name: "Checkout",
      type: "FRAME",
      children: [
        { id: "10:2", name: "Price", type: "TEXT", characters: "Unlock for €6.99" },
        { id: "10:4", name: "Price row", type: "FRAME", children: [] },
        {
          id: "10:5",
          name: "Badge",
          type: "FRAME",
          children: [
            { id: "10:6", name: "New", type: "TEXT", characters: "New" },
            { id: "10:7", name: "Hot", type: "TEXT", characters: "Hot" },
          ],
        },
      ],
    },
    { id: "12:1", name: "Forced Unlock", type: "FRAME", children: [] },
  ],
};

/** Figma, as far as these tests need it: the history and the page at each version. */
function figma(
  over: {
    versions?: (after: string | null) => unknown;
    read?: (version: string, url: string) => unknown;
  } = {}
) {
  mockFetch.mockImplementation(async (raw: string) => {
    const url = new URL(raw);
    if (url.pathname.endsWith("/versions")) {
      const after = url.searchParams.get("after");
      return over.versions ? over.versions(after) : ok(after === "v3" ? PAGE_2 : PAGE_1);
    }
    const v = url.searchParams.get("version") ?? "";
    if (over.read) return over.read(v, raw);
    return ok({
      name: "Report 3.0",
      nodes: { "1:2": { document: v === "v1" ? OLD_PAGE : NEW_PAGE } },
    });
  });
}
const calls = () => mockFetch.mock.calls.map(([u]) => String(u));
const run = (nodeId: string | null = "1:2", sinceMs = SINCE) =>
  designChanges({ fileKey: KEY, nodeId, sinceMs, sinceLabel: "2026-10-04" }, "figd_test");

beforeEach(() => {
  mockFetch.mockReset();
  kv.clear();
  kvSets.length = 0;
  kvDown = false;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("reading a Figma link", () => {
  it("takes the file key and node-id from a /design/ link", () => {
    expect(
      parseFigmaLink(`https://www.figma.com/design/${KEY}/Report-3.0?node-id=195-234&t=AbC-0`)
    ).toEqual({ fileKey: KEY, nodeId: "195:234" });
  });

  it("reads /file/ links, an encoded colon, and a link pasted without its scheme", () => {
    expect(
      parseFigmaLink(
        "https://www.figma.com/file/IdxyUUVvJSYRTpI9CYRtJI/LoveIQ?node-id=11600%3A15119"
      )
    ).toEqual({ fileKey: "IdxyUUVvJSYRTpI9CYRtJI", nodeId: "11600:15119" });
    expect(parseFigmaLink(`figma.com/design/${KEY}`)).toEqual({ fileKey: KEY, nodeId: null });
    expect(parseFigmaLink(`https://www.figma.com/proto/${KEY}/R?node-id=1-2`)?.nodeId).toBe("1:2");
  });

  it("uses a branch's own key, which is the one the API knows", () => {
    expect(
      parseFigmaLink(
        `https://www.figma.com/design/${KEY}/branch/BrAnCh1234567890ab/Report?node-id=1-2`
      )
    ).toEqual({ fileKey: "BrAnCh1234567890ab", nodeId: "1:2" });
  });

  it("reads a layer inside an instance", () => {
    expect(figmaNodeId("I5666-180910;1-49")).toBe("I5666:180910;1:49");
    expect(
      parseFigmaLink(`https://figma.com/design/${KEY}/R?node-id=I5666-180910%3B1-49`)?.nodeId
    ).toBe("I5666:180910;1:49");
  });

  it("refuses what is not a Figma file link rather than guessing", () => {
    expect(parseFigmaLink(`https://evil.example/design/${KEY}/R`)).toBeNull();
    expect(parseFigmaLink("https://www.figma.com/files/recent")).toBeNull();
    expect(parseFigmaLink(`https://www.figma.com/design/${KEY}/R?node-id=home`)).toBeNull();
  });

  it("lets a plain node id beat the link's node-id, and refuses links to two files", () => {
    const link = `https://www.figma.com/design/${KEY}/R?node-id=195-234`;
    expect(figmaTarget(link, "1-2")).toEqual({ fileKey: KEY, nodeId: "1:2" });
    expect(figmaTarget(link, "")).toEqual({ fileKey: KEY, nodeId: "195:234" });
    expect(figmaTarget("", link)).toEqual({ fileKey: KEY, nodeId: "195:234" });
    expect(figmaTarget(KEY, "")).toEqual({ fileKey: KEY, nodeId: null });
    expect(
      figmaTarget(link, "https://www.figma.com/design/IdxyUUVvJSYRTpI9CYRtJI/LoveIQ?node-id=1-2")
    ).toHaveProperty("error");
    expect(figmaTarget("../../me", "")).toHaveProperty("error");
    expect(figmaTarget(KEY, "frame one")).toHaveProperty("error");
  });
});

describe("the comparison", () => {
  it("finds what was added, removed, renamed and rewritten", () => {
    const { changes } = diffDesign(OLD_PAGE, NEW_PAGE, true);
    expect(changes.map((c) => `${c.kind} ${c.id}`).sort()).toEqual([
      "added 10:5",
      "added 12:1",
      "removed 10:3",
      "removed 11:1",
      "renamed 10:4",
      "text 10:2",
    ]);
    const text = changes.find((c) => c.kind === "text")!;
    expect([text.was, text.name]).toEqual(["Unlock for €9.99", "Unlock for €6.99"]);
    expect(changes.find((c) => c.kind === "renamed")).toMatchObject({
      was: "Row",
      name: "Price row",
    });
  });

  it("lists only the outermost new layer, counting the text layers inside it", () => {
    const { changes } = diffDesign(OLD_PAGE, NEW_PAGE, true);
    // The two text layers inside the new "Badge" frame are part of it, not changes of their own.
    expect(changes.some((c) => c.id === "10:6" || c.id === "10:7")).toBe(false);
    expect(changes.find((c) => c.id === "10:5")?.texts).toBe(2);
    expect(changes.find((c) => c.id === "11:1")?.texts).toBe(1);
  });

  it("follows an instance's own text but not the layers its component brings and takes away", () => {
    const instance = (texts: DesignNode[], name = "Button/Primary"): DesignNode => ({
      id: "1:2",
      type: "FRAME",
      name: "Screen",
      children: [{ id: "20:1", type: "INSTANCE", name, children: texts }],
    });
    const before = instance([
      { id: "I20:1;5:1", type: "TEXT", name: "Label", characters: "Buy" },
      { id: "I20:1;5:3", type: "TEXT", name: "Gone", characters: "Gone" },
    ]);
    const after = instance(
      [
        { id: "I20:1;5:1", type: "TEXT", name: "Label renamed", characters: "Buy now" },
        { id: "I20:1;5:2", type: "TEXT", name: "Came", characters: "Came" },
      ],
      "Button/Secondary"
    );
    expect(diffDesign(before, after, true).changes.map((c) => `${c.kind} ${c.id}`)).toEqual([
      "renamed 20:1",
      "text I20:1;5:1",
    ]);
  });

  it("leaves text out of a whole-file comparison and counts shapes without listing them", () => {
    const before: DesignNode = {
      id: "0:0",
      type: "DOCUMENT",
      children: [
        {
          id: "0:1",
          type: "CANVAS",
          name: "Report",
          children: [{ id: "3:1", type: "TEXT", name: "Note", characters: "old" }],
        },
      ],
    };
    const after: DesignNode = {
      id: "0:0",
      type: "DOCUMENT",
      children: [
        {
          id: "0:1",
          type: "CANVAS",
          name: "Report v2",
          children: [
            { id: "3:1", type: "TEXT", name: "Note", characters: "new" },
            { id: "3:2", type: "TEXT", name: "Added note", characters: "added" },
            { id: "3:3", type: "RECTANGLE", name: "image 14" },
          ],
        },
      ],
    };
    expect(diffDesign(before, after, false)).toEqual({
      changes: [expect.objectContaining({ kind: "renamed", id: "0:1", name: "Report v2" })],
      others: 1,
    });
  });

  it("says it grouped by page and frame, with links, and the same change once", () => {
    expect(renderChanges(KEY, diffDesign(OLD_PAGE, NEW_PAGE, true), true)).toBe(
      [
        "6 changes: 2 added, 2 removed, 1 renamed, 1 text layer rewritten.",
        "",
        'Page "Paygate"',
        `  added frame "Forced Unlock" https://www.figma.com/design/${KEY}?node-id=12-1`,
        '  removed frame "Legacy" with 1 text layer',
        `  in frame "Checkout" https://www.figma.com/design/${KEY}?node-id=10-1`,
        '    text "Unlock for €9.99" → "Unlock for €6.99"',
        '    renamed frame "Row" → "Price row"',
        '    added frame "Badge" with 2 text layers',
        '    removed text "Old badge"',
      ].join("\n")
    );
  });

  it("puts pages added or removed before the pages' own lists", () => {
    const doc = (pages: DesignNode[]): DesignNode => ({
      id: "0:0",
      type: "DOCUMENT",
      children: pages,
    });
    const report = (frames: DesignNode[]): DesignNode => ({
      id: "0:1",
      type: "CANVAS",
      name: "Report",
      children: frames,
    });
    const text = renderChanges(
      KEY,
      diffDesign(
        doc([report([])]),
        doc([
          report([{ id: "5:1", type: "FRAME", name: "Hero" }]),
          { id: "9:1", type: "CANVAS", name: "Rating", children: [] },
        ]),
        false
      ),
      false
    );
    expect(text.indexOf('added page "Rating"')).toBeGreaterThan(0);
    expect(text.indexOf('added page "Rating"')).toBeLessThan(text.indexOf('Page "Report"'));
  });

  it("caps long lists and says how many more there are", () => {
    const frame = (i: number, texts: string[]): DesignNode => ({
      id: `${i}:1`,
      type: "FRAME",
      name: `Screen ${i}`,
      children: texts.map((t, j) => ({
        id: `${i}:${j + 2}`,
        type: "TEXT",
        name: t,
        characters: t,
      })),
    });
    const page = (frames: DesignNode[]): DesignNode => ({
      id: "1:2",
      type: "CANVAS",
      name: "P",
      children: frames,
    });
    // One frame with twelve copies of one change and twenty distinct ones; forty more frames.
    const before = page([
      frame(100, [...Array(12).fill("Buy"), ...Array.from({ length: 20 }, (_, k) => `a${k}`)]),
      ...Array.from({ length: 40 }, (_, i) => frame(i + 200, ["x", "y", "z", "w", "v"])),
    ]);
    const after = page([
      frame(100, [...Array(12).fill("Buy now"), ...Array.from({ length: 20 }, (_, k) => `b${k}`)]),
      ...Array.from({ length: 40 }, (_, i) => frame(i + 200, ["X", "Y", "Z", "W", "V"])),
    ]);
    const text = renderChanges(KEY, diffDesign(before, after, true), true);
    expect(text).toContain('text "Buy" → "Buy now" (×12)');
    expect(text).toContain("…and 13 more, not listed.");
    expect(text).toMatch(/…and changes inside \d+ more frames, not listed\./);
    expect(text.split("\n").length).toBeLessThan(200);
  });

  it("cuts a long text to the part that changed", () => {
    const long = "This report is not medical advice and it is not therapy. ".repeat(4);
    const [was, now] = excerpt(`${long}Unlock for €9.99 today.`, `${long}Unlock for €6.99 today.`);
    expect(was).toBe("…t is not therapy. Unlock for €9.99 today.");
    expect(now).toBe("…t is not therapy. Unlock for €6.99 today.");
  });
});

describe("designChanges, against a mocked Figma", () => {
  it("pages the history with `after` and compares the right two versions", async () => {
    figma();
    const out = await run();
    expect(out.isError).toBe(false);
    expect(calls()).toEqual([
      `https://api.figma.com/v1/files/${KEY}/versions?page_size=50`,
      `https://api.figma.com/v1/files/${KEY}/versions?page_size=50&after=v3`,
      `https://api.figma.com/v1/files/${KEY}/nodes?ids=1%3A2&version=v1`,
      `https://api.figma.com/v1/files/${KEY}/nodes?ids=1%3A2&version=v4`,
    ]);
    expect(out.text).toContain(
      "the version saved 2026-10-03 10:52 UTC by Sanjin against the newest, saved 2026-10-11 14:25 UTC by Marcus Börner"
    );
    expect(out.text).toContain('text "Unlock for €9.99" → "Unlock for €6.99"');
  });

  it("says who saved each version, with its label", async () => {
    figma();
    const { text } = await run();
    expect(text).toContain(
      "Saved between the two: 3 versions (Marcus Börner 2, Fatih Hadžić 1), newest first:"
    );
    expect(text).toContain("  2026-10-11 14:25 UTC  Marcus Börner\n");
    expect(text).toContain('  2026-10-06 10:05 UTC  Fatih Hadžić  "Ready for dev"');
    // Version v1 is the older side of the comparison, not a save between the two.
    expect(text).not.toMatch(/Sanjin \d/);
  });

  it("reads nothing more when nothing was saved since", async () => {
    figma();
    const out = await run("1:2", sinceToMs("2026-10-12"));
    expect(out.text).toContain("Nothing in the Figma file");
    expect(out.text).toContain("saved 2026-10-11 14:25 UTC by Marcus Börner");
    expect(calls()).toHaveLength(1);
  });

  it("says so when the history read stops before `since`", async () => {
    const page = (after: string | null) => {
      const n = after === null ? 0 : Number(after.slice(1));
      return ok({
        versions: Array.from({ length: 50 }, (_, i) =>
          version(
            `p${n + i + 1}`,
            new Date(Date.parse("2026-10-11T00:00:00Z") - (n + i) * 60_000).toISOString(),
            "Mark"
          )
        ),
        pagination: { next_page: "more" },
      });
    };
    figma({ versions: page });
    const out = await run("1:2", sinceToMs("2026-01-01"));
    expect(calls().filter((u) => u.includes("/versions"))).toHaveLength(6);
    expect(out.text).toContain("Only the newest 300 versions were read");
  });

  it("compares a whole file a few levels deep, without its text", async () => {
    const doc = (name: string): DesignNode => ({
      id: "0:0",
      type: "DOCUMENT",
      children: [{ id: "0:1", type: "CANVAS", name, children: [] }],
    });
    figma({
      read: (v) => ok({ name: "Report 3.0", document: doc(v === "v1" ? "Report" : "Report v2") }),
    });
    const out = await run(null);
    expect(calls()[2]).toBe(`https://api.figma.com/v1/files/${KEY}?version=v1&depth=3`);
    expect(out.text).toContain('renamed page "Report" → "Report v2"');
    expect(out.text).toContain("Not compared: text (ask about one page or frame for it)");
  });

  it("names a node that is in neither version, and where to look instead", async () => {
    figma({ read: () => ok({ name: "Report 3.0", nodes: { "1:2": null } }) });
    const out = await run();
    expect(out.isError).toBe(true);
    expect(out.text).toContain("more than one file");
  });

  it("calls a node made after `since` new rather than failing", async () => {
    figma({
      read: (v) =>
        ok({ name: "Report 3.0", nodes: { "1:2": v === "v1" ? null : { document: NEW_PAGE } } }),
    });
    const out = await run();
    expect(out.isError).toBe(false);
    expect(out.text).toContain("which is new since then");
    expect(out.text).toContain('added page "Paygate"');
  });
});

describe("the cache", () => {
  it("answers the same two versions again without reading the design", async () => {
    figma();
    const first = await run();
    expect(kvSets).toEqual([
      { key: `jarvis:design-changes:v1:${KEY}:v1:v4:1:2`, options: { ex: 86_400 } },
    ]);
    mockFetch.mockClear();
    const second = await run();
    expect(calls().every((u) => u.includes("/versions"))).toBe(true);
    expect(second.text).toBe(first.text);
  });

  it("keeps one node's comparison apart from another's", async () => {
    figma();
    await run("1:2");
    figma({ read: () => ok({ name: "Report 3.0", nodes: { "7:7": { document: NEW_PAGE } } }) });
    mockFetch.mockClear();
    await run("7:7");
    expect(calls().some((u) => u.includes("ids=7%3A7"))).toBe(true);
  });

  it("asks the cache once and never retries it", async () => {
    figma();
    await run();
    // `retry: false` would still try twice in @upstash/redis 1.39.
    expect(kvOptions[0]).toMatchObject({ retry: { retries: 0 } });
  });

  it("still answers when the cache is down", async () => {
    kvDown = true;
    figma();
    const out = await run();
    expect(out.isError).toBe(false);
    expect(out.text).toContain('added frame "Forced Unlock"');
  });
});

describe("Figma's rate limit", () => {
  it("waits out a short Retry-After once, then compares", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let limitedOnce = false;
    figma({
      read: (v) => {
        if (v === "v1" && !limitedOnce) {
          limitedOnce = true;
          return limited("2");
        }
        return ok({
          name: "Report 3.0",
          nodes: { "1:2": { document: v === "v1" ? OLD_PAGE : NEW_PAGE } },
        });
      },
    });
    const pending = run();
    await vi.advanceTimersByTimeAsync(2_000);
    const out = await pending;
    expect(out.isError).toBe(false);
    expect(calls().filter((u) => u.includes("version=v1"))).toHaveLength(2);
  });

  it("retries once, never twice", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    figma({
      read: (v) => (v === "v1" ? limited("1") : ok({ nodes: { "1:2": { document: NEW_PAGE } } })),
    });
    const pending = run();
    await vi.advanceTimersByTimeAsync(5_000);
    const out = await pending;
    expect(calls().filter((u) => u.includes("version=v1"))).toHaveLength(2);
    expect(out.isError).toBe(true);
    expect(out.text).toContain("it asks us to wait 1 s");
  });

  it("does not wait out a long Retry-After, and still says who saved what", async () => {
    figma({
      read: (v) => (v === "v1" ? limited("120") : ok({ nodes: { "1:2": { document: NEW_PAGE } } })),
    });
    const out = await run();
    expect(calls().filter((u) => u.includes("version=v1"))).toHaveLength(1);
    expect(out.isError).toBe(true);
    expect(out.text).toContain("it asks us to wait 120 s (plan tier: pro)");
    expect(out.text).toContain("Saved between the two: 3 versions");
  });

  it("does not wait for a retry it has no time left to make", async () => {
    mockFetch.mockResolvedValueOnce(limited("5"));
    const res = await figmaFetch(
      "https://api.figma.com/v1/files/k",
      { timeoutMs: 40_000 },
      Date.now() + 3_000
    );
    expect(res.status).toBe(429);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("gives the retry only the time that is left", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mockFetch.mockResolvedValueOnce(limited("2")).mockResolvedValueOnce(ok({}));
    const pending = figmaFetch(
      "https://api.figma.com/v1/files/k",
      { timeoutMs: 40_000 },
      Date.now() + 20_000
    );
    await vi.advanceTimersByTimeAsync(2_000);
    await pending;
    const retry = mockFetch.mock.calls[1]![1] as { timeoutMs: number };
    expect(retry.timeoutMs).toBeGreaterThan(0);
    expect(retry.timeoutMs).toBeLessThanOrEqual(18_000);
  });

  it("tells a wrong file key from an outage", async () => {
    figma({
      versions: () => ({ ok: false, status: 404, headers: new Headers(), text: async () => "" }),
    });
    const out = await run();
    expect(out.isError).toBe(true);
    expect(out.text).toContain("Figma has no file");
  });

  it("calls a design too big to arrive in time too big, and says what to ask for", async () => {
    figma({
      read: () => {
        throw new Error("Request timeout after 40000ms: https://api.figma.com/v1/files/k/nodes");
      },
    });
    const out = await run();
    expect(out.isError).toBe(true);
    expect(out.text).toContain("too big to compare in one call");
    expect(out.text).toContain("show_design with this node lists its frames");
  });
});
