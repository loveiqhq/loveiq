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
 * runtime — a test asserts this map stays in step with vercel.json's cron list and the
 * brain jobs .github/workflows/brain-daily.yml runs (they need the `claude` binary).
 */
export const CRON_MAX_AGE_MS: Record<string, number> = {
  "survey-paused": 3 * 3_600_000,
  "nurture-sequence": 3 * 3_600_000,
  "invite-reminders": 26 * 3_600_000,
  "payment-fulfillment-sweep": 2 * 3_600_000,
  "security-storm-detector": 3_600_000,
  "anomaly-watcher": 3 * 3_600_000,
  // Every 30 minutes, so 90 minutes of silence is two missed ticks — the same
  // window the route itself looks back over.
  "ux-review": 90 * 60_000,
  "conversion-digest": 26 * 3_600_000,
  /**
   * WEEKLY, so eight days of silence is one missed run. Re-enabled 2026-09-19
   * after 2026-07-26's pause, and weekly rather than daily on purpose: the daily
   * and weekly messages carry the same 30-day chart rail, and `conversion-digest`
   * already posts a decision plus the per-experiment charts every morning.
   *
   * A generous window matters more here than elsewhere — a weekly cron that dies
   * is invisible for a week by definition, which is exactly the failure this
   * watch list exists to catch.
   */
  "funnel-digest": 8 * 24 * 3_600_000,
  // Daily, twenty minutes after the conversion digest, so it checks the numbers that were
  // just published. Silent on a normal day like the brief and the miner — a disagreement is
  // the only thing it posts — so it is watched for exactly that reason: a dead reconciler
  // and a set of numbers that agree look identical from the outside.
  "brain-reconcile": 26 * 3_600_000,
  "brain-ingest": 26 * 3_600_000,
  // Monthly, on the 3rd. The house rule is 2-3x the schedule, which would be 62
  // days — deliberately tighter here at 40, because this one writes to the cost
  // sheet. Two missed months of invoice filing is a quarter's worth of vendor
  // changes nobody reconciled, and the sheet feeds runway. 40 days tolerates a
  // late run and still catches a wholly missed month.
  "file-invoices": 40 * 24 * 3_600_000,
  // Every 15 minutes, so 45m of silence is two missed ticks.
  "brain-fast": 45 * 60_000,
  // Hourly.
  "brain-notion": 3 * 3_600_000,
  "brain-gmail": 3 * 3_600_000,
  "brain-calendar": 3 * 3_600_000,
  // Hourly, but with a 300s ceiling — a full Drive walk is minutes, not seconds.
  "brain-drive": 3 * 3_600_000,
  // Daily, and the ONLY job here whose normal output is silence -- it posts
  // nothing on a routine day. That makes it the easiest one to be dead without
  // anyone noticing, which is exactly why it is watched: it records a run every
  // day whether or not it says anything.
  "brain-brief": 26 * 3_600_000,
  // Daily, and silent like the brief: it posts nothing to Slack at all, so a dead miner
  // looks exactly like a fortnight of quiet meetings. Watched for the same reason — it
  // records a run every night whether or not it found a decision, and the thing it is
  // building, the decision record, is the corpus's thinnest and most valuable material.
  "brain-mine": 26 * 3_600_000,
  // Daily, and silent like the brief and the miner. Watched for an extra reason: its
  // budget is TEN REQUESTS A DAY and it spends one, so a run that starts failing is not
  // self-healing noise -- it is the only automatic read of the one tool that measures
  // frustration, and the dashboard keeps looking fine while the corpus goes stale.
  "brain-clarity": 26 * 3_600_000,
  // Daily, and silent like the brief: it posts only when Europe PMC is unreachable. A dead
  // run looks exactly like a quiet one, and the corpus it feeds goes stale invisibly —
  // research cards do not announce their own age.
  "brain-evidence": 26 * 3_600_000,
  // Nightly, in GitHub Actions. It records a run whether or not anything was queued, so a
  // missing night means the job did not fire, and questions are waiting on it.
  "brain-night-shift": 26 * 3_600_000,
  // WEEKLY, Mondays in GitHub Actions: the two test batteries record their results, then
  // the brain's report on itself is written. Eight days is one missed Monday, and a missed
  // Monday means a week with no accuracy measurement at all.
  "brain-health": 8 * 24 * 3_600_000,
  "brain-battery-retrieval": 8 * 24 * 3_600_000,
  "brain-battery-mcp": 8 * 24 * 3_600_000,
  /**
   * GITHUB-SCHEDULED. GitHub starts this repo's schedules 4.5 to 5.5 hours late and
   * drops some: from 2026-09-14 the verifier ran 4-6 times a day on an 8-a-day cron.
   * Both record their SCHEDULED runs (scripts/record-cron-run.mjs), so a hand-started run
   * cannot hide a dead schedule. The lateness shifts every run alike, so it does not
   * widen the gap between them; the verifier is hourly, so six hours is six missed runs
   * in a row, not an ordinary drop; the audit runs three times a day, so 26 hours means
   * all three were dropped.
   */
  "ux-review-verify": 6 * 3_600_000,
  "ux-digest-audit": 26 * 3_600_000,
};

/**
 * Watched jobs that GitHub Actions starts, and the workflow that starts them. When one
 * goes quiet the likeliest cause is GitHub's scheduler, not the job, and the remedy is to
 * start it by hand, so the alert says where. A test keeps this in step with the workflows.
 */
export const GITHUB_WORKFLOW: Record<string, string> = {
  "brain-brief": "brain-daily.yml",
  "brain-mine": "brain-daily.yml",
  "brain-night-shift": "brain-daily.yml",
  // All three run in brain-daily.yml's `brain-health` job; start that one.
  "brain-health": "brain-daily.yml",
  "brain-battery-retrieval": "brain-daily.yml",
  "brain-battery-mcp": "brain-daily.yml",
  "ux-review-verify": "ux-review-verify.yml",
  "ux-digest-audit": "ux-digest-audit.yml",
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
  const workflow = GITHUB_WORKFLOW[s.cron];
  const github = workflow
    ? `GitHub Actions starts it (${workflow}) and runs this repo's schedules hours late, ` +
      `sometimes not at all: start it by hand from the Actions tab if it cannot wait.`
    : null;
  if (s.lastRunAt === null) {
    return (
      `*${s.cron}* has NEVER recorded a run. If it was deployed within the last ` +
      `${hours(s.maxAgeMs)} this is expected and will clear on its own; otherwise it is ` +
      `scheduled but never being invoked.` +
      (github ? ` ${github}` : "")
    );
  }
  return (
    `*${s.cron}* last ran ${hours(s.ageMs ?? 0)} ago (limit ${hours(s.maxAgeMs)}). ` +
    (github ?? `It is scheduled but not firing, or dying before it can record the run.`)
  );
}
