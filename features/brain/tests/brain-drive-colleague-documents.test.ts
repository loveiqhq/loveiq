import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Everything that lives in a COLLEAGUE'S Drive.
 *
 * Google Meet files a Gemini note in the ORGANISER's Drive, and this walk reads as a
 * single account — so measured 2026-09-19, 124 documents were invisible to it, 97 of
 * them one person's.
 *
 * THIS FILE USED TO ARGUE THE OPPOSITE, and the reversal is the point. The first
 * version returned only files matching `notes by gemini`, and its tests asserted by
 * name that a colleague's landlord dispute, a shareholders agreement and employee
 * option terms were never returned. That trade was put to the owner on 2026-09-21 and
 * the decision was to index everything, so those assertions are gone — they encoded a
 * policy the company no longer holds, and leaving them would have made the change look
 * like a regression.
 *
 * What is still asserted, because it is still true: CVs never reach the corpus, each
 * file is read with the token it was LISTED with, and a colleague who refuses does not
 * break the walk.
 */

const mailboxes: { value: string[] | null } = { value: null };
vi.mock("@features/brain/server/ingest/gmail", () => ({
  domainMailboxes: vi.fn(async () => mailboxes.value),
}));

const refuseToken: Set<string> = new Set();
vi.mock("@shared/http/google-oauth", () => ({
  DRIVE_SCOPE: "drive",
  getGoogleAccessToken: vi.fn(async () => "admin-token"),
  getDelegatedToken: vi.fn(async (subject: string) =>
    refuseToken.has(subject) ? null : `tok:${subject}`
  ),
  isGoogleConfigured: () => true,
  googleCredentialShape: () => "test",
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async () => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => [],
  })),
}));

/** Per-mailbox file lists, keyed by the owner in the query. */
const drive: Record<string, Array<{ id: string; name: string }>> = {};
const listFails = new Set<string>();
const queries: string[] = [];

/** Owners whose listing is returned across two pages, to exercise the paging. */
const paged = new Set<string>();

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string) => {
    queries.push(url);
    const decoded = decodeURIComponent(url);
    const owner = decoded.match(/'([^']+)' in owners/)?.[1] ?? "";
    if (listFails.has(owner)) return { ok: false, status: 403, text: async () => "denied" };
    const all = drive[owner] ?? [];
    if (paged.has(owner)) {
      const second = /pageToken=/.test(decoded);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          files: second ? all.slice(1) : all.slice(0, 1),
          ...(second ? {} : { nextPageToken: "more" }),
        }),
        text: async () => "",
      };
    }
    return { ok: true, status: 200, json: async () => ({ files: all }), text: async () => "" };
  }),
}));

import { colleagueDocuments } from "@features/brain/server/ingest/drive";

const NOTE = "Report Review - 2026/09/07 13:00 WEST - Notes by Gemini";
const NOTE2 = "Meeting started 2026/09/04 12:50 WEST - Notes by Gemini";

beforeEach(() => {
  mailboxes.value = null;
  refuseToken.clear();
  listFails.clear();
  paged.clear();
  queries.length = 0;
  for (const k of Object.keys(drive)) delete drive[k];
});

