import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

/**
 * Watchdog for crons that stop firing.
 *
 * Every alert in the cron routes lives INSIDE the route body, which means the one
 * failure mode nobody hears about is the route never being entered: a cron that is
 * never invoked, 401s on `verifyCronAuth`, hits the non-prod gate, or is hard-killed
 * at `maxDuration` writes no `cron_run` row, sends no Slack message, and logs
 * nothing. Both early returns sit before the try/finally that calls `recordCronRun`.
 *
 * So this check has to run OUTSIDE the crons it watches. It is called from
 * `anomaly-watcher`, which is hourly and has fired thousands of times.
 *
 * The value is concrete: on 2026-08-28 the whole company brain looked healthy while
 * `brain-ingest` had zero runs. That turned out to be benign — it had only just
 * reached production — but nothing in the system could tell the difference between
 * "not deployed long enough" and "silently broken", which is exactly the gap here.
 */

/**
 * Maximum age of the newest run before a cron counts as stalled, per cron name.
 * Roughly 2-3x the schedule, so one missed tick is tolerated and two are not.
 * Kept explicit rather than parsed from vercel.json, which is not readable at
 * runtime — a test asserts this map and vercel.json's cron list stay in step.
 */
export const CRON_MAX_AGE_MS: Record<string, number> = {
  "survey-paused": 3 * 3_600_000,
  "nurture-sequence": 3 * 3_600_000,
  "invite-reminders": 26 * 3_600_000,
  "payment-fulfillment-sweep": 2 * 3_600_000,
  "security-storm-detector": 3_600_000,
  "anomaly-watcher": 3 * 3_600_000,
  "conversion-digest": 26 * 3_600_000,
  "brain-ingest": 26 * 3_600_000,
  // Every 15 minutes, so 45m of silence is two missed ticks.
  "brain-fast": 45 * 60_000,
  // Hourly.
  "brain-notion": 3 * 3_600_000,
};

/**
 * Crons deliberately not watched. `journey-backfill` runs once a year
 * (`0 4 1 1 *`), so "stale" is its normal state for 364 days.
 */
export const UNWATCHED_CRONS = new Set([
  "journey-backfill",
  "purge-old-data",
  // Retired 2026-08-29: the team stopped using chapter nudges, and its schedule has
  // been removed from vercel.json. Kept in this list so that if anyone re-adds the
  // schedule without deciding to bring the feature back, it does not start alerting
  // — and so the reason is written down rather than inferred from an absence.
  "chapter-nudge",
]);

export interface StalledCron {
  cron: string;
  lastRunAt: string | null;
  ageMs: number | null;
  maxAgeMs: number;
}

/** Newest run per cron. PostgREST has aggregates disabled, so this is one cheap
 *  indexed lookup per cron rather than a GROUP BY. */
async function newestRun(cron: string): Promise<string | null | undefined> {
  const res = await supabaseFetch(
    `/rest/v1/cron_run?cron_name=eq.${encodeURIComponent(cron)}&select=started_at` +
      `&order=started_at.desc&limit=1`
  );
  // undefined = could not tell. Distinct from null = genuinely never ran, because
  // reporting an unreachable database as "every cron is dead" would be worse than
  // saying nothing.
  if (!res.ok) return undefined;
  const rows = (await res.json().catch(() => [])) as Array<{ started_at?: string }>;
  return rows[0]?.started_at ?? null;
}

export async function findStalledCrons(nowMs: number = Date.now()): Promise<StalledCron[]> {
  const out: StalledCron[] = [];
  for (const [cron, maxAgeMs] of Object.entries(CRON_MAX_AGE_MS)) {
    const last = await newestRun(cron);
    if (last === undefined) {
      logger.warn({ cron }, "cron-stall: could not read cron_run, skipping this cron");
      continue;
    }
    if (last === null) {
      // Never ran. Cannot be distinguished from "deployed minutes ago" from here,
      // so the alert text says so rather than asserting a fault.
      out.push({ cron, lastRunAt: null, ageMs: null, maxAgeMs });
      continue;
    }
    const ageMs = nowMs - Date.parse(last);
    if (Number.isFinite(ageMs) && ageMs > maxAgeMs) {
      out.push({ cron, lastRunAt: last, ageMs, maxAgeMs });
    }
  }
  return out;
}

export function describeStall(s: StalledCron): string {
  const hours = (ms: number) => `${(ms / 3_600_000).toFixed(1)}h`;
  if (s.lastRunAt === null) {
    return (
      `*${s.cron}* has NEVER recorded a run. If it was deployed within the last ` +
      `${hours(s.maxAgeMs)} this is expected and will clear on its own; otherwise it is ` +
      `scheduled but never being invoked.`
    );
  }
  return (
    `*${s.cron}* last ran ${hours(s.ageMs ?? 0)} ago (limit ${hours(s.maxAgeMs)}). ` +
    `It is scheduled but not firing, or dying before it can record the run.`
  );
}
