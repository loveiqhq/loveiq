/**
 * The backfill's exit status is what the hourly brain-embed job alerts on: a run that
 * made progress and stopped at its budget must exit 0 (the next hour carries on), and a
 * pass that embeds nothing must not.
 */
import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

type Pass = { embedded: number; remaining: number; complete: boolean };
let now = 0;
let passes: Pass[] = [];
const embedMissing = vi.fn(async (): Promise<Pass> => {
  now += 10 * 60_000; // every pass takes ten minutes
  return passes.shift() ?? { embedded: 5, remaining: 100, complete: false };
});
vi.mock("@features/brain/server/embed", () => ({ embedMissing: () => embedMissing() }));

const log = vi.spyOn(console, "log").mockImplementation(() => {});
const err = vi.spyOn(console, "error").mockImplementation(() => {});

/** Runs the script once, to its last line of output. */
async function run() {
  vi.resetModules();
  await import("@/scripts/brain-embed-backfill");
  await vi.waitFor(() => {
    const last = [...log.mock.calls, ...err.mock.calls].map((c) => String(c[0]));
    expect(last.some((l) => /stopped|done|gave up|no progress/.test(l))).toBe(true);
  });
}

beforeEach(() => {
  now = 0;
  passes = [];
  vi.spyOn(Date, "now").mockImplementation(() => now);
  process.exitCode = undefined;
});
afterEach(() => {
  delete process.env.BACKFILL_BUDGET_MIN;
  embedMissing.mockClear();
  log.mockClear();
  err.mockClear();
  process.exitCode = undefined;
});

describe("brain-embed-backfill", () => {
  it("stops between passes at its budget with exit 0, having made progress", async () => {
    process.env.BACKFILL_BUDGET_MIN = "25";
    await run();
    // Passes start at 0, 10 and 20 minutes; the fourth would start past 25.
    expect(embedMissing).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledWith(
      "  stopped at the 25-minute budget with 100 left; the next run carries on"
    );
    expect(process.exitCode).toBeUndefined();
  });

  it("fails a pass that embeds nothing, budget or not", async () => {
    process.env.BACKFILL_BUDGET_MIN = "100";
    passes = [{ embedded: 0, remaining: 40, complete: false }];
    await run();
    expect(process.exitCode).toBe(1);
  });

  it("with no budget, keeps going until the backlog is done", async () => {
    passes = [
      { embedded: 5, remaining: 10, complete: false },
      { embedded: 5, remaining: 5, complete: false },
      { embedded: 5, remaining: 0, complete: true },
    ];
    await run();
    expect(embedMissing).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledWith("  done — every chunk has an embedding");
    expect(process.exitCode).toBeUndefined();
  });

  it("is given a budget the job's timeout leaves room for", () => {
    // A run GitHub stops at its timeout is cut off mid-pass and may never reach the alert
    // step, so the budget plus one nine-minute pass has to fit inside it.
    const job = (
      parse(readFileSync(".github/workflows/brain-embed.yml", "utf8")) as {
        jobs: {
          embed: {
            "timeout-minutes": number;
            steps: Array<{ name?: string; env?: Record<string, string> }>;
          };
        };
      }
    ).jobs.embed;
    const budget = Number(job.steps.find((s) => s.name === "Embed")?.env?.BACKFILL_BUDGET_MIN);
    expect(budget).toBeGreaterThan(0);
    expect(budget + 10).toBeLessThan(job["timeout-minutes"]);
  });
});