describe("colleagueDocuments", () => {
  it("returns nothing when the directory cannot be read, rather than throwing", async () => {
    mailboxes.value = null;
    const r = await colleagueDocuments(new Set(), () => false);
    expect(r.items).toEqual([]);
    expect(r.tokens.size).toBe(0);
    expect({ asked: r.asked, refused: r.refused }).toEqual({ asked: 0, refused: 0 });
  });

  it("collects a meeting note that only a colleague can see", async () => {
    mailboxes.value = ["mo@loveiq.org"];
    drive["mo@loveiq.org"] = [{ id: "n1", name: NOTE }];
    const r = await colleagueDocuments(new Set(), () => false);
    expect(r.items.map((f) => f.id)).toEqual(["n1"]);
    expect(r.asked).toBe(1);
  });

  it("accepts the other shape Gemini uses", async () => {
    mailboxes.value = ["mo@loveiq.org"];
    drive["mo@loveiq.org"] = [{ id: "n2", name: NOTE2 }];
    const r = await colleagueDocuments(new Set(), () => false);
    expect(r.items.map((f) => f.id)).toEqual(["n2"]);
  });

  /**
   * THE DECISION, WRITTEN AS A TEST.
   *
   * These are the real names of documents sitting in colleagues' Drives. The first
   * version of this walk refused every one of them by construction, and this block
   * asserted exactly that. On 2026-09-21 the owner decided the brain should index
   * everything, so they are returned now.
   *
   * Kept as named cases rather than deleted, because the list IS the decision: anyone
   * reading this can see precisely what "everything" reaches — a shareholders
   * agreement, employee option terms, a confidential information memorandum, and a
   * colleague's landlord dispute. `SKIP_FILE_IDS` is the mechanism if any single one
   * of them should come back out.
   */
  it.each([
    "01_Raeumungsaufforderung",
    "03_Mahnung",
    "07_Wohnungsuebergabeprotokoll",
    "08_Kautionsabrechnung",
    "CIM - Project Ignite.pdf",
    "Shareholders Agreement Applied Psychometrics GmbH",
    "AppliedPsychometrics_VSOP_Terms_of_Options",
    "cto-cofounder-profile-loveiq.md",
    "Handelsregisterauszug.pdf",
  ])("now returns %s, which the narrow rule refused", async (name) => {
    mailboxes.value = ["mb@loveiq.org"];
    drive["mb@loveiq.org"] = [{ id: "private", name }];
    const r = await colleagueDocuments(new Set(), () => false);
    expect(r.items.map((f) => f.name)).toEqual([name]);
  });

  it("asks for a colleague's whole Drive, not only their meeting notes", async () => {
    mailboxes.value = ["mo@loveiq.org"];
    drive["mo@loveiq.org"] = [{ id: "n1", name: NOTE }];
    await colleagueDocuments(new Set(), () => false);
    const q = decodeURIComponent(queries[0] ?? "");
    expect(q).toContain("'mo@loveiq.org' in owners");
    // The name filter is gone; the mime filter is the admin walk's.
    expect(q).not.toContain("Notes by Gemini");
    expect(q).toContain("application/vnd.google-apps.document");
    expect(q).toContain("application/pdf");
  });

  /**
   * A colleague owning 197 documents is a real case, and the meeting-note version
   * asked for one unpaged page of 200 — the quiet truncation this file has been
   * bitten by before.
   */
  it("pages through a colleague who owns more than one page", async () => {
    mailboxes.value = ["mo@loveiq.org"];
    paged.add("mo@loveiq.org");
    drive["mo@loveiq.org"] = [
      { id: "p1", name: "First" },
      { id: "p2", name: "Second" },
    ];
    const r = await colleagueDocuments(new Set(), () => false);
    expect(r.items.map((f) => f.id).sort()).toEqual(["p1", "p2"]);
  });

  /**
   * THE REGRESSION THIS SHIPPED WITH, for one night.
   *
   * The notes were listed with a colleague's token and then fetched with the ADMIN's,
   * which cannot see them — that is the whole reason they were invisible. Every one
   * came back 404, fourteen of those tripped the export-failure tolerance, the walk
   * stopped early, and because the sweep gate is "the listing completed", the sweep
   * stopped running too. One wrong token, three failures downstream.
   */
  it("returns the token each note must be READ with, not the admin's", async () => {
    mailboxes.value = ["mo@loveiq.org"];
    drive["mo@loveiq.org"] = [{ id: "n1", name: NOTE }];
    const r = await colleagueDocuments(new Set(), () => false);
    expect(r.tokens.get("n1")).toBe("tok:mo@loveiq.org");
  });

  it("gives each colleague's note that colleague's own token", async () => {
    mailboxes.value = ["mo@loveiq.org", "mb@loveiq.org"];
    drive["mo@loveiq.org"] = [{ id: "a", name: NOTE }];
    drive["mb@loveiq.org"] = [{ id: "b", name: NOTE2 }];
    const r = await colleagueDocuments(new Set(), () => false);
    expect(r.tokens.get("a")).toBe("tok:mo@loveiq.org");
    expect(r.tokens.get("b")).toBe("tok:mb@loveiq.org");
  });

  it("does not re-list something the admin walk already found", async () => {
    mailboxes.value = ["mo@loveiq.org"];
    drive["mo@loveiq.org"] = [{ id: "dupe", name: NOTE }];
    const r = await colleagueDocuments(new Set(["dupe"]), () => false);
    expect(r.items).toEqual([]);
  });

  it("does not return the same note twice when two colleagues both hold it", async () => {
    mailboxes.value = ["mo@loveiq.org", "mb@loveiq.org"];
    drive["mo@loveiq.org"] = [{ id: "same", name: NOTE }];
    drive["mb@loveiq.org"] = [{ id: "same", name: NOTE }];
    const r = await colleagueDocuments(new Set(), () => false);
    expect(r.items).toHaveLength(1);
  });

  /**
   * COMPLETENESS IS A SWEEP GATE, not a statistic.
   *
   * `listed.complete` decides whether the sweep deletes rows that were not listed this
   * run. It used to read the ADMIN listing alone, which was survivable while this
   * function returned at most fourteen meeting notes. Returning a colleague's whole
   * Drive changes that: one mailbox lost to the clock or to a refused token would
   * present ~100 live documents to the sweep as deleted — too few to trip the majority
   * guard, so they would actually go, come back next run, and go again.
   */
  it("is complete when every mailbox was walked to the end", async () => {
    mailboxes.value = ["mo@loveiq.org", "mb@loveiq.org"];
    drive["mo@loveiq.org"] = [{ id: "a", name: "One" }];
    drive["mb@loveiq.org"] = [{ id: "b", name: "Two" }];
    expect((await colleagueDocuments(new Set(), () => false)).complete).toBe(true);
  });

  it("is NOT complete when a colleague's token is refused", async () => {
    mailboxes.value = ["mb@loveiq.org", "mo@loveiq.org"];
    refuseToken.add("mb@loveiq.org");
    drive["mo@loveiq.org"] = [{ id: "n1", name: NOTE }];
    expect((await colleagueDocuments(new Set(), () => false)).complete).toBe(false);
  });

  it("is NOT complete when a colleague's listing fails", async () => {
    mailboxes.value = ["mo@loveiq.org"];
    listFails.add("mo@loveiq.org");
    expect((await colleagueDocuments(new Set(), () => false)).complete).toBe(false);
  });

  /**
   * TWO CLOCK CHECKS, TWO TESTS. The walk asks the clock once per mailbox and once per
   * page, and a single test hits whichever comes first — mutation testing showed the
   * original one passing through the PAGE check while the MAILBOX check's
   * `complete = false` was deleted. One test per path, with the call count chosen so
   * the intended one trips.
   *
   * Each mailbox with a single unpaged result costs exactly two clock calls: the
   * mailbox check, then the page check.
   */
  it("is NOT complete when the clock stops it between mailboxes", async () => {
    mailboxes.value = ["a@loveiq.org", "b@loveiq.org", "c@loveiq.org"];
    for (const m of mailboxes.value) drive[m] = [{ id: m, name: NOTE }];
    let calls = 0;
    // Calls 1-2 walk the first mailbox; call 3 is the second mailbox's own check.
    const r = await colleagueDocuments(new Set(), () => ++calls >= 3);
    expect(r.items.map((f) => f.id)).toEqual(["a@loveiq.org"]);
    expect(r.complete).toBe(false);
  });

  it("is NOT complete when the clock stops it between pages", async () => {
    mailboxes.value = ["a@loveiq.org"];
    paged.add("a@loveiq.org");
    drive["a@loveiq.org"] = [
      { id: "p1", name: "First" },
      { id: "p2", name: "Second" },
    ];
    let calls = 0;
    // Call 1 is the mailbox check, call 2 the first page; call 3 is the second page.
    const r = await colleagueDocuments(new Set(), () => ++calls >= 3);
    expect(r.items.map((f) => f.id)).toEqual(["p1"]);
    expect(r.complete).toBe(false);
  });

  /**
   * `null` and `[]` are different answers from the directory and only one is a
   * failure. Conflating them blocks the sweep forever wherever the directory is not
   * configured — which is every test in `brain-drive.test.ts`, and how this was caught.
   */
  it("is NOT complete when the directory cannot be read at all", async () => {
    mailboxes.value = null;
    expect((await colleagueDocuments(new Set(), () => false)).complete).toBe(false);
  });

  it("IS complete when the directory is readable and simply empty", async () => {
    mailboxes.value = [];
    expect((await colleagueDocuments(new Set(), () => false)).complete).toBe(true);
  });

  it("keeps walking when one colleague refuses, and counts the refusal", async () => {
    mailboxes.value = ["mb@loveiq.org", "mo@loveiq.org"];
    refuseToken.add("mb@loveiq.org");
    drive["mo@loveiq.org"] = [{ id: "n1", name: NOTE }];
    const r = await colleagueDocuments(new Set(), () => false);
    expect(r.items.map((f) => f.id)).toEqual(["n1"]);
    expect(r.refused).toBe(1);
    expect(r.asked).toBe(1);
  });

  it("counts a listing refusal too, rather than reporting an empty Drive", async () => {
    mailboxes.value = ["mo@loveiq.org"];
    listFails.add("mo@loveiq.org");
    const r = await colleagueDocuments(new Set(), () => false);
    expect(r.items).toEqual([]);
    expect(r.refused).toBe(1);
  });

  it("stops when the clock runs out instead of walking every colleague", async () => {
    mailboxes.value = ["a@loveiq.org", "b@loveiq.org", "c@loveiq.org"];
    for (const m of mailboxes.value) drive[m] = [{ id: m, name: NOTE }];
    let calls = 0;
    const outOfTime = () => ++calls > 1;
    const r = await colleagueDocuments(new Set(), outOfTime);
    expect(r.items.length).toBeLessThan(3);
  });
});
