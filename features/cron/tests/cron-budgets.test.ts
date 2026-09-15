import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A cron killed at its Vercel ceiling writes NO `cron_run` row.
 *
 * `recordCronRun` lives in the route's `finally`, and a FUNCTION_INVOCATION_TIMEOUT
 * does not run it — so a run that exceeded `maxDuration` counts as neither success
 * nor failure, it does not exist. Every dashboard and stall watcher reads the rows
 * that ARE there, which makes the worst runs the invisible ones. Observed live on
 * 2026-09-06: the 08:52 `brain-fast` run had visibly re-titled 187 chunks and left
 * no row at all.
 *
 * Two ways to walk into that, both of which this file makes loud:
 *
 *  1. `vercel.json` and the route's own `export const maxDuration` disagree. Vercel
 *     reads the json; humans read the export. Nothing else compares them.
 *  2. The in-route time budget is raised without raising the ceiling. The budget only
 *     bounds the FETCHING; the upsert, touch batches and sweep run after it and
 *     cannot be interrupted.
 */

const CRON_DIR = "app/api/cron";

/**
 * TWICE the measured worst uninterruptible tail (gmail mid-re-walk: 58.1s against a
 * 40s budget, so 18s of tail).
 *
 * This was one worst-tail, and requiring exactly the worst case observed is not a
 * margin — it passes the configuration that produces the incident. It did: with the
 * bar at 20s, brain-fast, brain-notion and brain-calendar all sat at exactly 20s and
 * the suite was green while brain-notion's worst completed run came within 883ms of
 * being killed.
 */
const WORST_TAIL_MS = 40_000;

const routes = readdirSync(CRON_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => ({ name: d.name, path: `${CRON_DIR}/${d.name}/route.ts` }))
  .map((r) => ({ ...r, src: readFileSync(r.path, "utf8") }));

const vercelFns = (
  JSON.parse(readFileSync("vercel.json", "utf8")) as {
    functions?: Record<string, { maxDuration?: number }>;
  }
).functions;

const declared = (src: string) => {
  const m = /export const maxDuration = (\d+)/.exec(src);
  return m ? Number(m[1]) : null;
};

const budget = (src: string) => {
  const m = /Date\.now\(\) - startedAtMs > ([\d_]+)/.exec(src);
  return m ? Number(m[1]!.replace(/_/g, "")) : null;
};

describe("cron time budgets must fit under the ceiling that kills them", () => {
  it("found the cron routes at all", () => {
    // Guards the guard: a renamed directory would silently empty every case below.
    expect(routes.length).toBeGreaterThan(10);
    expect(routes.some((r) => r.name === "brain-gmail")).toBe(true);
  });

  it.each(routes.filter((r) => declared(r.src) !== null).map((r) => [r.name, r] as const))(
    "%s declares the same maxDuration in vercel.json as in the route",
    (_name, r) => {
      const inRoute = declared(r.src);
      const inJson = vercelFns?.[r.path]?.maxDuration;
      // Only assert agreement when vercel.json mentions it; an unlisted route just
      // takes the platform default, which is a deliberate choice, not a mismatch.
      if (inJson === undefined) return;
      expect(inJson).toBe(inRoute);
    }
  );

  it.each(routes.filter((r) => budget(r.src) !== null).map((r) => [r.name, r] as const))(
    "%s leaves room after its walk budget for the tail that cannot be interrupted",
    (_name, r) => {
      const b = budget(r.src)!;
      const ceiling = (declared(r.src) ?? 300) * 1000;
      expect(b).toBeLessThan(ceiling);
      expect(ceiling - b).toBeGreaterThanOrEqual(WORST_TAIL_MS);
    }
  );
});

