/**
 * Funnel-leak severity scoring.
 *
 * Ranks drop-off edges by **estimated revenue lost** instead of raw drop count.
 * A 30-user drop at the top of the funnel (where conversion rates are low) is
 * usually worth less than a 10-user drop right before checkout (where the
 * conditional purchase rate is high).
 *
 * Estimate per edge (A → B):
 *   drop_count = max(0, A.count - B.count)
 *   downstream_paid_rate = total_purchased / B.count
 *     (probability a user who reached B eventually paid — used as the
 *     counterfactual rate the dropped users WOULD have paid at had they
 *     continued)
 *   estLostRevenue = drop_count × downstream_paid_rate × avg_revenue_per_paid
 *
 * The estimate is intentionally optimistic — it assumes dropped users would
 * have converted at the same rate as those who continued. In reality dropped
 * users are weaker leads, so true lost revenue is lower. The estimate is a
 * useful PRIORITIZATION tool, not a precise prediction.
 *
 * Pure function — no I/O, easy to test.
 */

import type {
  WeeklyMetrics,
  DropoffEverywhereSnapshot,
  RevenueBreakdown,
} from "@features/admin/server/digest-metrics";

export interface LeakSeverity {
  fromStage: string;
  toStage: string;
  dropCount: number;
  dropRate: number; // 0–100, share of the A cohort that dropped
  downstreamPaidRate: number; // 0–1, conditional purchase rate at stage B
  revenuePerPaid: number; // avg revenue per paid user, single dominant currency
  estLostRevenue: number; // dropCount × downstreamPaidRate × revenuePerPaid
  currency: string; // currency code of revenuePerPaid, e.g. "EUR"
}

const TOP_N = 3;

/**
 * Pick the dominant currency from revenue.byCurrency and compute the average
 * revenue per paid user in that currency. Returns null when there's no usable
 * revenue (prelaunch or no successful payments in the window).
 */
function dominantCurrencyAndAvg(
  revenue: RevenueBreakdown
): { currency: string; revenuePerPaid: number } | null {
  if (revenue.count <= 0) return null;
  const entries = Object.entries(revenue.byCurrency);
  if (entries.length === 0) return null;
  // Pick the currency with the largest total. In practice the site is EUR-only;
  // this just makes the function robust to mixed-currency weeks.
  let best: [string, number] | null = null;
  for (const e of entries) {
    if (!best || e[1] > best[1]) best = e;
  }
  if (!best || best[1] <= 0) return null;
  return {
    currency: best[0],
    revenuePerPaid: best[1] / revenue.count,
  };
}

/**
 * Score every adjacent edge in the dropoff snapshot. Returns an array sorted
 * by `estLostRevenue` desc, capped to top N. Returns [] when revenue is zero
 * (avoids meaningless "infinity lost" lines during prelaunch).
 */
export function scoreFunnelLeaks(
  dropoff: DropoffEverywhereSnapshot | null,
  revenue: RevenueBreakdown
): LeakSeverity[] {
  if (!dropoff || dropoff.stages.length < 2) return [];

  const stages = dropoff.stages;
  // Locate the absolute `purchased` count, if present in the funnel (it's
  // always the last stage in our get_dropoff_everywhere RPC).
  const purchasedStage = stages.find((s) => s.name === "purchased");
  const totalPurchased = purchasedStage?.count ?? revenue.count;
  if (totalPurchased <= 0) return [];

  const dom = dominantCurrencyAndAvg(revenue);
  if (!dom) return [];

  const edges: LeakSeverity[] = [];
  for (let i = 1; i < stages.length; i += 1) {
    const a = stages[i - 1]!;
    const b = stages[i]!;
    const dropCount = Math.max(0, a.count - b.count);
    if (dropCount === 0) continue;
    // Downstream paid-rate uses the count at stage B (the destination of this
    // edge). When B.count is zero, the rate is 0 → no contribution.
    const downstreamPaidRate = b.count > 0 ? totalPurchased / b.count : 0;
    // Cap at 1.0 — if totalPurchased somehow exceeds b.count (data anomaly,
    // e.g. a user paid via a different route without hitting B), the rate can
    // become > 1, which would mathematically claim more revenue than we earn.
    const cappedRate = Math.min(1, downstreamPaidRate);
    const estLost = dropCount * cappedRate * dom.revenuePerPaid;
    edges.push({
      fromStage: a.name,
      toStage: b.name,
      dropCount,
      dropRate: a.count > 0 ? (dropCount / a.count) * 100 : 0,
      downstreamPaidRate: cappedRate,
      revenuePerPaid: dom.revenuePerPaid,
      estLostRevenue: estLost,
      currency: dom.currency,
    });
  }

  edges.sort((x, y) => y.estLostRevenue - x.estLostRevenue);
  return edges.slice(0, TOP_N);
}

/** Convenience wrapper for the digest cron — pulls revenue from WeeklyMetrics. */
export function scoreFunnelLeaksFromWeekly(w: WeeklyMetrics): LeakSeverity[] {
  return scoreFunnelLeaks(w.dropoffEverywhere, w.revenue);
}
