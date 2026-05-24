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
  // Identity escape in tests — assertions are easier to write against the
  // raw label, and the real escape behavior is covered by slack.test.ts.
  escapeSlack: (s: string) => s,
}));
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  startCronTimer: vi.fn(() => async () => undefined),
  tryClaimSlackAlert: vi.fn().mockResolvedValue(false),
  verifyCronAuth: vi.fn().mockReturnValue(true),
}));

import { formatDaily, formatWeekly } from "@/app/api/cron/funnel-digest/route";

const baseDaily: DailyMetrics = {
  uniqueVisitors: 2500,
  newVisitors: 1900,
  returningVisitors: 600,
  surveyEngineMounts: 1100,
  surveyStarts: 1000,
  completions: 600,
  completionRate: 60,
  topCompletionHours: [
    { hour: 18, count: 7 },
    { hour: 20, count: 5 },
    { hour: 22, count: 4 },
  ],
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
    uniqueVisitors: 2500,
    engineMounts: 1100,
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

  it("Unique visitors line in the conversion funnel block is the baseline (no annotation)", () => {
    const msg = formatWeekly("2026-W20", "May 13 → May 19 UTC", baseWeekly, baseWeekly);
    // The funnel block's first line is now Unique visitors and should be bare
    expect(msg).toContain("• Unique visitors: 2500\n");
  });

  it("annotates top-of-funnel stages (Saw Q1, Survey starts) with % kept + % of starts", () => {
    const msg = formatWeekly("2026-W20", "May 13 → May 19 UTC", baseWeekly, baseWeekly);
    // Saw Q1: 1100/2500 = 44% kept; 1100/1000 = 110.00% of starts (since starts is the denominator)
    expect(msg).toMatch(/Saw Q1: 1100 \(44% kept, 110\.00% of starts\)/);
    // Survey starts: 1000/1100 = 91% kept; 1000/1000 = 100.00% of starts
    expect(msg).toMatch(/Survey starts: 1000 \(91% kept, 100\.00% of starts\)/);
  });

  it("gracefully drops the annotation when survey starts is 0", () => {
    const zero: WeeklyMetrics = {
      ...withZeroStarts(baseWeekly),
      avgCompletionSec: 0,
      funnel: {
        uniqueVisitors: 0,
        engineMounts: 0,
        starts: 0,
        completions: 0,
        reportViewed: 0,
        paywallViewed: 0,
        purchased: 0,
      },
      worstChapters: [],
      topIssues: [],
      dropOff: [],
    };
    const msg = formatWeekly("2026-W20", "May 13 → May 19 UTC", zero, zero);
    expect(msg).not.toMatch(/% of starts/);
  });
});

describe("formatDaily — top-of-funnel additions", () => {
  it("renders Unique visitors + Saw Q1 in the Acquisition block above Survey starts", () => {
    const msg = formatDaily("2026-05-20", baseDaily, baseDaily);
    const acquisitionStart = msg.indexOf("*Acquisition*");
    const visitorsLine = msg.indexOf("• Unique visitors: 2500");
    const sawQ1Line = msg.indexOf("• Saw Q1: 1100");
    const startsLine = msg.indexOf("• Survey starts:");
    expect(acquisitionStart).toBeGreaterThan(-1);
    expect(visitorsLine).toBeGreaterThan(acquisitionStart);
    expect(sawQ1Line).toBeGreaterThan(visitorsLine);
    expect(startsLine).toBeGreaterThan(sawQ1Line);
  });

  it("annotates Saw Q1 with its share of unique visitors (not of survey starts)", () => {
    const msg = formatDaily("2026-05-20", baseDaily, baseDaily);
    // 1100/2500 = 44.00%
    expect(msg).toMatch(/Saw Q1: 1100 \(DoD: .+, 44\.00% of visitors\)/);
  });

  it("drops the % of visitors annotation when uniqueVisitors is 0", () => {
    const zero = withZeroStarts(baseDaily);
    const msg = formatDaily("2026-05-20", zero, zero);
    expect(msg).not.toMatch(/% of visitors/);
  });
});

// -----------------------------------------------------------------------------
// Strategy-lead expansion: headline + channels + leak + alerts + monetization
// -----------------------------------------------------------------------------

import {
  pickHeadline,
  formatChannelLines,
  formatLeakLines,
  formatAlertLines,
  formatMonetizationLines,
  clampToSlackLimit,
} from "@/app/api/cron/funnel-digest/route";

