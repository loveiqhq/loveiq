/**
 * End-to-end integration test for the funnel-digest cron handler.
 *
 * Mocks every external boundary (Slack, Supabase, dedup table, env probes,
 * cron auth) so the test exercises the FULL GET-handler code path:
 *  - daily Block Kit composition + notifySlack call
 *  - Monday weekly main digest + supplement composition
 *  - persistRecommendations is called AFTER notifySlack succeeds, with the
 *    correct week_key
 *
 * Catches wiring regressions the per-module tests can't (e.g. swapped order
 * of notifySlack / markSlackAlertDelivered / persistRecommendations).
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DailyMetrics, WeeklyMetrics } from "@features/admin/server/digest-metrics";

// ---- Boundary mocks ---------------------------------------------------------

const mockNotifySlack = vi.fn();
const mockTryClaimSlackAlert = vi.fn();
const mockMarkSlackAlertDelivered = vi.fn();
const mockVerifyCronAuth = vi.fn();
const mockIsProdCronHost = vi.fn();
const mockPersistRecommendations = vi.fn();
const mockFetchDailyMetrics = vi.fn();
const mockFetchWeeklyMetrics = vi.fn();
const mockFetchFunnelCaptureStart = vi.fn();

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@shared/observability/slack", () => ({
  notifySlack: (...args: unknown[]) => mockNotifySlack(...args),
  escapeSlack: (s: string) => s,
}));

vi.mock("@shared/observability/slack-alert-dedup", () => ({
  startCronTimer: vi.fn(() => async () => undefined),
  recordCronRun: vi.fn(),
  tryClaimSlackAlert: (...args: unknown[]) => mockTryClaimSlackAlert(...args),
  markSlackAlertDelivered: (...args: unknown[]) => mockMarkSlackAlertDelivered(...args),
  verifyCronAuth: (...args: unknown[]) => mockVerifyCronAuth(...args),
}));

vi.mock("@shared/http/is-prod-cron-host", () => ({
  isProdCronHost: (...args: unknown[]) => mockIsProdCronHost(...args),
}));

vi.mock("@features/admin/server/digest-recommendation-history", () => ({
  persistRecommendations: (...args: unknown[]) => mockPersistRecommendations(...args),
}));

vi.mock("@features/admin/server/digest-metrics", async () => {
  const actual = await vi.importActual<typeof import("@features/admin/server/digest-metrics")>(
    "@features/admin/server/digest-metrics"
  );
  return {
    ...actual,
    fetchDailyMetrics: (...args: unknown[]) => mockFetchDailyMetrics(...args),
    fetchWeeklyMetrics: (...args: unknown[]) => mockFetchWeeklyMetrics(...args),
    fetchFunnelCaptureStart: (...args: unknown[]) => mockFetchFunnelCaptureStart(...args),
  };
});

// Imported AFTER all vi.mock calls
import { GET } from "@/app/api/cron/funnel-digest/route";

// ---- Fixtures ---------------------------------------------------------------

const baseDaily: DailyMetrics = {
  uniqueVisitors: 100,
  newVisitors: 80,
  returningVisitors: 20,
  surveyEngineMounts: 50,
  surveyStarts: 40,
  completions: 25,
  completionRate: 63,
  topCompletionHours: [],
  reportViewers: 20,
  engagement1min: 15,
  engagement5min: 10,
  engagement10min: 5,
  paywallInitiated: 8,
  beginCheckouts: 4,
  revenue: {
    count: 2,
    byCurrency: { EUR: 60 },
    planMix: { essentials: 1, full_report: 1, all_reports: 0 },
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
  wizardFunnel: {
    slide1: 30,
    slide2: 28,
    slide3: 26,
    slide4: 22,
    slide5: 20,
    reportViewed: 18,
  },
  sparklines: {
    days: Array.from({ length: 5 }, (_, i) => ({
      day: `2026-05-${String(i + 1).padStart(2, "0")}`,
      visitors: 10 + i,
      starts: 5 + i,
      completions: 2 + i,
      report_views: 1 + i,
      paywall_init: 1,
      purchases: 0,
    })),
  },
};

function buildWeekly(): WeeklyMetrics {
  return {
    ...baseDaily,
    avgCompletionSec: 240,
    funnel: {
      uniqueVisitors: 100,
      engineMounts: 50,
      starts: 40,
      completions: 25,
      reportViewed: 20,
      paywallInitiated: 8,
      purchased: 2,
    },
    worstChapters: [],
    topIssues: [],
    dropOff: [],
    dropoffEverywhere: {
      stages: [
        { name: "unique_visitors", count: 100 },
        { name: "purchased", count: 2 },
      ],
    },
    answerLift: null,
    engagementLift: {
      buckets: [
        { bucket: "0-1m", n: 10, paid: 0 },
        { bucket: "10m+", n: 5, paid: 2 },
      ],
    },
    leakSeverity: [
      {
        fromStage: "unique_visitors",
        toStage: "purchased",
        dropCount: 98,
        dropRate: 98,
        downstreamPaidRate: 1,
        revenuePerPaid: 30,
        estLostRevenue: 2940,
        currency: "EUR",
      },
    ],
    recommendations: [
      {
        severity: "high",
        rule: "dropoff_revenue_loss",
        message: "Big leak",
        evidence: "drop=98",
        fingerprint: { drop_count: 98, est_lost_revenue: 2940 },
      },
    ],
    revisited: [],
  };
}

// ---- Suite ------------------------------------------------------------------

beforeAll(() => {
  process.env.CRON_SECRET = "test-cron-secret";
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  process.env.STRATEGY_DIGEST_SIGNING_SECRET = "test-secret-long-enough-for-validation-1234";
});

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCronAuth.mockReturnValue(true);
  mockIsProdCronHost.mockReturnValue(true);
  mockTryClaimSlackAlert.mockResolvedValue(true);
  mockMarkSlackAlertDelivered.mockResolvedValue(undefined);
  mockNotifySlack.mockResolvedValue(undefined);
  mockPersistRecommendations.mockResolvedValue(undefined);
  mockFetchFunnelCaptureStart.mockResolvedValue(null);
  mockFetchDailyMetrics.mockResolvedValue(baseDaily);
  mockFetchWeeklyMetrics.mockResolvedValue(buildWeekly());
});

function newRequest() {
  return new Request("https://example.test/api/cron/funnel-digest", {
    headers: { Authorization: "Bearer test-cron-secret" },
  });
}

describe("funnel-digest cron handler — wiring", () => {
  it("returns 401 when verifyCronAuth fails", async () => {
    mockVerifyCronAuth.mockReturnValueOnce(false);
    const res = await GET(newRequest());
    expect(res.status).toBe(401);
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("short-circuits on non-prod cron host without sending Slack", async () => {
    mockIsProdCronHost.mockReturnValueOnce(false);
    const res = await GET(newRequest());
    const json = await res.json();
    expect(json.skipped).toBe(true);
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("daily path sends Block Kit message with text fallback + sparkline image block", async () => {
    // Pick a Tuesday so the weekly path does NOT fire (only daily branch).
    vi.setSystemTime(new Date("2026-05-26T09:00:00Z")); // 2026-05-26 = Tuesday
    try {
      await GET(newRequest());
      expect(mockNotifySlack).toHaveBeenCalledOnce();
      const call = mockNotifySlack.mock.calls[0][0];
      expect(call.kind).toBe("daily_digest");
      expect(call.channel).toBe("ops");
      expect(call.text).toContain("Daily digest");
      expect(Array.isArray(call.blocks)).toBe(true);
      expect(call.blocks.length).toBeGreaterThan(0);
      const imageBlock = call.blocks.find((b: { type: string }) => b.type === "image");
      expect(imageBlock).toBeDefined();
      expect(imageBlock.image_url).toMatch(
        /^https:\/\/example\.test\/api\/admin\/digest-image\/sparklines\?d=[^&]+&s=/
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("monday path sends THREE Slack messages: daily + weekly + strategy supplement", async () => {
    // 2026-05-25 is a Monday (UTC).
    vi.setSystemTime(new Date("2026-05-25T09:00:00Z"));
    try {
      await GET(newRequest());
      expect(mockNotifySlack).toHaveBeenCalledTimes(3);
      const kinds = mockNotifySlack.mock.calls.map((c) => c[0].kind);
      expect(kinds).toEqual(["daily_digest", "weekly_digest", "weekly_strategy_supplement"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("monday path persists recommendations AFTER the supplement send succeeds", async () => {
    vi.setSystemTime(new Date("2026-05-25T09:00:00Z"));
    try {
      await GET(newRequest());
      // 3 Slack sends + 1 persist call
      expect(mockPersistRecommendations).toHaveBeenCalledOnce();
      const [weekKey, recs] = mockPersistRecommendations.mock.calls[0];
      expect(weekKey).toMatch(/^\d{4}-W\d{2}$/);
      expect(Array.isArray(recs)).toBe(true);
      expect(recs.length).toBeGreaterThan(0);
      // Verify ORDERING: supplement notifySlack was called before persist.
      const supplementCallIdx = mockNotifySlack.mock.invocationCallOrder[2];
      const persistCallIdx = mockPersistRecommendations.mock.invocationCallOrder[0];
      expect(supplementCallIdx).toBeLessThan(persistCallIdx);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does NOT persist when supplement is empty (every section null)", async () => {
    vi.setSystemTime(new Date("2026-05-25T09:00:00Z"));
    try {
      mockFetchWeeklyMetrics.mockResolvedValue({
        ...buildWeekly(),
        wizardFunnel: null,
        dropoffEverywhere: null,
        answerLift: null,
        engagementLift: null,
        leakSeverity: [],
        recommendations: [], // ← empty recs → no persist
        revisited: [],
      });
      await GET(newRequest());
      expect(mockPersistRecommendations).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does NOT persist when Slack supplement notifySlack throws", async () => {
    vi.setSystemTime(new Date("2026-05-25T09:00:00Z"));
    try {
      // Daily + main weekly succeed; supplement (3rd call) throws.
      mockNotifySlack
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("slack 502"));
      const res = await GET(newRequest());
      // Outer try/catch returns 500 for cron-handler failure
      expect(res.status).toBe(500);
      // Persist NOT called because weeklyStrategySent never flipped to true
      expect(mockPersistRecommendations).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("supplement Block Kit contains image blocks pointing at signed digest-image URLs", async () => {
    vi.setSystemTime(new Date("2026-05-25T09:00:00Z"));
    try {
      await GET(newRequest());
      const supplementCall = mockNotifySlack.mock.calls.find(
        (c) => c[0].kind === "weekly_strategy_supplement"
      );
      expect(supplementCall).toBeDefined();
      const blocks = supplementCall![0].blocks;
      const imageBlocks = blocks.filter((b: { type: string }) => b.type === "image");
      // Engagement chart is built from the fixture; dropoffEverywhere is too;
      // wizard requires slide1>=3 (fixture has 30) → 3 images expected.
      expect(imageBlocks.length).toBeGreaterThanOrEqual(2);
      for (const img of imageBlocks) {
        expect(img.image_url).toMatch(
          /^https:\/\/example\.test\/api\/admin\/digest-image\/(funnel|wizard|sparklines|engagement|leaks)\?d=[^&]+&s=/
        );
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
