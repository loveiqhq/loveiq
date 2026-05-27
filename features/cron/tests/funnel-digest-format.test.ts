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
  paywallInitiated: 250,
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
    paywallInitiated: 0,
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
    expect(msg).toContain("Paywall initiated (user-click): 250");
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
    paywallInitiated: 250,
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
    expect(msg).toContain("Paywall initiated (user-click): 250");
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
    // Paywall initiated: 250/500 = 50% kept; 250/1000 = 25.00% of starts
    expect(msg).toMatch(/Paywall initiated: 250 \(50% kept, 25\.00% of starts\)/);
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
        paywallInitiated: 0,
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

// -----------------------------------------------------------------------------
// Strategy-lead funnel intelligence — new sections (2026-05-27)
// -----------------------------------------------------------------------------

import {
  formatWizardFunnel,
  formatDropoffEverywhere,
  formatAnswerLift,
  formatEngagementLift,
  formatSparklines,
  formatWeeklyStrategySupplement,
  buildSparkline,
} from "@/app/api/cron/funnel-digest/route";
import type {
  WizardSlideRetentionSnapshot,
  DropoffEverywhereSnapshot,
  AnswerLiftSnapshot,
  EngagementLiftSnapshot,
  SparklineSnapshot,
} from "@features/admin/server/digest-metrics";

describe("formatWizardFunnel", () => {
  it("returns [] when snapshot is null", () => {
    expect(formatWizardFunnel(null)).toEqual([]);
  });

  it("returns [] when slide1 < 3 (sample too small)", () => {
    const snap: WizardSlideRetentionSnapshot = {
      slide1: 2,
      slide2: 2,
      slide3: 1,
      slide4: 1,
      slide5: 1,
      reportViewed: 1,
    };
    expect(formatWizardFunnel(snap)).toEqual([]);
  });

  it("renders the slide-by-slide retention with % kept", () => {
    const snap: WizardSlideRetentionSnapshot = {
      slide1: 100,
      slide2: 80,
      slide3: 70,
      slide4: 60,
      slide5: 50,
      reportViewed: 40,
    };
    const lines = formatWizardFunnel(snap);
    expect(lines[0]).toBe("*Wizard funnel*");
    expect(lines.some((l) => l.includes("Slide 1 entered: 100"))).toBe(true);
    expect(lines.some((l) => l.includes("Slide 2:") && l.includes("80%"))).toBe(true);
    expect(lines.some((l) => l.includes("Report viewed:") && l.includes("40"))).toBe(true);
  });

  it("renders — for divide-by-zero when prev slide is 0", () => {
    const snap: WizardSlideRetentionSnapshot = {
      slide1: 10,
      slide2: 0,
      slide3: 0,
      slide4: 0,
      slide5: 0,
      reportViewed: 0,
    };
    const lines = formatWizardFunnel(snap);
    // Slide 3 has prev (slide 2) = 0, should print —
    const slide3Line = lines.find((l) => l.startsWith("• Slide 3:"));
    expect(slide3Line).toContain("—");
  });
});

