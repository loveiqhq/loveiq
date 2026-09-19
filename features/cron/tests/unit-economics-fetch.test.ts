import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `fetchUnitEconomics` itself — the layer where a EUR 0 unlock is separated from
 * a sale.
 *
 * The sibling tests in conversion-digest.test.ts call `buildUnitEconomicsLines`
 * with a fixture, so they assert the PRESENTATION and never touch the split. A
 * mutation collapsing the fetcher's `if (n > 0)` into a single counter survived
 * all 104 of them: the numbers were already separated by the time those tests
 * saw them.
 */
const { mockSupabaseFetch } = vi.hoisted(() => ({ mockSupabaseFetch: vi.fn() }));

vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { fetchUnitEconomics } from "@features/admin/server/conversion-digest";

const SINCE = "2026-08-20T22:00:00.000Z";
const UNTIL = "2026-09-19T22:00:00.000Z";

/** Answer the two reads the fetcher makes, in the order it makes them. */
function respond(ga4: unknown[], payments: unknown[]) {
  mockSupabaseFetch.mockImplementation((path: string) => {
    const body = String(path).includes("brain_chunk") ? ga4 : payments;
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
  });
}

describe("fetchUnitEconomics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts a EUR 0 unlock as comped, never as a sale", async () => {
    /**
     * The real shape on 2026-09-19: three succeeded non-test payments, one of
     * them a post-call coupon at zero. Folding it into the denominator divides
     * EUR 1,000 of spend by 3 instead of 2 and reports acquisition as 33%
     * cheaper than it is — the flattering direction.
     */
    respond(
      [{ meta: { ad_cost: 1000 } }],
      [{ amount: 29 }, { amount: 41 }, { amount: 0 }]
    );
    const u = await fetchUnitEconomics(SINCE, UNTIL, 30);
    expect(u).not.toBeNull();
    expect(u!.paidReports, "the zero must not be a sale").toBe(2);
    expect(u!.compedReports).toBe(1);
    // Revenue still includes it — it is EUR 0, so it changes nothing, and
    // dropping the row would make revenue disagree with the payment ledger.
    expect(u!.revenue).toBe(70);
  });

  it("reads amount as euros, not cents", async () => {
    // A 9.99 row is EUR 9.99. Dividing by 100 somewhere would make the whole
    // break-even line read 100x optimistic on the revenue side.
    respond([{ meta: { ad_cost: 10 } }], [{ amount: 9.99 }, { amount: 49 }]);
    const u = await fetchUnitEconomics(SINCE, UNTIL, 30);
    expect(u!.revenue).toBeCloseTo(58.99, 2);
  });

  it("sums ad spend across day chunks and counts the days covered", async () => {
    respond(
      [{ meta: { ad_cost: 10 } }, { meta: { ad_cost: 20.5 } }, { meta: { ad_cost: "30" } }],
      []
    );
    const u = await fetchUnitEconomics(SINCE, UNTIL, 30);
    expect(u!.adSpend).toBeCloseTo(60.5, 2);
    expect(u!.coveredDays).toBe(3);
  });

  it("does not count a day GA4 reported without a cost figure", async () => {
    /**
     * `coveredDays` drives the "spend is a floor" caveat. A day present but with
     * no ad_cost is NOT coverage — treating it as such would suppress the caveat
     * on exactly the windows that need it.
     */
    respond([{ meta: { ad_cost: 10 } }, { meta: {} }, { meta: { ad_cost: null } }], []);
    const u = await fetchUnitEconomics(SINCE, UNTIL, 30);
    expect(u!.adSpend).toBe(10);
    expect(u!.coveredDays).toBe(1);
  });

  it("returns null rather than zeros when a read fails", async () => {
    // Zeros would render "EUR 0.00 spent, EUR 0.00 earned" — a quiet month,
    // rather than a broken read.
    mockSupabaseFetch.mockResolvedValue({ ok: false, status: 500, json: async () => [] });
    expect(await fetchUnitEconomics(SINCE, UNTIL, 30)).toBeNull();
  });

  it("survives a non-array body from either read", async () => {
    respond([], []);
    mockSupabaseFetch.mockImplementation(() =>
      Promise.resolve({ ok: true, status: 200, json: async () => ({ unexpected: true }) })
    );
    const u = await fetchUnitEconomics(SINCE, UNTIL, 30);
    expect(u).toEqual({
      adSpend: 0,
      revenue: 0,
      paidReports: 0,
      compedReports: 0,
      coveredDays: 0,
      windowDays: 30,
    });
  });
});
