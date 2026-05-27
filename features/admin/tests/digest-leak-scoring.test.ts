import { describe, it, expect } from "vitest";
import { scoreFunnelLeaks } from "@features/admin/server/digest-leak-scoring";
import type {
  DropoffEverywhereSnapshot,
  RevenueBreakdown,
} from "@features/admin/server/digest-metrics";

function rev(count: number, eur = 0): RevenueBreakdown {
  return {
    count,
    byCurrency: count > 0 ? { EUR: eur } : {},
    planMix: { essentials: 0, full_report: 0, all_reports: 0 },
    promoRedemptions: 0,
  };
}

describe("scoreFunnelLeaks", () => {
  it("returns [] when dropoff is null", () => {
    expect(scoreFunnelLeaks(null, rev(10, 100))).toEqual([]);
  });

  it("returns [] when stages < 2", () => {
    const dropoff: DropoffEverywhereSnapshot = {
      stages: [{ name: "unique_visitors", count: 100 }],
    };
    expect(scoreFunnelLeaks(dropoff, rev(10, 100))).toEqual([]);
  });

  it("returns [] when revenue.count is 0 (prelaunch suppression)", () => {
    const dropoff: DropoffEverywhereSnapshot = {
      stages: [
        { name: "unique_visitors", count: 100 },
        { name: "saw_q1", count: 80 },
      ],
    };
    expect(scoreFunnelLeaks(dropoff, rev(0))).toEqual([]);
  });

  it("returns top-3 edges by est lost revenue, sorted desc", () => {
    const dropoff: DropoffEverywhereSnapshot = {
      stages: [
        { name: "unique_visitors", count: 1000 },
        { name: "saw_q1", count: 800 }, // drop 200
        { name: "survey_submitted", count: 200 }, // drop 600
        { name: "report_viewed", count: 150 }, // drop 50
        { name: "begin_checkout", count: 30 }, // drop 120
        { name: "purchased", count: 10 }, // drop 20
      ],
    };
    const r = rev(10, 500); // 50 EUR per paid
    const out = scoreFunnelLeaks(dropoff, r);
    expect(out.length).toBe(3);
    // est_lost for each edge:
    //  visitors→q1: 200 × (10/800) × 50 = 125
    //  q1→submitted: 600 × (10/200) × 50 = 1500
    //  submitted→viewed: 50 × (10/150) × 50 = 166.67
    //  viewed→checkout: 120 × (10/30) × 50 = 2000 (rate capped at 1: 120 × min(1, 10/30) × 50 = 120 × 0.333 × 50 = 2000)
    //  checkout→purchased: 20 × (10/10) × 50 = 1000
    // Sorted desc: viewed→checkout (2000), q1→submitted (1500), checkout→purchased (1000)
    // Edges sorted by estLostRevenue desc:
    //  report_viewed→begin_checkout: 120 × min(1, 10/30) × 50 = 2000
    //  saw_q1→survey_submitted:      600 × (10/200) × 50      = 1500
    //  begin_checkout→purchased:     20 × (10/10) × 50        = 1000
    expect(out[0]!.fromStage).toBe("report_viewed");
    expect(out[0]!.toStage).toBe("begin_checkout");
    expect(out[1]!.fromStage).toBe("saw_q1");
    expect(out[1]!.toStage).toBe("survey_submitted");
    expect(out[2]!.fromStage).toBe("begin_checkout");
    expect(out[2]!.toStage).toBe("purchased");
  });

  it("caps downstream paid rate at 1.0 to defend against data anomalies", () => {
    // Stage B has count=5 but totalPurchased=10 → naive rate = 2.0
    // After cap → 1.0 → est lost = dropCount × 1.0 × revPerPaid
    const dropoff: DropoffEverywhereSnapshot = {
      stages: [
        { name: "unique_visitors", count: 100 },
        { name: "saw_q1", count: 5 },
        { name: "purchased", count: 10 },
      ],
    };
    const r = rev(10, 1000); // 100 EUR per paid
    const out = scoreFunnelLeaks(dropoff, r);
    // First edge: 95 dropped, rate capped at 1.0 → est_lost = 95 × 1 × 100 = 9500
    expect(out[0]!.downstreamPaidRate).toBeLessThanOrEqual(1);
    expect(out[0]!.estLostRevenue).toBeLessThanOrEqual(95 * 100);
  });

  it("skips edges with zero drop", () => {
    const dropoff: DropoffEverywhereSnapshot = {
      stages: [
        { name: "unique_visitors", count: 100 },
        { name: "saw_q1", count: 100 }, // zero drop
        { name: "survey_submitted", count: 50 }, // drop 50
        { name: "purchased", count: 5 },
      ],
    };
    const out = scoreFunnelLeaks(dropoff, rev(5, 100));
    // Only non-zero drops appear in output
    expect(
      out.find((e) => e.fromStage === "unique_visitors" && e.toStage === "saw_q1")
    ).toBeUndefined();
  });

  it("populates the currency field from revenue.byCurrency", () => {
    const dropoff: DropoffEverywhereSnapshot = {
      stages: [
        { name: "a", count: 10 },
        { name: "b", count: 5 },
        { name: "purchased", count: 2 },
      ],
    };
    const r: RevenueBreakdown = {
      count: 2,
      byCurrency: { EUR: 200, USD: 50 }, // EUR is dominant
      planMix: { essentials: 0, full_report: 0, all_reports: 0 },
      promoRedemptions: 0,
    };
    const out = scoreFunnelLeaks(dropoff, r);
    expect(out[0]!.currency).toBe("EUR");
    expect(out[0]!.revenuePerPaid).toBe(100); // 200 EUR / 2 paid
  });

  it("handles missing 'purchased' stage by falling back to revenue.count", () => {
    // No `purchased` stage in dropoff, but revenue.count=5 → totalPurchased=5
    const dropoff: DropoffEverywhereSnapshot = {
      stages: [
        { name: "unique_visitors", count: 100 },
        { name: "saw_q1", count: 50 },
      ],
    };
    const out = scoreFunnelLeaks(dropoff, rev(5, 250));
    // 50 dropped × (5/50) × (250/5) = 50 × 0.1 × 50 = 250
    expect(out.length).toBe(1);
    expect(out[0]!.estLostRevenue).toBeCloseTo(250, 1);
  });
});
