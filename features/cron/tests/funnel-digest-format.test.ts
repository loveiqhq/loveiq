// Locks the Slack message format for the daily + weekly funnel digest so the
// "% of starts" annotation on each funnel-stage line doesn't regress.

import { describe, expect, it, vi } from "vitest";
import type { DailyMetrics, WeeklyMetrics } from "@features/admin/server/digest-metrics";

// The route module imports a few cron-only helpers we don't exercise here; stub
// them so importing the route doesn't drag Supabase / Slack into the test.
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@shared/observability/slack", () => ({
  notifySlack: vi.fn(),
}));
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  startCronTimer: vi.fn(() => async () => undefined),
  tryClaimSlackAlert: vi.fn().mockResolvedValue(false),
  verifyCronAuth: vi.fn().mockReturnValue(true),
}));

import { formatDaily, formatWeekly } from "@/app/api/cron/funnel-digest/route";

const baseDaily: DailyMetrics = {
  surveyStarts: 1000,
  completions: 600,
  completionRate: 60,
  reportViewers: 500,
  engagement1min: 400,
  engagement5min: 300,
  engagement10min: 200,
  paywallViews: 250,
  beginCheckouts: 100,
  revenue: {
    count: 25,
    byCurrency: { EUR: 500 },
    planMix: { essentials: 10, full_report: 12, all_reports: 3 },
    promoRedemptions: 4,
  },
  refunds: 1,
  refundAmount: 20,
  failedPayments: 2,
  disputes: 0,
  invites: 80,
  shares: 120,
  thumbsUp: 30,
  thumbsDown: 5,
  bounces: 3,
  complaints: 1,
  unsubscribes: 2,
  emailOpened: 200,
  emailClicked: 50,
  topArchetypes: [["Sensual Connector", 90]],
  topUtmSources: [["google", 250]],
};

function withZeroStarts(metrics: DailyMetrics): DailyMetrics {
  return {
    ...metrics,
    surveyStarts: 0,
    completions: 0,
    completionRate: 0,
    reportViewers: 0,
    engagement1min: 0,
    engagement5min: 0,
    engagement10min: 0,
    paywallViews: 0,
    beginCheckouts: 0,
  };
}

describe("formatDaily — % of starts annotation", () => {
  it("annotates each activation metric with its share of survey starts", () => {
    const msg = formatDaily("2026-05-20", baseDaily, baseDaily);
    // Activation lines pick up the new annotation
    expect(msg).toContain("Report viewers: 500");
    expect(msg).toContain("50.00% of starts");
    expect(msg).toContain("Engagement 1m+: 400");
    expect(msg).toContain("40.00% of starts");
    expect(msg).toContain("Engagement 10m+: 200");
    expect(msg).toContain("20.00% of starts");
    expect(msg).toContain("Paywall views: 250");
    expect(msg).toContain("25.00% of starts");
    expect(msg).toContain("Begin checkouts: 100");
    expect(msg).toContain("10.00% of starts");
    // Revenue → Purchases line gets the annotation inline
    expect(msg).toContain("Purchases: 25");
    expect(msg).toContain("2.50% of starts");
  });

  it("does NOT annotate the Survey starts line itself (it's the baseline)", () => {
    const msg = formatDaily("2026-05-20", baseDaily, baseDaily);
    // The "Survey starts" line should not carry a "% of starts" suffix
    const surveyLine = msg.split("\n").find((l) => l.startsWith("• Survey starts:"));
    expect(surveyLine).toBeDefined();
    expect(surveyLine).not.toMatch(/% of starts/);
  });

  it("gracefully drops the annotation when survey starts is 0 (avoids 0/0)", () => {
    const zero = withZeroStarts(baseDaily);
    const msg = formatDaily("2026-05-20", zero, zero);
    expect(msg).not.toMatch(/% of starts/);
  });

  it("keeps non-funnel sections untouched (no % of starts on refunds, email health, breakdowns)", () => {
    const msg = formatDaily("2026-05-20", baseDaily, baseDaily);
    const refundsLine = msg.split("\n").find((l) => l.startsWith("• Refunds:"));
    expect(refundsLine).not.toMatch(/% of starts/);
    const bouncesLine = msg.split("\n").find((l) => l.startsWith("• Bounces:"));
    expect(bouncesLine).not.toMatch(/% of starts/);
    const archetypesLine = msg.split("\n").find((l) => l.startsWith("• Archetypes:"));
    expect(archetypesLine).not.toMatch(/% of starts/);
  });
});

const baseWeekly: WeeklyMetrics = {
  ...baseDaily,
  avgCompletionSec: 240,
  funnel: {
    starts: 1000,
    completions: 600,
    reportViewed: 500,
    paywallViewed: 250,
    purchased: 25,
  },
  worstChapters: [],
  topIssues: [],
  dropOff: [],
};

describe("formatWeekly — % of starts annotation", () => {
  it("annotates each activation metric and the purchases line with % of starts", () => {
    const msg = formatWeekly("2026-W20", "May 13 → May 19 UTC", baseWeekly, baseWeekly);
    expect(msg).toContain("Report viewers: 500");
    expect(msg).toContain("50.00% of starts");
    expect(msg).toContain("Paywall views: 250");
    expect(msg).toContain("25.00% of starts");
    expect(msg).toContain("Purchases: 25");
    expect(msg).toContain("2.50% of starts");
  });

  it("annotates each conversion-funnel line with both % kept and % of starts", () => {
    const msg = formatWeekly("2026-W20", "May 13 → May 19 UTC", baseWeekly, baseWeekly);
    // Completions: 600/1000 = 60.00% of starts; 600/1000 kept = 60% kept
    expect(msg).toMatch(/Completions: 600 \(60% kept, 60\.00% of starts\)/);
    // Report viewed: 500/600 = 83% kept; 500/1000 = 50.00% of starts
    expect(msg).toMatch(/Report viewed: 500 \(83% kept, 50\.00% of starts\)/);
    // Paywall viewed: 250/500 = 50% kept; 250/1000 = 25.00% of starts
    expect(msg).toMatch(/Paywall viewed: 250 \(50% kept, 25\.00% of starts\)/);
    // Purchased: 25/250 = 10% kept; 25/1000 = 2.50% of starts
    expect(msg).toMatch(/Purchased: 25 \(10% kept, 2\.50% of starts\)/);
  });

  it("Survey starts line in the conversion funnel block is the baseline (no annotation)", () => {
    const msg = formatWeekly("2026-W20", "May 13 → May 19 UTC", baseWeekly, baseWeekly);
    // The funnel block's first line should be bare
    expect(msg).toContain("• Survey starts: 1000\n");
  });

  it("gracefully drops the annotation when survey starts is 0", () => {
    const zero: WeeklyMetrics = {
      ...withZeroStarts(baseWeekly),
      avgCompletionSec: 0,
      funnel: { starts: 0, completions: 0, reportViewed: 0, paywallViewed: 0, purchased: 0 },
      worstChapters: [],
      topIssues: [],
      dropOff: [],
    };
    const msg = formatWeekly("2026-W20", "May 13 → May 19 UTC", zero, zero);
    expect(msg).not.toMatch(/% of starts/);
  });
});