describe("clampToSlackLimit", () => {
  it("returns the input unchanged when under the cap", () => {
    expect(clampToSlackLimit("hello")).toBe("hello");
  });

  it("truncates with a trailing pointer when over the soft cap", () => {
    const huge = "x".repeat(5000);
    const clamped = clampToSlackLimit(huge);
    expect(clamped.length).toBeLessThanOrEqual(2800);
    expect(clamped).toContain("(see /admin for full details");
  });
});

describe("pickHeadline", () => {
  it("picks the metric with the largest absolute DoD% above the threshold", () => {
    const prev: DailyMetrics = {
      ...baseDaily,
      completions: 100,
      revenue: { ...baseDaily.revenue, count: 20 },
    };
    const curr: DailyMetrics = {
      ...baseDaily,
      completions: 150,
      revenue: { ...baseDaily.revenue, count: 30 },
    };
    // Completions +50%, Purchases +50% — tie, picks first. Both qualify.
    const headline = pickHeadline(curr, prev);
    expect(headline).toMatch(/Today's story/);
    expect(headline).toMatch(/\+50%/);
  });

  it("returns null when no metric crosses the 25% threshold", () => {
    const prev: DailyMetrics = { ...baseDaily };
    const curr: DailyMetrics = { ...baseDaily, completions: baseDaily.completions + 10 }; // 600 -> 610, <2%
    expect(pickHeadline(curr, prev)).toBeNull();
  });

  it("returns null when the candidate's prev is below the low-base floor", () => {
    const prev: DailyMetrics = { ...baseDaily, revenue: { ...baseDaily.revenue, count: 2 } };
    const curr: DailyMetrics = { ...baseDaily, revenue: { ...baseDaily.revenue, count: 10 } };
    // +400% but prev < 5 → suppressed (low-base guard).
    expect(pickHeadline(curr, prev)).toBeNull();
  });

  it("prefers the largest absolute mover when multiple qualify", () => {
    const prev: DailyMetrics = { ...baseDaily, uniqueVisitors: 100, completions: 100 };
    const curr: DailyMetrics = { ...baseDaily, uniqueVisitors: 200, completions: 150 };
    // Visitors +100%, Completions +50%. Visitors wins.
    const headline = pickHeadline(curr, prev);
    expect(headline).toContain("Unique visitors");
    expect(headline).toMatch(/\+100%/);
  });
});

describe("formatChannelLines", () => {
  it("returns [] when the snapshot is null", () => {
    const curr = { ...baseDaily, channels: null } as DailyMetrics;
    expect(formatChannelLines(curr)).toEqual([]);
  });

  it("renders top-5 sources + best-source line", () => {
    const curr = {
      ...baseDaily,
      channels: {
        generatedAt: "2026-05-23T00:00:00Z",
        days: 7,
        channels: [
          {
            source: "google",
            signups: 50,
            starts: 40,
            startRate: 80,
            completionRate: 60,
            scoredRate: 50,
            reportViewRate: 40,
            paidRate: 5,
            recoveryRate: 10,
            flaggedRate: 0,
            avgDurationMin: 8,
            revenuePerStart: 12,
            revenueTotal: 480,
            efficiencyScore: 70,
            confidence: "high" as const,
            action: "scale" as const,
          },
        ],
        summary: {
          totalSources: 1,
          totalSignups: 50,
          totalStarts: 40,
          totalPartialSaves: 30,
          avgEfficiencyScore: 70,
          scaleCandidates: 1,
          fixCandidates: 0,
          bestSource: "google",
          weakestHighVolumeSource: null,
        },
        trust: {
          windowDays: 7,
          sampleSize: 40,
          warning: null,
          source: "test",
          mode: "live" as const,
          lastUpdated: null,
          freshnessHours: null,
        },
      },
    } as DailyMetrics;
    const lines = formatChannelLines(curr);
    expect(lines[0]).toBe("*Channels (top 5)*");
    expect(lines.some((l) => l.includes("google"))).toBe(true);
    expect(lines.some((l) => l.includes("scale"))).toBe(true);
    expect(lines.some((l) => l.includes(":star:"))).toBe(true);
  });
});

describe("formatLeakLines", () => {
  it("returns [] when snapshot is null OR priorities array is empty", () => {
    expect(formatLeakLines({ ...baseDaily, leak: null } as DailyMetrics)).toEqual([]);
  });

  it("renders the top priority and up to 2 extras", () => {
    const curr = {
      ...baseDaily,
      leak: {
        generatedAt: "now",
        days: 7,
        summary: {
          totalStarts: 100,
          dimensionsCovered: 2,
          criticalLeaks: 1,
          blindspots: 0,
          strongestLeak: null,
        },
        priorities: [
          {
            dimension: "source" as const,
            label: "facebook",
            leakStageLabel: "Q1 → start",
            leakCount: 30,
            leakRate: 60,
            confidence: "medium" as const,
            explanation: "social-traffic bounce",
            href: "/admin",
          },
        ],
        dimensions: {} as never,
        trust: { warning: null, notes: [], windowDays: 7, sampleSize: 100 },
      },
    } as DailyMetrics;
    const lines = formatLeakLines(curr);
    expect(lines[0]).toBe("*Today's biggest leak*");
    expect(lines.some((l) => l.includes("facebook"))).toBe(true);
    expect(lines.some((l) => l.includes("Q1 → start"))).toBe(true);
  });
});

describe("formatAlertLines", () => {
  it("returns [] when no risk/watch breaches exist", () => {
    expect(formatAlertLines({ ...baseDaily, anomalies: null } as DailyMetrics)).toEqual([]);
  });

  it("emits :rotating_light: for risk and :warning: for watch, caps at 5", () => {
    const curr = {
      ...baseDaily,
      anomalies: {
        generatedAt: "now",
        days: 7,
        summary: { total: 2, risk: 1, watch: 1, matchedRules: 0 },
        items: [
          {
            id: "1",
            title: "Revenue dropped",
            category: "guardrail" as const,
            severity: "risk" as const,
            targetKey: "revenue",
            value: 100,
            detail: "below 200/day baseline",
            href: "/admin",
            ownerEmail: null,
            matchedRules: [],
          },
          {
            id: "2",
            title: "Latency rising",
            category: "service" as const,
            severity: "watch" as const,
            targetKey: "latency",
            value: 1200,
            detail: "P95 above 1s",
            href: "/admin",
            ownerEmail: null,
            matchedRules: [],
          },
        ],
        activeRules: [],
      },
    } as DailyMetrics;
    const lines = formatAlertLines(curr);
    expect(lines[0]).toBe("*Alerts*");
    expect(lines.some((l) => l.startsWith(":rotating_light:"))).toBe(true);
    expect(lines.some((l) => l.startsWith(":warning:"))).toBe(true);
  });
});

describe("formatMonetizationLines", () => {
  it("returns [] when no archetypes with starts", () => {
    expect(formatMonetizationLines({ ...baseDaily, monetization: null } as DailyMetrics)).toEqual(
      []
    );
  });

  it("includes median time-to-purchase when available", () => {
    const curr = {
      ...baseDaily,
      medianTimeToPurchaseHours: 4.5,
      monetization: {
        generatedAt: "now",
        days: 7,
        summary: {
          starts: 100,
          monetizedCount: 10,
          retainedCount: 5,
          referredCount: 2,
          upgradeIntentCount: 8,
          strongestMonetizationSignal: null,
          strongestRetentionSignal: null,
          strongestReferralSignal: null,
          strongestUpgradeSignal: null,
        },
        signals: [],
        channels: [],
        archetypes: [
          {
            archetype: "Magnetic Mystic",
            starts: 40,
            revenueTotal: 300,
            revenuePerStart: 7.5,
            valueRealizationScore: 50,
            monetizationRate: 25,
            monetizationLift: 0,
            referralRate: 10,
            referralLift: 0,
            retentionRate: 15,
            retentionLift: 0,
            upgradeIntentRate: 20,
            upgradeIntentLift: 0,
          },
        ],
        recommendations: [],
        trust: { warning: null, notes: [] },
      },
    } as DailyMetrics;
    const lines = formatMonetizationLines(curr);
    expect(lines[0]).toBe("*Segment monetization*");
    expect(lines.some((l) => l.includes("Magnetic Mystic"))).toBe(true);
    expect(lines.some((l) => l.includes("4.5h"))).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// Round 4: new-vs-returning + hour-of-day
// -----------------------------------------------------------------------------

describe("formatDaily — new vs returning visitor split", () => {
  it("renders the New / Returning line with the % of total visitors", () => {
    const msg = formatDaily("2026-05-20", baseDaily, baseDaily);
    expect(msg).toMatch(/New: 1900 \(DoD:.+\) \| Returning: 600 \(24\.0% of visitors\)/);
  });

  it("omits the split line when uniqueVisitors is 0", () => {
    const zero = withZeroStarts(baseDaily);
    const msg = formatDaily("2026-05-20", zero, zero);
    expect(msg).not.toMatch(/New: \d/);
    expect(msg).not.toMatch(/Returning: \d/);
  });
});

describe("formatDaily — top hours", () => {
  it("renders the Top hours line with formatted hour buckets", () => {
    const msg = formatDaily("2026-05-20", baseDaily, baseDaily);
    expect(msg).toContain("Top hours (UTC): 18:00 (7), 20:00 (5), 22:00 (4)");
  });

  it("omits Top hours when array is empty", () => {
    const m: DailyMetrics = { ...baseDaily, topCompletionHours: [] };
    const msg = formatDaily("2026-05-20", m, m);
    expect(msg).not.toMatch(/Top hours/);
  });
});

describe("formatDaily — partial-day funnel_event capture", () => {
  const windowStartIso = "2026-05-23T00:00:00.000Z";
  // Capture started ~45 minutes before midnight UTC on the day the digest
  // covers — modelled on the real 2026-05-23 incident where funnel_event was
  // applied at 23:15:21 UTC and the day-after digest compared a 45-minute
  // visitor window to a 24-hour survey_starts window.
  const captureStartIso = "2026-05-23T23:15:21.000Z";

  it("prepends a partial-capture warning line when partial is set", () => {
    const msg = formatDaily("2026-05-23", baseDaily, baseDaily, {
      capturedFromIso: captureStartIso,
      windowStartIso,
    });
    expect(msg).toContain("Visitor capture started 2026-05-23 23:15 UTC");
    expect(msg).toContain("partial window");
  });

  it("does NOT add the warning when partial is null (steady-state digest)", () => {
    const msg = formatDaily("2026-05-23", baseDaily, baseDaily);
    expect(msg).not.toContain("Visitor capture started");
    expect(msg).not.toContain("partial window");
  });

  it("excludes Unique visitors + Saw Q1 from headline candidates under partial capture", () => {
    // Build a curr that would otherwise produce a "Unique visitors ▲ +900%"
    // headline. With partial=true, the picker should ignore those candidates.
    const curr: DailyMetrics = { ...baseDaily, uniqueVisitors: 50000, surveyEngineMounts: 30000 };
    const msg = formatDaily("2026-05-23", curr, baseDaily, {
      capturedFromIso: captureStartIso,
      windowStartIso,
    });
    expect(msg).not.toMatch(/Today's story:\* Unique visitors/);
    expect(msg).not.toMatch(/Today's story:\* Saw Q1/);
  });

  it("still allows non-visitor headlines (e.g. Survey starts) under partial capture", () => {
    // Move only Survey starts so it's the strongest mover, but keep visitor
    // counts boring. Partial should NOT block the survey-starts headline.
    const curr: DailyMetrics = { ...baseDaily, surveyStarts: 5000 };
    const msg = formatDaily("2026-05-23", curr, baseDaily, {
      capturedFromIso: captureStartIso,
      windowStartIso,
    });
    expect(msg).toContain("Today's story:* Survey starts");
  });
});

describe("formatWeekly — partial-day funnel_event capture", () => {
  const baseWeeklyForPartial = baseWeekly;
  it("prepends the warning line when partial is set", () => {
    const msg = formatWeekly(
      "2026-W20",
      "May 13 → May 19 UTC",
      baseWeeklyForPartial,
      baseWeeklyForPartial,
      {
        capturedFromIso: "2026-05-17T08:00:00.000Z",
        windowStartIso: "2026-05-13T00:00:00.000Z",
      }
    );
    expect(msg).toContain("Visitor capture started 2026-05-17 08:00 UTC");
  });

  it("does NOT add the warning when partial is null", () => {
    const msg = formatWeekly(
      "2026-W20",
      "May 13 → May 19 UTC",
      baseWeeklyForPartial,
      baseWeeklyForPartial
    );
    expect(msg).not.toContain("Visitor capture started");
  });
});