/**
 * AN ALERT KEY BELONGING TO A DIFFERENT CRON SUPPRESSES THIS ONE'S ALERTS.
 *
 * `alertOnce` claims `tryClaimSlackAlert(key, "day", today)`, so the key IS the
 * once-per-day lock. Found on 2026-09-07: `brain-drive` built its key as
 * `brain_gmail_failed:${name}` -- a copy-paste. Gmail runs at :11 and drive at :52,
 * so on any day both failed, gmail claimed the lock first and drive's failure alert
 * was swallowed for the rest of the day. Nothing was broken enough to notice; the
 * alert simply never arrived.
 *
 * Cheap to get wrong again -- these routes are near-identical and are written by
 * copying the last one -- and invisible when it happens, because a suppressed alert
 * and a healthy day look the same. So the key is asserted to name its own cron.
 */
describe("an alert dedup key must name the cron that owns it", () => {
  const keyed = routes
    .map((r) => ({ ...r, m: /const key = `([a-z0-9_]+):\$\{name\}`/.exec(r.src) }))
    .filter((r) => r.m !== null);

  it("finds the keys at all, so a rename cannot silently empty this suite", () => {
    // A regex that matches nothing passes every assertion below it.
    expect(keyed.length).toBeGreaterThanOrEqual(6);
  });

  it.each(keyed.map((r) => [r.name, r.m![1]!] as const))(
    "%s uses a key naming itself, not another cron (%s)",
    (name, key) => {
      expect(key).toContain(name.replace(/-/g, "_"));
    }
  );
});

/**
 * `brain-mine` must run AFTER the Gemini free-tier quota resets, not before it.
 *
 * The free tier allows 20 requests a day per model and resets at midnight PACIFIC —
 * `features/brain/server/llm.ts` says so in the comment above `isDailyQuota`. The cron
 * sat at `40 5 * * *` UTC, which is 22:40 Pacific: the last eighty minutes of a Pacific
 * day, by which point the allowance has had a full day to be spent. It is not spent by
 * the miner alone — `/api/slack/events` answers questions on demand out of the same
 * quota, so anyone talking to the brain in Slack draws it down before the miner wakes.
 *
 * Measured 2026-09-15: four consecutive runs ended `stopped early: rate_limited`, and the
 * only one carrying the retry-wait fix was the SHORTEST at 5.2 seconds — a run that gave
 * up immediately rather than waiting, which is the daily limit's signature and not the
 * per-minute one. 19 of 123 meeting documents had been mined.
 *
 * The invariant is not "08:10" but "after the reset in BOTH DST states", because the
 * Pacific offset moves and a slot that clears the reset in July can fall behind it in
 * December. Asserted here rather than in a comment nobody re-reads.
 */
describe("brain-mine runs on a fresh Gemini quota", () => {
  const crons = (
    JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons: Array<{ path: string; schedule: string }>;
    }
  ).crons;

  it("is scheduled after midnight Pacific in both summer and winter", () => {
    const mine = crons.find((c) => c.path === "/api/cron/brain-mine");
    expect(mine, "brain-mine must be scheduled at all").toBeDefined();

    const [minute, hour] = mine!.schedule.split(" ");
    expect(`${hour}:${minute}`).toMatch(/^\d+:\d+$/);

    // A July date is PDT (UTC-7); a December date is PST (UTC-8). Both must land on the
    // same Pacific DAY as the run, i.e. after 00:00 and before noon — a slot that lands
    // in the evening is the previous day's exhausted allowance.
    for (const [label, month] of [
      ["PDT", 6],
      ["PST", 11],
    ] as const) {
      const utc = new Date(Date.UTC(2026, month, 15, Number(hour), Number(minute)));
      // hourCycle h23, NOT hour12:false. With en-US the latter selects the h24
      // cycle, where midnight formats as "24" rather than "0" — and whether it
      // does depends on the ICU build: Node 24 answers "00", Node 20 answers
      // "24". This slot IS 00:10 Pacific, correct by intent, and the assertion
      // still failed on CI's Node 20 while passing on a Node 24 laptop.
      const pacificHour = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Los_Angeles",
          hour: "2-digit",
          hourCycle: "h23",
        }).format(utc)
      );
      expect(
        pacificHour,
        `${label}: ${hour}:${minute} UTC is ${pacificHour}:00 Pacific — the quota resets at 00:00 Pacific, so an evening slot runs on an allowance that has had all day to be spent`
      ).toBeLessThan(12);
    }
  });
});
