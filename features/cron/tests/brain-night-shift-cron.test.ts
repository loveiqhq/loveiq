import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const mockRecordCronRun = vi.fn();
const mockTimer = vi.fn();
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  verifyCronAuth: (req: Request) => req.headers.get("authorization") === "Bearer s",
  startCronTimer: (...a: unknown[]) => {
    mockTimer(...a);
    return async () => undefined;
  },
  recordCronRun: (...a: unknown[]) => mockRecordCronRun(...a),
}));
const mockProdHost = vi.fn(() => true);
vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => mockProdHost() }));
const mockRun = vi.fn();
vi.mock("@features/brain/server/night-shift", () => ({
  runNightShift: () => mockRun(),
  NIGHT_BUDGET_SEC: 3600,
}));

import { GET } from "@/app/api/cron/brain-night-shift/route";

const call = (auth = "Bearer s") =>
  GET(
    new Request("https://loveiq.org/api/cron/brain-night-shift", {
      headers: { authorization: auth },
    })
  );

describe("GET /api/cron/brain-night-shift", () => {
  beforeEach(() => {
    mockRecordCronRun.mockReset();
    mockRun.mockReset();
    mockProdHost.mockReturnValue(true);
    process.env.BRAIN_LLM_CLI = "claude";
  });

  it("refuses without the cron bearer, off production, and without the claude binary", async () => {
    expect((await call("Bearer nope")).status).toBe(401);
    mockProdHost.mockReturnValue(false);
    expect(await (await call()).json()).toMatchObject({ skipped: true });
    mockProdHost.mockReturnValue(true);
    delete process.env.BRAIN_LLM_CLI;
    const res = await call();
    expect(res.status).toBe(503);
    expect(mockRun).not.toHaveBeenCalled();
    expect(mockRecordCronRun).not.toHaveBeenCalled();
  });

  it("records what it did as success, including a question it could not answer from sources", async () => {
    mockRun.mockResolvedValue({ queued: 2, answered: 1, failed: 1, limited: false, error: null });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, answered: 1 });
    expect(mockRecordCronRun).toHaveBeenCalledWith(
      "brain-night-shift",
      expect.any(Number),
      "success",
      "queued=2 answered=1 failed=1"
    );
  });

  it("records nothing-to-do as a run, so a missing night is visible", async () => {
    mockRun.mockResolvedValue({ queued: 0, answered: 0, failed: 0, limited: false, error: null });
    await call();
    expect(mockRecordCronRun).toHaveBeenCalledWith(
      "brain-night-shift",
      expect.any(Number),
      "success",
      "queued=0 answered=0 failed=0"
    );
  });

  it("fails the run when the agent failed or a usage limit stopped it, so the workflow alerts", async () => {
    mockRun.mockResolvedValue({
      queued: 3,
      answered: 0,
      failed: 0,
      limited: true,
      error: "You've hit your session limit",
    });
    const res = await call();
    expect(res.status).toBe(502);
    expect(mockRecordCronRun.mock.calls[0]![2]).toBe("error");
    expect(mockRecordCronRun.mock.calls[0]![3]).toBe(
      "queued=3 answered=0 failed=0 stopped=rate_limited error=You've hit your session limit"
    );
  });

  /** Reviewed 2026-09-25: a 300s budget posted "investigate slowness" on every real night. */
  it("measures slowness against the night's real budget, not the Vercel ceiling", async () => {
    mockRun.mockResolvedValue({ queued: 1, answered: 1, failed: 0, limited: false, error: null });
    await call();
    expect(mockTimer).toHaveBeenCalledWith("brain-night-shift", 3600);
  });

  it("is reported to the brain channel when the job is cancelled or times out, not only when it fails", () => {
    const workflow = readFileSync(".github/workflows/brain-daily.yml", "utf8");
    expect(workflow).toMatch(
      /name: Tell the brain channel the job failed\n(?:\s+#.*\n)*\s+if: failure\(\) \|\| cancelled\(\)/
    );
  });

  it("fails the run when the queue cannot be read", async () => {
    mockRun.mockRejectedValue(new Error("research queue unreadable: 503"));
    expect((await call()).status).toBe(500);
    expect(mockRecordCronRun.mock.calls[0]!.slice(2)).toEqual([
      "error",
      "research queue unreadable: 503",
    ]);
  });
});
