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
import {
  buildFunnelDigestBlocks,
  shortDate,
  computeDropoutBars,
} from "@/app/api/cron/funnel-digest/route";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  process.env.STRATEGY_DIGEST_SIGNING_SECRET = "cvr-test-secret-1234567890";
});

describe("shortDate", () => {
  it("formats YYYY-MM-DD as 'MMM D' with no leading zero on the day", () => {
    expect(shortDate("2026-05-01")).toBe("May 1");
    expect(shortDate("2026-12-25")).toBe("Dec 25");
    expect(shortDate("2026-01-09")).toBe("Jan 9");
  });
  it("returns the input unchanged when it is not a YYYY-MM-DD string", () => {
    expect(shortDate("not-a-date")).toBe("not-a-date");
  });
});

describe("computeDropoutBars", () => {
  it("computes per-question drop-off rate from consecutive reach", () => {
    // 100 -> 80 = 20% quit at Q1; 80 -> 60 = 25% quit at Q2. Last question
    // (index 2) has no successor → no bar.
    const bars = computeDropoutBars([
      { question_index: 0, sessions: 100 },
      { question_index: 1, sessions: 80 },
      { question_index: 2, sessions: 60 },
    ]);
    expect(bars).toHaveLength(2);
    expect(bars[0]).toEqual({ label: "Q1", dropPct: 20, reached: 100 });
    expect(bars[1]).toEqual({ label: "Q2", dropPct: 25, reached: 80 });
  });
  it("skips questions below the reach floor (tiny-sample noise)", () => {
    // Q3 reached by only 3 (< floor 5) → no bar for it, even though 3 -> 0.
    const bars = computeDropoutBars(
      [
        { question_index: 0, sessions: 50 },
        { question_index: 1, sessions: 3 },
        { question_index: 2, sessions: 0 },
      ],
      5
    );
    expect(bars.map((b) => b.label)).toEqual(["Q1"]); // only index-0 (reach 50) qualifies
  });
  it("clamps negative drops to 0 (reach can't legitimately grow)", () => {
    const bars = computeDropoutBars([
      { question_index: 0, sessions: 50 },
      { question_index: 1, sessions: 60 },
    ]);
    expect(bars[0]!.dropPct).toBe(0);
  });
  it("returns [] for fewer than 2 questions", () => {
    expect(computeDropoutBars([{ question_index: 0, sessions: 100 }])).toEqual([]);
  });
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

/**
 * Thirty consecutive days ending 2026-09-18.
 *
 * These fixtures used to be a SINGLE day, which meant every cvr series was
 * entirely null — a 7-day trailing average needs seven days — and the charts
 * they asserted were empty frames with a title and a "now —" readout. The
 * assertions passed because nothing checked that a chart had a line in it.
 *
 * The dates sit after PAYGATE_MEASURED_FROM (2026-09-06) so the two
 * paygate-derived charts are on the measured side of the instrumentation
 * boundary; before that date they are correctly suppressed, which is what these
 * tests would otherwise be asserting against.
 */
function cvrDays(over: Partial<Record<string, number>> = {}) {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 7, 20) + i * 86_400_000).toISOString().slice(0, 10);
    return {
      day: d,
      visitors: 180,
      visitors_control: 100,
      starts: 40,
      completions: 25,
      eng_1m: 15,
      eng_5m: 10,
      eng_10m: 5,
      paygate: 8,
      purchased: 2,
      ...over,
    };
  });
}

function bucketDays() {
  return Array.from({ length: 30 }, (_, i) => ({
    day: new Date(Date.UTC(2026, 7, 20) + i * 86_400_000).toISOString().slice(0, 10),
    buckets: {
      a: { shown: 20, purchases: 4, revenue: 120 },
      b: { shown: 10, purchases: 1, revenue: 200 },
    },
  }));
}