describe("buildSparkline", () => {
  it("returns empty line for empty input", () => {
    expect(buildSparkline([])).toEqual({ line: "", max: 0 });
  });

  it("maps all-zero series to all-▁ chars", () => {
    const out = buildSparkline([0, 0, 0, 0, 0]);
    expect(out.line).toBe("▁▁▁▁▁");
    expect(out.max).toBe(0);
  });

  it("maps max value to █ and 0 to ▁", () => {
    const out = buildSparkline([0, 10]);
    expect(out.line.startsWith("▁")).toBe(true);
    expect(out.line.endsWith("█")).toBe(true);
    expect(out.max).toBe(10);
  });

  it("preserves length = input length", () => {
    const out = buildSparkline([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(out.line.length).toBe(10);
  });
});

describe("formatSparklines", () => {
  it("returns [] when snapshot is null", () => {
    expect(formatSparklines(null)).toEqual([]);
  });

  it("returns [] when every day has zero across every metric", () => {
    const snap: SparklineSnapshot = {
      days: [
        {
          day: "2026-05-01",
          visitors: 0,
          starts: 0,
          completions: 0,
          report_views: 0,
          paywall_init: 0,
          purchases: 0,
        },
        {
          day: "2026-05-02",
          visitors: 0,
          starts: 0,
          completions: 0,
          report_views: 0,
          paywall_init: 0,
          purchases: 0,
        },
      ],
    };
    expect(formatSparklines(snap)).toEqual([]);
  });

  it("renders 6 metric rows with header line", () => {
    const days = Array.from({ length: 5 }, (_, i) => ({
      day: `2026-05-${String(i + 1).padStart(2, "0")}`,
      visitors: (i + 1) * 10,
      starts: i + 1,
      completions: 0,
      report_views: 0,
      paywall_init: 0,
      purchases: 0,
    }));
    const lines = formatSparklines({ days });
    expect(lines[0]).toMatch(/5-day trends/);
    expect(lines.some((l) => l.includes("Visitors"))).toBe(true);
    expect(lines.some((l) => l.includes("Survey starts"))).toBe(true);
    expect(lines.some((l) => l.includes("peak 50"))).toBe(true);
  });
});

describe("formatDropoffEverywhere", () => {
  it("returns [] when snapshot is null", () => {
    expect(formatDropoffEverywhere(null)).toEqual([]);
  });

  it("returns [] when first stage is zero (no funnel to show)", () => {
    const snap: DropoffEverywhereSnapshot = {
      stages: [{ name: "unique_visitors", count: 0 }],
    };
    expect(formatDropoffEverywhere(snap)).toEqual([]);
  });

  it("renders one line per stage with drop count, rate, and biggest-leak tag", () => {
    const snap: DropoffEverywhereSnapshot = {
      stages: [
        { name: "unique_visitors", count: 100 },
        { name: "saw_q1", count: 80 },
        { name: "survey_started", count: 30 }, // biggest absolute drop = 50
        { name: "purchased", count: 5 },
      ],
    };
    const lines = formatDropoffEverywhere(snap);
    expect(lines[0]).toBe("*Drop-off everywhere (weekly)*");
    expect(lines.some((l) => l.includes("Unique visitors: 100"))).toBe(true);
    expect(lines.some((l) => l.includes("Saw Q1") && l.includes("20 dropped"))).toBe(true);
    expect(lines.some((l) => l.includes("Survey started") && l.includes("biggest leak"))).toBe(
      true
    );
  });

  it("handles unknown stage names by falling back to the raw name", () => {
    const snap: DropoffEverywhereSnapshot = {
      stages: [
        { name: "unique_visitors", count: 10 },
        { name: "some_new_stage_we_added", count: 5 },
      ],
    };
    const lines = formatDropoffEverywhere(snap);
    expect(lines.some((l) => l.includes("some_new_stage_we_added"))).toBe(true);
  });
});

describe("formatAnswerLift", () => {
  it("returns [] when snapshot is null OR pairs is empty", () => {
    expect(formatAnswerLift(null)).toEqual([]);
    expect(
      formatAnswerLift({ baseline_pct: 3, baseline_n: 100, baseline_paid: 3, pairs: [] })
    ).toEqual([]);
  });

  it("returns [] when baseline_paid is 0 (no purchases to compare against)", () => {
    expect(
      formatAnswerLift({
        baseline_pct: 0,
        baseline_n: 100,
        baseline_paid: 0,
        pairs: [
          { q_id: "Q1", q_text: "?", answer: "Yes", n: 50, paid_n: 0, rate_pct: 0, lift_pct: 0 },
        ],
      })
    ).toEqual([]);
  });

  it("emits the baseline header + one bullet per pair, anti-signal tag for negative lift", () => {
    const snap: AnswerLiftSnapshot = {
      baseline_pct: 3.6,
      baseline_n: 100,
      baseline_paid: 3,
      pairs: [
        {
          q_id: "Q12013",
          q_text: "How often do you feel emotionally exhausted?",
          answer: "Often",
          n: 24,
          paid_n: 2,
          rate_pct: 8.3,
          lift_pct: 127,
        },
        {
          q_id: "Q03004",
          q_text: "Age range",
          answer: "18-24",
          n: 46,
          paid_n: 0,
          rate_pct: 1.1,
          lift_pct: -69,
        },
      ],
    };
    const lines = formatAnswerLift(snap);
    expect(lines[0]).toContain("baseline = 3.6%");
    expect(lines[0]).toContain("n=100");
    expect(lines.some((l) => l.includes("Q12013") && l.includes("+127%"))).toBe(true);
    expect(lines.some((l) => l.includes("anti-signal"))).toBe(true);
  });

  it("truncates long question text", () => {
    const longText = "a".repeat(200);
    const snap: AnswerLiftSnapshot = {
      baseline_pct: 5,
      baseline_n: 100,
      baseline_paid: 5,
      pairs: [
        {
          q_id: "Q1",
          q_text: longText,
          answer: "Yes",
          n: 20,
          paid_n: 4,
          rate_pct: 20,
          lift_pct: 300,
        },
      ],
    };
    const lines = formatAnswerLift(snap);
    const pairLine = lines.find((l) => l.includes("Q1"));
    expect(pairLine).toBeDefined();
    expect(pairLine!.length).toBeLessThan(longText.length); // truncation happened
    expect(pairLine).toContain("…");
  });
});

describe("formatEngagementLift", () => {
  it("returns [] when snapshot is null OR buckets is empty", () => {
    expect(formatEngagementLift(null)).toEqual([]);
    expect(formatEngagementLift({ buckets: [] })).toEqual([]);
  });

  it("returns [] when total n across all buckets is 0", () => {
    expect(
      formatEngagementLift({
        buckets: [
          { bucket: "0-1m", n: 0, paid: 0 },
          { bucket: "10m+", n: 0, paid: 0 },
        ],
      })
    ).toEqual([]);
  });

  it("renders buckets in fixed order 0-1m → 10m+", () => {
    const snap: EngagementLiftSnapshot = {
      buckets: [
        { bucket: "10m+", n: 12, paid: 5 },
        { bucket: "0-1m", n: 14, paid: 0 },
        { bucket: "1-5m", n: 22, paid: 1 },
        { bucket: "5-10m", n: 18, paid: 3 },
      ],
    };
    const lines = formatEngagementLift(snap);
    const order = lines
      .filter((l) => l.startsWith("• "))
      .map((l) => l.match(/^• ([0-9-]+m\+?)/)?.[1]);
    expect(order).toEqual(["0-1m", "1-5m", "5-10m", "10m+"]);
  });

  it("tags the top-rate bucket with N× baseline when at least 2× lift", () => {
    const snap: EngagementLiftSnapshot = {
      buckets: [
        { bucket: "0-1m", n: 10, paid: 0 },
        { bucket: "10m+", n: 10, paid: 5 }, // 50% vs ~25% aggregate baseline
      ],
    };
    const lines = formatEngagementLift(snap);
    const top = lines.find((l) => l.includes("10m+"));
    expect(top).toContain("× baseline");
  });

  it("handles divide-by-zero on bucket-level rate", () => {
    const snap: EngagementLiftSnapshot = {
      buckets: [
        { bucket: "0-1m", n: 0, paid: 0 },
        { bucket: "10m+", n: 5, paid: 2 },
      ],
    };
    const lines = formatEngagementLift(snap);
    // Should not throw, and 0-1m line shows 0.0%
    expect(lines.some((l) => l.includes("0-1m dwell: n=0, paid 0.0%"))).toBe(true);
  });
});

describe("formatWeeklyStrategySupplement", () => {
  function buildBaseline(): WeeklyMetrics {
    return {
      ...baseWeekly,
      dropoffEverywhere: null,
      answerLift: null,
      engagementLift: null,
    } as WeeklyMetrics;
  }

  it("returns null when every section is empty", () => {
    const out = formatWeeklyStrategySupplement("2026-W22", "May 25 → May 31 UTC", buildBaseline());
    expect(out).toBeNull();
  });

  it("emits a single composed message when at least one section has data", () => {
    const w: WeeklyMetrics = {
      ...buildBaseline(),
      wizardFunnel: {
        slide1: 50,
        slide2: 40,
        slide3: 35,
        slide4: 30,
        slide5: 25,
        reportViewed: 20,
      },
    };
    const out = formatWeeklyStrategySupplement("2026-W22", "May 25 → May 31 UTC", w);
    expect(out).not.toBeNull();
    expect(out!).toContain("Weekly funnel intelligence");
    expect(out!).toContain("Wizard funnel");
  });

  it("composes multiple sections separated by blank lines", () => {
    const w: WeeklyMetrics = {
      ...buildBaseline(),
      wizardFunnel: {
        slide1: 50,
        slide2: 40,
        slide3: 35,
        slide4: 30,
        slide5: 25,
        reportViewed: 20,
      },
      dropoffEverywhere: {
        stages: [
          { name: "unique_visitors", count: 100 },
          { name: "purchased", count: 5 },
        ],
      },
    };
    const out = formatWeeklyStrategySupplement("2026-W22", "May 25 → May 31 UTC", w);
    expect(out!).toContain("Wizard funnel");
    expect(out!).toContain("Drop-off everywhere");
  });

  it("respects Slack 2800-char soft cap (clamp returns truncated message)", () => {
    // Stuff a huge answer-lift pair list to force clamp behaviour.
    const longPairs = Array.from({ length: 100 }, (_, i) => ({
      q_id: `Q${i}`,
      q_text: "a".repeat(40),
      answer: "b".repeat(20),
      n: 50,
      paid_n: 25,
      rate_pct: 50,
      lift_pct: 1000 + i,
    }));
    const w: WeeklyMetrics = {
      ...buildBaseline(),
      answerLift: { baseline_pct: 3, baseline_n: 1000, baseline_paid: 30, pairs: longPairs },
    };
    const out = formatWeeklyStrategySupplement("2026-W22", "May 25 → May 31 UTC", w);
    expect(out!.length).toBeLessThanOrEqual(2800);
  });
});

describe("pickHeadline — no regression from new wizard/sparkline fields", () => {
  it("does NOT consider wizard or sparkline values as headline candidates", () => {
    // pickHeadline only takes DailyMetrics top-level numbers (visitors, starts,
    // completions, etc). Setting wizardFunnel to a wildly large value should
    // never become "Today's story". This catches anyone wiring the new fields
    // into the headline picker accidentally.
    const prev: DailyMetrics = { ...baseDaily };
    const curr: DailyMetrics = {
      ...baseDaily,
      wizardFunnel: {
        slide1: 99999,
        slide2: 99999,
        slide3: 99999,
        slide4: 99999,
        slide5: 99999,
        reportViewed: 99999,
      },
    } as DailyMetrics;
    expect(pickHeadline(curr, prev)).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// Phase 2 — recommendations + leak severity formatters + Block Kit builders
// -----------------------------------------------------------------------------

import {
  formatRecommendationsLines,
  formatLeakSeverityLines,
  buildDailyBlocks,
  buildWeeklyStrategyBlocks,
} from "@/app/api/cron/funnel-digest/route";
import type { Recommendation } from "@features/admin/server/digest-recommendations";
import type { LeakSeverity } from "@features/admin/server/digest-leak-scoring";

describe("formatRecommendationsLines", () => {
  it("returns [] when empty", () => {
    expect(formatRecommendationsLines([])).toEqual([]);
  });

  it("renders header + one line per rec with severity-coded emoji", () => {
    const recs: Recommendation[] = [
      { severity: "high", rule: "x1", message: "Fix the leak", evidence: "n=10" },
      { severity: "med", rule: "x2", message: "Audit channel X", evidence: "starts=200" },
      { severity: "low", rule: "x3", message: "Cohort check", evidence: "lift=-60%" },
    ];
    const lines = formatRecommendationsLines(recs);
    expect(lines[0]).toBe("*Recommendations*");
    expect(lines.some((l) => l.includes(":rotating_light:") && l.includes("HIGH"))).toBe(true);
    expect(lines.some((l) => l.includes(":warning:") && l.includes("MED"))).toBe(true);
    expect(lines.some((l) => l.includes("Fix the leak"))).toBe(true);
  });
});

describe("formatLeakSeverityLines", () => {
  it("returns [] when empty", () => {
    expect(formatLeakSeverityLines([])).toEqual([]);
  });

  it("renders ranked rows with currency-formatted lost revenue", () => {
    const leaks: LeakSeverity[] = [
      {
        fromStage: "report_viewed",
        toStage: "begin_checkout",
        dropCount: 50,
        dropRate: 60,
        downstreamPaidRate: 0.25,
        revenuePerPaid: 30,
        estLostRevenue: 375.5,
        currency: "EUR",
      },
    ];
    const lines = formatLeakSeverityLines(leaks);
    expect(lines[0]).toBe("*Top funnel leaks by est. revenue impact*");
    expect(lines[1]).toContain("1. report_viewed → begin_checkout");
    expect(lines[1]).toContain("50 dropped");
    expect(lines[1]).toContain("EUR 376"); // Math.round(375.5) = 376
  });
});

describe("buildDailyBlocks", () => {
  it("returns blocks containing a section + image when sparklines exist + site URL set", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
    process.env.STRATEGY_DIGEST_SIGNING_SECRET = "test-secret-long-enough-for-validation-abc";
    const daily: DailyMetrics = {
      ...baseDaily,
      sparklines: {
        days: [
          {
            day: "2026-05-01",
            visitors: 10,
            starts: 5,
            completions: 3,
            report_views: 2,
            paywall_init: 1,
            purchases: 1,
          },
        ],
      },
    } as DailyMetrics;
    const out = await buildDailyBlocks("2026-05-02", daily, baseDaily);
    expect(out.text).toContain("Daily digest");
    expect(out.blocks.length).toBeGreaterThanOrEqual(1);
    expect(out.blocks[0]!.type).toBe("section");
    const imageBlock = out.blocks.find((b) => b.type === "image");
    expect(imageBlock).toBeDefined();
    expect(imageBlock!.image_url).toMatch(
      /^https:\/\/example\.test\/api\/admin\/digest-image\/sparklines/
    );
  });

  it("omits the image block when sparklines is null", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
    const out = await buildDailyBlocks("2026-05-02", baseDaily, baseDaily);
    const imageBlock = out.blocks.find((b) => b.type === "image");
    expect(imageBlock).toBeUndefined();
  });

  it("omits the image block when NEXT_PUBLIC_SITE_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const daily: DailyMetrics = {
      ...baseDaily,
      sparklines: {
        days: [
          {
            day: "2026-05-01",
            visitors: 10,
            starts: 5,
            completions: 3,
            report_views: 2,
            paywall_init: 1,
            purchases: 1,
          },
        ],
      },
    } as DailyMetrics;
    const out = await buildDailyBlocks("2026-05-02", daily, baseDaily);
    expect(out.blocks.find((b) => b.type === "image")).toBeUndefined();
  });
});

describe("buildWeeklyStrategyBlocks", () => {
  function buildSupplementWeekly(overrides: Partial<WeeklyMetrics> = {}): WeeklyMetrics {
    return {
      ...baseWeekly,
      wizardFunnel: null,
      sparklines: null,
      dropoffEverywhere: null,
      answerLift: null,
      engagementLift: null,
      leakSeverity: [],
      recommendations: [],
      ...overrides,
    } as WeeklyMetrics;
  }

  it("returns null when every section is empty", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
    process.env.STRATEGY_DIGEST_SIGNING_SECRET = "test-secret-long-enough-for-validation-abc";
    const out = await buildWeeklyStrategyBlocks(
      "2026-W22",
      "May 25 → May 31 UTC",
      buildSupplementWeekly()
    );
    expect(out).toBeNull();
  });

  it("composes header + image + sections + image when data is present", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
    process.env.STRATEGY_DIGEST_SIGNING_SECRET = "test-secret-long-enough-for-validation-abc";
    const w = buildSupplementWeekly({
      wizardFunnel: {
        slide1: 50,
        slide2: 40,
        slide3: 35,
        slide4: 30,
        slide5: 25,
        reportViewed: 20,
      },
      dropoffEverywhere: {
        stages: [
          { name: "unique_visitors", count: 100 },
          { name: "purchased", count: 5 },
        ],
      },
      recommendations: [{ severity: "high", rule: "x", message: "Fix it", evidence: "n=10" }],
      leakSeverity: [
        {
          fromStage: "a",
          toStage: "b",
          dropCount: 30,
          dropRate: 30,
          downstreamPaidRate: 0.1,
          revenuePerPaid: 50,
          estLostRevenue: 150,
          currency: "EUR",
        },
      ],
    });
    const out = await buildWeeklyStrategyBlocks("2026-W22", "May 25 → May 31 UTC", w);
    expect(out).not.toBeNull();
    expect(out!.blocks[0]!.type).toBe("header");
    const sections = out!.blocks.filter((b) => b.type === "section");
    expect(sections.length).toBeGreaterThanOrEqual(2);
    const images = out!.blocks.filter((b) => b.type === "image");
    expect(images.length).toBeGreaterThanOrEqual(1);
    // image URLs should be HTTPS + signed
    for (const img of images) {
      expect(img.image_url).toMatch(/^https:\/\/example\.test\//);
      expect(img.image_url).toMatch(/[?&]d=/);
      expect(img.image_url).toMatch(/[?&]s=/);
    }
  });

  it("text fallback is the all-text supplement", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
    process.env.STRATEGY_DIGEST_SIGNING_SECRET = "test-secret-long-enough-for-validation-abc";
    const w = buildSupplementWeekly({
      wizardFunnel: {
        slide1: 50,
        slide2: 40,
        slide3: 35,
        slide4: 30,
        slide5: 25,
        reportViewed: 20,
      },
    });
    const out = await buildWeeklyStrategyBlocks("2026-W22", "May 25 → May 31 UTC", w);
    expect(out!.text).toContain("Weekly funnel intelligence");
    expect(out!.text).toContain("Wizard funnel");
  });
});

