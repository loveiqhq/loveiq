import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(),
}));

vi.mock("@features/brain/server/ingest/upsert", () => ({
  upsertChunks: vi.fn(async (rows: unknown[]) => rows.length),
  sweepStale: vi.fn(async () => 0),
}));

import { supabaseFetch } from "@features/admin/server/supabase";
import { upsertChunks } from "@features/brain/server/ingest/upsert";
import { ingestPeople } from "@features/brain/server/ingest/people";

const STAMP = "2026-09-11T12:00:00.000Z";
const mockFetch = vi.mocked(supabaseFetch);
const mockUpsert = vi.mocked(upsertChunks);

function roster(people: unknown[]) {
  mockFetch.mockResolvedValue({ ok: true, json: async () => people } as never);
}
const written = () => (mockUpsert.mock.calls[0]?.[0] as Array<{ body: string; meta: unknown }>)[0];

afterEach(() => vi.clearAllMocks());

describe("the people roster", () => {
  it("spells the initials out, because nobody asks for the Chief Technology Officer", async () => {
    // The defect: a roster holding only the expanded title ranked 1st for "who is the
    // CEO" and MISSED "who is the CTO" outright — those three letters were nowhere in it.
    roster([
      {
        canonical: "A Person",
        kind: "person",
        active: true,
        role: "Chief Technology Officer",
        role_confidence: "confirmed",
      },
    ]);
    await ingestPeople(STAMP);
    expect(written().body).toContain("Chief Technology Officer (CTO)");
  });

  /** Measured 2026-09-24: the names in a longer role became "(CEOMBSK)" and "(OMOMB)". */
  it("abbreviates only the leading title, never the names in the rest of the role", async () => {
    roster([
      {
        canonical: "Mark Oldenburg",
        kind: "person",
        active: true,
        role: "Chief Executive Officer; owns design decisions together with Marcus Börner and Sanjin Kacevac",
        role_confidence: "confirmed",
      },
      {
        canonical: "Sanjin Kacevac",
        kind: "person",
        active: true,
        role: "Owns design decisions together with Mark Oldenburg and Marcus Börner",
        role_confidence: "confirmed",
      },
    ]);
    await ingestPeople(STAMP);
    expect(written().body).toContain("Chief Executive Officer (CEO); owns design decisions");
    expect(written().body).toContain("together with Marcus Börner and Sanjin Kacevac\n");
    expect(written().body).toContain("together with Mark Oldenburg and Marcus Börner\n");
    expect(written().body).not.toMatch(/\((?:CEOMBSK|OMOMB)\)/);
  });

  it("does not invent an acronym for a one-word role", async () => {
    roster([
      {
        canonical: "A Person",
        kind: "person",
        active: true,
        role: "Developer",
        role_confidence: "confirmed",
      },
    ]);
    await ingestPeople(STAMP);
    expect(written().body).toContain("A Person: Developer");
    expect(written().body).not.toMatch(/Developer \(/);
  });

  it("carries an unconfirmed role's caveat into the text a reader sees", async () => {
    // A role reported with "don't take me for granted" must not read as settled fact.
    roster([
      {
        canonical: "A Person",
        kind: "person",
        active: true,
        role: "Product",
        role_confidence: "unconfirmed",
      },
    ]);
    await ingestPeople(STAMP);
    expect(written().body).toMatch(/unconfirmed/i);
  });

  it("says a role is unrecorded rather than leaving the person out", async () => {
    roster([
      { canonical: "A Person", kind: "person", active: true, role: null, role_confidence: null },
    ]);
    await ingestPeople(STAMP);
    expect(written().body).toContain("role not recorded");
    expect(written().body).toContain("do not guess one");
  });

  it("marks someone who has left, so old email does not read as current staff", async () => {
    roster([
      {
        canonical: "A Person",
        kind: "person",
        active: false,
        role: "Designer",
        role_confidence: "confirmed",
      },
    ]);
    await ingestPeople(STAMP);
    expect(written().body).toContain("has left the company");
  });

  it("writes nothing when the registry cannot be read, so a bad request cannot sweep the roster away", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 } as never);
    const r = await ingestPeople(STAMP);
    expect(r.skipped).toBe("people-read-503");
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe("the metadata filter", () => {
  // Measured 2026-09-11: `speakers` and `participants` both returned 0 hits for a
  // bare string and worked as an array. jsonb containment makes that a SUCCESSFUL
  // query with no rows, so an empty result reads as "this person said nothing"
  // rather than "wrong shape" — the worst failure a filter can have.
  it("wraps a bare string for a list-valued key, so the filter cannot fail silently", async () => {
    const { normaliseMetaFilter } = await import("@features/brain/server/retrieve");
    for (const key of ["people", "speakers", "participants", "attendees", "covers"]) {
      expect(normaliseMetaFilter({ [key]: "Mark Oldenburg" })).toEqual({
        [key]: ["Mark Oldenburg"],
      });
    }
  });

  it("leaves a scalar key alone — wrapping status would break every Notion filter", async () => {
    const { normaliseMetaFilter } = await import("@features/brain/server/retrieve");
    expect(normaliseMetaFilter({ status: "WIP" })).toEqual({ status: "WIP" });
    expect(normaliseMetaFilter({ channel: "all-loveiq" })).toEqual({ channel: "all-loveiq" });
  });

  it("passes an array through unchanged", async () => {
    const { normaliseMetaFilter } = await import("@features/brain/server/retrieve");
    expect(normaliseMetaFilter({ people: ["A", "B"] })).toEqual({ people: ["A", "B"] });
  });
});

/**
 * A colleague who has left is still all over the corpus.
 *
 * Marking someone inactive used to remove them from the roster entirely: `withoutRole`
 * excluded them and `withRole` never held them, because a departed colleague rarely has
 * a role recorded. `line()`'s "has left the company" suffix became unreachable for
 * exactly the people it was written for. Measured 2026-09-20, one of the five is named
 * in 315 chunks across six sources — so the corpus invites "who is this?" and the
 * roster could no longer answer.
 */
describe("people who have left", () => {
  const LEFT = {
    canonical: "Gone Person",
    kind: "person",
    active: false,
    role: null,
    role_confidence: null,
  };
  const HERE = {
    canonical: "Here Person",
    kind: "person",
    active: true,
    role: null,
    role_confidence: null,
  };

  it("still names someone who has left, rather than dropping them silently", async () => {
    roster([LEFT, HERE]);
    await ingestPeople(STAMP);
    expect(written().body).toContain("Gone Person");
  });

  it("does not list them as being on the team", async () => {
    roster([LEFT, HERE]);
    await ingestPeople(STAMP);
    const body = written().body;
    const teamAt = body.indexOf("Also on the team");
    const leftAt = body.indexOf("No longer at LoveIQ");
    expect(leftAt).toBeGreaterThan(-1);
    // "Here Person" sits under the team heading; "Gone Person" must be below the split.
    expect(body.indexOf("Here Person")).toBeGreaterThan(teamAt);
    expect(body.indexOf("Gone Person")).toBeGreaterThan(leftAt);
  });

  it("says plainly that they are not to be contacted or assigned work", async () => {
    roster([LEFT, HERE]);
    await ingestPeople(STAMP);
    expect(written().body).toMatch(/Do not assign them work or contact them/i);
  });

  it("omits the section entirely when nobody has left", async () => {
    roster([HERE]);
    await ingestPeople(STAMP);
    expect(written().body).not.toContain("No longer at LoveIQ");
  });

  it("keeps a departed person who DID have a role out of the current list", async () => {
    roster([{ ...LEFT, role: "Head of Data", role_confidence: "confirmed" }, HERE]);
    await ingestPeople(STAMP);
    const body = written().body;
    expect(body.indexOf("Gone Person")).toBeGreaterThan(body.indexOf("No longer at LoveIQ"));
  });
});
