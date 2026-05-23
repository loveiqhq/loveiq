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
const mockVerifyAuth = vi.fn();
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  startCronTimer: vi.fn(() => async () => undefined),
  tryClaimSlackAlert: (...args: unknown[]) => mockTryClaim(...args),
  verifyCronAuth: (...args: unknown[]) => mockVerifyAuth(...args),
  recordCronRun: vi.fn().mockResolvedValue(undefined),
}));

const mockIsProdCronHost = vi.fn();
vi.mock("@shared/http/is-prod-cron-host", () => ({
  isProdCronHost: () => mockIsProdCronHost(),
}));

const mockFetchTech = vi.fn();
vi.mock("@features/admin/server/digest-tech", () => ({
  fetchTechMetrics: (...args: unknown[]) => mockFetchTech(...args),
}));

import { GET } from "@/app/api/cron/tech-digest/route";

function makeReq() {
  return new Request("http://localhost/api/cron/tech-digest", {
    headers: { Authorization: "Bearer secret" },
  });
}

const emptyMetrics = {
  health: null,
  stuck: null,
  webhooks: null,
  cronHealth: null,
  security: null,
};

describe("GET /api/cron/tech-digest", () => {
  beforeEach(() => {
    mockNotifySlack.mockReset();
    mockTryClaim.mockReset().mockResolvedValue(true);
    mockVerifyAuth.mockReset().mockReturnValue(true);
    mockIsProdCronHost.mockReset().mockReturnValue(true);
    mockFetchTech.mockReset().mockResolvedValue(emptyMetrics);
  });

  it("returns 401 without cron auth", async () => {
    mockVerifyAuth.mockReturnValue(false);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(mockFetchTech).not.toHaveBeenCalled();
  });

  it("skips on non-prod cron host", async () => {
    mockIsProdCronHost.mockReturnValue(false);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("returns alreadyClaimed without firing Slack when day already taken", async () => {
    mockTryClaim.mockResolvedValue(false);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.alreadyClaimed).toBe(true);
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("fires Slack on the happy path", async () => {
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.sent).toBe(true);
    expect(mockNotifySlack).toHaveBeenCalledOnce();
    const payload = mockNotifySlack.mock.calls[0]![0];
    expect(payload.channel).toBe("ops");
    expect(payload.kind).toBe("tech_digest");
    expect(payload.text).toContain("Tech digest");
  });

  it("returns 500 when the fetcher throws", async () => {
    mockFetchTech.mockRejectedValue(new Error("boom"));
    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });
});
