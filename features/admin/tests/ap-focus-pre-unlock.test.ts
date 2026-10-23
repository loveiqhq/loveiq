import { describe, expect, it } from "vitest";
import type { Facts } from "@features/admin/server/ap/facts";
import { parseFilters } from "@features/admin/server/ap/filters";
import { buildFocus } from "@features/admin/server/ap/focus";
import { factsFixture, sub } from "./ap-fixtures";

/**
 * Pre-unlock's success KPI (Notion "RFD > Pre-Unlock"): the share of finished surveys that
 * buy the EUR 1.99 Core Archetype, and what each of those sales brings in. E07's day-4
 * gift is a EUR 0 `initial` row and is never counted.
 */
const TODAY = "2026-10-13";
const now = new Date("2026-10-13T10:00:00Z");
const filters = parseFilters({ period: "custom", from: "2026-10-01", to: "2026-10-07" }, TODAY);
const ad = { byDay: new Map<string, number>(), from: "2026-04-24", to: TODAY };

const sale = (sid: number, amount: number, plan: string): Facts["money"][number] => ({
  day: "2026-10-03",
  sid,
  amount,
  plan,
  src: "google",
  med: "cpc",
  ads: true,
  arm: "white_card",
  device: "iOS",
  tier: "tier_1",
  ph: null,
  uid: null,
  method: null,
  camp: null,
  term: null,
  net: null,
  priceArm: null,
});

describe("Completion → pre-unlock", () => {
  const facts = factsFixture({
    subs: Array.from({ length: 40 }, (_, i) =>
      sub({ id: i + 1, day: "2026-10-02", at: "2026-10-02T10:00:00Z" })
    ),
    money: [
      sale(1, 1.99, "initial"),
      sale(2, 1.99, "initial"),
      sale(3, 0, "initial"), // E07's gift
      sale(4, 29.99, "full_report"),
    ],
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

  it("is open now the Core Archetype is on sale", () => {
    expect(chart.blocked).toBeNull();
  });

  it("counts two paid Core Archetypes in forty finished surveys: 5.0%, at EUR 1.99 each", () => {
    const [rate, revenue] = chart.views.week.series;
    expect(rate!.total).toBeCloseTo(0.05);
    expect(revenue!.total).toBeCloseTo(1.99);
    // The week the surveys and the sales fall in.
    expect(rate!.values[0]).toBeCloseTo(0.05);
    expect(revenue!.values[0]).toBeCloseTo(1.99);
  });
});
