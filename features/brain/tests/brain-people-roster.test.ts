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
