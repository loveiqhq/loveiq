import { readFileSync } from "node:fs";

import { jobsDue } from "@features/cron/server/github-jobs";

type BrainDailyJob =
  | "brain-brief"
  | "brain-mine"
  | "brain-night-shift"
  | "brain-radar"
  | "brain-health"
  | "brain-battery-retrieval"
  | "brain-battery-mcp";

/**
 * The brain jobs Vercel's clock starts through `.github/workflows/brain-daily.yml`, each as
 * the cron its clock hours amount to ("41 6,7,8 * * *"), so the tests that pin a schedule
 * check the one that actually fires (features/cron/server/github-jobs.ts). Until
 * 2026-09-28 GitHub's own schedule started them, hours late.
 *
 * Throws rather than returning nothing when the workflow or the clock stops matching, so a
 * rewrite fails loudly instead of leaving every assertion below with nothing to check.
 *
 * The two test batteries run inside the Monday brain-health job and record their own
 * cron_run rows, so they carry that job's schedule.
 */
export function brainDailySchedules(): Record<BrainDailyJob, string> {
  const workflow = readFileSync(".github/workflows/brain-daily.yml", "utf8");
  if (/^\s*schedule:/m.test(workflow)) {
    throw new Error("brain-daily.yml has a schedule: again, so GitHub would start late copies");
  }
  // 2026-09-27 is a Sunday: a week of clock hours, one day at a time.
  const hoursOn = (job: string, day: number) =>
    [...Array(24).keys()].filter((h) =>
      jobsDue(new Date(Date.UTC(2026, 8, 27 + day, h, 41))).some(
        (j) => j.workflow === "brain-daily.yml" && j.inputs?.job === job
      )
    );
  const cronOf = (job: string) => {
    const week = [...Array(7).keys()].map((d) => hoursOn(job, d).join(","));
    if (week.every((h) => h !== "" && h === week[0])) return `41 ${week[0]} * * *`;
    if (week.every((h, d) => (d === 1 ? h !== "" : h === ""))) return `41 ${week[1]} * * 1`;
    return undefined;
  };
  const brief = cronOf("brain-brief");
  const mine = cronOf("brain-mine");
  const night = cronOf("brain-night-shift");
  const health = cronOf("brain-health");
  if (!brief || !mine || !night || !health) {
    throw new Error(
      "the clock no longer starts the brief, miner and Night Shift daily and the health report on Mondays"
    );
  }
  const runs = (job: string) => workflow.includes(`scripts/brain-cron.ts ${job}`);
  const records = (flag: string) => workflow.includes(`scripts/brain-battery.ts ${flag} --record`);
  if (
    !["brain-brief", "brain-mine", "brain-radar", "brain-night-shift", "brain-health"].every(runs)
  ) {
    throw new Error(
      "brain-daily.yml no longer runs brain-brief, brain-mine, brain-radar, brain-night-shift and brain-health"
    );
  }
  if (!records("--retrieval") || !records("--mcp")) {
    throw new Error("brain-daily.yml no longer records both test batteries");
  }
  return {
    "brain-brief": brief,
    "brain-mine": mine,
    "brain-night-shift": night,
    // Runs inside the miner's job, straight after it.
    "brain-radar": mine,
    "brain-health": health,
    "brain-battery-retrieval": health,
    "brain-battery-mcp": health,
  };
}
