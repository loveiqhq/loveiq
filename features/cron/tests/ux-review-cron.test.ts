import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockNotifySlack = vi.fn();
vi.mock("@shared/observability/slack", () => ({
  notifySlack: (...args: unknown[]) => mockNotifySlack(...args),
  escapeSlack: (s: string) => s,
}));

const mockTryClaim = vi.fn();
const mockMarkDelivered = vi.fn();
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  tryClaimSlackAlert: (...args: unknown[]) => mockTryClaim(...args),
  markSlackAlertDelivered: (...args: unknown[]) => mockMarkDelivered(...args),
  startCronTimer: () => async () => undefined,
  verifyCronAuth: () => true,
  recordCronRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => true }));
vi.mock("@shared/flags/system-flags", () => ({ isFeatureEnabled: async () => true }));

const mockRecordNotice = vi.fn();
vi.mock("@features/brain/server/notice", () => ({
  recordNotice: (...args: unknown[]) => mockRecordNotice(...args),
}));

const mockFetchFindings = vi.fn();
const mockFetchDailyStats = vi.fn();
const mockContradiction = vi.fn();
const mockFetchSessionEvents = vi.fn();
vi.mock("@features/ux-review/server/review", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@features/ux-review/server/review")>();
  return {
    ...actual,
    fetchFindings: (...a: unknown[]) => mockFetchFindings(...a),
    fetchDailyStats: (...a: unknown[]) => mockFetchDailyStats(...a),
    contradiction: (...a: unknown[]) => mockContradiction(...a),
    fetchSessionEvents: (...a: unknown[]) => mockFetchSessionEvents(...a),
  };
});

import { GET } from "@/app/api/cron/ux-review/route";

const req = () =>
  new Request("http://localhost/api/cron/ux-review", {
    headers: { Authorization: "Bearer test-secret" },
  });

const finding = (over: Record<string, unknown> = {}) => ({
  observationId: "obs-1",
  sessionId: "01a09e04-dfaa-7a3e-9622-0d7ca5285017",
  scannerId: "scanner-1",
  scannerName: "LoveIQ report UX",
  scannerVersion: 2,
  confidence: 0.9,
  reasoning: "something changed on screen",
  ...over,
});

describe("ux-review cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // After DIGEST_HOUR_UTC (07:00), so the digest path is eligible.
    vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
    mockTryClaim.mockResolvedValue(true);
    mockMarkDelivered.mockResolvedValue(undefined);
    mockFetchFindings.mockResolvedValue([]);
    mockFetchDailyStats.mockResolvedValue([{ scanner: "LoveIQ report UX", observed: 8, yes: 2 }]);
    mockContradiction.mockReturnValue(null);
    mockFetchSessionEvents.mockResolvedValue(new Set(["report_viewed"]));
  });

  afterEach(() => vi.useRealTimers());

  it("never posts an individual finding to Slack", async () => {
    // The whole reason the route changed: on 2026-09-14 the five findings it
    // posted were each wrong about the mechanism. Only the digest may post.
    mockFetchFindings.mockResolvedValue([finding()]);
    await GET(req());

    const kinds = mockNotifySlack.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    expect(kinds).not.toContain("ux_review");
    expect(kinds).toContain("ux_review_digest");
  });

  it("records a finding to the notice table and finalises its claim", async () => {
    mockFetchFindings.mockResolvedValue([finding()]);
    const res = await GET(req());

    expect(mockRecordNotice).toHaveBeenCalledTimes(1);
    expect(mockMarkDelivered).toHaveBeenCalledWith("ux_review", "observation", "obs-1");
    expect(await res.json()).toMatchObject({ ok: true, collected: 1, contradicted: 0 });
  });

  it("finalises the claim on the refuted path too, so it is not re-queried", async () => {
    // A claim taken and never marked goes stale in ten minutes and is handed
    // back, so a 90-minute lookback re-refuted the same finding three times.
    mockFetchFindings.mockResolvedValue([finding()]);
    mockContradiction.mockReturnValue("the session has no unlock_click");

    const res = await GET(req());

    expect(mockRecordNotice).not.toHaveBeenCalled();
    expect(mockMarkDelivered).toHaveBeenCalledWith("ux_review", "observation", "obs-1");
    expect(await res.json()).toMatchObject({ contradicted: 1, collected: 0 });
  });

  it("does not post the digest before the digest hour", async () => {
    vi.setSystemTime(new Date("2026-09-14T03:00:00Z"));
    await GET(req());
    const kinds = mockNotifySlack.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    expect(kinds).not.toContain("ux_review_digest");
  });

  it("posts the digest once a day, keyed by UTC date", async () => {
    await GET(req());
    expect(mockTryClaim).toHaveBeenCalledWith("ux_review_digest", "daily", "2026-09-14");
    expect(mockMarkDelivered).toHaveBeenCalledWith("ux_review_digest", "daily", "2026-09-14");
  });

  it("stays silent when the digest claim is already taken", async () => {
    mockTryClaim.mockResolvedValue(false);
    await GET(req());
    const kinds = mockNotifySlack.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    expect(kinds).not.toContain("ux_review_digest");
  });
});
