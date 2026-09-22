import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The colleague half of the walk is real in these tests, not stubbed, so the
 * exclusions can be proved to cover files that arrive through it. `colleagueMailboxes`
 * is empty by default, which is what every pre-existing test here assumes.
 */
const colleagueMailboxes: { value: string[] } = { value: [] };
/** Mailboxes whose delegated token is refused, to drive the sweep gate. */
const refuseColleagueToken = new Set<string>();
/** Files owned by a colleague, keyed by mailbox. */
const colleagueFiles: Record<string, Array<Record<string, unknown>>> = {};
vi.mock("@features/brain/server/ingest/gmail", () => ({
  domainMailboxes: vi.fn(async () => colleagueMailboxes.value),
}));

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
    // A colleague whose token is refused is how the sweep gate gets exercised.
    if (refuseColleagueToken.has(subject)) return null;
    return delegatedToken;
  }),
  isGoogleConfigured: () => true,
}));

const dbCalls: Array<{ path: string; method: string; body: string }> = [];

/**
 * The ids this run actually DELETED. Drive now sweeps by id set rather than by
 * timestamp, so "did this row survive" is read off the DELETE calls, not off whether
 * a confirming PATCH was issued.
 */
function deletedIds(): string[] {
  return dbCalls
    .filter((c) => c.method === "DELETE" && c.path.includes("brain_chunk"))
    .flatMap((c) =>
      (decodeURIComponent(c.path).match(/"([^"]+)"/g) ?? []).map((q) => q.slice(1, -1))
    );
}
let existing: Array<{ source_id: string; meta: { edited: string; v?: number } }> = [];
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    dbCalls.push({ path, method, body: String(init?.body ?? "") });
    // A source with no sweep-state row has never swept, so it is due. Answered
    // here rather than stubbing shouldSweep, to keep the real gate under test.
    if (path.includes("brain_sweep_state")) {
      return { ok: true, status: 200, headers: new Headers(), json: async () => [] };
    }
    // sweepMissing's paged id listing. `select=source_id&` -- note the ampersand --
    // is what distinguishes it from knownDocs' `select=source_id,meta`.
    if (method === "GET" && /select=source_id&/.test(path)) {
      const off = Number(/offset=(\d+)/.exec(path)?.[1] ?? 0);
      return {
        ok: true,
        headers: new Headers(),
        json: async () => (off === 0 ? existing.map((e) => ({ source_id: e.source_id })) : []),
      };
    }
    if (method === "DELETE") {
      // Prefer: return=representation, so the caller counts what it deleted.
      const n = (path.match(/%22/g)?.length ?? 0) / 2;
      return {
        ok: true,
        headers: new Headers(),
        json: async () => Array.from({ length: n }, () => ({})),
      };
    }
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
const exportOverrides: Record<string, string> = {};
let listOk = true;
let targets: Record<string, unknown> = {};
let alwaysMorePages = false;
let exportFails = false;
/** 500 is retried with backoff; a 4xx is returned immediately. See driveGet. */
let exportFailStatus = 500;
/** How many times the listing should answer with a transient 5xx before succeeding. */
let listTransientFailures = 0;
const httpCalls: string[] = [];
/** Tab names and their rows, as the Sheets API would answer. */
let sheetTabs: string[] = ["Costs", "Core_KPI"];
let sheetValues: Array<{ values?: unknown[][] }> = [
  {
    values: [
      ["Name", "Cost"],
      ["Slack", "(41.25)"],
    ],
  },
  {
    values: [
      ["Layer", "KPI"],
      ["Monetization", "Paid Reports"],
    ],
  },
];
let sheetsApiFails = false;

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string) => {
    httpCalls.push(url);
    if (url.startsWith("https://sheets.googleapis.com/")) {
      if (sheetsApiFails) return { ok: false, status: 500, text: async () => "boom" };
      if (url.includes("values:batchGet")) {
        return { ok: true, status: 200, json: async () => ({ valueRanges: sheetValues }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ sheets: sheetTabs.map((t) => ({ properties: { title: t } })) }),
      };
    }
    if (url.includes("/files?q=")) {
      if (listTransientFailures > 0) {
        listTransientFailures -= 1;
        return { ok: false, status: 500, text: async () => "backend error" };
      }
      if (!listOk) return { ok: false, status: 403, text: async () => "denied" };
      // `alwaysMorePages` makes every page claim a successor, so the loop hits
      // MAX_PAGES with items in hand — an INCOMPLETE but non-empty listing, which
      // is the only state that reaches the sweep decision.
      return {
        ok: true,
        status: 200,
        json: async () => {
          // A colleague listing names its owner; serve that person's files, not the
          // admin's, so an exclusion can be proved against a file only they own.
          const owner = decodeURIComponent(url).match(/'([^']+)' in owners/)?.[1];
          if (owner) return { files: colleagueFiles[owner] ?? [] };
          return alwaysMorePages ? { files, nextPageToken: "more" } : { files };
        },
        text: async () => "",
      };
    }
    if (url.includes("/export?")) {
      if (exportFails) return { ok: false, status: exportFailStatus, text: async () => "boom" };
      // Per-file override, so one document can be empty while another still has
      // content — the sweep only deletes on a run that wrote something.
      const exportId = /\/files\/([^/]+)\/export/.exec(url)?.[1] ?? "";
      const chosen = exportId in exportOverrides ? exportOverrides[exportId] : exportBody;
      return { ok: true, status: 200, text: async () => "﻿" + chosen.replace(/\n/g, "\r\n") };
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
      arrayBuffer: async () => pdfBytes.slice().buffer,
    };
  }),
}));

// unpdf is stubbed rather than fed a real pdf: this test is about what the
// ingester DOES with extracted text, not about whether pdfjs can parse.
/** Raw bytes the alt=media download hands back. A zero-length one is a real Drive file. */
let pdfBytes: Uint8Array = new Uint8Array([37, 80, 68, 70]);
let pdfText = "";
vi.mock("unpdf", () => ({
  // FAITHFUL TO pdfjs: it throws on a zero-byte buffer rather than returning no text.
  // A mock that quietly returned "" here made the zero-byte test pass with the guard
  // REMOVED — the doc reached `empty=` either way — so the test proved nothing. Caught
  // by mutation, which is the only thing that can catch it.
  getDocumentProxy: vi.fn(async (buf: Uint8Array) => {
    if (!buf || buf.byteLength === 0) {
      throw new Error("The PDF file is empty, i.e. its size is zero bytes.");
    }
    return {};
  }),
  extractText: vi.fn(async () => ({ totalPages: 1, text: pdfText })),
}));

