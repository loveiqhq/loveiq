import { describe, expect, it, vi } from "vitest";

vi.mock("@features/brain/server/act/notion", () => ({
  queryNotionDatabase: vi.fn(),
  createDatabaseRow: vi.fn(),
  updateNotionPage: vi.fn(),
  archiveNotionPage: vi.fn(),
}));

import {
  kpiColumnProperties,
  kpiRowProperties,
  kpiRowValue,
  readKpiRow,
} from "@features/admin/server/kpi-notion";
import type { KpiRow } from "@features/admin/server/kpi-weekly";
import { planRowSync, type ExistingRow } from "@features/admin/server/notion-row-sync";

const row = (over: Partial<KpiRow> = {}): KpiRow => ({
  key: "visit_to_start · 2026-10-05 · All traffic",
  week: "2026-10-05",
  days: 7,
  kpiId: "visit_to_start",
  kpi: "Unique Visitors → Survey Attempts CVR %",
  unit: "percent",
  segment: "All traffic",
  value: 0.1406,
  num: 288,
  den: 2049,
  shown: "14.1%",
  ...over,
});

/** What Notion sends back for properties written in kpiRowProperties' shape. */
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

describe("the KPI weekly numbers codec", () => {
  it("writes the value under its unit's property, so Notion formats it right", () => {
    const p = kpiRowProperties(row()) as Record<string, { number?: number | null }>;
    expect(p.Percent).toEqual({ number: 0.1406 });
    expect([p.Count, p.Euro, p.Minutes]).toEqual([
      { number: null },
      { number: null },
      { number: null },
    ]);
    const euro = kpiRowProperties(row({ unit: "euro", value: 2.35 })) as Record<string, unknown>;
    expect(euro.Euro).toEqual({ number: 2.35 });
    expect(euro.Percent).toEqual({ number: null });
  });

  it("reads back exactly what it wrote, so an unchanged row is never rewritten", () => {
    for (const r of [
      row(),
      row({
        unit: "count",
        value: 2049,
        num: null,
        den: null,
        shown: "2,049",
        kpi: "Unique Visitors #",
      }),
      row({ unit: "minutes", value: 15.3, shown: "15.3 min", num: null, den: null }),
    ]) {
      const back = readKpiRow({ id: "p1", properties: asNotionReturnsIt(kpiRowProperties(r)) });
      expect(back).toEqual({ id: "p1", key: r.key, week: r.week, value: kpiRowValue(r) });
    }
  });

  it("writes the live columns of 📊 KPI as text, and the day they were refreshed", () => {
    const p = kpiColumnProperties(
      {
        lastFullWeek: "142 (5 to 11 Oct)",
        weekBefore: "123",
        change: "▲ 19 (+15.4%)",
        lastWeeks: "▁▂▃▅▂▄▆█",
        thisWeekSoFar: "",
      },
      "2026-10-12"
    ) as Record<string, { rich_text?: unknown[]; date?: unknown }>;
    expect(p["Last full week"]!.rich_text).toHaveLength(1);
    expect(p["This week so far"]!.rich_text).toEqual([]); // empty clears the cell
    expect(p.Updated).toEqual({ date: { start: "2026-10-12" } });
  });
});

describe("planRowSync with frozen weeks", () => {
  const held = (r: KpiRow, id: string, value = kpiRowValue(r)): ExistingRow => ({
    id,
    key: r.key,
    week: r.week,
    value,
  });
  const frozen = (week: string) => week < "2026-09-28";

  it("creates a missing row of a frozen week, but never rewrites or trashes one", () => {
    const old = row({ week: "2026-09-21", key: "visit_to_start · 2026-09-21 · All traffic" });
    const gone = row({ week: "2026-09-14", key: "visit_to_start · 2026-09-14 · All traffic" });
    const live = row();
    const missing = row({ week: "2026-09-07", key: "visit_to_start · 2026-09-07 · All traffic" });
    const plan = planRowSync(
      [old, live, missing],
      [held(old, "p-old", "stale"), held(gone, "p-gone"), held(live, "p-live", "stale")],
      kpiRowValue,
      frozen
    );
    expect(plan.create.map((r) => r.key)).toEqual([missing.key]);
    expect(plan.update.map((u) => u.id)).toEqual(["p-live"]); // the frozen week keeps its row
    expect(plan.archive).toEqual([]); // and its uncomputable rows stay
  });

  it("still trashes a duplicate, frozen week or not", () => {
    const old = row({ week: "2026-09-21", key: "visit_to_start · 2026-09-21 · All traffic" });
    const plan = planRowSync([old], [held(old, "a"), held(old, "b")], kpiRowValue, frozen);
    expect(plan.archive).toEqual(["b"]);
  });
});