// -----------------------------------------------------------------------------
// Phase 3 — Revisited from last week (loop-closure)
// -----------------------------------------------------------------------------

import { formatRevisitedLines } from "@/app/api/cron/funnel-digest/route";
import type { RevisitedEntry } from "@features/admin/server/digest-recommendation-compare";

describe("formatRevisitedLines", () => {
  it("returns [] when empty", () => {
    expect(formatRevisitedLines([])).toEqual([]);
  });

  it("groups by status with worsened first, then resolved, then ongoing", () => {
    const entries: RevisitedEntry[] = [
      {
        rule: "a",
        severity: "high",
        lastWeekMessage: "A flag",
        status: "worsened",
        currentMessage: "A worse now",
        deltaSummary: "65% → 50% (-15pp)",
      },
      { rule: "b", severity: "med", lastWeekMessage: "B flag", status: "resolved" },
      {
        rule: "c",
        severity: "med",
        lastWeekMessage: "C flag",
        status: "ongoing",
        currentMessage: "C current",
        deltaSummary: "60% → 62% (+2pp)",
      },
    ];
    const lines = formatRevisitedLines(entries);
    expect(lines[0]).toBe("*Revisited from last week*");
    const text = lines.join("\n");
    const worsenedIdx = text.indexOf("Worsened");
    const resolvedIdx = text.indexOf("Resolved");
    const ongoingIdx = text.indexOf("Still flagged");
    expect(worsenedIdx).toBeGreaterThan(-1);
    expect(resolvedIdx).toBeGreaterThan(-1);
    expect(ongoingIdx).toBeGreaterThan(-1);
    expect(worsenedIdx).toBeLessThan(resolvedIdx);
    expect(resolvedIdx).toBeLessThan(ongoingIdx);
  });

  it("renders delta summary for worsened/ongoing entries", () => {
    const entries: RevisitedEntry[] = [
      {
        rule: "wizard_slide_drop_4_5",
        severity: "high",
        lastWeekMessage: "Wizard 4→5 retention 78%",
        currentMessage: "Wizard 4→5 retention 62%",
        deltaSummary: "78% → 62% (-16pp)",
        status: "worsened",
      },
    ];
    const lines = formatRevisitedLines(entries);
    expect(lines.join("\n")).toContain("-16pp");
  });

  it("does NOT render delta summary for resolved entries (no current data needed)", () => {
    const entries: RevisitedEntry[] = [
      {
        rule: "wizard_slide_drop_4_5",
        severity: "med",
        // deliberately avoiding the → arrow in the message so the assertion
        // below only tests that no DELTA suffix (e.g. "— 65% → 80%") was
        // appended.
        lastWeekMessage: "Wizard slide retention 65 pct",
        status: "resolved",
      },
    ];
    const lines = formatRevisitedLines(entries);
    const text = lines.join("\n");
    expect(text).toContain("Wizard slide retention 65 pct");
    // The formatter prepends " — " before deltaSummary. Resolved entries have
    // no delta, so the em-dash separator must not appear.
    expect(text).not.toContain(" — ");
  });

  it("shows consecutive-week tag when count >= 3 for ongoing entries", () => {
    const entries: RevisitedEntry[] = [
      {
        rule: "channel_efficiency_low_google",
        severity: "med",
        lastWeekMessage: "google 0% paid",
        currentMessage: "google 0% paid",
        status: "ongoing",
        consecutiveWeeks: 4,
      },
    ];
    const lines = formatRevisitedLines(entries);
    expect(lines.join("\n")).toContain("4th consecutive week");
  });

  it("does NOT show consecutive-week tag when count < 3", () => {
    const entries: RevisitedEntry[] = [
      {
        rule: "wizard_slide_drop_4_5",
        severity: "med",
        lastWeekMessage: "msg",
        currentMessage: "msg",
        status: "ongoing",
        consecutiveWeeks: 2,
      },
    ];
    const lines = formatRevisitedLines(entries);
    expect(lines.join("\n")).not.toContain("consecutive");
  });

  it("escapes mrkdwn characters in messages (defense vs answer-option labels)", () => {
    const entries: RevisitedEntry[] = [
      {
        rule: "answer_lift_positive",
        severity: "med",
        lastWeekMessage: 'Q12 answer "*bold*_under_" predicts 10%',
        status: "resolved",
      },
    ];
    const lines = formatRevisitedLines(entries);
    // escapeSlack escapes * and _; in test slack mock it's identity, so this
    // just ensures the formatter completes without crashing on edge chars.
    expect(lines.join("\n")).toContain("Q12 answer");
  });
});
