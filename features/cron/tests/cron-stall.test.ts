import { describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...a: unknown[]) => mockFetch(...a),
}));

import {
  CRON_MAX_AGE_MS,
  describeStall,
  findStalledCrons,
  GITHUB_WORKFLOW,
  UNWATCHED_CRONS,
} from "@features/cron/server/cron-stall";
import { brainDailySchedules } from "./brain-daily-schedule";

const NOW = Date.parse("2026-08-29T12:00:00Z");

/**
 * Every cron something schedules: vercel.json's, plus the brain jobs GitHub Actions runs
 * because they need the `claude` binary. Those still write cron_run rows, so they are
 * watched exactly like the rest.
 */
async function scheduledCrons(): Promise<string[]> {
  const fs = await import("node:fs");
  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8")) as {
    crons?: Array<{ path: string }>;
  };
  return [
    ...(vercel.crons ?? []).map((c) => c.path.replace("/api/cron/", "")),
    ...Object.keys(brainDailySchedules()),
    ...githubRecordedCrons(fs).map(([cron]) => cron),
  ];
}

/**
 * GitHub Actions jobs that record their scheduled runs with scripts/record-cron-run.mjs.
 * One counts only if its workflow both has a schedule AND records under that exact name,
 * so a watched name cannot quietly stop being written.
 */
function githubRecordedCrons(fs: typeof import("node:fs")): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  for (const file of fs.readdirSync(".github/workflows")) {
    const yml = fs.readFileSync(`.github/workflows/${file}`, "utf8");
    if (!/^\s*schedule:/m.test(yml)) continue;
    for (const m of yml.matchAll(/record-cron-run\.mjs ([a-z0-9-]+)/g)) found.push([m[1], file]);
  }
  return found;
}
const ok = (started_at: string | null) =>
  ({
    ok: true,
    status: 200,
    json: async () => (started_at ? [{ started_at }] : []),
  }) as unknown as Response;

describe("findStalledCrons", () => {
  it("flags a cron whose newest run is older than its limit", async () => {
    // brain-fast runs every 15 minutes; 4 hours of silence is a real stall.
    mockFetch.mockImplementation((url: string) =>
      Promise.resolve(
        ok(url.includes("brain-fast") ? "2026-08-29T08:00:00Z" : "2026-08-29T11:55:00Z")
      )
    );
    const stalled = await findStalledCrons(NOW);
    expect(stalled.map((s) => s.cron)).toContain("brain-fast");
  });

  it("does not flag a cron that ran within its limit", async () => {
    mockFetch.mockResolvedValue(ok("2026-08-29T11:59:00Z"));
    expect(await findStalledCrons(NOW)).toEqual([]);
  });

  it("reports a never-run cron, but says it may simply be newly deployed", async () => {
    // This is the exact case that produced a false alarm during the audit:
    // brain-ingest had zero runs because it had only just reached production.
    // Reporting it is right; asserting it is broken is not.
    mockFetch.mockResolvedValue(ok(null));
    const stalled = await findStalledCrons(NOW);
    expect(stalled.length).toBe(Object.keys(CRON_MAX_AGE_MS).length);
    expect(describeStall(stalled[0])).toMatch(/NEVER recorded a run/);
    expect(describeStall(stalled[0])).toMatch(/expected and will clear/);
  });

  it("tells the reader to start a GitHub job by hand, and names its workflow", () => {
    // GitHub starts this repo's schedules hours late and drops some, so a quiet GitHub
    // job is usually the scheduler, and "not firing" alone sends the reader to debug it.
    const stall = {
      cron: "ux-review-verify",
      lastRunAt: "2026-08-29T05:00:00Z",
      ageMs: 7 * 3_600_000,
      maxAgeMs: 6 * 3_600_000,
    };
    expect(describeStall(stall)).toMatch(/\(ux-review-verify\.yml\).*start it by hand/);
    expect(describeStall({ ...stall, lastRunAt: null, ageMs: null })).toMatch(/start it by hand/);
    expect(describeStall({ ...stall, cron: "brain-fast" })).not.toMatch(/GitHub/);
  });

  it("says NOTHING when the database is unreachable", async () => {
    // Reporting an outage as "every cron is dead" would be a worse lie than silence,
    // and would fire an alert per cron every hour during any Supabase blip.
    mockFetch.mockResolvedValue({ ok: false, status: 503, json: async () => [] } as Response);
    expect(await findStalledCrons(NOW)).toEqual([]);
  });
});

describe("the watch list must not drift from what is scheduled", () => {
  /**
   * A cron added to vercel.json but not here is unwatched, which is precisely the
   * blind spot this module exists to close — and it would be invisible, because an
   * unwatched cron looks identical to a healthy one.
   */
  it("every scheduled cron is either watched or explicitly unwatched", async () => {
    const scheduled = await scheduledCrons();
    expect(scheduled.length).toBeGreaterThan(0);
    for (const cron of scheduled) {
      expect(
        cron in CRON_MAX_AGE_MS || UNWATCHED_CRONS.has(cron),
        `cron "${cron}" is scheduled but neither watched nor explicitly unwatched`
      ).toBe(true);
    }
  });

  it("names the workflow of every job GitHub starts, and of nothing else", async () => {
    const fs = await import("node:fs");
    expect(GITHUB_WORKFLOW).toEqual(
      Object.fromEntries([
        ...Object.keys(brainDailySchedules()).map((cron) => [cron, "brain-daily.yml"]),
        ...githubRecordedCrons(fs),
      ])
    );
  });

  it("does not watch a cron that is not scheduled at all", async () => {
    const scheduled = new Set(await scheduledCrons());
    for (const cron of Object.keys(CRON_MAX_AGE_MS)) {
      expect(scheduled.has(cron), `"${cron}" is watched but no longer scheduled`).toBe(true);
    }
  });
});

describe("the watchdog must not be able to break the cron it rides on", () => {
  /**
   * The first wiring put `findStalledCrons()` inline in anomaly-watcher's try
   * block, so an unmocked/failing Supabase call made the whole route return 500 and
   * skip its real anomaly alerts. A monitoring add-on that can take down the thing
   * it was bolted onto is worse than no monitoring.
   */
  it("anomaly-watcher still reports its anomaly results when the stall check throws", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("app/api/cron/anomaly-watcher/route.ts", "utf8")
    );
    // The call must sit inside its own try/catch, not the route's main one.
    expect(src).toMatch(/try \{\s*stalled = await alertOnStalledCrons\(dayKey\);\s*\} catch/);
    expect(src).toMatch(/cron stall check failed/);
  });
});
