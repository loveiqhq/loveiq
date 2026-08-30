import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let delegatedToken: string | null = "delegated-token";
const delegatedFor: string[] = [];
vi.mock("@shared/http/google-oauth", () => ({
  DRIVE_SCOPE: "drive",
  getGoogleAccessToken: vi.fn(async () => "test-token"),
  getDelegatedToken: vi.fn(async (subject: string) => {
    delegatedFor.push(subject);
    return delegatedToken;
  }),
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
      return {
        ok: true,
        headers: new Headers({ "content-range": `*/${n}` }),
        json: async () => [],
      };
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
let targets: Record<string, unknown> = {};
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
    // single-file metadata GET, which is how a shortcut's TARGET is resolved
    const meta = /\/files\/([^?]+)\?fields=id,name/.exec(url);
    if (meta) {
      const target = targets[decodeURIComponent(meta[1])];
      return target
        ? { ok: true, status: 200, json: async () => target, text: async () => "" }
        : { ok: false, status: 404, text: async () => '{"error":"File not found"}' };
    }
    // alt=media download: bytes for a pdf, text for everything else
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => "",
      arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer,
    };
  }),
}));

// unpdf is stubbed rather than fed a real pdf: this test is about what the
// ingester DOES with extracted text, not about whether pdfjs can parse.
let pdfText = "";
vi.mock("unpdf", () => ({
  getDocumentProxy: vi.fn(async () => ({})),
  extractText: vi.fn(async () => ({ totalPages: 1, text: pdfText })),
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
    targets = {};
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
      .flatMap((c) =>
        (decodeURIComponent(c.path).match(/"([^"]+)"/g) ?? []).map((q) => q.slice(1, -1))
      );
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

describe("Google Meet shortcuts", () => {
  const SHORTCUT = {
    id: "sc1",
    name: "60 min with Mark - 2026/08/22 - Notes by Gemini",
    mimeType: "application/vnd.google-apps.shortcut",
    modifiedTime: "2026-08-22T11:00:00.000Z",
    shortcutDetails: {
      targetId: "tgt1",
      targetMimeType: "application/vnd.google-apps.document",
    },
  };
  const VIDEO_SHORTCUT = {
    id: "sc2",
    name: "60 min with Mark - recording",
    mimeType: "application/vnd.google-apps.shortcut",
    shortcutDetails: { targetId: "vid1", targetMimeType: "video/mp4" },
  };

  beforeEach(() => {
    dbCalls.length = 0;
    httpCalls.length = 0;
    existing = [];
    listOk = true;
    alwaysMorePages = false;
    targets = {};
    process.env.NOTION_TOKEN = "ntn_test";
  });

  function written() {
    return dbCalls
      .filter((c) => c.method !== "GET" && c.path.includes("on_conflict"))
      .flatMap((c) => JSON.parse(c.body) as Array<{ source_id: string; title: string }>);
  }

  it("follows a shortcut to a readable document, which a Docs-only query misses", async () => {
    // Meet drops a SHORTCUT when the meeting was organised by someone else. In the
    // real folder, three of four meeting series held only shortcuts — so querying
    // for documents alone found 23 of 24 available notes.
    files = [SHORTCUT];
    targets = {
      tgt1: {
        id: "tgt1",
        name: "60 min with Mark - 2026/08/22 - Notes by Gemini",
        mimeType: "application/vnd.google-apps.document",
        modifiedTime: "2026-08-22T11:05:00.000Z",
        webViewLink: "https://docs.google.com/document/d/tgt1/edit",
      },
    };
    await ingestDrive(STAMP);
    const rows = written();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].source_id).toBe("doc:tgt1");
    expect(rows[0].title.startsWith("Meeting notes:")).toBe(true);
  });

  it("dates the chunk from the TARGET, not the pointer", async () => {
    // A shortcut's own modifiedTime tracks the pointer, so using it would mean an
    // edited note never looks changed.
    files = [SHORTCUT];
    targets = {
      tgt1: {
        id: "tgt1",
        name: "note",
        mimeType: "application/vnd.google-apps.document",
        modifiedTime: "2026-08-24T09:00:00.000Z",
      },
    };
    await ingestDrive(STAMP);
    const rows = dbCalls
      .filter((c) => c.method !== "GET" && c.path.includes("on_conflict"))
      .flatMap((c) => JSON.parse(c.body) as Array<{ period_end: string }>);
    expect(rows[0].period_end).toBe("2026-08-24");
  });

  it("treats an unreadable target as normal, not as a failure", async () => {
    // The note lives in the organiser's Drive and they have not shared it. That is
    // the expected state, so the run must still succeed and must not sweep-delete
    // anything.
    files = [SHORTCUT];
    targets = {}; // 404
    const res = await ingestDrive(STAMP);
    expect(res.skipped).toBe("drive-nothing-shared");
    expect(written()).toHaveLength(0);
  });

  it("skips a shortcut pointing at a video without trying to export it", async () => {
    files = [VIDEO_SHORTCUT];
    await ingestDrive(STAMP);
    expect(httpCalls.filter((u) => u.includes("/export?"))).toHaveLength(0);
    expect(httpCalls.filter((u) => u.includes("/files/vid1"))).toHaveLength(0);
  });

  it("does not re-fetch a target that is already visible directly", async () => {
    // NOT about duplicate rows: `upsertChunks` dedupes by (source, source_id), so a
    // duplicate would be collapsed at the write path and the row count proves
    // nothing — an earlier version of this test passed with the guard deleted for
    // exactly that reason. What the guard actually saves is a pointless HTTP
    // request per shortcut whose target we already have.
    files = [
      FILE,
      {
        ...SHORTCUT,
        shortcutDetails: {
          targetId: FILE.id,
          targetMimeType: "application/vnd.google-apps.document",
        },
      },
    ];
    targets = { [FILE.id]: { ...FILE } };
    await ingestDrive(STAMP);
    expect(httpCalls.filter((u) => u.includes(`/files/${FILE.id}?fields=id,name`))).toHaveLength(0);
    // and it is still indexed exactly once
    expect(written().filter((r) => r.source_id === `doc:${FILE.id}`)).toHaveLength(1);
  });
});

describe("PDFs — the 213 files that used to be invisible", () => {
  const PDF = {
    id: "pdf1",
    name: "Term Sheet 2026",
    mimeType: "application/pdf",
    modifiedTime: "2026-08-26T14:05:00.000Z",
    createdTime: "2026-08-26T14:00:00.000Z",
    webViewLink: "https://drive.google.com/file/d/pdf1/view",
    owners: [{ emailAddress: "ec@loveiq.org" }],
  };

  beforeEach(() => {
    files = [PDF];
    existing = [];
    dbCalls.length = 0;
    httpCalls.length = 0;
    listOk = true;
    alwaysMorePages = false;
    targets = {};
  });

  it("asks Drive for PDFs at all — they were absent from the listing query", async () => {
    // Everything else is downstream of this: if the `q` does not name the mime
    // type, no PDF is ever seen, and the ingester looks like it works.
    pdfText = "some real text ".repeat(40);
    await ingestDrive(STAMP, () => false, null);
    const listing = httpCalls.find((u) => u.includes("/files?q="));
    expect(decodeURIComponent(listing ?? "")).toContain("mimeType='application/pdf'");
  });

  it("indexes the text layer of a real pdf", async () => {
    pdfText = "Investors agree to a EUR 2m SAFE at a 12m cap. ".repeat(10);
    await ingestDrive(STAMP, () => false, null);
    const written = dbCalls
      .filter((c) => c.method === "POST")
      .map((c) => c.body)
      .join(" ");
    expect(written).toContain("SAFE at a 12m cap");
    expect(written).toContain("Term Sheet 2026");
  });

  /**
   * A scanned contract has no text layer. Extracting it yields a few stray
   * characters, and indexing that produces a chunk whose only real content is its
   * own title — which then matches questions it cannot answer. There is no OCR
   * here, so the honest thing is to skip it.
   */
  it("skips a scan with no text layer rather than indexing an empty husk", async () => {
    pdfText = "  \n page 1 \n ";
    await ingestDrive(STAMP, () => false, null);
    const written = dbCalls
      .filter((c) => c.method === "POST")
      .map((c) => c.body)
      .join(" ");
    expect(written).not.toContain("Term Sheet 2026");
  });

  it("caps one pdf, and says so in the text rather than truncating silently", async () => {
    pdfText = "word ".repeat(200_000); // ~1M chars, larger than the cap
    await ingestDrive(STAMP, () => false, null);
    const written = dbCalls
      .filter((c) => c.method === "POST")
      .map((c) => c.body)
      .join(" ");
    expect(written).toContain("[truncated: this pdf is longer than the brain indexes]");
  });
});

describe("Drive reads as a PERSON, not as the service account", () => {
  beforeEach(() => {
    files = [FILE];
    existing = [];
    dbCalls.length = 0;
    httpCalls.length = 0;
    delegatedFor.length = 0;
    delegatedToken = "delegated-token";
    listOk = true;
    alwaysMorePages = false;
    targets = {};
    exportBody = "Summary\n\nWe agreed to ship the paywall.";
    delete process.env.GOOGLE_WORKSPACE_ADMIN;
  });

  /**
   * The whole point. As its own identity the service account sees only what has been
   * explicitly shared with it — measured in production on 2026-08-30, TWENTY-FOUR
   * documents against 512 for a person. The other ~11,000 chunks came from a one-off
   * local run and every production run since was saved from deleting them only by
   * the sweep's majority guard.
   */
  it("impersonates the workspace admin when one is configured", async () => {
    process.env.GOOGLE_WORKSPACE_ADMIN = "ec@loveiq.org";
    await ingestDrive(STAMP, () => false, null);
    expect(delegatedFor).toContain("ec@loveiq.org");
  });

  it("falls back to the service account when impersonation fails, so it is never WORSE", async () => {
    process.env.GOOGLE_WORKSPACE_ADMIN = "ec@loveiq.org";
    delegatedToken = null;
    const result = await ingestDrive(STAMP, () => false, null);
    // still ingested, using the old identity
    expect(result.skipped).not.toBe("google-token-unavailable");
    expect(httpCalls.some((u) => u.includes("/files?q="))).toBe(true);
  });

  it("does not attempt impersonation when no admin is configured", async () => {
    await ingestDrive(STAMP, () => false, null);
    expect(delegatedFor).toHaveLength(0);
  });
});
