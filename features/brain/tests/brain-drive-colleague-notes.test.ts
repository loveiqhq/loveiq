import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Meeting notes that live in a COLLEAGUE'S Drive.
 *
 * Google Meet files a Gemini note in the ORGANISER's Drive, and this walk reads as a
 * single account — so every meeting we did not organise was unreadable. Measured
 * 2026-09-19 by impersonating each colleague in turn: 122 documents were invisible,
 * 14 of them meeting notes.
 *
 * The rule is deliberately narrow, and these tests exist to keep it narrow. The other
 * 108 invisible files include a colleague's landlord dispute (eviction demand, dunning
 * letters, deposit settlement), a confidential information memorandum, a shareholders
 * agreement and employee option terms. None of them is a Gemini meeting note, so the
 * exclusion holds by construction — and a test that proves it must use those real
 * names, not invented ones.
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

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string) => {
    queries.push(url);
    const owner = decodeURIComponent(url).match(/'([^']+)' in owners/)?.[1] ?? "";
    if (listFails.has(owner)) return { ok: false, status: 403, text: async () => "denied" };
    return {
      ok: true,
      status: 200,
      json: async () => ({ files: drive[owner] ?? [] }),
      text: async () => "",
    };
  }),
}));

import { colleagueMeetingNotes } from "@features/brain/server/ingest/drive";

const NOTE = "Report Review - 2026/09/07 13:00 WEST - Notes by Gemini";
const NOTE2 = "Meeting started 2026/09/04 12:50 WEST - Notes by Gemini";

beforeEach(() => {
  mailboxes.value = null;
  refuseToken.clear();
  listFails.clear();
  queries.length = 0;
  for (const k of Object.keys(drive)) delete drive[k];
});

describe("colleagueMeetingNotes", () => {
  it("returns nothing when the directory cannot be read, rather than throwing", async () => {
    mailboxes.value = null;
    const r = await colleagueMeetingNotes(new Set(), () => false);
    expect(r.items).toEqual([]);
    expect(r.tokens.size).toBe(0);
    expect({ asked: r.asked, refused: r.refused }).toEqual({ asked: 0, refused: 0 });
  });

  it("collects a meeting note that only a colleague can see", async () => {
    mailboxes.value = ["mo@loveiq.org"];
    drive["mo@loveiq.org"] = [{ id: "n1", name: NOTE }];
    const r = await colleagueMeetingNotes(new Set(), () => false);
    expect(r.items.map((f) => f.id)).toEqual(["n1"]);
    expect(r.asked).toBe(1);
  });

  it("accepts the other shape Gemini uses", async () => {
    mailboxes.value = ["mo@loveiq.org"];
    drive["mo@loveiq.org"] = [{ id: "n2", name: NOTE2 }];
    const r = await colleagueMeetingNotes(new Set(), () => false);
    expect(r.items.map((f) => f.id)).toEqual(["n2"]);
  });

  /**
   * THE TEST THAT MATTERS. These are the real names of the private documents sitting
   * beside those meeting notes in the same Drive.
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
  ])("never returns a colleague's private document: %s", async (name) => {
    mailboxes.value = ["mb@loveiq.org"];
    drive["mb@loveiq.org"] = [{ id: "private", name }];
    const r = await colleagueMeetingNotes(new Set(), () => false);
    expect(r.items).toEqual([]);
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
    const r = await colleagueMeetingNotes(new Set(), () => false);
    expect(r.tokens.get("n1")).toBe("tok:mo@loveiq.org");
  });

  it("gives each colleague's note that colleague's own token", async () => {
    mailboxes.value = ["mo@loveiq.org", "mb@loveiq.org"];
    drive["mo@loveiq.org"] = [{ id: "a", name: NOTE }];
    drive["mb@loveiq.org"] = [{ id: "b", name: NOTE2 }];
    const r = await colleagueMeetingNotes(new Set(), () => false);
    expect(r.tokens.get("a")).toBe("tok:mo@loveiq.org");
    expect(r.tokens.get("b")).toBe("tok:mb@loveiq.org");
  });

  it("does not re-list something the admin walk already found", async () => {
    mailboxes.value = ["mo@loveiq.org"];
    drive["mo@loveiq.org"] = [{ id: "dupe", name: NOTE }];
    const r = await colleagueMeetingNotes(new Set(["dupe"]), () => false);
    expect(r.items).toEqual([]);
  });

  it("does not return the same note twice when two colleagues both hold it", async () => {
    mailboxes.value = ["mo@loveiq.org", "mb@loveiq.org"];
    drive["mo@loveiq.org"] = [{ id: "same", name: NOTE }];
    drive["mb@loveiq.org"] = [{ id: "same", name: NOTE }];
    const r = await colleagueMeetingNotes(new Set(), () => false);
    expect(r.items).toHaveLength(1);
  });

  it("keeps walking when one colleague refuses, and counts the refusal", async () => {
    mailboxes.value = ["mb@loveiq.org", "mo@loveiq.org"];
    refuseToken.add("mb@loveiq.org");
    drive["mo@loveiq.org"] = [{ id: "n1", name: NOTE }];
    const r = await colleagueMeetingNotes(new Set(), () => false);
    expect(r.items.map((f) => f.id)).toEqual(["n1"]);
    expect(r.refused).toBe(1);
    expect(r.asked).toBe(1);
  });

  it("counts a listing refusal too, rather than reporting an empty Drive", async () => {
    mailboxes.value = ["mo@loveiq.org"];
    listFails.add("mo@loveiq.org");
    const r = await colleagueMeetingNotes(new Set(), () => false);
    expect(r.items).toEqual([]);
    expect(r.refused).toBe(1);
  });

  it("stops when the clock runs out instead of walking every colleague", async () => {
    mailboxes.value = ["a@loveiq.org", "b@loveiq.org", "c@loveiq.org"];
    for (const m of mailboxes.value) drive[m] = [{ id: m, name: NOTE }];
    let calls = 0;
    const outOfTime = () => ++calls > 1;
    const r = await colleagueMeetingNotes(new Set(), outOfTime);
    expect(r.items.length).toBeLessThan(3);
  });

  it("asks Google to filter, so a colleague with thousands of files is not paged through", async () => {
    mailboxes.value = ["mo@loveiq.org"];
    drive["mo@loveiq.org"] = [{ id: "n1", name: NOTE }];
    await colleagueMeetingNotes(new Set(), () => false);
    const q = decodeURIComponent(queries[0] ?? "");
    expect(q).toContain("'mo@loveiq.org' in owners");
    expect(q).toContain("Notes by Gemini");
  });
});
