import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `fetchUnitEconomics` — the layer where a EUR 0 unlock is separated from a
 * sale, where spend is attributed to the right days, and where a currency that
 * is not EUR stays out of a total labelled EUR.
 *
 * The sibling tests in conversion-digest.test.ts call `buildUnitEconomicsLines`
 * with a fixture, so they assert the PRESENTATION and never touch any of this.
 */
const { mockSupabaseFetch } = vi.hoisted(() => ({ mockSupabaseFetch: vi.fn() }));

vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { fetchUnitEconomics } from "@features/admin/server/conversion-digest";
import type { AdCost } from "@features/brain/server/ingest/analytics";

/**
 * Both bounds are Berlin midnight expressed in UTC. `22:00Z` IS the next Berlin
 * day, which is the whole point of the window test below — pinned to literals so
 * the assertions cannot drift with the code they check.
 */
const SINCE = "2026-08-20T22:00:00.000Z"; // Berlin 2026-08-21 00:00
const UNTIL = "2026-09-19T22:00:00.000Z"; // Berlin 2026-09-20 00:00 (exclusive)
/** First and last Berlin day actually inside [SINCE, UNTIL). */
const FIRST_DAY = "2026-08-21";
const LAST_DAY = "2026-09-19";
/** The day `.slice(0, 10)` of SINCE used to name — one day BEFORE the window. */
const DAY_BEFORE = "2026-08-20";

function ad(byDay: Record<string, number>, from = FIRST_DAY, to = LAST_DAY): AdCost {
  return { byDay: new Map(Object.entries(byDay)), from, to };
}

/** Answer the one read the fetcher makes: payments. */
function payments(rows: unknown[]) {
  mockSupabaseFetch.mockResolvedValue({ ok: true, status: 200, json: async () => rows });
}

