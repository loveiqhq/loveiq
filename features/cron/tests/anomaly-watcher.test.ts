import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { addDays } from "@features/admin/server/ap/days";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockNotifySlack = vi.fn();
vi.mock("@shared/observability/slack", () => ({
  notifySlack: (...args: unknown[]) => mockNotifySlack(...args),
  escapeSlack: (s: string) => s,
}));

const mockTryClaim = vi.fn();
const mockStartTimer = vi.fn(() => async () => undefined);
const mockVerifyAuth = vi.fn();
const mockMarkDelivered = vi.fn();
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  tryClaimSlackAlert: (...args: unknown[]) => mockTryClaim(...args),
  startCronTimer: (...args: unknown[]) => mockStartTimer(...args),
  verifyCronAuth: (...args: unknown[]) => mockVerifyAuth(...args),
  recordCronRun: vi.fn().mockResolvedValue(undefined),
  markSlackAlertDelivered: (...args: unknown[]) => mockMarkDelivered(...args),
}));

const mockRecordNotice = vi.fn();
vi.mock("@features/brain/server/notice", () => ({
  recordNotice: (...args: unknown[]) => mockRecordNotice(...args),
}));

/** The visit log read is the one outside call; judging the days stays real. */
const mockReadChatgpt = vi.fn();
vi.mock("@features/cron/server/chatgpt-gap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/cron/server/chatgpt-gap")>()),
  readChatgptVisits: (...args: unknown[]) => mockReadChatgpt(...args),
}));

/** `perDay` ChatGPT visits on every day from `from` to `to`: 2 a day is 14 a week. */
function steady(from: string, to: string, perDay = 2): Map<string, number> {
  const counts = new Map<string, number>();
  for (let day = from; day <= to; day = addDays(day, 1)) counts.set(day, perDay);
  return counts;
}

const mockIsProdCronHost = vi.fn();
vi.mock("@shared/http/is-prod-cron-host", () => ({
  isProdCronHost: () => mockIsProdCronHost(),
}));

const mockBuildAnomaly = vi.fn();
vi.mock("@features/admin/server/alerts", () => ({
  buildAnomalySnapshot: (...args: unknown[]) => mockBuildAnomaly(...args),
}));

const mockNoticeJumps = vi.fn();
vi.mock("@features/brain/server/jumps", () => ({
  noticeJumps: (...args: unknown[]) => mockNoticeJumps(...args),
}));

import { GET } from "@/app/api/cron/anomaly-watcher/route";

function makeReq() {
  return new Request("http://localhost/api/cron/anomaly-watcher", {
    headers: { Authorization: "Bearer test-secret" },
  });
}

function snapshotWith(items: Array<{ severity: string; targetKey: string }>) {
  return {
    generatedAt: "now",
    days: 7,
    summary: { total: items.length, risk: 0, watch: 0, matchedRules: 0 },
    items: items.map((i, idx) => ({
      id: String(idx),
      title: `item-${idx}`,
      category: "guardrail",
      severity: i.severity,
      targetKey: i.targetKey,
      value: 1,
      detail: "detail",
      href: "/admin",
      ownerEmail: null,
      matchedRules: [],
    })),
    activeRules: [],
  };
}

