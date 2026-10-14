import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * New meeting notes every ten minutes, ahead of the hourly Drive walk.
 *
 * Measured 2026-10-11: notes reached Jarvis 29-62 minutes after Gemini wrote them, because
 * the hourly walk was their only reader. This check must write a note exactly as the walk
 * would, read it as the walk would, skip what the walk skips, and never delete anything.
 */

const mailboxes: { value: string[] | null } = { value: [] };
vi.mock("@features/brain/server/ingest/gmail", () => ({
  domainMailboxes: vi.fn(async () => mailboxes.value),
}));

const refuseToken = new Set<string>();
vi.mock("@shared/http/google-oauth", () => ({
  DRIVE_SCOPE: "drive",
  getGoogleAccessToken: vi.fn(async () => "sa-token"),
  getDelegatedToken: vi.fn(async (subject: string) =>
    refuseToken.has(subject) ? null : `tok:${subject}`
  ),
  isGoogleConfigured: () => true,
  googleCredentialShape: () => "test",
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@features/brain/server/people", () => ({
  loadPeople: vi.fn(async () => null),
  peopleIn: vi.fn(() => undefined),
}));

/** What the brain already holds, by source_id. */
const stored = new Map<string, { edited: string; v: string }>();
const upserted: Array<Record<string, unknown>> = [];
const dbCalls: Array<{ path: string; method: string }> = [];
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async (path: string, init?: RequestInit) => {
    dbCalls.push({ path, method: init?.method ?? "GET" });
    if (init?.method === "POST") {
      upserted.push(...(JSON.parse(String(init.body)) as Array<Record<string, unknown>>));
      return new Response(null, { status: 201 });
    }
    const decoded = decodeURIComponent(path);
    if (decoded.includes("select=source_id,edited:meta->>edited")) {
      const ids = [...decoded.matchAll(/"(doc:[^"]+)"/g)].map((m) => m[1]!);
      const rows = ids
        .filter((id) => stored.has(id))
        .map((id) => ({ source_id: id, edited: stored.get(id)!.edited, v: stored.get(id)!.v }));
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    return new Response("[]", { status: 200 });
  }),
}));

interface File {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime: string;
  createdTime?: string;
  properties?: Record<string, string>;
}
/** Drive listings by whose they are: "" is the walk's own login, else the owner queried. */
const drive: Record<string, File[]> = {};
const text: Record<string, string> = {};
const listings: string[] = [];
const reads: Array<{ id: string; auth: string }> = [];
const exportCheck = { fails: false };

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
    const auth = init?.headers?.Authorization ?? "";
    const decoded = decodeURIComponent(url);
    const exported = /\/files\/([^/?]+)\/export/.exec(url);
    if (exported) {
      reads.push({ id: exported[1]!, auth });
      return new Response(text[exported[1]!] ?? "", { status: 200 });
    }
    if (decoded.includes("properties has")) {
      if (exportCheck.fails) return new Response("no", { status: 500 });
      return new Response(JSON.stringify({ files: [] }), { status: 200 });
    }
    listings.push(decoded);
    const owner = decoded.match(/'([^']+)' in owners/)?.[1] ?? "";
    return new Response(JSON.stringify({ files: drive[owner] ?? [] }), { status: 200 });
  }),
}));

import {
  docToRows,
  DRIVE_BUILDER_VERSION,
  ingestFreshMeetingNotes,
} from "@features/brain/server/ingest/drive";

const NOW = Date.parse("2026-10-14T09:20:00Z");
const STAMP = "2026-10-14T09:20:00.000Z";
const SYNC = "LoveIQ Sync - 2026/10/14 09:00 CEST - Notes by Gemini";
const CALL = "Ajna <> Mark - Catch Up - 2026/10/14 08:30 WEST - Notes by Gemini";
const NOTE_TEXT =
  "Summary\nThe team agreed to ship the pricing test.\n\n" +
  "You should review Gemini's notes to make sure they're accurate.\n\nTranscript\nhello";

const note = (id: string, name: string, modifiedTime = "2026-10-14T07:25:00.000Z"): File => ({
  id,
  name,
  mimeType: "application/vnd.google-apps.document",
  modifiedTime,
  createdTime: "2026-10-14T07:10:00.000Z",
});

const run = (isOutOfTime: () => boolean = () => false) =>
  ingestFreshMeetingNotes(STAMP, isOutOfTime, null, NOW);

beforeEach(() => {
  process.env.GOOGLE_WORKSPACE_ADMIN = "ec@loveiq.org";
  mailboxes.value = [];
  refuseToken.clear();
  stored.clear();
  upserted.length = 0;
  dbCalls.length = 0;
  listings.length = 0;
  reads.length = 0;
  exportCheck.fails = false;
  for (const k of Object.keys(drive)) delete drive[k];
  for (const k of Object.keys(text)) delete text[k];
});

