import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A MINING RUN THAT READ NOTHING MUST NOT REPORT SUCCESS.
 *
 * `skipped` on its own is not a failure: stopping on the per-minute quota after
 * mining five meetings is this cron working exactly as designed, and alerting on that
 * would fire every night on a healthy drain. Stopping having read ZERO documents is
 * the other thing entirely, and from the outside the two looked identical — `status`
 * only became "error" on a thrown exception.
 *
 * Measured 2026-09-20: two consecutive days of `stopped early: error:HTTP 503`, runs
 * of 1.5s and 2.1s that mined nothing, both recorded as success. Errors mirror to the
 * ops channel and successes do not, so the miner had been dead since 2026-09-18 and
 * the only way to find out was to read `cron_run.error_message` by hand.
 */

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import logger from "@shared/observability/logger";

let result: { scanned: number; written: number; dropped: number; skipped: string | null } = {
  scanned: 5,
  written: 2,
  dropped: 1,
  skipped: null,
};
let throws = false;
vi.mock("@features/brain/server/ingest/mine-decisions", async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>;
  return {
    ...real,
    mineDecisions: vi.fn(async () => {
      if (throws) throw new Error("miner exploded");
      return result;
    }),
  };
});

vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => true }));

const recorded: Array<{ status: string; error?: string }> = [];
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  verifyCronAuth: () => true,
  startCronTimer: () => async () => {},
  recordCronRun: async (_n: string, _s: number, status: string, error?: string) => {
    recorded.push({ status, error });
  },
  tryClaimSlackAlert: async () => true,
  markSlackAlertDelivered: async () => {},
}));

vi.mock("@shared/observability/slack", () => ({ notifySlack: async () => {} }));

import { GET } from "@/app/api/cron/brain-mine/route";

const run = () => GET(new Request("https://www.loveiq.org/api/cron/brain-mine"));

beforeEach(() => {
  recorded.length = 0;
  vi.mocked(logger.error).mockClear();
  throws = false;
  result = { scanned: 5, written: 2, dropped: 1, skipped: null };
});

describe("brain-mine run status", () => {
  it("reports success for an ordinary run", async () => {
    await run();
    expect(recorded[0]?.status).toBe("success");
  });

  it("still reports success when it stopped early HAVING MADE PROGRESS", async () => {
    // The per-minute quota on a healthy drain. Alerting here every night is what
    // trains people to ignore the channel.
    result = { scanned: 5, written: 2, dropped: 0, skipped: "rate_limited:per-minute" };
    await run();
    expect(recorded[0]?.status).toBe("success");
  });

  it("reports an ERROR when it stopped early having read nothing", async () => {
    result = { scanned: 0, written: 0, dropped: 0, skipped: "error:HTTP 503" };
    await run();
    expect(recorded[0]?.status).toBe("error");
    expect(recorded[0]?.error).toContain("HTTP 503");
  });

  it("says it mined nothing, rather than only naming the cause", async () => {
    result = { scanned: 0, written: 0, dropped: 0, skipped: "rate_limited:daily" };
    await run();
    expect(recorded[0]?.error).toMatch(/mined nothing/i);
  });

  it("does not invent an error for a clean run that simply found no decisions", async () => {
    // Reading ten meetings and finding nothing worth recording is a real outcome.
    result = { scanned: 10, written: 0, dropped: 10, skipped: null };
    await run();
    expect(recorded[0]?.status).toBe("success");
  });

  /**
   * RECORDING IT IS NOT REPORTING IT.
   *
   * `recordCronRun` writes a row and nothing else. The mirror to Slack is in the
   * logger, on level 50 — so the first version of this fix marked the run an error and
   * still told nobody, which is the whole defect it was written to close.
   */
  it("SAYS SO, rather than only writing a row nobody reads", async () => {
    result = { scanned: 0, written: 0, dropped: 0, skipped: "error:HTTP 503" };
    await run();
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
    const msg = vi.mocked(logger.error).mock.calls.at(-1)?.[1];
    // Must start with "brain" or `isBrainMessage` routes it to ops, not the brain channel.
    expect(String(msg)).toMatch(/^brain/);
  });

  it("stays quiet on a healthy drain, so the channel keeps being read", async () => {
    result = { scanned: 5, written: 2, dropped: 0, skipped: "rate_limited:per-minute" };
    await run();
    expect(vi.mocked(logger.error)).not.toHaveBeenCalled();
  });

  it("still reports a thrown error as an error", async () => {
    throws = true;
    await run();
    expect(recorded[0]?.status).toBe("error");
  });
});
