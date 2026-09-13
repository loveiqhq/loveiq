import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/** Rows the database holds for the source under test. */
let stored: Array<{ source_id: string; meta: Record<string, unknown> }> = [];
const deleted: string[] = [];
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async (path: string, init?: RequestInit) => {
    if ((init?.method ?? "GET").toUpperCase() === "DELETE") {
      deleted.push(
        ...(decodeURIComponent(path).match(/"([^"]+)"/g) ?? []).map((q) => q.slice(1, -1))
      );
      return { ok: true, headers: new Headers(), json: async () => deleted.map(() => ({})) };
    }
    const off = Number(/offset=(\d+)/.exec(path)?.[1] ?? 0);
    return { ok: true, headers: new Headers(), json: async () => (off === 0 ? stored : []) };
  }),
}));

import { sweepMissing } from "@features/brain/server/ingest/upsert";

/**
 * A SCOPE THAT DISAPPEARS WHOLE IS LOST ACCESS, NOT DELETED DOCUMENTS.
 *
 * The majority guard refuses only ABOVE half a source. Measured 2026-09-06, drive's
 * largest owner holds 48.5% of that source — it would be deleted entire and the guard
 * would miss it by 1.5 points.
 *
 * Not hypothetical: production Drive once listed 24 documents where the same code on a
 * laptop listed 512, and only the majority guard stopped each run removing the other
 * ~11,000 chunks. At 48% it would not have stopped anything.
 *
 * Tested HERE rather than through an ingester because this is where the rule lives, and
 * because gmail cannot exercise it — its walked-mailbox rule already keeps rows from a
 * mailbox the run did not cover, so a gmail test passes for the older reason and proves
 * nothing about this one. Drive and notion have no such rule; they have only this.
 */
const rows = (n: number, scope: string, prefix: string) =>
  Array.from({ length: n }, (_, i) => ({ source_id: `${prefix}${i}`, meta: { owner: scope } }));

const seen = (list: string[]) => new Set(list);
const ids = (rs: Array<{ source_id: string }>) => rs.map((r) => r.source_id);

describe("sweepMissing — vanishing scope", () => {
  beforeEach(() => {
    stored = [];
    deleted.length = 0;
  });

  it("refuses when one scope would lose every row it holds", async () => {
    // 30 of 70 — a 43% minority, so the majority guard passes it straight through.
    stored = [...rows(30, "gone@loveiq.org", "g"), ...rows(40, "here@loveiq.org", "h")];
    const swept = await sweepMissing("drive", seen(ids(rows(40, "here@loveiq.org", "h"))), {
      scopeKey: "owner",
    });
    expect(swept).toBe(0);
    expect(deleted).toEqual([]);
  });

  it("sweeps when a scope only PARTLY empties, however many rows that is", async () => {
    /**
     * The distinguishing case for "whole scope", and the numbers are the test. 30 rows
     * lost from a single scope of 70 clears BOTH floors — 30 >= 20 rows and 30 >= 5% —
     * so the only thing separating this from the case above is that the scope survives.
     * Written first with 5 orphans, which sat under the row floor and so passed whether
     * that condition existed or not.
     */
    stored = rows(70, "here@loveiq.org", "h");
    const swept = await sweepMissing("drive", seen(ids(stored).slice(30)), { scopeKey: "owner" });
    expect(swept).toBe(30);
    expect(deleted).toHaveLength(30);
  });

  it("ignores a vanishing scope below the ROW floor, even though it clears the share", async () => {
    // 10 of 80 rows: 12.5% clears the 5% share, so only the 20-row floor lets this
    // through. One small shared folder going away must not block every future sweep.
    stored = [...rows(10, "oneoff@x.org", "t"), ...rows(70, "here@loveiq.org", "h")];
    await sweepMissing("drive", seen(ids(rows(70, "here@loveiq.org", "h"))), {
      scopeKey: "owner",
    });
    expect(deleted).toHaveLength(10);
  });

  it("ignores a vanishing scope below the SHARE floor, even though it clears the rows", async () => {
    // 25 rows clears the 20-row floor, but against a 925-row source it is 2.7% — far
    // too small a slice to read as lost access. Only the share condition allows it.
    stored = [...rows(25, "small@x.org", "s"), ...rows(900, "here@loveiq.org", "h")];
    await sweepMissing("drive", seen(ids(rows(900, "here@loveiq.org", "h"))), {
      scopeKey: "owner",
    });
    expect(deleted).toHaveLength(25);
  });

  it("never judges a row that carries no scope", async () => {
    // Absence of evidence is not evidence of deletion — but it must not BLOCK either,
    // or a source that names no scope could never sweep at all.
    stored = [
      ...Array.from({ length: 30 }, (_, i) => ({ source_id: `n${i}`, meta: {} })),
      ...rows(40, "here@loveiq.org", "h"),
    ];
    await sweepMissing("drive", seen(ids(rows(40, "here@loveiq.org", "h"))), { scopeKey: "owner" });
    expect(deleted).toHaveLength(30);
  });

  it("does nothing at all when the caller names no scope key", async () => {
    // Back-compatibility: without a key the sweep must behave exactly as it did before.
    stored = [...rows(30, "gone@loveiq.org", "g"), ...rows(40, "here@loveiq.org", "h")];
    await sweepMissing("drive", seen(ids(rows(40, "here@loveiq.org", "h"))));
    expect(deleted).toHaveLength(30);
  });
});
