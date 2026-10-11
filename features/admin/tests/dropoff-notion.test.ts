import { beforeEach, describe, expect, it, vi } from "vitest";

const mockQuery = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockArchive = vi.fn();
vi.mock("@features/brain/server/act/notion", () => ({
  queryNotionDatabase: (...a: unknown[]) => mockQuery(...a),
  createDatabaseRow: (...a: unknown[]) => mockCreate(...a),
  updateNotionPage: (...a: unknown[]) => mockUpdate(...a),
  archiveNotionPage: (...a: unknown[]) => mockArchive(...a),
}));

import {
  applySync,
  planSync,
  readDropoffRows,
  readExisting,
  rowProperties,
  rowValue,
  selectName,
  type ExistingRow,
} from "@features/admin/server/dropoff-notion";
import type { DropoffRow } from "@features/admin/server/dropoff-report";

const row = (over: Partial<DropoffRow> = {}): DropoffRow => ({
  key: "2026-10-05 · All traffic · 00001",
  week: "2026-10-05",
  days: 7,
  n: 1,
  qId: "00001",
  question: "01 · What is your name?",
  name: "What is your name?",
  segment: "All traffic",
  reached: 304,
  left: 21,
  rate: 0.069,
  ofEveryone: 0.067,
  usual: 0.084,
  flag: "Top 3 of the week",
  ...over,
});

/** What Notion sends back for properties written in `rowProperties`' shape. */
function asNotionReturnsIt(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(props)) {
    const v = value as Record<string, unknown>;
    if ("title" in v || "rich_text" in v) {
      const kind = "title" in v ? "title" : "rich_text";
      const texts = v[kind] as Array<{ text: { content: string } }>;
      out[name] = { type: kind, [kind]: texts.map((t) => ({ plain_text: t.text.content })) };
    } else if ("select" in v) {
      out[name] = { type: "select", select: { name: (v.select as { name: string }).name } };
    } else if ("date" in v) {
      out[name] = { type: "date", date: { start: (v.date as { start: string }).start, end: null } };
    } else {
      out[name] = { type: "number", number: v.number };
    }
  }
  return out;
}

describe("rowProperties", () => {
  it("writes the question as the title, the key beside it, and percents as fractions", () => {
    const p = rowProperties(row()) as Record<string, Record<string, unknown>>;
    expect(
      (p["Question text"]!.title as Array<{ text: { content: string } }>)[0]!.text.content
    ).toBe("01 · What is your name?");
    expect((p.Key!.rich_text as Array<{ text: { content: string } }>)[0]!.text.content).toBe(
      "2026-10-05 · All traffic · 00001"
    );
    expect(p["Drop-off"]).toEqual({ number: 0.069 });
    expect(p.Week).toEqual({ date: { start: "2026-10-05" } });
    expect(p.Flag).toEqual({ select: { name: "Top 3 of the week" } });
  });

  it("keeps commas out of the question's select option, which Notion refuses", () => {
    const label = "02 · Right now, I feel satisfied with my sex life.";
    expect(selectName(label)).not.toContain(",");
    expect(selectName(label)).toBe("02 · Right now\u201a I feel satisfied with my sex life.");
    expect(selectName("x".repeat(150))).toHaveLength(100);
    const p = rowProperties(row({ question: label })) as Record<string, Record<string, unknown>>;
    expect((p.Question!.select as { name: string }).name).toBe(selectName(label));
    // The title keeps the real commas.
    expect(
      (p["Question text"]!.title as Array<{ text: { content: string } }>)[0]!.text.content
    ).toBe(label);
  });

  it("reads back exactly what it wrote, so an unchanged row is never rewritten", () => {
    for (const r of [
      row(),
      row({
        question: "02 · Right now, I feel satisfied with my sex life.",
        rate: null,
        usual: null,
      }),
      row({ ofEveryone: null, days: 3, flag: "Normal" }),
    ]) {
      const back = readExisting({ id: "p1", properties: asNotionReturnsIt(rowProperties(r)) });
      expect(back).toEqual({ id: "p1", key: r.key, value: rowValue(r) });
    }
  });
});

