import { beforeEach, describe, expect, it, vi } from "vitest";

/** Content-Range is where PostgREST puts an exact count; `ok:false` = unreadable. */
let responses: Array<{ ok: boolean; total?: number }> = [];
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async () => {
    const next = responses.shift() ?? { ok: true, total: 0 };
    return {
      ok: next.ok,
      headers: new Headers(
        next.total === undefined ? {} : { "content-range": `0-0/${next.total}` }
      ),
    };
  }),
}));

import { describeBrainHealth, readBrainHealth, WINDOW_HOURS } from "@features/brain/server/health";

beforeEach(() => {
  responses = [];
});

const health = (over: Partial<Parameters<typeof describeBrainHealth>[0]> = {}) => ({
  calls: 24,
  searches: 17,
  emptySearches: 0,
  outages: 0,
  failures: 0,
  ...over,
});

describe("describeBrainHealth — silent unless something is actually wrong", () => {
  /**
   * The shape of the real window on 2026-09-07: 24 calls, no empty searches, no
   * outages. The two `error` rows in it were a deliberate path refusal and an
   * upstream 404 — the system working — which is exactly why this function never
   * looks at that column.
   */
  it("says nothing about a healthy day", () => {
    expect(describeBrainHealth(health())).toBeNull();
  });

  /**
   * Nobody asking is a fact about the team, not a fault in the brain. It has answered
   * 33 questions in its life; a watchdog that treats that as breakage would alert
   * every day and be muted within a week — which is what happened to seven
   * informational pushes on 2026-07-26.
   */
  it("says nothing when there was no usage at all", () => {
    expect(describeBrainHealth(health({ calls: 0, searches: 0 }))).toBeNull();
  });

  it("reports an outage, and calls it an outage rather than an empty result", () => {
    const said = describeBrainHealth(health({ outages: 3 }));
    expect(said).toContain("unreachable");
    expect(said).toContain("not an empty result");
  });

  it("reports a tool that threw", () => {
    expect(describeBrainHealth(health({ failures: 2 }))).toContain("failed outright");
  });

  /**
   * One or two empty searches are questions the corpus does not cover, which is honest
   * and not a fault. Only a pattern is worth a word — so both the floor and the share
   * have to be met.
   */
  it("stays quiet below the volume floor, even at a high share", () => {
    expect(describeBrainHealth(health({ searches: 2, emptySearches: 2 }))).toBeNull();
  });

  it("stays quiet above the floor when the share is small", () => {
    expect(describeBrainHealth(health({ searches: 100, emptySearches: 4 }))).toBeNull();
  });

  it("speaks when enough searches come back empty", () => {
    const said = describeBrainHealth(health({ searches: 10, emptySearches: 5 }));
    expect(said).toContain("5 of 10");
    expect(said).toContain("50%");
  });

  it("cannot divide by zero when there were no searches but other faults exist", () => {
    expect(describeBrainHealth(health({ searches: 0, emptySearches: 0, outages: 1 }))).toContain(
      "unreachable"
    );
  });

  it("reports every fault it found, not just the first", () => {
    const said = describeBrainHealth(health({ outages: 1, failures: 1 }));
    expect(said).toContain("unreachable");
    expect(said).toContain("failed outright");
  });
});

describe("readBrainHealth — 'could not tell' is not 'healthy'", () => {
  it("returns the five counts when every read succeeds", async () => {
    responses = [
      { ok: true, total: 24 },
      { ok: true, total: 17 },
      { ok: true, total: 1 },
      { ok: true, total: 0 },
      { ok: true, total: 0 },
    ];
    expect(await readBrainHealth()).toEqual({
      calls: 24,
      searches: 17,
      emptySearches: 1,
      outages: 0,
      failures: 0,
    });
  });

  /**
   * THE REGRESSION THIS GUARDS. Returning zeroes on an unreadable database would make
   * `describeBrainHealth` report a healthy day — the same class of lie as telling a
   * model the corpus is empty when it is merely unreachable.
   */
  it("returns null when a count cannot be read, rather than reporting zero", async () => {
    responses = [{ ok: true, total: 24 }, { ok: false }];
    expect(await readBrainHealth()).toBeNull();
  });

  it("returns null when the count header is missing entirely", async () => {
    responses = [{ ok: true }];
    expect(await readBrainHealth()).toBeNull();
  });

  it("looks at a day, matching the once-per-day alert dedup", () => {
    expect(WINDOW_HOURS).toBe(24);
  });
});
