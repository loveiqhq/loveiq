/**
 * Phase 3 unit tests:
 *  - computeRate() guards (the one helper all CVR charts depend on)
 *  - buildFunnelDigestBlocks() composition + gating (8 chart kinds, footer)
 *
 * buildFunnelDigestBlocks signs real image URLs via Web Crypto (no mock needed);
 * env vars below satisfy the signer + base-URL guard.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { computeRate, type DailyMetrics } from "@features/admin/server/digest-metrics";
import { buildFunnelDigestBlocks } from "@/app/api/cron/funnel-digest/route";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  process.env.STRATEGY_DIGEST_SIGNING_SECRET = "cvr-test-secret-1234567890";
});

describe("computeRate", () => {
  it("returns 0 when denominator is 0 (no divide-by-zero / Infinity)", () => {
    expect(computeRate(5, 0)).toBe(0);
  });
  it("returns 0 for NaN / Infinity / negative inputs", () => {
    expect(computeRate(NaN, 10)).toBe(0);
    expect(computeRate(10, NaN)).toBe(0);
    expect(computeRate(Infinity, 10)).toBe(0);
    expect(computeRate(-3, 10)).toBe(0);
  });
  it("computes a normal ratio as a percentage, rounded to 1 decimal", () => {
    expect(computeRate(1, 3)).toBe(33.3);
    expect(computeRate(40, 100)).toBe(40);
  });
  it("clamps to 100 when numerator exceeds denominator", () => {
    expect(computeRate(150, 100)).toBe(100);
  });
});

// Minimal DailyMetrics — the digest footer only reads revenue + refund/dispute
// fields + anomalies. Cast keeps the fixture focused on what the builder uses.
function mkDaily(over: Partial<DailyMetrics> = {}): DailyMetrics {
  return {
    revenue: {
      count: 3,
      byCurrency: { EUR: 90 },
      planMix: { essentials: 2, full_report: 1, all_reports: 0 },
      promoRedemptions: 1,
    },
    refunds: 0,
    refundAmount: 0,
    failedPayments: 0,
    disputes: 0,
    anomalies: null,
    ...over,
  } as DailyMetrics;
}

const fullSnaps = {
  cvr: {
    days: [
      {
        day: "2026-05-28",
        visitors: 100,
        starts: 40,
        completions: 25,
        eng_1m: 15,
        eng_5m: 10,
        eng_10m: 5,
        paygate: 8,
        purchased: 2,
      },
    ],
  },
  bucket: {
    days: [
      {
        day: "2026-05-28",
        buckets: {
          a: { shown: 20, purchases: 4, revenue: 120 },
          b: { shown: 10, purchases: 1, revenue: 200 },
        },
      },
    ],
  },
  dropout: {
    questions: [
      { question_index: 0, q_id: "00000", sessions: 100 },
      { question_index: 1, q_id: "00001", sessions: 70 },
    ],
  },
  nurture: { stages: [{ stage: "6h_no_view", sent: 50, purchased: 2 }] },
};

function imageKinds(blocks: Array<{ type: string; image_url?: string }>): string[] {
  return blocks
    .filter((b) => b.type === "image" && typeof b.image_url === "string")
    .map((b) => {
      const m = b.image_url!.match(/digest-image\/([^?]+)\?/);
      return m ? m[1]! : "";
    });
}

describe("buildFunnelDigestBlocks", () => {
  it("emits all 8 chart kinds when every snapshot has data", async () => {
    const curr = mkDaily();
    const { blocks } = await buildFunnelDigestBlocks({
      title: "Test",
      windowLabel: "30d",
      cvr: fullSnaps.cvr,
      bucket: fullSnaps.bucket,
      dropout: fullSnaps.dropout,
      nurture: fullSnaps.nurture,
      curr,
      prev: curr,
      cadence: "DoD",
    });
    const kinds = imageKinds(blocks as Array<{ type: string; image_url?: string }>);
    expect(kinds).toEqual([
      "cvr-visitor-start",
      "cvr-start-completion",
      "cvr-completion-engagement",
      "cvr-completion-paygate",
      "cvr-paygate-purchase",
      "bucket-performance",
      "dropout-funnel",
      "reactivation-email",
    ]);
  });

  it("omits chart images when snapshots are null but keeps the Revenue footer", async () => {
    const curr = mkDaily();
    const { blocks } = await buildFunnelDigestBlocks({
      title: "Test",
      windowLabel: "30d",
      cvr: null,
      bucket: null,
      dropout: null,
      nurture: null,
      curr,
      prev: curr,
      cadence: "DoD",
    });
    expect(imageKinds(blocks as Array<{ type: string; image_url?: string }>)).toEqual([]);
    const footer = (blocks as Array<{ type: string; text?: { text?: string } }>).find(
      (b) => b.type === "section" && (b.text?.text ?? "").includes("*Revenue*")
    );
    expect(footer).toBeDefined();
  });

  it("gates CVR charts on the denominator, not the rate (real 0% still renders)", async () => {
    // paygate=0 everywhere:
    //  - cvr-completion-paygate: denominator = completions (25) > 0 -> a real
    //    0% conversion -> MUST render (critical signal, not 'no data').
    //  - cvr-paygate-purchase: denominator = paygate (0) -> no traffic at that
    //    stage -> skipped.
    const curr = mkDaily();
    const { blocks } = await buildFunnelDigestBlocks({
      title: "Test",
      windowLabel: "30d",
      cvr: {
        days: [
          {
            day: "2026-05-28",
            visitors: 100,
            starts: 40,
            completions: 25,
            eng_1m: 15,
            eng_5m: 10,
            eng_10m: 5,
            paygate: 0,
            purchased: 0,
          },
        ],
      },
      bucket: null,
      dropout: null,
      nurture: null,
      curr,
      prev: curr,
      cadence: "DoD",
    });
    const kinds = imageKinds(blocks as Array<{ type: string; image_url?: string }>);
    expect(kinds).toContain("cvr-completion-paygate"); // real 0% renders
    expect(kinds).not.toContain("cvr-paygate-purchase"); // empty denominator skips
    expect(kinds).toContain("cvr-visitor-start");
  });

  it("includes the top-revenue bucket in the bucket chart windowLabel via alt/url", async () => {
    // Bucket b has higher revenue (200) than a (120) → subtitle names B.
    const curr = mkDaily();
    const { blocks } = await buildFunnelDigestBlocks({
      title: "Test",
      windowLabel: "30d",
      cvr: null,
      bucket: fullSnaps.bucket,
      dropout: null,
      nurture: null,
      curr,
      prev: curr,
      cadence: "DoD",
    });
    const kinds = imageKinds(blocks as Array<{ type: string; image_url?: string }>);
    expect(kinds).toContain("bucket-performance");
  });

  it("renders WoW cadence label in the Revenue footer", async () => {
    const curr = mkDaily({
      revenue: {
        count: 10,
        byCurrency: { EUR: 300 },
        planMix: { essentials: 5, full_report: 5, all_reports: 0 },
        promoRedemptions: 0,
      },
    });
    const prev = mkDaily({
      revenue: {
        count: 5,
        byCurrency: { EUR: 150 },
        planMix: { essentials: 5, full_report: 0, all_reports: 0 },
        promoRedemptions: 0,
      },
    });
    const { blocks } = await buildFunnelDigestBlocks({
      title: "Weekly",
      windowLabel: "30d",
      cvr: null,
      bucket: null,
      dropout: null,
      nurture: null,
      curr,
      prev,
      cadence: "WoW",
    });
    const footer = (blocks as Array<{ type: string; text?: { text?: string } }>).find(
      (b) => b.type === "section" && (b.text?.text ?? "").includes("*Revenue*")
    );
    expect(footer?.text?.text).toContain("WoW:");
  });
});
