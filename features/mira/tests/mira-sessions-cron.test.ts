import { beforeEach, describe, expect, it, vi } from "vitest";

const prod = vi.hoisted(() => ({ host: true }));
vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => prod.host }));
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  recordCronRun: vi.fn(),
  startCronTimer: () => async () => undefined,
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/mira/server/session-emails", () => ({ runSessionReminders: vi.fn() }));

import { GET, maxDuration } from "@/app/api/cron/mira-session-reminders/route";
import { runSessionReminders } from "@features/mira/server/session-emails";
import { recordCronRun } from "@shared/observability/slack-alert-dedup";

/** The weekly sessions' reminder cron (every 15 minutes): the gate, the run and its record. */

const call = (auth?: string) =>
  GET(
    new Request("http://localhost/api/cron/mira-session-reminders", {
      headers: auth ? { authorization: auth } : {},
    })
  );
const ok = { candidates: 2, due: 1, sent: 1, skipped: {}, errors: 0, stoppedEarly: false };

beforeEach(() => {
  vi.clearAllMocks();
  prod.host = true;
  process.env.CRON_SECRET = "cron-secret";
  vi.mocked(runSessionReminders).mockResolvedValue(ok);
});

describe("GET /api/cron/mira-session-reminders", () => {
  it("runs only with the cron's bearer token", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await call("Bearer cron-secret")).status).toBe(503);
    expect(runSessionReminders).not.toHaveBeenCalled();
  });

  it("sends nothing from staging or a preview: only the production host emails", async () => {
    prod.host = false;
    const res = await call("Bearer cron-secret");
    expect(await res.json()).toEqual({ skipped: true, reason: "non-prod-cron-host" });
    expect(runSessionReminders).not.toHaveBeenCalled();
  });

  it("runs with a time budget that leaves the tail room under its ceiling, and records it", async () => {
    const res = await call("Bearer cron-secret");
    expect(await res.json()).toEqual({ ok: true, ...ok });
    const [, opts] = vi.mocked(runSessionReminders).mock.calls[0]!;
    expect(opts?.outOfTime?.()).toBe(false);
    expect(maxDuration).toBe(60);
    expect(recordCronRun).toHaveBeenCalledWith(
      "mira-session-reminders",
      expect.any(Number),
      "success",
      undefined
    );
  });

  it("records people left out or a failed send as an error", async () => {
    vi.mocked(runSessionReminders).mockResolvedValueOnce({ ...ok, sent: 0, errors: 1 });
    await call("Bearer cron-secret");
    expect(recordCronRun).toHaveBeenCalledWith(
      "mira-session-reminders",
      expect.any(Number),
      "error",
      expect.stringContaining("1 failed")
    );
    vi.mocked(runSessionReminders).mockRejectedValueOnce(new Error("db down"));
    expect((await call("Bearer cron-secret")).status).toBe(500);
    expect(vi.mocked(recordCronRun).mock.calls.at(-1)?.[2]).toBe("error");
  });
});
