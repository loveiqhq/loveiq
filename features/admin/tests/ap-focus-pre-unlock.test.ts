import { describe, expect, it } from "vitest";
import type { Facts } from "@features/admin/server/ap/facts";
import { parseFilters } from "@features/admin/server/ap/filters";
import { buildFocus } from "@features/admin/server/ap/focus";
import { factsFixture, sub } from "./ap-fixtures";

/**
 * Pre-unlock's success KPI (Notion "RFD > Pre-Unlock"): the share of finished surveys whose Core
 * Archetype was pre-unlocked (EUR 1.99 paid) so far, and what each of those sales brings in, as
 * the full unlock's chart counts its own. E07's day-4 gift is a EUR 0 `initial` row and is never
 * counted. Before it was on sale (23 Oct 2026) nobody could: those points are blank, never 0%.
 */
const TODAY = "2026-10-31";
const now = new Date("2026-10-31T10:00:00Z");
const filters = parseFilters({ period: "custom", from: "2026-10-24", to: "2026-10-30" }, TODAY);
const ad = { byDay: new Map<string, number>(), from: "2026-04-24", to: TODAY };
const at = Date.parse("2026-10-26T12:00:00Z") / 1000;

const pays = (amount: number, plan: string): Facts["subs"][number]["pays"] => [[at, amount, plan]];

describe("Completion → pre-unlock", () => {
  const facts = factsFixture({
    from: "2026-10-24",
    to: "2026-10-30",
    subs: Array.from({ length: 40 }, (_, i) =>
      sub({
        id: i + 1,
        day: "2026-10-26",
        at: "2026-10-26T10:00:00Z",
        // Two paid Core Archetypes, E07's gift and a full report: one pre-unlock rate of 2 in 40.
        ...(i === 0 ? { pays: pays(1.99, "initial") } : {}),
        ...(i === 1 ? { pays: pays(1.99, "initial") } : {}),
        ...(i === 2 ? { pays: pays(0, "initial") } : {}),
        ...(i === 3 ? { pays: pays(29.99, "full_report"), full: true } : {}),
      })
    ),
    money: [],
  });
  const chart = buildFocus({
    facts,
    previous: null,
    ad,
    filters,
    today: TODAY,
    now,
    ratings: null,
  }).charts.find((c) => c.key === "pre-unlock")!;

  it("is open over a range the Core Archetype was on sale all through", () => {
    expect(chart.views.day.blocked).toBeNull();
  });

  it("counts two paid Core Archetypes in forty finished surveys: 5.0%, at EUR 1.99 each", () => {
    const [rate, revenue] = chart.views.day.series;
    expect(rate!.total).toBeCloseTo(0.05);
    expect(revenue!.total).toBeCloseTo(1.99);
    // The day the surveys fall on.
    const i = chart.views.day.periods.findIndex((p) => p.from === "2026-10-26");
    expect(rate!.values[i]).toBeCloseTo(0.05);
    expect(revenue!.values[i]).toBeCloseTo(1.99);
  });

  it("is blank, with the day it went on sale, over a range starting before it", () => {
    const early = buildFocus({
      facts: factsFixture({ from: "2026-10-01", to: "2026-10-07" }),
      previous: null,
      ad,
      filters: parseFilters({ period: "custom", from: "2026-10-01", to: "2026-10-07" }, TODAY),
      today: TODAY,
      now,
      ratings: null,
    }).charts.find((c) => c.key === "pre-unlock")!;
    expect(early.views.day.blocked).toMatch(
      /Pre-unlock figures start on 23 Oct 2026, its first whole day on sale/
    );
    expect(early.views.day.series.every((s) => s.values.every((v) => v === null))).toBe(true);
  });
});