describe("GET /api/cron/anomaly-watcher", () => {
  beforeEach(() => {
    mockNotifySlack.mockReset();
    mockTryClaim.mockReset();
    mockBuildAnomaly.mockReset();
    mockVerifyAuth.mockReset().mockReturnValue(true);
    mockIsProdCronHost.mockReset().mockReturnValue(true);
    mockNoticeJumps.mockReset().mockResolvedValue(0);
    mockMarkDelivered.mockReset().mockResolvedValue(undefined);
    mockRecordNotice.mockReset().mockResolvedValue(true);
    mockReadChatgpt
      .mockReset()
      .mockImplementation(async (from: string, to: string) => steady(from, to));
  });

  it("returns 401 when cron auth fails", async () => {
    mockVerifyAuth.mockReturnValue(false);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(mockBuildAnomaly).not.toHaveBeenCalled();
  });

  it("skips on non-prod host without firing any Slack", async () => {
    mockIsProdCronHost.mockReturnValue(false);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(mockNotifySlack).not.toHaveBeenCalled();
    expect(mockBuildAnomaly).not.toHaveBeenCalled();
  });

  it("fires Slack for each unclaimed risk-severity item", async () => {
    mockBuildAnomaly.mockResolvedValue(
      snapshotWith([
        { severity: "risk", targetKey: "rev" },
        { severity: "risk", targetKey: "starts" },
        { severity: "watch", targetKey: "latency" }, // ignored
      ])
    );
    mockTryClaim.mockResolvedValue(true);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.fired).toBe(2);
    expect(body.suppressed).toBe(0);
    expect(mockNotifySlack).toHaveBeenCalledTimes(2);
  });

  it("suppresses re-fires already claimed for the day", async () => {
    mockBuildAnomaly.mockResolvedValue(snapshotWith([{ severity: "risk", targetKey: "rev" }]));
    mockTryClaim.mockResolvedValue(false);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.fired).toBe(0);
    expect(body.suppressed).toBe(1);
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("does not fire for watch-severity items", async () => {
    mockBuildAnomaly.mockResolvedValue(
      snapshotWith([
        { severity: "watch", targetKey: "a" },
        { severity: "good", targetKey: "b" },
      ])
    );
    mockTryClaim.mockResolvedValue(true);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.fired).toBe(0);
    expect(body.riskItems).toBe(0);
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("returns 500 when buildAnomalySnapshot throws", async () => {
    mockBuildAnomaly.mockRejectedValue(new Error("supabase down"));
    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("caps per-run firings to avoid a Slack storm and reports deferred count", async () => {
    const manyRisks = Array.from({ length: 15 }, (_, i) => ({
      severity: "risk" as const,
      targetKey: `target-${i}`,
    }));
    mockBuildAnomaly.mockResolvedValue(snapshotWith(manyRisks));
    mockTryClaim.mockResolvedValue(true);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.fired).toBe(10); // MAX_FIRINGS_PER_RUN
    expect(body.deferred).toBe(5);
    expect(body.riskItems).toBe(15);
    expect(mockNotifySlack).toHaveBeenCalledTimes(10);
  });

  it("scans for unusual numbers and reports how many it wrote up, without posting to Slack", async () => {
    mockBuildAnomaly.mockResolvedValue(snapshotWith([]));
    mockNoticeJumps.mockResolvedValue(2);
    const body = await (await GET(makeReq())).json();
    expect(mockNoticeJumps).toHaveBeenCalledTimes(1);
    expect(mockNoticeJumps.mock.calls[0]![0]).toBeInstanceOf(Date);
    expect(body.jumps).toBe(2);
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("does not fail its real job when the number scan throws", async () => {
    mockBuildAnomaly.mockResolvedValue(snapshotWith([]));
    mockNoticeJumps.mockRejectedValue(new Error("rollup down"));
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect((await res.json()).jumps).toBe(0);
  });

  describe("the ChatGPT gap check", () => {
    /** 14 visits a week up to 21 Nov, then none on 22, 23 and 24 Nov: 3 quiet days is enough. */
    const quietSince22Nov = async (from: string) => steady(from, "2026-11-21");
    const RUN = ["chatgpt_gap", "quiet_run", "2026-11-22:alert"] as const;

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-25T08:40:00Z")); // 09:40 in Berlin
      mockBuildAnomaly.mockResolvedValue(snapshotWith([]));
    });
    afterEach(() => vi.useRealTimers());

    it("posts once to #prod-alerts when the quiet days are enough, and leaves Jarvis a notice", async () => {
      mockReadChatgpt.mockImplementation(quietSince22Nov);
      mockTryClaim.mockResolvedValue(true);
      const body = await (await GET(makeReq())).json();

      expect(mockTryClaim).toHaveBeenCalledWith(...RUN);
      expect(mockNotifySlack).toHaveBeenCalledTimes(1);
      const post = mockNotifySlack.mock.calls[0]![0];
      expect(post).toMatchObject({ channel: "ops", kind: "chatgpt_gap", username: "ops_alerts" });
      expect(post.text).toContain("22 to 24 Nov");
      expect(mockRecordNotice).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "anomaly-watcher",
          headline: expect.stringContaining("22 to 24 Nov"),
        })
      );
      expect(mockMarkDelivered).toHaveBeenCalledWith(...RUN);
      expect(body.chatgpt).toMatchObject({
        day: "2026-11-24",
        streak: 3,
        action: "alert",
        key: "2026-11-22:alert",
      });
    });

    it("claims before it posts and marks delivered only after, so a crash mid-post is retried", async () => {
      mockReadChatgpt.mockImplementation(quietSince22Nov);
      mockTryClaim.mockResolvedValue(true);
      await GET(makeReq());
      const claimed =
        mockTryClaim.mock.invocationCallOrder[
          mockTryClaim.mock.calls.findIndex((c) => c[0] === "chatgpt_gap")
        ]!;
      const posted = mockNotifySlack.mock.invocationCallOrder[0]!;
      const marked =
        mockMarkDelivered.mock.invocationCallOrder[
          mockMarkDelivered.mock.calls.findIndex((c) => c[0] === "chatgpt_gap")
        ]!;
      expect(claimed).toBeLessThan(posted);
      expect(posted).toBeLessThan(marked);
    });

    it("reads the 90 days up to yesterday in Berlin", async () => {
      await GET(makeReq());
      expect(mockReadChatgpt).toHaveBeenCalledWith("2026-08-27", "2026-11-24");
    });

    it("says nothing when the quiet run's post is already claimed", async () => {
      mockReadChatgpt.mockImplementation(quietSince22Nov);
      mockTryClaim.mockResolvedValue(false);
      await GET(makeReq());
      expect(mockNotifySlack).not.toHaveBeenCalled();
      expect(mockMarkDelivered).not.toHaveBeenCalledWith(...RUN);
    });

    it("claims nothing on an ordinary day", async () => {
      const body = await (await GET(makeReq())).json();
      expect(mockTryClaim).not.toHaveBeenCalledWith(
        "chatgpt_gap",
        expect.anything(),
        expect.anything()
      );
      expect(mockNotifySlack).not.toHaveBeenCalled();
      expect(body.chatgpt).toMatchObject({ streak: 0, action: null });
    });

    it("does not judge before 07:00 in Berlin", async () => {
      vi.setSystemTime(new Date("2026-11-25T05:30:00Z")); // 06:30 in Berlin (winter time)
      mockReadChatgpt.mockImplementation(quietSince22Nov);
      const body = await (await GET(makeReq())).json();
      expect(mockReadChatgpt).not.toHaveBeenCalled();
      expect(body.chatgpt).toBeNull();
    });

    it("keeps 07:00 Berlin in summer time too", async () => {
      vi.setSystemTime(new Date("2026-07-15T04:30:00Z")); // 06:30 in Berlin (summer time)
      expect((await (await GET(makeReq())).json()).chatgpt).toBeNull();
      vi.setSystemTime(new Date("2026-07-15T05:30:00Z")); // 07:30 in Berlin
      await GET(makeReq());
      expect(mockReadChatgpt).toHaveBeenCalledWith("2026-04-16", "2026-07-14");
    });

    it("does not fail its real job when the visit log can't be read", async () => {
      mockReadChatgpt.mockRejectedValue(new Error("supabase down"));
      const res = await GET(makeReq());
      expect(res.status).toBe(200);
      expect((await res.json()).chatgpt).toBeNull();
    });
  });
});