const fullSnaps = {
  cvr: { days: cvrDays() },
  bucket: { days: bucketDays() },
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
  it("emits the six chart kinds that survived the 2026-09-19 trim", async () => {
    const curr = mkDaily();
    const { blocks } = await buildFunnelDigestBlocks({
      title: "Test",
      windowLabel: "30d",
      cvr: fullSnaps.cvr,
      bucket: fullSnaps.bucket,
      dropout: fullSnaps.dropout,
      curr,
      prev: curr,
      cadence: "DoD",
    });
    const kinds = imageKinds(blocks as Array<{ type: string; image_url?: string }>);
    /**
     * Two were removed on 2026-09-19 at the team's request:
     *
     *   cvr-completion-engagement — three cumulative lines on one axis read as
     *     three competing series rather than one thing measured at three delays;
     *   reactivation-email        — and its `purchased` half was never
     *     trustworthy, because checkout does not stamp promoStage.
     *
     * Asserted as an exact list, in order, so a re-added chart has to be a
     * decision rather than an accident.
     */
    expect(kinds).toEqual([
      "cvr-visitor-start",
      "cvr-start-completion",
      "cvr-completion-paygate",
      "cvr-paygate-purchase",
      "bucket-performance",
      "dropout-funnel",
    ]);
    expect(kinds).not.toContain("cvr-completion-engagement");
    expect(kinds).not.toContain("reactivation-email");
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
      cvr: { days: cvrDays({ paygate: 0, purchased: 0 }) },
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

/**
 * The paywall stage changed how it was MEASURED on 2026-09-05, and an unmasked
 * chart reads that as a product event.
 *
 * `paygate` unions a consent-gated client event with
 * report_price_quote.paywall_reached_at, and the server column has no rows
 * before 2026-09-05 19:15 UTC. Drawn across the boundary, completion→paygate
 * steps 5% -> 60% and paygate→purchase collapses 9% -> 1.6% on the same day.
 * Both are the same instrumentation change. The unmeasured stretch must be a
 * GAP, which is the repo's standing rule that null is never a plotted zero.
 */
describe("the paywall instrumentation boundary", () => {
  const payloadOf = (blocks: unknown[], kind: string) => {
    const img = (blocks as Array<{ type: string; image_url?: string }>).find(
      (b) => b.type === "image" && (b.image_url ?? "").includes(`digest-image/${kind}?`)
    );
    if (!img?.image_url) return null;
    const d = new URL(img.image_url).searchParams.get("d")!;
    return JSON.parse(Buffer.from(d, "base64url").toString("utf8")) as {
      series: Array<Array<number | null>>;
    };
  };

  it("leaves the pre-instrumentation stretch blank instead of drawing a low rate", async () => {
    const curr = mkDaily();
    const { blocks } = await buildFunnelDigestBlocks({
      title: "Test",
      windowLabel: "30d",
      // cvrDays() spans 2026-08-20 .. 2026-09-18, straddling the boundary.
      cvr: { days: cvrDays() },
      bucket: null,
      dropout: null,
      nurture: null,
      curr,
      prev: curr,
      cadence: "WoW",
    });

    for (const kind of ["cvr-completion-paygate", "cvr-paygate-purchase"]) {
      const payload = payloadOf(blocks, kind);
      expect(payload, `${kind} should still be drawn`).not.toBeNull();
      const series = payload!.series[0]!;
      expect(series).toHaveLength(30);

      // 2026-09-06 is index 17; the first slot whose whole 7-day window is on
      // the measured side is index 23 (2026-09-12).
      const firstDrawn = series.findIndex((v) => v !== null);
      expect(firstDrawn).toBe(23);
      // Everything before it is a gap, not a number.
      expect(series.slice(0, 23).every((v) => v === null)).toBe(true);
      // And the measured side is actually drawn -- a fully blank chart would
      // satisfy the assertion above on its own.
      expect(series.slice(23).some((v) => v !== null)).toBe(true);
    }
  });

  it("omits the chart entirely when the whole window predates the boundary", async () => {
    const curr = mkDaily();
    const preBoundary = cvrDays().map((d, i) => ({
      ...d,
      day: new Date(Date.UTC(2026, 5, 1) + i * 86_400_000).toISOString().slice(0, 10),
    }));
    const { blocks } = await buildFunnelDigestBlocks({
      title: "Test",
      windowLabel: "30d",
      cvr: { days: preBoundary },
      bucket: null,
      dropout: null,
      nurture: null,
      curr,
      prev: curr,
      cadence: "WoW",
    });
    const kinds = imageKinds(blocks as Array<{ type: string; image_url?: string }>);
    // An all-null series is an empty frame with a title and a "now --" readout,
    // which is worse than no chart.
    expect(kinds).not.toContain("cvr-completion-paygate");
    expect(kinds).not.toContain("cvr-paygate-purchase");
    // The stages that were always measured the same way still render.
    expect(kinds).toContain("cvr-visitor-start");
    expect(kinds).toContain("cvr-start-completion");
  });
});