describe("fetchUnitEconomics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    payments([]);
  });

  it("counts a EUR 0 unlock as comped, never as a sale", async () => {
    /**
     * Three succeeded non-test payments, one of them a post-call coupon at zero.
     * Folding it into the denominator divides EUR 1,000 of spend by 3 instead of
     * 2 and reports acquisition as 33% cheaper than it is — the flattering
     * direction.
     */
    payments([{ amount: 29 }, { amount: 41 }, { amount: 0 }]);
    const u = await fetchUnitEconomics(ad({ [LAST_DAY]: 1000 }), SINCE, UNTIL, 30);
    expect(u).not.toBeNull();
    expect(u!.paidReports, "the zero must not be a sale").toBe(2);
    expect(u!.compedReports).toBe(1);
    // Revenue still includes it — it is EUR 0, so it changes nothing, and
    // dropping the row would make revenue disagree with the payment ledger.
    expect(u!.revenue).toBe(70);
  });

  it("reads amount as euros, not cents", async () => {
    payments([{ amount: 9.99 }, { amount: 49 }]);
    const u = await fetchUnitEconomics(ad({}), SINCE, UNTIL, 30);
    expect(u!.revenue).toBeCloseTo(58.99, 2);
  });

  it("keeps a non-EUR payment out of a total labelled EUR, and says so", async () => {
    /**
     * `funnel-digest` carries the same warning about this table ("mostly EUR,
     * occasionally MXN") and buckets by currency for exactly this reason. A
     * single MXN row summed in turns EUR 29.00 into "earned EUR 528.00".
     */
    payments([
      { amount: 29, currency: "EUR" },
      { amount: 499, currency: "MXN" },
    ]);
    const u = await fetchUnitEconomics(ad({}), SINCE, UNTIL, 30);
    expect(u!.revenue, "the MXN row must not be added to euros").toBe(29);
    expect(u!.paidReports).toBe(1);
    expect(u!.otherCurrencyReports).toBe(1);
  });

  it("treats a missing currency as EUR", async () => {
    // Older rows have a NULL currency and every one of them is EUR. Dropping
    // them would understate revenue, which is the same error in reverse.
    payments([{ amount: 29, currency: null }, { amount: 41 }]);
    const u = await fetchUnitEconomics(ad({}), SINCE, UNTIL, 30);
    expect(u!.revenue).toBe(70);
    expect(u!.otherCurrencyReports).toBe(0);
  });

  it("attributes spend to Berlin days, not to a sliced timestamp", async () => {
    /**
     * THE REGRESSION THIS FILE EXISTS FOR.
     *
     * `since.slice(0, 10)` of `2026-08-20T22:00:00.000Z` is "2026-08-20" — the
     * day BEFORE the window that timestamp opens. The spend window came out
     * shifted a whole day off the revenue window, in both directions at once,
     * and because both spans were still 30 days long `coveredDays` reached 30
     * and no caveat ever fired.
     *
     * Asserted at BOTH edges: the last true day must be in, the day before the
     * first must be out. A fix that only moved the window would pass one and
     * fail the other.
     */
    const u = await fetchUnitEconomics(
      ad({ [DAY_BEFORE]: 500, [FIRST_DAY]: 10, [LAST_DAY]: 7 }, DAY_BEFORE, LAST_DAY),
      SINCE,
      UNTIL,
      30
    );
    expect(u!.adSpend, "2026-08-20 is outside the window; 2026-09-19 is inside").toBe(17);
  });

  it("counts a covered day with no spend as covered", async () => {
    /**
     * A day GA4 fully reported on which no campaign ran carries no `ad_cost` key
     * at all — `google.ts` writes it as `...(ad ? {…} : {})`. Keying coverage on
     * that key reported a genuinely complete window as partial, printing "GA4
     * reported spend for 3 of 30 days, so the spend figure is a floor" under a
     * window with nothing missing. `analytics.ts` settled this already: "a day
     * with no spend is still a day we know about".
     */
    const u = await fetchUnitEconomics(ad({ [FIRST_DAY]: 40 }), SINCE, UNTIL, 30);
    expect(u!.adSpend).toBe(40);
    expect(u!.coveredDays, "all 30 days are inside GA4's reported window").toBe(30);
  });

  it("counts only the days GA4's ad report actually reached", async () => {
    // Coverage stops on 2026-08-25, so 5 days are covered and 25 are not.
    const u = await fetchUnitEconomics(
      ad({ [FIRST_DAY]: 40 }, FIRST_DAY, "2026-08-25"),
      SINCE,
      UNTIL,
      30
    );
    expect(u!.coveredDays).toBe(5);
    expect(u!.windowDays).toBe(30);
  });

  it("counts no days when the ad report's window is unknown", async () => {
    // `to: null` means the ad report was truncated or failed. Coverage then
    // reads as zero and the caveat fires, rather than spend reading as EUR 0.00.
    const u = await fetchUnitEconomics(
      ad({ [FIRST_DAY]: 40 }, null as never, null as never),
      SINCE,
      UNTIL,
      30
    );
    expect(u!.adSpend).toBe(0);
    expect(u!.coveredDays).toBe(0);
  });

  it("names 30 Berlin days across the autumn clock change", async () => {
    /**
     * Berlin falls back on 2026-10-25. Stepping 24h from a Berlin-midnight
     * instant lands on 23:00 the previous day across the changeover, so a naive
     * step names one day twice and skips another. Stepping at NOON is what makes
     * this 30 and not 29 or 31.
     */
    const since = "2026-10-10T22:00:00.000Z"; // Berlin 2026-10-11 00:00 (CEST)
    const until = "2026-11-09T23:00:00.000Z"; // Berlin 2026-11-10 00:00 (CET)
    const u = await fetchUnitEconomics(ad({}, "2026-10-11", "2026-11-09"), since, until, 30);
    expect(u!.coveredDays).toBe(30);
  });

  it("returns null rather than zeros when the payment read fails", async () => {
    // Zeros would render "EUR 0.00 earned" — a quiet month, rather than a
    // broken read.
    mockSupabaseFetch.mockResolvedValue({ ok: false, status: 500, json: async () => [] });
    expect(await fetchUnitEconomics(ad({}), SINCE, UNTIL, 30)).toBeNull();
  });

  it("survives a non-array payment body", async () => {
    mockSupabaseFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: true }),
    });
    const u = await fetchUnitEconomics(ad({}), SINCE, UNTIL, 30);
    expect(u).toEqual({
      adSpend: 0,
      revenue: 0,
      paidReports: 0,
      compedReports: 0,
      otherCurrencyReports: 0,
      coveredDays: 30,
      windowDays: 30,
    });
  });

  it("does not read the GA4 chunks a second time", async () => {
    // Spend arrives as an argument now. A second read of brain_chunk here is
    // what produced two disagreeing notions of the window and of "covered".
    await fetchUnitEconomics(ad({ [FIRST_DAY]: 5 }), SINCE, UNTIL, 30);
    const paths = mockSupabaseFetch.mock.calls.map((c) => String(c[0]));
    expect(paths.some((p) => p.includes("brain_chunk"))).toBe(false);
    expect(paths.filter((p) => p.includes("/payment")).length).toBe(1);
  });
});
