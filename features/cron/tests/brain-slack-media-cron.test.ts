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
vi.mock("@features/brain/server/ingest/slack-media", () => ({
  describeSlackMedia: () => mockRun(),
  MEDIA_JOB_SEC: 1200,
}));

import { GET } from "@/app/api/cron/brain-slack-media/route";

const call = (auth = "Bearer s") =>
  GET(
    new Request("https://loveiq.org/api/cron/brain-slack-media", {
      headers: { authorization: auth },
    })
  );

const result = (over: Record<string, unknown> = {}) => ({
  waiting: 3,
  described: 2,
  skipped: 0,
  failed: 1,
  limited: false,
  error: null,
  ...over,
});

describe("GET /api/cron/brain-slack-media", () => {
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
    expect((await call()).status).toBe(503);
    expect(mockRun).not.toHaveBeenCalled();
    expect(mockRecordCronRun).not.toHaveBeenCalled();
  });

  it("records a run with counts, a file it could not describe included, as success", async () => {
    mockRun.mockResolvedValue(result());
    const res = await call();
    expect(res.status).toBe(200);
    expect(mockRecordCronRun).toHaveBeenCalledWith(
      "brain-slack-media",
      expect.any(Number),
      "success",
      "waiting=3 described=2 skipped=0 failed=1"
    );
  });

  it("fails the run when something stopped it, so the workflow alerts", async () => {
    mockRun.mockResolvedValue(
      result({ described: 0, failed: 1, limited: true, error: "You've hit your limit" })
    );
    const res = await call();
    expect(res.status).toBe(502);
    expect(mockRecordCronRun.mock.calls[0]!.slice(2)).toEqual([
      "error",
      "waiting=3 described=0 skipped=0 failed=1 stopped=rate_limited error=You've hit your limit",
    ]);
  });

  it("fails the run when the stored descriptions cannot be read", async () => {
    mockRun.mockRejectedValue(new Error("brain-ingest slack-media: could not read the list"));
    expect((await call()).status).toBe(500);
    expect(mockRecordCronRun.mock.calls[0]![2]).toBe("error");
  });

  it("measures slowness against the job's own ceiling, not the Vercel one", async () => {
    mockRun.mockResolvedValue(result());
    await call();
    expect(mockTimer).toHaveBeenCalledWith("brain-slack-media", 1200);
  });

  it("is started by the workflow with the Slack token, which only this job is given", () => {
    const workflow = readFileSync(".github/workflows/brain-daily.yml", "utf8");
    expect(workflow).toContain(
      "brain-slack-media) npx tsx scripts/brain-cron.ts brain-slack-media"
    );
    expect(workflow).toContain(
      "SLACK_BRAIN_BOT_TOKEN: ${{ inputs.job == 'brain-slack-media' && secrets.SLACK_BRAIN_BOT_TOKEN || '' }}"
    );
    expect(workflow).toContain(
      '[ "$JOB" = "brain-slack-media" ] && need="$need SLACK_BRAIN_BOT_TOKEN"'
    );
    // Frames need ffmpeg, which the runner image lacks.
    expect(workflow).toMatch(
      /if: inputs\.job == 'brain-slack-media'\n\s+run: sudo apt-get update -q && sudo apt-get install -y -q --no-install-recommends ffmpeg/
    );
  });
});
