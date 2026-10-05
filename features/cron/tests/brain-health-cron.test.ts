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
vi.mock("@/app/api/mcp/route", () => ({ RELEVANCE_FLOOR: 1.85 }));
const mockNotice = vi.fn();
vi.mock("@features/brain/server/notice", () => ({
  recordNotice: (...a: unknown[]) => mockNotice(...a),
}));
const mockReport = vi.fn();
const mockRender = vi.fn();
vi.mock("@features/brain/server/self-report", () => ({
  selfReport: (...a: unknown[]) => mockReport(...a),
  renderSelfReport: (...a: unknown[]) => mockRender(...a),
}));

import { GET } from "@/app/api/cron/brain-health/route";

const call = (auth = "Bearer s") =>
  GET(
    new Request("https://loveiq.org/api/cron/brain-health", { headers: { authorization: auth } })
  );

const stats = { calls: 1471, searches: 289, weak: 41, empty: 0, failures: 0 };

describe("GET /api/cron/brain-health", () => {
  beforeEach(() => {
    mockRecordCronRun.mockReset();
    mockNotice.mockReset().mockResolvedValue(true);
    mockReport.mockReset().mockResolvedValue({ until: "2026-09-28", now: stats });
    mockRender.mockReset().mockReturnValue("the report");
    mockProdHost.mockReturnValue(true);
  });

  it("refuses without the cron bearer, and does nothing off production", async () => {
    expect((await call("Bearer nope")).status).toBe(401);
    mockProdHost.mockReturnValue(false);
    expect(await (await call()).json()).toMatchObject({ skipped: true });
    expect(mockReport).not.toHaveBeenCalled();
    expect(mockRecordCronRun).not.toHaveBeenCalled();
  });

  it("writes the week as one notice, without the questions' text, and records the run", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(mockReport).toHaveBeenCalledWith(7, 1.85, expect.any(Number));
    expect(mockRender).toHaveBeenCalledWith(expect.anything(), 1.85, {
      withQuestions: false,
      nowMs: expect.any(Number),
    });
    expect(mockNotice).toHaveBeenCalledWith(
      expect.objectContaining({
        // The same headline all day: a re-run replaces the notice instead of adding one.
        headline: "How the brain did in the week to 2026-09-28",
        detail: "the report",
        kind: "brain-health",
      })
    );
    expect(mockRecordCronRun).toHaveBeenCalledWith(
      "brain-health",
      expect.any(Number),
      "success",
      "calls=1471 searches=289 weak=41 empty=0 failures=0"
    );
  });

  it("writes nothing and fails the run when the usage log could not be read", async () => {
    mockReport.mockResolvedValue({ until: "2026-09-28", now: null });
    const res = await call();
    expect(res.status).toBe(502);
    expect(mockNotice).not.toHaveBeenCalled();
    expect(mockRecordCronRun).toHaveBeenCalledWith(
      "brain-health",
      expect.any(Number),
      "error",
      "the usage log could not be read, so no report was written"
    );
  });

  it("fails the run when the notice could not be written, or the report threw", async () => {
    mockNotice.mockResolvedValue(false);
    expect((await call()).status).toBe(502);
    expect(mockRecordCronRun).toHaveBeenLastCalledWith(
      "brain-health",
      expect.any(Number),
      "error",
      "the notice could not be written"
    );
    mockReport.mockRejectedValue(new Error("boom"));
    expect((await call()).status).toBe(500);
    expect(mockRecordCronRun).toHaveBeenLastCalledWith(
      "brain-health",
      expect.any(Number),
      "error",
      "boom"
    );
  });
});