describe("ingestFreshMeetingNotes", () => {
  it("asks Drive only for Gemini notes changed in the last three hours", async () => {
    mailboxes.value = ["mo@loveiq.org"];
    await run();
    expect(listings).toHaveLength(2);
    for (const q of listings) {
      expect(q).toContain("mimeType='application/vnd.google-apps.document'");
      expect(q).toContain("trashed=false");
      expect(q).toContain("modifiedTime > '2026-10-14T06:20:00.000Z'");
      expect(q).toContain("name contains 'Notes by Gemini'");
    }
    expect(listings.filter((q) => q.includes("'mo@loveiq.org' in owners"))).toHaveLength(1);
  });

  it("writes a new note exactly as the hourly walk builds it", async () => {
    drive[""] = [note("n1", SYNC)];
    text.n1 = NOTE_TEXT;
    const r = await run();
    const expected = docToRows(note("n1", SYNC) as never, NOTE_TEXT, STAMP);
    expect(upserted.map((row) => row.source_id)).toEqual(expected.map((row) => row.source_id));
    expect(upserted[0]).toMatchObject({
      title: expected[0]!.title,
      body: expected[0]!.body,
      meta: expected[0]!.meta as Record<string, unknown>,
      period_end: "2026-10-14",
    });
    expect(upserted[0]!.meta).toMatchObject({
      kind: "meeting-notes",
      edited: "2026-10-14T07:25:00.000Z",
      v: DRIVE_BUILDER_VERSION,
      at: "2026-10-14T07:25:00.000Z",
    });
    expect(r.rows).toBe(expected.length);
    expect(r.detail).toMatch(/notes=1 stale=1 written=/);
  });

  it("leaves a note alone that is stored at its current edit and builder", async () => {
    drive[""] = [note("n1", SYNC)];
    stored.set("doc:n1", { edited: "2026-10-14T07:25:00.000Z", v: String(DRIVE_BUILDER_VERSION) });
    const r = await run();
    expect(reads).toEqual([]);
    expect(upserted).toEqual([]);
    expect(r.detail).toMatch(/notes=1 stale=0 written=0/);
  });

  it("reads a note again once it has been edited since it was stored", async () => {
    drive[""] = [note("n1", SYNC, "2026-10-14T09:05:00.000Z")];
    stored.set("doc:n1", { edited: "2026-10-14T07:25:00.000Z", v: String(DRIVE_BUILDER_VERSION) });
    text.n1 = NOTE_TEXT;
    await run();
    expect(reads.map((r) => r.id)).toEqual(["n1"]);
    expect(upserted[0]!.meta).toMatchObject({ edited: "2026-10-14T09:05:00.000Z" });
  });

  it("reads a note again when it was stored by an older builder", async () => {
    drive[""] = [note("n1", SYNC)];
    stored.set("doc:n1", {
      edited: "2026-10-14T07:25:00.000Z",
      v: String(DRIVE_BUILDER_VERSION - 1),
    });
    text.n1 = NOTE_TEXT;
    await run();
    expect(reads.map((r) => r.id)).toEqual(["n1"]);
  });

  /** Mark's calls are in his Drive alone: 7 of the last 12 notes on 2026-10-14. */
  it("reads a colleague's note with the colleague's own login", async () => {
    mailboxes.value = ["mo@loveiq.org"];
    drive["mo@loveiq.org"] = [note("m1", CALL)];
    text.m1 = NOTE_TEXT;
    await run();
    expect(reads).toEqual([{ id: "m1", auth: "Bearer tok:mo@loveiq.org" }]);
    expect(upserted.map((row) => row.source_id)).toContain("doc:m1");
  });

  it("reads a note both can see with the walk's own login, as the walk does", async () => {
    mailboxes.value = ["mo@loveiq.org"];
    drive[""] = [note("n1", SYNC)];
    drive["mo@loveiq.org"] = [note("n1", SYNC)];
    text.n1 = NOTE_TEXT;
    await run();
    expect(reads).toEqual([{ id: "n1", auth: "Bearer tok:ec@loveiq.org" }]);
  });

  it("skips what the walk skips: anything not a Gemini note, and a job interview", async () => {
    drive[""] = [
      note("x1", "Gemini prompt ideas"),
      note("x2", "Interview Design Role - 2026/10/14 10:00 CEST - Notes by Gemini"),
    ];
    const r = await run();
    expect(reads).toEqual([]);
    expect(upserted).toEqual([]);
    expect(r.detail).toMatch(/notes=0/);
  });

  it("writes nothing when it cannot check the team export folder", async () => {
    drive[""] = [note("n1", SYNC)];
    text.n1 = NOTE_TEXT;
    exportCheck.fails = true;
    const r = await run();
    expect(r.skipped).toBe("team-export-check-failed");
    expect(upserted).toEqual([]);
  });

  it("costs a colleague who refuses only their own notes, and says so", async () => {
    mailboxes.value = ["mo@loveiq.org"];
    refuseToken.add("mo@loveiq.org");
    drive[""] = [note("n1", SYNC)];
    text.n1 = NOTE_TEXT;
    const r = await run();
    expect(upserted.map((row) => row.source_id)).toContain("doc:n1");
    expect(r.complete).toBe(false);
    expect(r.detail).toMatch(/unread=1/);
  });

  it("stops reading at the clock and counts what waits for the walk", async () => {
    drive[""] = [note("n1", SYNC), note("n2", CALL)];
    text.n1 = NOTE_TEXT;
    text.n2 = NOTE_TEXT;
    let checks = 0;
    // Listing, then the export check's listing, then the first note; out of time after that.
    const r = await run(() => ++checks > 3);
    expect(reads).toHaveLength(1);
    expect(r.complete).toBe(false);
    expect(r.detail).toMatch(/deferred=1/);
  });

  it("never deletes anything: the hourly walk is the only sweep", async () => {
    drive[""] = [note("n1", SYNC)];
    text.n1 = NOTE_TEXT;
    await run();
    expect(dbCalls.filter((c) => c.method === "DELETE")).toEqual([]);
    expect(dbCalls.some((c) => c.path.includes("brain_sweep"))).toBe(false);
  });
});
