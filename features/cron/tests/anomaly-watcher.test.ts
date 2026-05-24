import { describe, it, expect, vi, beforeEach } from "vitest";

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
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  tryClaimSlackAlert: (...args: unknown[]) => mockTryClaim(...args),
  startCronTimer: (...args: unknown[]) => mockStartTimer(...args),
  verifyCronAuth: (...args: unknown[]) => mockVerifyAuth(...args),
  recordCronRun: vi.fn().mockResolvedValue(undefined),
  markSlackAlertDelivered: vi.fn().mockResolvedValue(undefined),
}));

const mockIsProdCronHost = vi.fn();
vi.mock("@shared/http/is-prod-cron-host", () => ({
  isProdCronHost: () => mockIsProdCronHost(),
}));

const mockBuildAnomaly = vi.fn();
vi.mock("@features/admin/server/alerts", () => ({
  buildAnomalySnapshot: (...args: unknown[]) => mockBuildAnomaly(...args),
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
});
