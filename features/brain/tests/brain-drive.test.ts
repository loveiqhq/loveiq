import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@shared/http/google-oauth", () => ({
  getGoogleAccessToken: vi.fn(async () => "test-token"),
  isGoogleConfigured: () => true,
}));

const dbCalls: Array<{ path: string; method: string; body: string }> = [];
let existing: Array<{ source_id: string; meta: { edited: string; v?: number } }> = [];
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    dbCalls.push({ path, method, body: String(init?.body ?? "") });
    if (method === "GET" && path.includes("select=source_id,meta")) {
      const off = Number(/offset=(\d+)/.exec(path)?.[1] ?? 0);
      return { ok: true, headers: new Headers(), json: async () => (off === 0 ? existing : []) };
    }
    if (method === "PATCH") {
      const n = (path.match(/%22/g)?.length ?? 0) / 2;
      return { ok: true, headers: new Headers({ "content-range": `*/${n}` }), json: async () => [] };
    }
    if (method === "GET") {
      return { ok: true, headers: new Headers({ "content-range": "0-0/0" }), json: async () => [] };
    }
    return { ok: true, status: 201, headers: new Headers(), json: async () => [] };
  }),
}));

let files: unknown[] = [];
let exportBody = "Summary\n\nWe agreed to ship the paywall.";
let listOk = true;
let alwaysMorePages = false;
const httpCalls: string[] = [];
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string) => {
    httpCalls.push(url);
    if (url.includes("/files?q=")) {
      if (!listOk) return { ok: false, status: 403, text: async () => "denied" };
      // `alwaysMorePages` makes every page claim a successor, so the loop hits
      // MAX_PAGES with items in hand — an INCOMPLETE but non-empty listing, which
      // is the only state that reaches the sweep decision.
      return {
        ok: true,
        status: 200,
        json: async () => (alwaysMorePages ? { files, nextPageToken: "more" } : { files }),
        text: async () => "",
      };
    }
    if (url.includes("/export?")) {
      return { ok: true, status: 200, text: async () => "﻿" + exportBody.replace(/\n/g, "\r\n") };
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
  }),
}));

import { docToRows, ingestDrive } from "@features/brain/server/ingest/drive";

const STAMP = "2026-08-28T04:47:00.000Z";
const FILE = {
  id: "1AbCdEf",
  name: "Notes by Gemini — Marcus / Eman 26 Aug",
  mimeType: "application/vnd.google-apps.document",
  modifiedTime: "2026-08-26T14:05:00.000Z",
  createdTime: "2026-08-26T14:00:00.000Z",
  webViewLink: "https://docs.google.com/document/d/1AbCdEf/edit",
  owners: [{ emailAddress: "ec@loveiq.org" }],
};

describe("docToRows", () => {
  it("titles a Gemini note as MEETING NOTES, because the title feeds the search index", () => {
    // "Drive: LoveIQ Sync - … - Notes by Gemini" contains no word anyone would use
    // to ask for it, and the title is half of what brain_search matches on.
    const [row] = docToRows(FILE, "x", STAMP);
    expect(row.title.startsWith("Meeting notes:")).toBe(true);
    expect((row.meta as { kind: string }).kind).toBe("meeting-notes");
  });

  it("leaves an ordinary Drive document with the neutral prefix", () => {
    const [row] = docToRows({ ...FILE, name: "Q3 budget" }, "x", STAMP);
    expect(row.title).toBe("Drive: Q3 budget");
    expect((row.meta as { kind: string }).kind).toBe("drive-doc");
  });

  it("keeps the document title and its text, and links back to Drive", () => {
    const [row] = docToRows(FILE, "We agreed to ship the paywall.", STAMP);
    expect(row.source).toBe("drive");
    expect(row.source_id).toBe("doc:1AbCdEf");
    expect(row.title).toContain("Notes by Gemini");
    expect(row.body).toContain("We agreed to ship the paywall.");
    expect(row.url).toContain("docs.google.com");
  });

  it("dates the chunk from the last MODIFICATION, so today's note outranks March's", () => {
    expect(docToRows(FILE, "x", STAMP)[0].period_end).toBe("2026-08-26");
  });

  it("splits a long note instead of letting the write path cut its tail", () => {
    const long = Array.from({ length: 10 }, (_, i) => `Point ${i} ` + "y".repeat(400)).join("\n\n");
    const rows = docToRows(FILE, long, STAMP);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0].source_id).toBe("doc:1AbCdEf");
    expect(rows[1].source_id).toBe("doc:1AbCdEf#2");
    expect(rows.map((r) => r.body).join(" ")).toContain("Point 9");
    for (const r of rows) expect(r.body.length).toBeLessThanOrEqual(2400);
  });

  it("skips a document with no id or no name", () => {
    expect(docToRows({ ...FILE, id: undefined }, "x", STAMP)).toEqual([]);
    expect(docToRows({ ...FILE, name: "   " }, "x", STAMP)).toEqual([]);
  });
});

