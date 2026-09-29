/**
 * The GitHub Actions jobs that Vercel's clock starts, and when.
 *
 * GitHub's own `schedule:` trigger stopped being a clock for this repository after its
 * 2026-08-26 Actions incident: runs start 4.5 to 5.5 hours late, and slots that fall due
 * while one is still waiting are dropped. The verifier's hourly cron still produced four
 * runs a day (2026-09-25: 05:23, 12:13, 18:03, 21:47 UTC), the same as the 3-hourly cron
 * before it. Others report the same since that date
 * (github.com/orgs/community/discussions/207346). `workflow_dispatch` starts a run within
 * seconds, so /api/cron/start-github-jobs asks for these through the API, every hour at
 * :41, and their workflows carry no `schedule:` of their own, so GitHub cannot start a
 * late duplicate.
 *
 * The brain's daily jobs (brain-daily.yml) are here too since 2026-09-28, the day the miner
 * ran 8.5 hours late and set off two stall alerts. The brief had been scheduled at 01:10 so
 * that it landed in the morning; it now starts in the morning. The brain's embedding
 * catch-up (brain-embed.yml) is hourly: it has no time of day. The persona walks on staging
 * (persona-walkers.yml) run nightly at 02:41.
 */

export interface GithubJob {
  /** File name under .github/workflows/. */
  workflow: string;
  /** workflow_dispatch inputs; every key must be declared by that workflow. */
  inputs?: Record<string, string>;
}

/** Every workflow the clock can start, whatever the hour. */
export const CLOCK_WORKFLOWS = [
  "ux-review-verify.yml",
  "probe-guard.yml",
  "survey-db-sync.yml",
  "health-monitor.yml",
  "ux-digest-audit.yml",
  "brain-embed.yml",
  "brain-daily.yml",
  "persona-walkers.yml",
] as const;

/** The jobs to start at `at`, a run of the hourly :41 cron. Times are UTC. */
export function jobsDue(at: Date): GithubJob[] {
  const hour = at.getUTCHours();
  const monday = at.getUTCDay() === 1;
  const jobs: GithubJob[] = [
    // `on_time` makes the run record itself for the stall watchdog, which is how a clock
    // that stops gets noticed. `weekly` adds the scanner scoring, once a week.
    {
      workflow: "ux-review-verify.yml",
      inputs: { on_time: "true", ...(monday && hour === 10 ? { weekly: "true" } : {}) },
    },
    // Embeds any chunks brain-fast has not caught up with; ends at once when there are none.
    { workflow: "brain-embed.yml" },
  ];
  if (monday && hour === 4) jobs.push({ workflow: "probe-guard.yml", inputs: { which: "weekly" } });
  if (hour === 5) jobs.push({ workflow: "probe-guard.yml", inputs: { which: "daily" } });
  if (hour === 7) jobs.push({ workflow: "survey-db-sync.yml" });
  if (hour === 8) jobs.push({ workflow: "health-monitor.yml" });
  // After the UX digest, which posts at 07:17 UTC in summer and 08:17 in winter, and once
  // more as a fallback: the audit posts at most once per digest.
  if (hour === 8 || hour === 10) {
    jobs.push({ workflow: "ux-digest-audit.yml", inputs: { on_time: "true" } });
  }
  // The brain, on the teamwork@ Claude seat. The Night Shift answers the day's queued
  // research by morning; the Monday report follows the test batteries it reports on.
  if (hour === 0) jobs.push(brain("brain-night-shift"));
  // Persona walks on staging, judged on the same seat: after the Night Shift, before the
  // brief. Four walks and two judge passes take about an hour.
  if (hour === 2) jobs.push({ workflow: "persona-walkers.yml" });
  if (monday && hour === 1) jobs.push(brain("brain-health"));
  // The brief, and two retries: its day claim makes a retry a no-op once one delivered.
  if (hour >= 6 && hour <= 8) jobs.push(brain("brain-brief"));
  // The decision miner after the brief's last retry; the radar runs inside its job.
  if (hour === 9) jobs.push(brain("brain-mine"));
  return jobs;
}

const brain = (job: string): GithubJob => ({ workflow: "brain-daily.yml", inputs: { job } });