import {
  docToRows,
  ingestDrive,
  isPersonalDataExport,
  isJobApplication,
  isVendorBilling,
  sheetTabsWithRows,
} from "@features/brain/server/ingest/drive";
// The predicate lives in `upsert` rather than here: `drive` imports `gmail`, so the
// mailbox walk cannot import it back, and the same contract arrives both ways.
import { isLegalInstrument } from "@features/brain/server/ingest/upsert";

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
  /**
   * A Gemini note is two documents in one file, and `brain_search` collapses a
   * document to one part. Measured across all 114 notes on four decision-shaped
   * questions, the surviving part was a TRANSCRIPT part 24-46% of the time -- so
   * on roughly a third of meetings the decision record was discarded at random.
   */
  describe("splitting the decision record from the transcript", () => {
    const DIVIDER = "You should review Gemini's notes to make sure they're accurate.";
    const notes = "Summary\n\nThe team aligned on the consumer pivot.\n\n" + "N".repeat(2600);
    const transcript =
      "Mark: I give you 20 seconds because I also need shoes.\n\n" + "T".repeat(2600);

    const sections = (rows: ReturnType<typeof docToRows>) =>
      rows.map((r) => (r.meta as { section?: string }).section);

    it("marks the parts before Google's divider as the record and the rest as transcript", () => {
      const rows = docToRows(FILE, `${notes}\n\n${DIVIDER}\n\n${transcript}`, STAMP);
      expect(rows.length).toBeGreaterThan(2);
      const marks = sections(rows);
      // Every part is labelled, the labels are contiguous, and both halves exist.
      expect(marks.every((m) => m === "summary" || m === "transcript")).toBe(true);
      expect(marks).toContain("summary");
      expect(marks).toContain("transcript");
      expect(marks.lastIndexOf("summary")).toBeLessThan(marks.indexOf("transcript"));
      // The part holding the divider keeps the tail of the notes, so it is record.
      const dividerAt = rows.findIndex((r) => r.body.includes("You should review Gemini"));
      expect(marks[dividerAt]).toBe("summary");
    });

    it("leaves the section UNSET when the divider is absent, rather than guessing", () => {
      // Google's string, not ours. If they change it, this must fail loudly rather
      // than silently mislabel half of every meeting note.
      const rows = docToRows(FILE, `${notes}\n\n${transcript}`, STAMP);
      expect(sections(rows).every((m) => m === undefined)).toBe(true);
    });

    it("does not label an ordinary Drive document", () => {
      const plain = { ...FILE, name: "Q3 planning spreadsheet" };
      const rows = docToRows(plain, `${notes}\n\n${DIVIDER}\n\n${transcript}`, STAMP);
      expect(rows[0].title.startsWith("Drive:")).toBe(true);
      expect(sections(rows).every((m) => m === undefined)).toBe(true);
    });
  });

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
    colleagueMailboxes.value = [];
    refuseColleagueToken.clear();
    for (const k of Object.keys(colleagueFiles)) delete colleagueFiles[k];
    listOk = true;
    alwaysMorePages = false;
    exportFails = false;
    exportFailStatus = 500;
    exportBody = "Summary\n\nWe agreed to ship the paywall.";
    targets = {};
  });

  /**
   * `docs=745` against 727 indexed documents could not be reconciled from outside the
   * run: an empty file and a refused people-list both vanish silently. A NEW gap would
   * therefore look exactly like the known one, which is what this summary exists to stop.
   */
  /**
   * Printed even at zero, unlike every other counter here.
   *
   * Colleague notes are appended to the listing and then compete with the whole
   * backlog for the fetch budget, so "none are indexed yet" is the NORMAL state for
   * hours after a rebuild. Without a counter that is always present, that is
   * indistinguishable from the feature not running at all — which is exactly the
   * confusion this hit on the night it shipped.
   */
  it("always reports whether colleagues were asked for meeting notes", async () => {
    const res = await ingestDrive(STAMP);
    expect(res.detail).toMatch(/colleagueDocs=\d+\/\d+asked/);
  });

  /**
   * THE FILTER, NOT THE PREDICATE.
   *
   * `isVendorBilling` and `isJobApplication` were each covered by two dozen cases, and
   * deleting either one from the listing filter left every one of those green — 1,482
   * tests passing while the walk indexed receipts and strangers' CVs again. A predicate
   * nothing calls is decoration. These two drive the whole run and read the rows it
   * actually wrote.
   *
   * Filtered at LISTING time on purpose, so the ids never reach `touch` or `deferred`
   * either: a skipped document has to look ABSENT to the sweep, not merely unfetched,
   * or the sweep would protect the very rows being removed.
   */
  it.each([
    ["a vendor invoice", "ZZbillingZZ", "MT-INV00945830.pdf", "application/pdf"],
    ["a candidate's CV", "ZZcandidateZZ", "Nejra_Rizvic_CV.pdf", "application/pdf"],
    [
      "a colleague's contract",
      "ZZcontractZZ",
      "Freelancer Agreement_Fatih.docx",
      "application/pdf",
    ],
    [
      "the cap table",
      "ZZcaptableZZ",
      "Shareholders Agreement Applied Psychometrics GmbH",
      "application/pdf",
    ],
  ])("never even fetches %s that reached the listing", async (_what, id, name, mimeType) => {
    files = [FILE, { ...FILE, id, name, mimeType }];
    await ingestDrive(STAMP);
    const written = dbCalls
      .filter(
        (c) =>
          c.method !== "GET" && c.path.includes("brain_chunk") && c.path.includes("on_conflict")
      )
      .flatMap((c) => JSON.parse(c.body) as Array<{ source_id: string }>);
    // Positive control, or a run that indexed NOTHING would pass this just as well.
    expect(written.map((r) => r.source_id)).toEqual(["doc:1AbCdEf"]);
    // Asserted on the HTTP calls, not on what was written: a filtered file must never
    // be requested at all. Asserting only "no row was written" is vacuous here — a pdf
    // whose export yields no text is dropped as empty anyway, so the first version of
    // this test passed with the filter deleted.
    expect(httpCalls.some((u) => u.includes(id))).toBe(false);
  });

  /**
   * THE COLLEAGUE HALF GOES THROUGH THE SAME EXCLUSIONS.
   *
   * The walk was widened on 2026-09-21 from "a colleague's meeting notes" to a
   * colleague's whole Drive, on an explicit decision. That makes `isJobApplication`
   * load-bearing in a way it was not before: personal Drives are exactly where CVs
   * live, and the owner's instruction was that CVs stay out.
   *
   * Asserted on the HTTP calls, so the file must never be REQUESTED — and with a
   * positive control from the same colleague, or a run that fetched nothing from
   * them would pass this just as well.
   */
  it("fetches a colleague's ordinary document and never their CV", async () => {
    colleagueMailboxes.value = ["mo@loveiq.org"];
    colleagueFiles["mo@loveiq.org"] = [
      { ...FILE, id: "ZZcolleagueDocZZ", name: "Report Review notes" },
      { ...FILE, id: "ZZcolleagueCvZZ", name: "Nejra_Rizvic_CV.pdf", mimeType: "application/pdf" },
      // A personal Drive is exactly where a person's own contract lives, which is why
      // this half has to carry the exclusion too and not just the shared folders.
      {
        ...FILE,
        id: "ZZcolleagueContractZZ",
        name: "Freelancer Agreement Marc.docx",
        mimeType: "application/pdf",
      },
    ];
    await ingestDrive(STAMP);
    expect(httpCalls.some((u) => u.includes("ZZcolleagueDocZZ"))).toBe(true);
    expect(httpCalls.some((u) => u.includes("ZZcolleagueCvZZ"))).toBe(false);
    expect(httpCalls.some((u) => u.includes("ZZcolleagueContractZZ"))).toBe(false);
  });

  it("indexes a colleague's document that is not a meeting note at all", async () => {
    // The whole point of widening: a plain document nobody organised a meeting for.
    colleagueMailboxes.value = ["mb@loveiq.org"];
    colleagueFiles["mb@loveiq.org"] = [{ ...FILE, id: "ZZkpiZZ", name: "KPI Framework" }];
    await ingestDrive(STAMP);
    const written = dbCalls
      .filter(
        (c) =>
          c.method !== "GET" && c.path.includes("brain_chunk") && c.path.includes("on_conflict")
      )
      .flatMap((c) => JSON.parse(c.body) as Array<{ source_id: string }>);
    expect(written.map((r) => r.source_id)).toContain("doc:ZZkpiZZ");
  });

  it("counts the files it skipped for having no text", async () => {
    exportBody = "   ";
    const res = await ingestDrive(STAMP);
    expect(res.detail).toMatch(/empty=1/);
  });

  it("counts the files it refused as a list of people, separately from empty ones", async () => {
    // Over MAX_ADDRESSES_PER_DOC, which is what makes it an export rather than a document.
    exportBody = Array.from({ length: 25 }, (_, i) => `person${i}@example.com`).join("\n");
    const res = await ingestDrive(STAMP);
    expect(res.detail).toMatch(/refusedAsPeopleList=1/);
    // The two must not be conflated: an empty file is a dud, a people list is a refusal.
    expect(res.detail).not.toMatch(/empty=/);
    expect(res.detail).not.toMatch(/unusable=/);
  });

  it("does not file a nameless file under the people-list refusal", async () => {
    // `docToRows` returns [] for a people list AND for a file with no name. Counting
    // both as "refusedAsPeopleList" would be one label for two states — the exact
    // defect these counters exist to answer.
    files = [{ ...FILE, name: "" }];
    const res = await ingestDrive(STAMP);
    expect(res.detail).toMatch(/unusable=1/);
    expect(res.detail).not.toMatch(/refusedAsPeopleList=/);
  });

  it("says nothing when there is nothing to say, so the summary stays readable", async () => {
    const res = await ingestDrive(STAMP);
    expect(res.detail).not.toMatch(/empty=/);
    expect(res.detail).not.toMatch(/refusedAsPeopleList=/);
  });

  it("strips the BOM and CRLFs that Google's text export adds", async () => {
    await ingestDrive(STAMP);
    const written = dbCalls
      .filter(
        (c) =>
          c.method !== "GET" && c.path.includes("brain_chunk") && c.path.includes("on_conflict")
      )
      .flatMap((c) => JSON.parse(c.body) as Array<{ body: string }>);
    expect(written.length).toBe(1);
    expect(written[0].body).not.toContain("﻿");
    expect(written[0].body).not.toContain("\r");
    expect(written[0].body).toContain("We agreed to ship the paywall.");
  });

  it("indexes nothing from the skip-listed documents, and everything else as before", async () => {
    /**
     * The list is by FILE ID on purpose. The obvious rule -- drop the big PDFs --
     * also destroys the fourteen `LoveIQ_*_Preview.pdf` files, which are our own
     * product, and the PhD thesis behind report copy. So the guard needs a
     * positive control: one that skipped everything would pass a "was it skipped"
     * assertion just as well.
     */
    files = [
      {
        ...FILE,
        id: "1CK4rTwWyL9NPDrGNTTzy2-ElZGBuZ9PFh4eWa58b-2M",
        name: "Pitchbook Investors Data",
      },
      { ...FILE, id: "1l98gvhLBXhbFf5wq3plctq7V9n-2Jx9z", name: "Come As You Are.pdf" },
      { ...FILE, id: "1AbCdEf", name: "Notes by Gemini — Marcus / Eman 26 Aug" },
    ];
    await ingestDrive(STAMP);
    const written = dbCalls
      .filter(
        (c) =>
          c.method !== "GET" && c.path.includes("brain_chunk") && c.path.includes("on_conflict")
      )
      .flatMap((c) => JSON.parse(c.body) as Array<{ source_id: string; title: string }>);

    // Positive control: the ordinary document is still indexed.
    expect(written.map((r) => r.source_id)).toEqual(["doc:1AbCdEf"]);
    // And the skipped ones are not fetched at all — not fetched-then-discarded,
    // which would still spend the clock and the export quota on them.
    expect(httpCalls.some((u) => u.includes("1CK4rTwWyL9NPDrGNTTzy2"))).toBe(false);
    expect(httpCalls.some((u) => u.includes("1l98gvhLBXhbFf5wq3plctq7V9n-2Jx9z"))).toBe(false);
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

  /**
   * WHY IT STOPPED, not merely that it did.
   *
   * `complete=false` was reported on 21 of 21 brain-drive runs on 2026-09-07 with no
   * way to tell a listing cap from a refused page from the clock — and those want
   * three completely different fixes. One of them is a capacity decision
   * (PAGE_SIZE * MAX_PAGES documents), one is an access problem, one is a budget.
   */
  it("names the page cap when the listing never runs out of pages", async () => {
    alwaysMorePages = true;
    const res = await ingestDrive(STAMP);
    expect(res.complete).toBe(false);
    expect(res.detail).toMatch(/stopped=page-cap@\d+x\d+/);
  });

  /**
   * THE FALSE ALARM THIS PINS, shipped and caught within a day.
   *
   * A failed export makes the walk incomplete but does NOT block the sweep: the
   * document was still LISTED, so it never looks deleted, which is why drive gates
   * sweeping on `listed.complete` alone. An alert keyed on `complete` therefore told
   * people "documents deleted from Drive are staying in the corpus" on every run,
   * while drive was in fact sweeping normally — verified against `brain_sweep_state`,
   * which recorded a drive sweep at the very run that reported `complete=false
   * stopped=export-failed`.
   */
  it("tolerates a few failed exports instead of calling the whole walk incomplete", async () => {
    // It used to `stop()` inside the catch, so ONE unexportable file marked
    // every run incomplete forever. Measured 2026-09-17: document
    // 1bunyq5jy7fbERkhDGswQlQPE-v090F88 had failed on 224 consecutive runs since
    // 2026-09-08, and drive had not reported a complete walk once in that time.
    // Calendar tolerates 10 unreachable calendars and gmail 10 unreadable
    // threads; drive was the only one that gave up on the first.
    exportFails = true;
    const res = await ingestDrive(STAMP);

    expect(res.complete).toBe(true);
    expect(res.detail).not.toMatch(/stopped=/);
    // The FILE ID survives regardless. The log line naming it sits in a buffer
    // that holds hours while this cron runs hourly, so by the time anyone looks
    // it has rolled off; the note in `cron_run` is what lasts.
    expect(res.detail).toMatch(/exportFailed=1:1AbCdEf/);
    // ...and WHY it failed, by the same argument. Three opaque ids and no status
    // is a note nobody can act on without the logs that have already rolled off:
    // an unexportable TYPE, a 404 and a permission error need different fixes.
    expect(res.detail).toMatch(/exportFailed=1:1AbCdEf\(export 500\)/);
    // The listing was fine, so deletion is still safe.
    expect(res.sweepBlocked).toBe(false);
  });

  it("DOES call the walk incomplete once the failures pass the tolerance", async () => {
    // The positive control: a genuine export outage must still be reported, or
    // the tolerance is just a way of never noticing.
    exportFails = true;
    // 403, not 500: a 4xx is returned immediately while a 500 is retried with
    // backoff, and eleven files through the backoff path takes longer than the
    // test timeout.
    exportFailStatus = 403;
    files = Array.from({ length: 11 }, (_, i) => ({ ...FILE, id: `dead-${i}` }));

    const res = await ingestDrive(STAMP);

    expect(res.complete).toBe(false);
    expect(res.detail).toMatch(/stopped=export-failed=11:dead-0/);
    // Still the LISTING that gates deletion, not the fetch.
    expect(res.sweepBlocked).toBe(false);
  });

  it("DOES call the sweep blocked when the listing was cut short", async () => {
    alwaysMorePages = true;
    const res = await ingestDrive(STAMP);
    expect(res.sweepBlocked).toBe(true);
  });

  it("names no stop reason at all on a walk that finished", async () => {
    const res = await ingestDrive(STAMP);
    expect(res.complete).toBe(true);
    expect(res.detail).toMatch(/complete=true/);
    expect(res.detail).not.toMatch(/stopped=/);
  });

  it("does not re-export a document whose modifiedTime is unchanged", async () => {
    const v = (docToRows(FILE, "x", STAMP)[0].meta as { v: number }).v;
    existing = [{ source_id: "doc:1AbCdEf", meta: { edited: FILE.modifiedTime, v } }];
    await ingestDrive(STAMP);
    expect(httpCalls.filter((u) => u.includes("/export?"))).toHaveLength(0);
    // It used to assert a PATCH happened, i.e. that the row was CONFIRMED by writing
    // to it. There is no confirm write any more, so assert the thing that actually
    // mattered: an unchanged document is not deleted.
    expect(deletedIds()).not.toContain("doc:1AbCdEf");
  });

  /**
   * The bump is the whole delivery mechanism for a reader change, and it had no test.
   * A file is refetched when its `modifiedTime` moves — so a fix to HOW a file is read
   * reaches nothing until the version says the stored row is the wrong shape. v3 -> v4
   * (spreadsheets, first tab only) depended on exactly this: "Business Case" had not
   * been edited since 2026-09-16, so without the bump its missing tab stayed missing.
   */
  it("re-exports an UNCHANGED document when the builder version moved on", async () => {
    const v = (docToRows(FILE, "x", STAMP)[0].meta as { v: number }).v;
    existing = [{ source_id: "doc:1AbCdEf", meta: { edited: FILE.modifiedTime, v: v - 1 } }];
    await ingestDrive(STAMP);
    expect(httpCalls.filter((u) => u.includes("/export?")).length).toBeGreaterThan(0);
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
    // Directly: the part is not deleted. Stronger than the old assertion that it was
    // PATCHed, which only proved the mechanism ran, not that the row survived.
    expect(deletedIds()).not.toContain("doc:1AbCdEf#2");
  });

  it("DOES sweep when the listing was complete", async () => {
    // The control for the test below. Without it, "no sweep" proves nothing —
    // an earlier version of that test passed only because a failed listing
    // returns zero items and exits before the sweep is ever reached.
    files = [FILE];
    await ingestDrive(STAMP);
    // The bookkeeping write happens if and only if this run swept, so it is the
    // unambiguous marker. `updated_at=lt.` no longer appears -- that was the
    // timestamp sweep, which drive no longer uses.
    expect(
      dbCalls.filter((c) => c.method === "POST" && c.path.includes("brain_sweep_state")).length
    ).toBeGreaterThan(0);
  });

  /**
   * A COLLEAGUE LOST TO A REFUSED TOKEN MUST BLOCK THE SWEEP TOO.
   *
   * The sweep gate read the ADMIN listing alone. That was survivable while the
   * colleague walk returned at most fourteen meeting notes; once it returns a
   * colleague's whole Drive, one refused token presents ~100 live documents to the
   * sweep as deleted — too few to trip the majority guard, so they would go, return
   * on the next run, and go again. Regression found before it ran, on 2026-09-21.
   */
  it("does NOT sweep when a colleague's Drive could not be walked", async () => {
    colleagueMailboxes.value = ["mo@loveiq.org"];
    // No files served for that owner and the token refused — see the drive mock.
    refuseColleagueToken.add("mo@loveiq.org");
    files = [FILE];
    await ingestDrive(STAMP);
    expect(
      dbCalls.filter((c) => c.method === "POST" && c.path.includes("brain_sweep_state")).length
    ).toBe(0);
  });

  it("DOES still sweep when every colleague was walked", async () => {
    // The control: without it, "no sweep" above could come from any other cause.
    colleagueMailboxes.value = ["mo@loveiq.org"];
    colleagueFiles["mo@loveiq.org"] = [{ ...FILE, id: "ZZokZZ", name: "Fine" }];
    files = [FILE];
    await ingestDrive(STAMP);
    expect(
      dbCalls.filter((c) => c.method === "POST" && c.path.includes("brain_sweep_state")).length
    ).toBeGreaterThan(0);
  });

  it("does NOT sweep when the listing was incomplete but returned documents", async () => {
    // A truncated listing makes existing documents look deleted. This needs a
    // non-empty result to reach the sweep decision at all, hence the paging mock.
    alwaysMorePages = true;
    files = [FILE];
    await ingestDrive(STAMP);
    /**
     * ASSERT ON A MARKER THIS CODE ACTUALLY EMITS.
     *
     * This used to filter for `updated_at=lt.`, which only `sweepStale`/`countChunks`
     * in upsert.ts ever produce. drive imports `sweepMissing` alone and deletes by
     * `source_id=in.(...)`, so the filtered array was ALWAYS empty and the assertion
     * could never fail. Deleting `listed.complete &&` from the sweep gate left all 484
     * tests passing — verified by mutation — while the real effect is deleting rows a
     * truncated listing never saw.
     *
     * `brain_sweep_state` is written if and only if this run swept, so it is the
     * unambiguous marker. The DELETE check is the belt to that braces.
     */
    expect(
      dbCalls.filter((c) => c.method === "POST" && c.path.includes("brain_sweep_state"))
    ).toHaveLength(0);
    expect(dbCalls.filter((c) => c.method === "DELETE")).toHaveLength(0);
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
    exportFails = false;
    exportFailStatus = 500;
    targets = {};
    process.env.NOTION_TOKEN = "ntn_test";
  });

  function written() {
    return dbCalls
      .filter(
        (c) =>
          c.method !== "GET" && c.path.includes("brain_chunk") && c.path.includes("on_conflict")
      )
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
      .filter(
        (c) =>
          c.method !== "GET" && c.path.includes("brain_chunk") && c.path.includes("on_conflict")
      )
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

describe("spreadsheets — every tab, not just the first", () => {
  const SHEET = {
    id: "sheet1",
    name: "Business Case",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-09-16T14:05:00.000Z",
    createdTime: "2026-08-26T14:00:00.000Z",
    webViewLink: "https://docs.google.com/spreadsheets/d/sheet1/edit",
    owners: [{ emailAddress: "ec@loveiq.org" }],
  };

  beforeEach(() => {
    files = [SHEET];
    existing = [];
    dbCalls.length = 0;
    httpCalls.length = 0;
    listOk = true;
    alwaysMorePages = false;
    sheetsApiFails = false;
    sheetTabs = ["Costs", "Core_KPI"];
    sheetValues = [
      {
        values: [
          ["Name", "Cost"],
          ["Slack", "(41.25)"],
        ],
      },
      {
        values: [
          ["Layer", "KPI"],
          ["Monetization", "Paid Reports"],
        ],
      },
    ];
  });

  const writtenBody = () =>
    dbCalls
      .filter((c) => c.method === "POST" && c.path.includes("brain_chunk"))
      .map((c) => c.body)
      .join(" ");

  /**
   * FOUND IN PRODUCTION 2026-09-19. `files.export?mimeType=text/csv` answers with the
   * FIRST worksheet and drops the rest, because CSV is a single-table format. "Business
   * Case" has `Costs` and `Core_KPI`; the brain held only the cost lines, so asked about
   * the KPI table it reported it could not see the file — while every count of indexed
   * documents called that file present.
   */
  it("indexes a tab that is not the first one", async () => {
    await ingestDrive(STAMP, () => false, null);
    const body = writtenBody();
    expect(body).toContain("Paid Reports");
    expect(body).toContain("Core_KPI");
  });

  it("still indexes the first tab, and names both", async () => {
    await ingestDrive(STAMP, () => false, null);
    const body = writtenBody();
    expect(body).toContain("Slack");
    expect(body).toContain("Costs");
  });

  it("asks the Sheets API rather than exporting csv", async () => {
    await ingestDrive(STAMP, () => false, null);
    expect(httpCalls.some((u) => u.includes("sheets.googleapis.com"))).toBe(true);
    expect(httpCalls.some((u) => u.includes("export?mimeType=text%2Fcsv"))).toBe(false);
  });

  it("falls back to the first tab rather than losing the file when Sheets fails", async () => {
    // Worse than the new behaviour, better than nothing — and the warn says which.
    sheetsApiFails = true;
    const res = await ingestDrive(STAMP, () => false, null);
    expect(res.complete).toBe(true);
    expect(httpCalls.some((u) => u.includes("export?mimeType=text%2Fcsv"))).toBe(true);
  });

  it("skips a spreadsheet whose tabs are all empty", async () => {
    sheetValues = [{ values: [] }, { values: [[""], [" "]] }];
    await ingestDrive(STAMP, () => false, null);
    expect(writtenBody()).not.toContain("Business Case");
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
    pdfBytes = new Uint8Array([37, 80, 68, 70]);
    existing = [];
    dbCalls.length = 0;
    httpCalls.length = 0;
    listOk = true;
    alwaysMorePages = false;
    exportFails = false;
    exportFailStatus = 500;
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

  /**
   * MEASURED IN PRODUCTION 2026-09-18. Two Drive files are zero-byte PDFs; pdfjs throws
   * `The PDF file is empty, i.e. its size is zero bytes`, which landed in the catch and
   * was reported as a failed export on EVERY hourly run since at least 2026-09-08 — and
   * one of them used to abort the whole walk. Nothing about the file will ever change,
   * so a failure list containing it is a list nobody can act on.
   */
  it("treats a zero-byte pdf as an empty document, not as an export failure", async () => {
    pdfBytes = new Uint8Array(0);
    const res = await ingestDrive(STAMP, () => false, null);
    expect(res.detail).toMatch(/empty=1/);
    expect(res.detail).not.toMatch(/exportFailed/);
    expect(res.complete).toBe(true);
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
    exportFails = false;
    exportFailStatus = 500;
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

describe("a WhatsApp export in Drive is a conversation, not a document", () => {
  const EXPORT = [
    "[06/08/2026, 09:12:31] Marcus: Should the report be 39.99?",
    "[06/08/2026, 09:13:02] Eman: I think so",
    "[07/08/2026, 11:02:00] Eman: Shipped.",
  ].join("\n");

  it("routes it to the per-day parser instead of the generic document path", () => {
    // Left to the normal path it becomes anonymous slices all stamped with the
    // FILE's modified date, so "what did we decide in July" cannot work.
    const rows = docToRows(
      { ...FILE, name: "WhatsApp Chat with LoveIQ Team.txt", mimeType: "text/plain" },
      EXPORT,
      STAMP
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.period_end)).toEqual(["2026-08-06", "2026-08-07"]);
    expect(rows[0]!.title).toContain("WhatsApp: LoveIQ Team");
  });

  it("leaves an ordinary text file on the normal path", () => {
    const rows = docToRows({ ...FILE, name: "Q3 budget" }, "Some prose about the budget.", STAMP);
    expect(rows[0]!.title).toBe("Drive: Q3 budget");
  });
});

describe("a failed sweep must not retry every hour", () => {
  /**
   * THE LOOP THIS EXISTS FOR.
   *
   * `touchChunks` fails closed: a non-2xx confirm throws, so the sweep can never
   * delete rows it could not confirm. Correct. But `recordSweep` ran AFTER the sweep,
   * so a throw meant the attempt was never recorded — and brain-drive retried its
   * 16,117-row touch EVERY HOUR, timing out at 8s in the same place each time
   * (observed 14:52, 15:52 and 16:52 on 2026-08-31), generating precisely the disk IO
   * the once-a-day sweep exists to remove.
   *
   * The bookkeeping write must land before the expensive work, which is what the
   * comment on `recordSweep` already claimed. Only asserting the ORDER keeps the
   * comment and the code honest.
   */
  beforeEach(() => {
    // This describe sits outside the main one, so it does NOT inherit its beforeEach.
    // Without this the run lists no files, never reaches the touch, and `dbCalls`
    // still holds entries from earlier tests — which is exactly how two earlier
    // versions of this test passed with the bug present and the mutation applied.
    vi.clearAllMocks();
    dbCalls.length = 0;
    httpCalls.length = 0;
    files = [FILE];
    listOk = true;
    alwaysMorePages = false;
    exportFails = false;
    exportFailStatus = 500;
    targets = {};
    existing = [];
  });

  it("refuses to delete the majority of a source, because that is indistinguishable from a broken walk", async () => {
    /**
     * The guard that stands between a bad walk and the corpus. Removing it entirely
     * left all 475 tests green, which is why this test exists.
     *
     * Five rows stored, one produced by the walk: four orphans against one keeper.
     * A genuine mass id change (a re-chunking, a shorter window) looks exactly like a
     * collection that half-failed, and counts cannot tell them apart -- so it refuses
     * and says so. Stale rows are recoverable; deleted ones are not.
     */
    const v = (docToRows(FILE, "x", STAMP)[0].meta as { v: number }).v;
    existing = [
      { source_id: "doc:1AbCdEf", meta: { edited: FILE.modifiedTime, v } },
      { source_id: "doc:gone-1", meta: { edited: FILE.modifiedTime, v } },
      { source_id: "doc:gone-2", meta: { edited: FILE.modifiedTime, v } },
      { source_id: "doc:gone-3", meta: { edited: FILE.modifiedTime, v } },
      { source_id: "doc:gone-4", meta: { edited: FILE.modifiedTime, v } },
    ];

    const res = await ingestDrive(STAMP);

    expect(deletedIds()).toEqual([]); // nothing deleted at all
    expect(res.swept).toBe(0);
  });

  /**
   * A DOCUMENT THAT HAS BECOME EMPTY MUST LOSE ITS OLD CHUNK.
   *
   * The empty branch says skipping "lets the sweep remove it if it was indexed
   * before" — and for a long time it could not, because `deferred` protected every
   * file in `toFetch` that produced no rows, which includes the ones that were READ
   * and deliberately not indexed. Found 2026-09-19 on "Discount sheet", a real
   * spreadsheet with one tab and no rows, whose 14-character chunk had survived
   * every run since 31 August while describing a document that holds nothing.
   */
  it("sweeps the stale chunk of a document that has become empty", async () => {
    const other = {
      ...FILE,
      id: "2ZyXwV",
      webViewLink: "https://docs.google.com/document/d/2ZyXwV/edit",
    };
    files = [FILE, other];
    exportOverrides[FILE.id] = "   "; // this one is now empty; `other` still has text
    const v = (docToRows(FILE, "x", STAMP)[0].meta as { v: number }).v;
    existing = [
      { source_id: "doc:1AbCdEf", meta: { edited: "2026-01-01T00:00:00.000Z", v } },
      { source_id: "doc:2ZyXwV", meta: { edited: "2026-01-01T00:00:00.000Z", v } },
    ];

    await ingestDrive(STAMP);

    // The emptied document's row goes; the one that still has content stays.
    expect(deletedIds()).toContain("doc:1AbCdEf");
    expect(deletedIds()).not.toContain("doc:2ZyXwV");
  });

  /**
   * THE CONTROL FOR THE VERSION FILTER, and it has to use OLD-version parts.
   *
   * The touch path protects only parts on the current builder version, so orphans
   * from a shorter re-chunk are swept. Applying that same filter to DEFERRED files
   * looks equally reasonable and is catastrophic: during a rebuild every unreached
   * file still sits on the OLD version, so the filter would protect none of them and
   * the sweep would delete the backlog for the crime of not having been read yet.
   *
   * A mutation applying the filter to `deferred` passed the whole suite on
   * 2026-09-20 — every existing test used current-version parts, so none could see
   * it. This one uses old-version parts deliberately.
   */
  it("protects an unreached file whose parts are still on the OLD builder version", async () => {
    const other = {
      ...FILE,
      id: "2ZyXwV",
      webViewLink: "https://docs.google.com/document/d/2ZyXwV/edit",
    };
    files = [FILE, other];
    const v = (docToRows(FILE, "x", STAMP)[0].meta as { v: number }).v;
    existing = [
      { source_id: "doc:1AbCdEf", meta: { edited: "2026-01-01T00:00:00.000Z", v: v - 1 } },
      // Never reached this run, and every part is on the previous builder version —
      // which is the normal state of a rebuild backlog.
      { source_id: "doc:2ZyXwV", meta: { edited: "2026-01-01T00:00:00.000Z", v: v - 1 } },
      { source_id: "doc:2ZyXwV#2", meta: { edited: "2026-01-01T00:00:00.000Z", v: v - 1 } },
    ];

    let ticks = 0;
    await ingestDrive(STAMP, () => ++ticks > 2);

    expect(deletedIds()).not.toContain("doc:2ZyXwV");
    expect(deletedIds()).not.toContain("doc:2ZyXwV#2");
  });

  it("still protects a file the clock never reached", async () => {
    // The control. Deferring exists for genuine outages, and removing that would
    // delete most of the corpus on any run that runs out of time.
    const other = {
      ...FILE,
      id: "2ZyXwV",
      webViewLink: "https://docs.google.com/document/d/2ZyXwV/edit",
    };
    files = [FILE, other];
    const v = (docToRows(FILE, "x", STAMP)[0].meta as { v: number }).v;
    existing = [
      { source_id: "doc:1AbCdEf", meta: { edited: "2026-01-01T00:00:00.000Z", v } },
      { source_id: "doc:2ZyXwV", meta: { edited: "2026-01-01T00:00:00.000Z", v } },
    ];

    // Out of time immediately after the first file is taken.
    let ticks = 0;
    await ingestDrive(STAMP, () => ++ticks > 2);

    expect(deletedIds()).not.toContain("doc:2ZyXwV");
  });

  /**
   * A DOCUMENT THAT RE-CHUNKS SHORTER MUST LOSE ITS TAIL.
   *
   * The part ids handed to the sweep come from the DATABASE, not from the file, so
   * they include parts the file no longer produces. The run that shrinks a file
   * writes the new parts and the orphans go unwritten — but the sweep runs once a
   * day, and the NEXT run finds the file unchanged, touches it, and re-protects
   * every stored id including the orphans. A shrinking file was therefore only
   * sweepable during the single run that shrank it.
   *
   * Measured 2026-09-20: the Glossary went from 311 parts to 223 and all 88 orphans
   * survived, still titled "part 224 of 311" and dated three weeks earlier.
   */
  it("sweeps orphan parts of a file that re-chunked shorter, even when it is untouched since", async () => {
    files = [FILE];
    const v = (docToRows(FILE, "x", STAMP)[0].meta as { v: number }).v;
    existing = [
      // Current parts, on this builder version, unchanged -> the file is TOUCHED.
      { source_id: "doc:1AbCdEf", meta: { edited: FILE.modifiedTime, v } },
      { source_id: "doc:1AbCdEf#2", meta: { edited: FILE.modifiedTime, v } },
      // The tail of a longer previous version, left on the OLD builder version.
      { source_id: "doc:1AbCdEf#3", meta: { edited: FILE.modifiedTime, v: v - 1 } },
      { source_id: "doc:1AbCdEf#4", meta: { edited: FILE.modifiedTime, v: v - 1 } },
    ];

    await ingestDrive(STAMP);

    expect(deletedIds()).toContain("doc:1AbCdEf#3");
    expect(deletedIds()).toContain("doc:1AbCdEf#4");
    // The live parts must survive.
    expect(deletedIds()).not.toContain("doc:1AbCdEf");
    expect(deletedIds()).not.toContain("doc:1AbCdEf#2");
  });

  it("deletes a minority of orphans, so the guard is a majority rule and not a veto", async () => {
    // The control for the test above: one orphan against four keepers must go, or
    // "refuses" above would pass simply because the sweep never deletes anything.
    const v = (docToRows(FILE, "x", STAMP)[0].meta as { v: number }).v;
    existing = [
      { source_id: "doc:1AbCdEf", meta: { edited: FILE.modifiedTime, v } },
      { source_id: "doc:1AbCdEf#2", meta: { edited: FILE.modifiedTime, v } },
      { source_id: "doc:1AbCdEf#3", meta: { edited: FILE.modifiedTime, v } },
      { source_id: "doc:gone-1", meta: { edited: FILE.modifiedTime, v } },
    ];

    await ingestDrive(STAMP);

    expect(deletedIds()).toEqual(["doc:gone-1"]);
  });

  it("records the attempt before the delete, so a failure defers instead of looping", async () => {
    // A stored row the walk cannot produce, so the sweep genuinely deletes something
    // and there is a real DELETE to order the bookkeeping against.
    const v = (docToRows(FILE, "x", STAMP)[0].meta as { v: number }).v;
    existing = [
      { source_id: "doc:1AbCdEf", meta: { edited: FILE.modifiedTime, v } },
      { source_id: "doc:ZZZ_deleted_from_drive", meta: { edited: FILE.modifiedTime, v } },
    ];

    await ingestDrive(STAMP);

    const firstDelete = dbCalls.findIndex(
      (c) => c.method === "DELETE" && c.path.includes("brain_chunk")
    );
    const record = dbCalls.findIndex(
      (c) => c.path.includes("brain_sweep_state") && c.method === "POST"
    );
    expect(firstDelete).toBeGreaterThanOrEqual(0); // the setup must reach a real sweep
    expect(record).toBeGreaterThanOrEqual(0); // the attempt must be recorded
    expect(record).toBeLessThan(firstDelete); // and recorded FIRST
    // And it deleted the orphan ONLY.
    expect(deletedIds()).toEqual(["doc:ZZZ_deleted_from_drive"]);
  });
});

/**
 * Drive answers 500/503 transiently under normal operation. Giving up on the first one
 * ended the entire walk — and since the sweep only runs after a COMPLETE walk, nothing
 * deleted was ever removed from the corpus. Observed live on 2026-09-13:
 * `stopped=listing-refused@p4:500`, in an alert whose own text said "Nothing failed, so
 * this looks healthy".
 */
describe("a transient Drive refusal is retried, not fatal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    httpCalls.length = 0;
    files = [FILE];
    listOk = true;
    exportFails = false;
    exportFailStatus = 500;
    alwaysMorePages = false;
    listTransientFailures = 0;
    targets = {};
    pdfText = "";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-for-tests";
  });

  const listCalls = () => httpCalls.filter((u) => u.includes("/files?q=")).length;

  it("completes the walk when the listing 500s once", async () => {
    listTransientFailures = 1;

    const result = await ingestDrive(STAMP);

    // `complete: true` is the whole point — it is what unblocks the sweep.
    expect(result.complete).toBe(true);
    expect(result.sweepBlocked).toBe(false);
    expect(result.detail).not.toMatch(/stopped=/);
    // Two listing calls for one page: the refusal, then the retry that worked.
    expect(listCalls()).toBe(2);
  });

  it("still gives up once the attempts run out, rather than retrying forever", async () => {
    listTransientFailures = 99;

    const result = await ingestDrive(STAMP);

    expect(result.skipped).toBe("drive-list-failed");
    expect(listCalls()).toBe(3);
  });

  /**
   * A 403 is a permissions answer, not a blip. Retrying it spends the time budget
   * arriving at the same refusal — and this walk shares that budget with the export pass.
   */
  it("does not retry a 403, which would say the same thing three times", async () => {
    listOk = false;

    const result = await ingestDrive(STAMP);

    expect(result.skipped).toBe("drive-list-failed");
    expect(listCalls()).toBe(1);
  });
});

describe("personal-data exports are refused", () => {
  const addresses = (n: number, domain = "example.org") =>
    Array.from({ length: n }, (_, i) => `person${i}@${domain}`).join("\n");

  it("refuses a file that is a list of people", () => {
    /**
     * Found by audit 2026-09-17: three marketing audience exports were sitting in Drive
     * and fully indexed, putting 2,083 real people's email addresses into a corpus any
     * team member can search with one shared token. The rule against indexing user-level
     * rows existed; nothing enforced it.
     */
    expect(isPersonalDataExport(addresses(200))).toBe(true);
    expect(isPersonalDataExport(`email,name\n${addresses(1429)}`)).toBe(true);
  });

  it("leaves an ordinary document alone", () => {
    // The largest legitimate Drive document measured carries six addresses — a team page.
    expect(isPersonalDataExport(`Team:\n${addresses(6)}\n\nNotes about the project.`)).toBe(false);
    expect(isPersonalDataExport("A document with no addresses at all.")).toBe(false);
  });

  it("counts DISTINCT addresses, not mentions", () => {
    // One person cc'd on a long thread is not a list. Counting raw matches would refuse
    // real correspondence.
    const repeated = Array.from({ length: 200 }, () => "same.person@example.org").join(" ");
    expect(isPersonalDataExport(repeated)).toBe(false);
  });

  it("does not index a refused file, so the sweep can remove what is already stored", () => {
    // Returning zero rows keeps the file out of the walk's written-id set, which is what
    // lets `sweepMissing` clear the chunks indexed before this guard existed.
    const rows = docToRows(
      { id: "f1", name: "loveiq_audience1_completers_all.csv" } as never,
      addresses(500),
      "2026-09-17T00:00:00Z"
    );
    expect(rows).toEqual([]);
  });

  it("still indexes a normal file", () => {
    const rows = docToRows(
      { id: "f2", name: "Strategy notes" } as never,
      "We decided to focus on mobile. Contact anna@example.org for detail.",
      "2026-09-17T00:00:00Z"
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});

/**
 * Vendor billing is filtered by a RULE, where every other exclusion here is an id
 * list — so the rule has to be proven against the real names on both sides.
 *
 * Measured 2026-09-19: 93 billing files were in the corpus, and a drive-only search
 * for what was agreed about pricing in our calls returned five Slack billing
 * statements and NO meeting note.
 */
/**
 * Every name below is a real document that was in the corpus on 2026-09-22, and every
 * SPARED one is a real document that has to stay. Written from the measurement across
 * all 814 Drive documents rather than from imagination — the last title rule written
 * blind would have deleted two research papers.
 */
describe("isLegalInstrument", () => {
  it.each([
    "Freelancer Agreement_Fatih.docx",
    "Freelancer Agreement_\u2060Eman \u010ci\u010dku\u0161i\u0107.docx",
    "Freelancer Agreement Sanjin _SIGNED_mb_signed.pdf",
    "Freelancer Agreement Marc.docx",
    "Shareholders Agreement Applied Psychometrics GmbH",
    "Shareholders Agreement Applied Psychometrics GmbH - For Commenting",
    "AppliedPsychometrics_VSOP_Terms_of_Options",
    "Freelance Contract - Applied Psychometrics UG template.docx",
    "applied_psychometrics_freelance_contract_adapted.docx",
    "Confidentiality, Data Protection & Responsible Data Handling Agreement",
    "Ismar Fazlic Confidentiality, Data Protection & Responsible Data Handling Agreement",
    "Copy of Confidentiality, Data Protection & Responsible Data Handling Agreement",
  ])("keeps %j out", (name) => {
    expect(isLegalInstrument(name)).toBe(true);
  });

  it.each([
    // The team's working norms, not an instrument. Plural is the whole difference, and
    // an earlier draft of this rule buried it.
    "Development Agreements.md",
    "Development_Agreements.pdf",
    // Analysis ABOUT law, which is exactly what we want found.
    "DE_Dating_App_Legal_Compliance_Strategiepapier_Final.pdf",
    "EN_Dating_App_Legal_Compliance_Strategic_Paper_EN.pdf",
    "Legal_Compliance_Summary_EU_DE.pdf",
    // Ordinary documents that merely contain a matching word.
    "32 - Recommendations",
    "ShowUp_Epic_1_Backend_Foundation_Report.docx",
    "LoveIQ_Market_Analysis_Competitive_Matrix_EN",
  ])("leaves %j alone", (name) => {
    expect(isLegalInstrument(name)).toBe(false);
  });

  it("spares a MEETING about a contract, which is a discussion and not the instrument", () => {
    expect(
      isLegalInstrument("Eman <> Mark - Contract Sync - 2026/09/09 16:01 WEST - Notes by Gemini")
    ).toBe(false);
  });

  it("still excludes a contract whose name happens to mention notes", () => {
    // Guards the meeting carve-out from becoming a way through: only Gemini's own
    // "Notes by Gemini" suffix spares a file, not the word "notes".
    expect(isLegalInstrument("Freelancer Agreement Marc - notes.docx")).toBe(true);
  });

  it("is empty-safe", () => {
    expect(isLegalInstrument(undefined)).toBe(false);
    expect(isLegalInstrument("   ")).toBe(false);
  });
});

describe("isJobApplication", () => {
  /**
   * The real filenames. Fifteen external candidates' CVs were sitting in a corpus the
   * whole team can ask questions of — personal data of people who applied for a job
   * here, and nothing at all about how LoveIQ works.
   */
  it.each([
    "Adna Njuhović – CV.pdf (2).pdf",
    "CV Saša Arslanagić (1).pdf",
    "Habiba-Raafat-CV-Resume (1).pdf",
    "Iman_Beslija_CV.pdf",
    "Lejla Viteškić Resume (3).docx (1).pdf",
    "Naida Smailbegovic-cv.pdf",
    "Nađa Sinić 2026 _CV.pdf",
    "Resume (2).pdf",
    "hamza_ramic_cv.pdf",
  ])("drops %s", (name) => {
    expect(isJobApplication(name)).toBe(true);
  });

  /**
   * The line it must not cross. A document ABOUT hiring is company knowledge; the
   * pattern is anchored at word boundaries so none of these is touched, and measuring
   * across all 705 Drive documents produced no near miss.
   */
  it.each([
    "Business Case",
    "LoveIQ_Explorer_of_Edges_Preview.pdf",
    "Recruiting pipeline 2026",
    "cover-letter-template.docx",
    "curriculum-of-the-onboarding-week.md",
    "Onthology_Enity_Model",
  ])("keeps %s", (name) => {
    expect(isJobApplication(name)).toBe(false);
  });

  /**
   * A KNOWN EDGE, recorded rather than fixed — the same trade as "Invoice 2026
   * policy.pdf" below. A candidate's file often leads with the word ("CV Saša
   * Arslanagić"), so a document ABOUT CVs leads with it identically and the filename
   * cannot separate them. Narrowing to catch only a trailing token would miss five of
   * the fifteen real ones. No such document exists among the 705 Drive files, so it
   * costs nothing today, and this says so out loud.
   */
  it("drops a document named like a CV but about screening them", () => {
    expect(isJobApplication("CV screening process.docx")).toBe(true);
  });
});

describe("isVendorBilling", () => {
  const PDF = "application/pdf";

  // Every distinct naming shape actually present in the corpus.
  const BILLING = [
    "Atlassian_Invoice_IN-EU-002-332-278.pdf",
    "CookieYes_invoice_5256BCEE-848972_www.loveiq.org_Jun_2026.pdf",
    "github-loveiqhq-receipt-2026-03-20.pdf",
    "Invoice-MKWVRQXU-0008.pdf",
    "Invoice-2026-01-EmaDjedovic-AppliedPsychometrics-Feb2026.pdf",
    "Receipt-2124-3214-5234.pdf",
    "slack_fair_billing_statement_SBIE-11862133.pdf",
    "slack_invoice_11511445020947.pdf",
    "Invoice January 2026.pdf",
    // THE TWO THAT ESCAPED. Amazon Rechnungen, VAT boilerplate and all, still sitting
    // in the corpus on 2026-09-20 — the vendor put the reference number in the
    // document, and only the filename is known when the walk decides.
    "invoice 1.1.pdf",
    "invoice 1.2.pdf",
    "Rechnung.pdf",
    // The vendor reference with no spelled-out word. Three of these came back in the
    // top twelve for "what did we agree about pricing in our calls" — the question
    // this rule exists for — a day after the rule was supposedly fixed.
    "MT-INV00945830.pdf",
    "MT-INV00894286.pdf",
  ];

  it.each(BILLING)("drops %s", (name) => {
    expect(isVendorBilling(name, PDF)).toBe(true);
  });

  // Real documents from the same corpus that must NEVER be dropped.
  const KEEP: Array<[string, string]> = [
    ["Freelancer Agreement Sanjin _SIGNED_mb_signed.pdf", PDF],
    ["LoveIQ_Explorer_of_Edges_Preview.pdf", PDF],
    ["C-BRAIN UAT Milestone 2", "application/vnd.google-apps.document"],
    ["Business Case", "application/vnd.google-apps.spreadsheet"],
    ["Cost sheet audit — software & tooling, 19 Sep 2026", "application/vnd.google-apps.document"],
    ["LoveIQ Dynamic Pricing Engine — MVP Requirements", "application/vnd.google-apps.document"],
    ["Data_Acquisition_Automation.docx", PDF],
  ];

  it.each(KEEP)("keeps %s", (name, mime) => {
    expect(isVendorBilling(name, mime)).toBe(false);
  });

  it("keeps a document ABOUT invoicing, which has no vendor reference", () => {
    expect(isVendorBilling("Invoice process redesign.pdf", PDF)).toBe(false);
    expect(isVendorBilling("How our invoicing works.pdf", PDF)).toBe(false);
  });

  /**
   * The line the second test walks. A vendor's file is the word and its numbering; a
   * document about billing has something to say in its title, and that is exactly what
   * separates them once the reference number turns out to be unreliable.
   */
  it.each(["Invoice template.pdf", "Receipt tracker.pdf"])(
    "keeps %s — a title with something left in it once the numbering goes",
    (name) => {
      expect(isVendorBilling(name, PDF)).toBe(false);
    }
  );

  /**
   * A KNOWN EDGE, recorded rather than fixed. A year reads as a vendor reference, so
   * "Invoice 2026 policy.pdf" would be dropped even though it is a policy document.
   * Tightening the digit rule to exclude years would un-drop "Invoice January 2026.pdf",
   * a real invoice sitting in the list above, so the trade is deliberate. No such name
   * exists among the 705 Drive documents, so it costs nothing today; this test says so
   * out loud, so the next person meets a decision rather than a surprise.
   */
  it("drops a year-named document about billing, which is the accepted cost", () => {
    expect(isVendorBilling("Invoice 2026 policy.pdf", PDF)).toBe(true);
  });

  /**
   * THE TWO THIS RULE MUST NEVER REACH.
   *
   * `5419031713.pdf` is a Google invoice; `726933.pdf` is a peer-reviewed paper on
   * sexual and relationship variables, 26 chunks of it. Their names are the same shape,
   * and the rule decides before anything is fetched — so a "nothing but digits" test,
   * which catches every numeric invoice cleanly, also deletes the literature. Measured
   * before it shipped; these cases are why it did not.
   */
  it.each(["726933.pdf", "18.01.161.20221004.pdf", "5419031713.pdf"])(
    "never drops %s — a numeric name is not evidence either way",
    (name) => {
      expect(isVendorBilling(name, PDF)).toBe(false);
    }
  );

  it("never drops a non-pdf, whatever it is called", () => {
    // A spreadsheet named like an invoice is a ledger someone maintains, not a receipt.
    expect(
      isVendorBilling("Invoice-MKWVRQXU-0008", "application/vnd.google-apps.spreadsheet")
    ).toBe(false);
  });

  it("is not fooled by the word appearing mid-word", () => {
    expect(isVendorBilling("invoicing-2026-guide.pdf", PDF)).toBe(false);
  });
});

/**
 * The reconciler asks which tabs SHOULD have produced a heading, and the honest
 * answer is not "all of them".
 *
 * `sheetText` skips a tab with no rows, so a check expecting one heading per tab
 * title reports a gap the corpus can never close. Measured 2026-09-20: a tab named
 * ">>> Archive", used as a visual separator and holding nothing, was reported as a
 * missing tab by the nightly reconciler — a false alarm on a daily job, which is how
 * a check stops being read.
 */
describe("sheetTabsWithRows", () => {
  it("leaves out a tab that holds nothing", async () => {
    sheetTabs = ["Costs", ">>> Archive", "Core_KPI"];
    sheetValues = [
      { values: [["Slack", "41.25"]] },
      { values: [] },
      { values: [["Paid Reports", "600"]] },
    ];
    await expect(sheetTabsWithRows("t", "sheet1")).resolves.toEqual(["Costs", "Core_KPI"]);
  });

  it("treats a tab of blank cells as empty, not as content", async () => {
    sheetTabs = ["Real", "Blank"];
    sheetValues = [{ values: [["x"]] }, { values: [["", "  "], [""]] }];
    await expect(sheetTabsWithRows("t", "sheet1")).resolves.toEqual(["Real"]);
  });

  it("keeps every tab when they all hold something", async () => {
    sheetTabs = ["A", "B"];
    sheetValues = [{ values: [["1"]] }, { values: [["2"]] }];
    await expect(sheetTabsWithRows("t", "sheet1")).resolves.toEqual(["A", "B"]);
  });

  it("returns nothing for a spreadsheet with no tabs at all", async () => {
    sheetTabs = [];
    sheetValues = [];
    await expect(sheetTabsWithRows("t", "sheet1")).resolves.toEqual([]);
  });
});