describe("ingestDrive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbCalls.length = 0;
    httpCalls.length = 0;
    existing = [];
    files = [FILE];
    listOk = true;
    alwaysMorePages = false;
  });

  it("strips the BOM and CRLFs that Google's text export adds", async () => {
    await ingestDrive(STAMP);
    const written = dbCalls
      .filter((c) => c.method !== "GET" && c.path.includes("on_conflict"))
      .flatMap((c) => JSON.parse(c.body) as Array<{ body: string }>);
    expect(written.length).toBe(1);
    expect(written[0].body).not.toContain("﻿");
    expect(written[0].body).not.toContain("\r");
    expect(written[0].body).toContain("We agreed to ship the paywall.");
  });

  it("reports NOTHING SHARED as a skip, not as an error or an empty success", async () => {
    // The service account sees only what somebody shared with it, so an empty list
    // on a fresh setup is the expected state. Treating it as a failure would fire
    // the ops alert nightly for a source nobody has enabled.
    files = [];
    const res = await ingestDrive(STAMP);
    expect(res.skipped).toBe("drive-nothing-shared");
    expect(res.rows).toBe(0);
    expect(res.swept).toBe(0);
  });

  it("distinguishes a FAILED listing from an empty one", async () => {
    files = [];
    listOk = false;
    expect((await ingestDrive(STAMP)).skipped).toBe("drive-list-failed");
  });

  it("does not re-export a document whose modifiedTime is unchanged", async () => {
    const v = (docToRows(FILE, "x", STAMP)[0].meta as { v: number }).v;
    existing = [{ source_id: "doc:1AbCdEf", meta: { edited: FILE.modifiedTime, v } }];
    await ingestDrive(STAMP);
    expect(httpCalls.filter((u) => u.includes("/export?"))).toHaveLength(0);
    expect(dbCalls.filter((c) => c.method === "PATCH").length).toBeGreaterThan(0);
  });

  it("re-exports when the document changed", async () => {
    const v = (docToRows(FILE, "x", STAMP)[0].meta as { v: number }).v;
    existing = [{ source_id: "doc:1AbCdEf", meta: { edited: "2026-08-01T00:00:00.000Z", v } }];
    await ingestDrive(STAMP);
    expect(httpCalls.filter((u) => u.includes("/export?")).length).toBeGreaterThan(0);
  });

  it("confirms continuation parts, so the sweep cannot delete them", async () => {
    const v = (docToRows(FILE, "x", STAMP)[0].meta as { v: number }).v;
    existing = [
      { source_id: "doc:1AbCdEf", meta: { edited: FILE.modifiedTime, v } },
      { source_id: "doc:1AbCdEf#2", meta: { edited: FILE.modifiedTime, v } },
    ];
    await ingestDrive(STAMP);
    const ids = dbCalls
      .filter((c) => c.method === "PATCH")
      .flatMap((c) => (decodeURIComponent(c.path).match(/"([^"]+)"/g) ?? []).map((q) => q.slice(1, -1)));
    expect(ids).toContain("doc:1AbCdEf#2");
  });

  it("DOES sweep when the listing was complete", async () => {
    // The control for the test below. Without it, "no sweep" proves nothing —
    // an earlier version of that test passed only because a failed listing
    // returns zero items and exits before the sweep is ever reached.
    files = [FILE];
    await ingestDrive(STAMP);
    expect(
      dbCalls.filter((c) => c.method === "GET" && c.path.includes("updated_at=lt.")).length
    ).toBeGreaterThan(0);
  });

  it("does NOT sweep when the listing was incomplete but returned documents", async () => {
    // A truncated listing makes existing documents look deleted. This needs a
    // non-empty result to reach the sweep decision at all, hence the paging mock.
    alwaysMorePages = true;
    files = [FILE];
    await ingestDrive(STAMP);
    expect(
      dbCalls.filter((c) => c.method === "GET" && c.path.includes("updated_at=lt."))
    ).toHaveLength(0);
  });

  it("asks Drive only for native Google Docs, which are the only exportable kind", async () => {
    await ingestDrive(STAMP);
    const list = httpCalls.find((u) => u.includes("/files?q="))!;
    expect(decodeURIComponent(list)).toContain("mimeType='application/vnd.google-apps.document'");
    expect(decodeURIComponent(list)).toContain("trashed=false");
  });
});
