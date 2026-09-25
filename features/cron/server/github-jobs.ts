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
 * The brain's jobs (brain-daily.yml) are not here: their times were chosen to land after
 * GitHub's delay, so starting them on time would move the brief to the small hours.
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
  return jobs;
}
