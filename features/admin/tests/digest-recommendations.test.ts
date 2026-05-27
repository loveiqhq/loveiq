import { describe, it, expect } from "vitest";
import { buildRecommendations } from "@features/admin/server/digest-recommendations";
import type { WeeklyMetrics } from "@features/admin/server/digest-metrics";

function baseWeekly(overrides: Partial<WeeklyMetrics> = {}): WeeklyMetrics {
  // Minimal valid WeeklyMetrics — fields not exercised by any rule are stubbed
  // with safe defaults. Casts to WeeklyMetrics let us skip every unrelated
  // field on DailyMetrics; the engine never reads them.
  return {
    uniqueVisitors: 0,
    newVisitors: 0,
    returningVisitors: 0,
    surveyEngineMounts: 0,
    surveyStarts: 0,
    completions: 0,
    completionRate: 0,
    topCompletionHours: [],
    reportViewers: 0,
    engagement1min: 0,
    engagement5min: 0,
    engagement10min: 0,
    paywallInitiated: 0,
    beginCheckouts: 0,
    revenue: {
      count: 0,
      byCurrency: {},
      planMix: { essentials: 0, full_report: 0, all_reports: 0 },
      promoRedemptions: 0,
    },
    refunds: 0,
    refundAmount: 0,
    failedPayments: 0,
    disputes: 0,
    invites: 0,
    shares: 0,
    thumbsUp: 0,
    thumbsDown: 0,
    bounces: 0,
    complaints: 0,
    unsubscribes: 0,
    emailOpened: 0,
    emailClicked: 0,
    topArchetypes: [],
    topUtmSources: [],
    channels: null,
    leak: null,
    anomalies: null,
    monetization: null,
    medianTimeToPurchaseHours: null,
    wizardFunnel: null,
    sparklines: null,
    avgCompletionSec: 0,
    funnel: {
      uniqueVisitors: 0,
      engineMounts: 0,
      starts: 0,
      completions: 0,
      reportViewed: 0,
      paywallInitiated: 0,
      purchased: 0,
    },
    worstChapters: [],
    topIssues: [],
    dropOff: [],
    dropoffEverywhere: null,
    answerLift: null,
    engagementLift: null,
    ...overrides,
  } as WeeklyMetrics;
}

