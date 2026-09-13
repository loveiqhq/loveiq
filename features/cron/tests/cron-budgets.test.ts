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
