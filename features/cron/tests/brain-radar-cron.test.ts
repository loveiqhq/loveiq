import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const mockRecordCronRun = vi.fn();
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  verifyCronAuth: (req: Request) => req.headers.get("authorization") === "Bearer s",
  recordCronRun: (...a: unknown[]) => mockRecordCronRun(...a),
}));
const mockProdHost = vi.fn(() => true);
vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => mockProdHost() }));
const mockConfigured = vi.fn(() => true);
vi.mock("@features/brain/server/llm", () => ({
  complete: vi.fn(),
  isLlmConfigured: () => mockConfigured(),
}));
const mockNotice = vi.fn();
vi.mock("@features/brain/server/notice", () => ({
  recordNotice: (...a: unknown[]) => mockNotice(...a),
}));
const mockRun = vi.fn();
vi.mock("@features/brain/server/radar", () => ({ runRadar: (...a: unknown[]) => mockRun(...a) }));

import { GET } from "@/app/api/cron/brain-radar/route";

const call = (auth = "Bearer s") =>
  GET(new Request("https://loveiq.org/api/cron/brain-radar", { headers: { authorization: auth } }));

const result = (over: Record<string, unknown> = {}) => ({
  ok: true,
  decisions: 200,
  topics: 14,
  checked: ["tooling"],
  unchanged: 13,
  candidates: 10,
  found: [],
  failed: [],
  outOfTime: [],
  autoSettled: 0,
  marked: 0,
  ...over,
});
const finding = {
  earlier: "decision:2026-05-15-jira",
  later: "decision:2026-09-03-notion",
  topic: "tooling",
  kind: "unclear",
  why: "Two tools named for tracking work.",
  earlierTitle: "Require Jira tickets",
  laterTitle: "Shift from Notion to tickets",
};

describe("GET /api/cron/brain-radar", () => {
  beforeEach(() => {
    mockRecordCronRun.mockReset();
    mockNotice.mockReset().mockResolvedValue(true);
    mockRun.mockReset().mockResolvedValue(result());
    mockProdHost.mockReturnValue(true);
    mockConfigured.mockReturnValue(true);
  });

  it("refuses without the bearer, off production, and without a model", async () => {
    expect((await call("Bearer nope")).status).toBe(401);
    mockProdHost.mockReturnValue(false);
    expect(await (await call()).json()).toMatchObject({ skipped: true });
    mockProdHost.mockReturnValue(true);
    mockConfigured.mockReturnValue(false);
    expect((await call()).status).toBe(503);
    expect(mockRun).not.toHaveBeenCalled();
    expect(mockRecordCronRun).not.toHaveBeenCalled();
  });

  it("records a quiet run as a success and writes no notice", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(mockNotice).not.toHaveBeenCalled();
    expect(mockRecordCronRun).toHaveBeenCalledWith(
      "brain-radar",
      expect.any(Number),
      "success",
      "decisions=200 topics=14 checked=1 unchanged=13 candidates=10 found=0 auto_settled=0 marked=0"
    );
  });

  it("writes one notice naming each new pair and how to settle it", async () => {
    mockRun.mockResolvedValue(result({ found: [finding] }));
    await call();
    expect(mockNotice).toHaveBeenCalledWith(
      expect.objectContaining({
        headline: "1 recorded decision pair may not both stand",
        kind: "brain-radar",
        detail: expect.stringContaining(
          '- tooling: "Require Jira tickets" (decision/2026-05-15-jira) and "Shift from Notion to tickets" (decision/2026-09-03-notion). Two tools named for tracking work.'
        ),
      })
    );
    expect(mockNotice.mock.calls[0]![0].detail).toContain("settle_decision_conflict");
  });

  it("fails the run when the radar could not work, and says what failed", async () => {
    mockRun.mockResolvedValue(
      result({
        ok: false,
        checked: [],
        failed: [{ topic: "tooling", reason: "rate_limited" }],
        outOfTime: ["x"],
      })
    );
    expect((await call()).status).toBe(502);
    expect(mockRecordCronRun).toHaveBeenCalledWith(
      "brain-radar",
      expect.any(Number),
      "error",
      expect.stringContaining("failed=tooling:rate_limited left_for_tomorrow=1")
    );
    mockRun.mockRejectedValue(new Error("boom"));
    expect((await call()).status).toBe(500);
    expect(mockRecordCronRun).toHaveBeenLastCalledWith(
      "brain-radar",
      expect.any(Number),
      "error",
      "boom"
    );
  });
});