describe("buildRecommendations", () => {
  it("returns [] when every snapshot is null/empty", () => {
    expect(buildRecommendations(baseWeekly())).toEqual([]);
  });

  it("ruleWizardSlideDrop: emits HIGH when retention < 70% on any slide", () => {
    const w = baseWeekly({
      wizardFunnel: {
        slide1: 100,
        slide2: 50, // 50% retention from slide1 → HIGH
        slide3: 48,
        slide4: 46,
        slide5: 44,
        reportViewed: 42,
      },
    });
    const recs = buildRecommendations(w);
    const wizardRec = recs.find((r) => r.rule.startsWith("wizard_slide_drop_1_2"));
    expect(wizardRec).toBeDefined();
    expect(wizardRec!.severity).toBe("high");
  });

  it("ruleWizardSlideDrop: emits MED when retention is 70-80%", () => {
    const w = baseWeekly({
      wizardFunnel: {
        slide1: 100,
        slide2: 75,
        slide3: 70,
        slide4: 65,
        slide5: 60,
        reportViewed: 55,
      },
    });
    const recs = buildRecommendations(w);
    const wizardRec = recs.find((r) => r.rule.startsWith("wizard_slide_drop_1_2"));
    expect(wizardRec).toBeDefined();
    expect(wizardRec!.severity).toBe("med");
  });

  it("ruleWizardSlideDrop: suppresses when slide1 < 10 (sample too small)", () => {
    const w = baseWeekly({
      wizardFunnel: { slide1: 5, slide2: 1, slide3: 1, slide4: 1, slide5: 1, reportViewed: 0 },
    });
    const recs = buildRecommendations(w);
    expect(recs.find((r) => r.rule.startsWith("wizard_slide_drop"))).toBeUndefined();
  });

  it("ruleAnswerLiftPositive: emits MED when top lift > 100%", () => {
    const w = baseWeekly({
      answerLift: {
        baseline_pct: 3.6,
        baseline_n: 100,
        baseline_paid: 4,
        pairs: [
          {
            q_id: "Q12013",
            q_text: "?",
            answer: "Often",
            n: 24,
            paid_n: 2,
            rate_pct: 8.3,
            lift_pct: 130,
          },
        ],
      },
    });
    const recs = buildRecommendations(w);
    const rec = recs.find((r) => r.rule === "answer_lift_positive");
    expect(rec).toBeDefined();
    expect(rec!.severity).toBe("med");
    expect(rec!.message).toContain("Q12013");
  });

  it("ruleAnswerLiftPositive: suppresses when baseline_n < 20", () => {
    const w = baseWeekly({
      answerLift: {
        baseline_pct: 3,
        baseline_n: 10,
        baseline_paid: 1,
        pairs: [
          { q_id: "Q1", q_text: "?", answer: "x", n: 5, paid_n: 1, rate_pct: 20, lift_pct: 500 },
        ],
      },
    });
    const recs = buildRecommendations(w);
    expect(recs.find((r) => r.rule === "answer_lift_positive")).toBeUndefined();
  });

  it("ruleAnswerLiftNegative: emits LOW when bottom lift < -50%", () => {
    const w = baseWeekly({
      answerLift: {
        baseline_pct: 5,
        baseline_n: 100,
        baseline_paid: 5,
        pairs: [
          {
            q_id: "Q3",
            q_text: "Age",
            answer: "18-24",
            n: 46,
            paid_n: 0,
            rate_pct: 1,
            lift_pct: -80,
          },
        ],
      },
    });
    const recs = buildRecommendations(w);
    const rec = recs.find((r) => r.rule === "answer_lift_negative");
    expect(rec).toBeDefined();
    expect(rec!.severity).toBe("low");
  });

  it("ruleEngagementMultiplier: emits MED when top bucket >= 5× baseline", () => {
    const w = baseWeekly({
      engagementLift: {
        buckets: [
          { bucket: "0-1m", n: 100, paid: 1 }, // 1% rate
          { bucket: "10m+", n: 10, paid: 6 }, // 60% rate
          // Baseline = 7/110 = 6.4% → top 60/6.4 = 9.4× ≥ 5
        ],
      },
    });
    const recs = buildRecommendations(w);
    const rec = recs.find((r) => r.rule === "engagement_bucket_multiplier");
    expect(rec).toBeDefined();
    expect(rec!.severity).toBe("med");
  });

  it("ruleEngagementMultiplier: suppresses when top bucket < 5× baseline", () => {
    const w = baseWeekly({
      engagementLift: {
        buckets: [
          { bucket: "0-1m", n: 10, paid: 1 },
          { bucket: "10m+", n: 10, paid: 2 }, // 20% vs 15% baseline = 1.3× — too small
        ],
      },
    });
    const recs = buildRecommendations(w);
    expect(recs.find((r) => r.rule === "engagement_bucket_multiplier")).toBeUndefined();
  });

  it("ruleDropoffRevenueLoss: emits HIGH when top leak > 100 EUR", () => {
    const w = baseWeekly({
      leakSeverity: [
        {
          fromStage: "report_viewed",
          toStage: "begin_checkout",
          dropCount: 50,
          dropRate: 60,
          downstreamPaidRate: 0.2,
          revenuePerPaid: 30,
          estLostRevenue: 300,
          currency: "EUR",
        },
      ] as WeeklyMetrics["leakSeverity"],
    });
    const recs = buildRecommendations(w);
    const rec = recs.find((r) => r.rule === "dropoff_revenue_loss");
    expect(rec).toBeDefined();
    expect(rec!.severity).toBe("high");
  });

  it("caps total recommendations at 5", () => {
    // Stuff conditions for many rules so > 5 fire.
    const w = baseWeekly({
      wizardFunnel: {
        slide1: 100,
        slide2: 30,
        slide3: 25,
        slide4: 20,
        slide5: 15,
        reportViewed: 10,
      },
      answerLift: {
        baseline_pct: 3,
        baseline_n: 100,
        baseline_paid: 3,
        pairs: [
          {
            q_id: "Q1",
            q_text: "?",
            answer: "x",
            n: 30,
            paid_n: 3,
            rate_pct: 10,
            lift_pct: 200,
          },
          {
            q_id: "Q2",
            q_text: "?",
            answer: "y",
            n: 30,
            paid_n: 0,
            rate_pct: 0,
            lift_pct: -100,
          },
        ],
      },
      engagementLift: {
        buckets: [
          { bucket: "0-1m", n: 100, paid: 1 },
          { bucket: "10m+", n: 10, paid: 6 },
        ],
      },
      leakSeverity: [
        {
          fromStage: "a",
          toStage: "b",
          dropCount: 100,
          dropRate: 50,
          downstreamPaidRate: 0.3,
          revenuePerPaid: 30,
          estLostRevenue: 900,
          currency: "EUR",
        },
      ] as WeeklyMetrics["leakSeverity"],
      worstChapters: [{ sectionId: "intro", downs: 5 }],
    });
    const recs = buildRecommendations(w);
    expect(recs.length).toBeLessThanOrEqual(5);
  });

  it("sorts high → med → low", () => {
    const w = baseWeekly({
      wizardFunnel: {
        slide1: 100,
        slide2: 50,
        slide3: 48,
        slide4: 46,
        slide5: 44,
        reportViewed: 42,
      },
      answerLift: {
        baseline_pct: 5,
        baseline_n: 100,
        baseline_paid: 5,
        pairs: [
          { q_id: "Q3", q_text: "?", answer: "x", n: 50, paid_n: 0, rate_pct: 0, lift_pct: -80 },
        ],
      },
    });
    const recs = buildRecommendations(w);
    expect(recs.length).toBeGreaterThanOrEqual(2);
    const severities = recs.map((r) => r.severity);
    const rank = { high: 3, med: 2, low: 1 };
    for (let i = 1; i < severities.length; i += 1) {
      expect(rank[severities[i]!]).toBeLessThanOrEqual(rank[severities[i - 1]!]);
    }
  });

  it("buggy rule data does not crash — engine swallows per-rule errors", () => {
    // Pass partial structures to risk runtime errors inside rules
    const w = baseWeekly({
      wizardFunnel: {
        slide1: 100,
        slide2: NaN as unknown as number,
        slide3: 0,
        slide4: 0,
        slide5: 0,
        reportViewed: 0,
      },
    });
    expect(() => buildRecommendations(w)).not.toThrow();
  });
});
