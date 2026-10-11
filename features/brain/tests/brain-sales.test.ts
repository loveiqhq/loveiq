import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...a: unknown[]) => mockSupabaseFetch(...(a as [])),
}));

import { loadSales, renderSales, type Sale } from "@features/brain/server/sales";

const sale = (over: Partial<Sale> & { groups?: Partial<Sale["groups"]> } = {}): Sale => ({
  day: "2026-10-01",
  charged: 29.99,
  net: 29.99,
  currency: "EUR",
  ...over,
  groups: {
    plan: "full_report",
    price_list: "A3",
    device: "iOS",
    source: "google",
    country_tier: "tier_1",
    landing: "white_card",
    ...over.groups,
  },
});

describe("loadSales", () => {
  beforeEach(() => mockSupabaseFetch.mockReset());

  it("reads real succeeded payments with the metadata fields named, a page at a time", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          amount: "19.99",
          refund_amount: "5",
          currency: "eur",
          payment_date_time: "2026-10-02T23:30:00Z",
          created_date_time: "2026-10-01T10:00:00Z",
          plan: "all_reports",
          price_list: "B3",
          device: "Android",
          source: "direct",
          country_tier: "tier_2",
          landing: null,
        },
      ],
    });
    const sales = await loadSales();
    const path = String(mockSupabaseFetch.mock.calls[0]![0]);
    // Tests and failed attempts never count (is_test is never null: NOT NULL DEFAULT false).
    expect(path).toContain("/rest/v1/payment?is_test=is.false&status=eq.succeeded&order=id.asc");
    expect(path).toContain("price_list:metadata->>experimentGroup");
    expect(path).toContain("device:metadata->>deviceType");
    expect(path).toContain("&limit=1000&offset=0");
    expect(sales).toEqual([
      {
        // The day it was paid, not the day the attempt began.
        day: "2026-10-02",
        charged: 19.99,
        net: 14.99,
        currency: "EUR",
        groups: {
          plan: "all_reports",
          price_list: "B3",
          device: "Android",
          source: "direct",
          country_tier: "tier_2",
          landing: null,
        },
      },
    ]);
  });

  it("is null when the read fails, so an outage is never read as no sales", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(loadSales()).resolves.toBeNull();
  });
});

describe("renderSales", () => {
  it("splits a period's sales and revenue by one thing, the biggest first", () => {
    const text = renderSales(
      [
        sale(),
        sale({ charged: 4.99, net: 4.99, groups: { plan: "all_reports" } }),
        sale({ groups: { plan: "all_reports" } }),
        sale({ day: "2026-09-30" }),
      ],
      ["plan"],
      "2026-10-01",
      "2026-10-31"
    );
    expect(text).toContain(
      "Sales by plan, 2026-10-01 to 2026-10-31 (UTC days, by the day paid): 3 sales, EUR 64.97."
    );
    expect(text).toMatch(
      /- all_reports: 2 sales, EUR 34\.98 \(average EUR 17\.49\)\n- full_report: 1 sale, EUR 29\.99/
    );
  });

  it("counts a EUR 0 unlock as a comp beside the sales, never in them", () => {
    const text = renderSales(
      [sale(), sale({ charged: 0, net: 0 })],
      ["price_list"],
      "2026-10-01",
      "2026-10-01"
    );
    expect(text).toContain(": 1 sale, EUR 29.99, and 1 EUR 0 comp.");
    expect(text).toContain("- A3: 1 sale, EUR 29.99 (average EUR 29.99); 1 comp");
  });

  it("takes refunds off the revenue but still counts the sale, as the daily numbers do", () => {
    const text = renderSales([sale({ net: 0 })], ["plan"], "2026-10-01", "2026-10-01");
    expect(text).toContain("- full_report: 1 sale, EUR 0.00");
    expect(text).not.toMatch(/\d (EUR 0 )?comp/);
  });

  it("splits by two things at once, by month, and names what was never recorded", () => {
    const text = renderSales(
      [sale(), sale({ day: "2026-09-12", groups: { device: null } })],
      ["month", "device"],
      "2026-09-01",
      "2026-10-31"
    );
    expect(text).toContain("Sales by month and device,");
    expect(text).toContain("- 2026-10 · iOS: 1 sale");
    expect(text).toContain("- 2026-09 · not recorded: 1 sale");
  });

  it("keeps a sale in another currency out of the EUR total and says so", () => {
    const text = renderSales(
      [sale(), sale({ currency: "USD" })],
      ["plan"],
      "2026-10-01",
      "2026-10-01"
    );
    expect(text).toContain(
      "- full_report: 2 sales, EUR 29.99 (average EUR 29.99), 1 in another currency, not in the total"
    );
  });

  it("says plainly when nothing was sold", () => {
    expect(renderSales([sale()], ["plan"], "2026-11-01", "2026-11-30")).toContain(
      ": 0 sales, EUR 0.00.\n"
    );
    expect(renderSales([], ["plan"], "2026-11-01", "2026-11-30")).toMatch(
      /No sales or comps in that period\.$/
    );
  });
});
