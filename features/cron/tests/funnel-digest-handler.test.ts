/**
 * End-to-end integration test for the Phase-3 funnel-digest cron handler.
 *
 * Mocks every external boundary (Slack, dedup table, env probes, cron auth,
 * metric + chart fetchers) so the test exercises the full GET-handler path:
 *  - single daily_digest message (chart rail + Revenue/Alerts footer)
 *  - Monday weekly_digest recap
 *  - image blocks point at the new /api/admin/digest-image/<kind> URLs
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DailyMetrics,
  WeeklyMetrics,
  FunnelCvrSnapshot,
  BucketPerfSnapshot,
  DropoutFunnelSnapshot,
  NurturePerfSnapshot,
} from "@features/admin/server/digest-metrics";

const mockNotifySlack = vi.fn();
const mockTryClaimSlackAlert = vi.fn();
const mockMarkSlackAlertDelivered = vi.fn();
const mockVerifyCronAuth = vi.fn();
const mockIsProdCronHost = vi.fn();
const mockFetchDailyMetrics = vi.fn();
const mockFetchWeeklyMetrics = vi.fn();
const mockFetchCvr = vi.fn();
const mockFetchBucket = vi.fn();
const mockFetchDropout = vi.fn();
const mockFetchNurture = vi.fn();

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

vi.mock("@features/admin/server/digest-metrics", async () => {
  const actual = await vi.importActual<typeof import("@features/admin/server/digest-metrics")>(
    "@features/admin/server/digest-metrics"
  );
  return {
    ...actual,
    fetchDailyMetrics: (...args: unknown[]) => mockFetchDailyMetrics(...args),
    fetchWeeklyMetrics: (...args: unknown[]) => mockFetchWeeklyMetrics(...args),
    fetchFunnelCvrSparklines: (...args: unknown[]) => mockFetchCvr(...args),
    fetchBucketPerformance: (...args: unknown[]) => mockFetchBucket(...args),
    fetchDropoutFunnel: (...args: unknown[]) => mockFetchDropout(...args),
    fetchNurturePerformance: (...args: unknown[]) => mockFetchNurture(...args),
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
    dropoffEverywhere: { stages: [] },
    answerLift: null,
    engagementLift: null,
    leakSeverity: [],
    recommendations: [],
    revisited: [],
  };
}

const cvrSnap: FunnelCvrSnapshot = {
  days: Array.from({ length: 3 }, (_, i) => ({
    day: `2026-05-2${i + 5}`,
    visitors: 100,
    starts: 40,
    completions: 25,
    eng_1m: 15,
    eng_5m: 10,
    eng_10m: 5,
    paygate: 8,
    purchased: 2,
  })),
};
const bucketSnap: BucketPerfSnapshot = {
  days: [{ day: "2026-05-27", buckets: { a: { shown: 10, purchases: 2, revenue: 60 } } }],
};
const dropoutSnap: DropoutFunnelSnapshot = {
  questions: [
    { question_index: 0, q_id: "00000", sessions: 100 },
    { question_index: 1, q_id: "00001", sessions: 80 },
    { question_index: 2, q_id: "01002", sessions: 60 },
  ],
};
const nurtureSnap: NurturePerfSnapshot = {
  stages: [{ stage: "6h_no_view", sent: 50, purchased: 3 }],
};

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
  mockFetchDailyMetrics.mockResolvedValue(baseDaily);
  mockFetchWeeklyMetrics.mockResolvedValue(buildWeekly());
  mockFetchCvr.mockResolvedValue(cvrSnap);
  mockFetchBucket.mockResolvedValue(bucketSnap);
  mockFetchDropout.mockResolvedValue(dropoutSnap);
  mockFetchNurture.mockResolvedValue(nurtureSnap);
});

function newRequest() {
  return new Request("https://example.test/api/cron/funnel-digest", {
    headers: { Authorization: "Bearer test-cron-secret" },
  });
}

describe("funnel-digest cron handler — Phase 3 wiring", () => {
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

  it("daily path sends ONE daily_digest message with chart images + Revenue footer", async () => {
    vi.setSystemTime(new Date("2026-05-26T09:00:00Z")); // Tuesday → no weekly
    try {
      await GET(newRequest());
      expect(mockNotifySlack).toHaveBeenCalledOnce();
      const call = mockNotifySlack.mock.calls[0][0];
      expect(call.kind).toBe("daily_digest");
      expect(call.channel).toBe("ops");

      const imageBlocks = call.blocks.filter((b: { type: string }) => b.type === "image");
      expect(imageBlocks.length).toBeGreaterThanOrEqual(5);
      for (const img of imageBlocks) {
        expect(img.image_url).toMatch(
          /^https:\/\/example\.test\/api\/admin\/digest-image\/(cvr-visitor-start|cvr-start-completion|cvr-completion-engagement|cvr-completion-paygate|cvr-paygate-purchase|bucket-performance|dropout-funnel|reactivation-email)\?d=[^&]+&s=/
        );
      }
      // Revenue footer section present.
      const hasRevenue = call.blocks.some(
        (b: { type: string; text?: { text?: string } }) =>
          b.type === "section" && (b.text?.text ?? "").includes("*Revenue*")
      );
      expect(hasRevenue).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("monday path sends TWO messages: daily_digest + weekly_digest", async () => {
    vi.setSystemTime(new Date("2026-05-25T09:00:00Z")); // Monday
    try {
      await GET(newRequest());
      expect(mockNotifySlack).toHaveBeenCalledTimes(2);
      const kinds = mockNotifySlack.mock.calls.map((c) => c[0].kind);
      expect(kinds).toEqual(["daily_digest", "weekly_digest"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits the cvr-paygate-purchase chart even though paygate→purchase is low", async () => {
    vi.setSystemTime(new Date("2026-05-26T09:00:00Z"));
    try {
      await GET(newRequest());
      const call = mockNotifySlack.mock.calls[0][0];
      const urls = call.blocks
        .filter((b: { type: string }) => b.type === "image")
        .map((b: { image_url: string }) => b.image_url);
      expect(urls.some((u: string) => u.includes("/cvr-paygate-purchase"))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still sends (revenue footer only) when every chart snapshot is null", async () => {
    vi.setSystemTime(new Date("2026-05-26T09:00:00Z"));
    try {
      mockFetchCvr.mockResolvedValue(null);
      mockFetchBucket.mockResolvedValue(null);
      mockFetchDropout.mockResolvedValue(null);
      mockFetchNurture.mockResolvedValue(null);
      await GET(newRequest());
      expect(mockNotifySlack).toHaveBeenCalledOnce();
      const call = mockNotifySlack.mock.calls[0][0];
      const imageBlocks = call.blocks.filter((b: { type: string }) => b.type === "image");
      expect(imageBlocks.length).toBe(0);
      // Revenue footer still present.
      const hasRevenue = call.blocks.some(
        (b: { type: string; text?: { text?: string } }) =>
          b.type === "section" && (b.text?.text ?? "").includes("*Revenue*")
      );
      expect(hasRevenue).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