describe("planSync", () => {
  const existing = (r: DropoffRow, id: string): ExistingRow => ({
    id,
    key: r.key,
    value: rowValue(r),
  });

  it("creates the missing, updates the changed, leaves the rest", () => {
    const a = row();
    const b = row({ key: "2026-10-05 · All traffic · 01002", qId: "01002" });
    const c = row({ key: "2026-10-05 · All traffic · 01005", qId: "01005" });
    const plan = planSync([a, { ...b, left: 22 }, c], [existing(a, "pa"), existing(b, "pb")]);
    expect(plan.create.map((r) => r.key)).toEqual([c.key]);
    expect(plan.update.map((u) => u.id)).toEqual(["pb"]);
    expect(plan.archive).toEqual([]);
  });

  it("trashes duplicates and rows nobody computes any more", () => {
    const a = row();
    const gone = row({ key: "2026-10-05 · All traffic · 99999", qId: "99999" });
    const plan = planSync([a], [existing(a, "pa"), existing(a, "pa2"), existing(gone, "pg")]);
    expect(plan.create).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.archive.sort()).toEqual(["pa2", "pg"]);
  });
});

describe("readDropoffRows", () => {
  beforeEach(() => mockQuery.mockReset());

  it("reads only the weeks being written, with room for every row", async () => {
    mockQuery.mockResolvedValue([
      { id: "p1", properties: asNotionReturnsIt(rowProperties(row())) },
    ]);
    const rows = await readDropoffRows("db1", "2026-09-21");
    expect(rows).toEqual([{ id: "p1", key: row().key, value: rowValue(row()) }]);
    expect(mockQuery).toHaveBeenCalledWith("db1", {
      filter: { property: "Week", date: { on_or_after: "2026-09-21" } },
      maxRows: 10_000,
    });
  });
});

describe("applySync", () => {
  beforeEach(() => {
    for (const m of [mockCreate, mockUpdate, mockArchive])
      m.mockReset().mockResolvedValue(undefined);
  });

  it("writes everything, newest weeks first, and counts it", async () => {
    const order: string[] = [];
    mockUpdate.mockImplementation(async (id: string) => void order.push(`u:${id}`));
    mockCreate.mockImplementation(
      async (_db: string, p: Record<string, { date?: { start: string } }>) =>
        void order.push(`c:${p.Week!.date!.start}`)
    );
    mockArchive.mockImplementation(async (id: string) => void order.push(`a:${id}`));
    const result = await applySync(
      "db1",
      {
        create: [row({ week: "2026-09-21" }), row({ week: "2026-10-12" })],
        update: [{ id: "old", row: row({ week: "2026-09-28" }) }],
        archive: ["gone"],
      },
      () => false
    );
    expect(result).toEqual({
      created: 2,
      updated: 1,
      archived: 1,
      pending: 0,
      failed: 0,
      firstError: null,
    });
    // Three workers start together, so only the first three are certain to start in order.
    expect(order.slice(0, 3)).toEqual(["c:2026-10-12", "u:old", "c:2026-09-21"]);
    expect(order.at(-1)).toBe("a:gone");
  });

  it("stops starting writes when time runs out and says how many are left", async () => {
    let calls = 0;
    const result = await applySync(
      "db1",
      {
        create: Array.from({ length: 10 }, (_, i) => row({ key: `k${i}` })),
        update: [],
        archive: [],
      },
      () => calls++ >= 4
    );
    expect(result.created + result.pending).toBe(10);
    expect(result.pending).toBeGreaterThan(0);
  });

  it("gives up after a handful of failures instead of hammering Notion", async () => {
    mockCreate.mockRejectedValue(new Error("validation_error"));
    const result = await applySync(
      "db1",
      {
        create: Array.from({ length: 50 }, (_, i) => row({ key: `k${i}` })),
        update: [],
        archive: [],
      },
      () => false
    );
    expect(result.failed).toBeGreaterThanOrEqual(5);
    expect(result.failed).toBeLessThanOrEqual(7); // three workers may each be mid-write
    expect(result.firstError).toBe("validation_error");
    expect(result.pending).toBe(50 - result.failed);
  });
});
