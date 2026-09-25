import { readFileSync } from "node:fs";

type BrainDailyJob =
  | "brain-brief"
  | "brain-mine"
  | "brain-night-shift"
  | "brain-health"
  | "brain-battery-retrieval"
  | "brain-battery-mcp";

/**
 * The brain crons GitHub Actions schedules instead of Vercel, with their cron strings.
 *
 * `brain-brief` and `brain-mine` need the `claude` binary, so they moved out of vercel.json
 * into `.github/workflows/brain-daily.yml`. The tests that pin a schedule read it from
 * there, so they check the schedule that actually fires. Throws rather than returning
 * nothing when the workflow stops matching, so a rewrite fails loudly instead of leaving
 * every assertion below with nothing to check.
 *
 * The two test batteries run inside the Monday brain-health job and record their own
 * cron_run rows, so they carry that job's schedule.
 */
export function brainDailySchedules(): Record<BrainDailyJob, string> {
  const workflow = readFileSync(".github/workflows/brain-daily.yml", "utf8");
  const crons = [...workflow.matchAll(/^\s*- cron: "([^"]+)"/gm)].map((m) => m[1]!);
  const scheduleOf = (job: string) =>
    new RegExp(`github\\.event\\.schedule == '([^']+)' && '${job}'`).exec(workflow)?.[1];
  const mine = scheduleOf("brain-mine");
  const night = scheduleOf("brain-night-shift");
  const health = scheduleOf("brain-health");
  const brief = crons.find((c) => c !== mine && c !== night && c !== health);
  const runs = (job: string) => workflow.includes(`scripts/brain-cron.ts ${job}`);
  const records = (flag: string) => workflow.includes(`scripts/brain-battery.ts ${flag} --record`);
  if (
    crons.length !== 4 ||
    !mine ||
    !night ||
    !health ||
    ![mine, night, health].every((c) => crons.includes(c)) ||
    !brief
  ) {
    throw new Error(
      "brain-daily.yml no longer has one schedule each for the brief, miner, Night Shift and weekly health report"
    );
  }
  if (!["brain-brief", "brain-mine", "brain-night-shift", "brain-health"].every(runs)) {
    throw new Error(
      "brain-daily.yml no longer runs brain-brief, brain-mine, brain-night-shift and brain-health"
    );
  }
  if (!records("--retrieval") || !records("--mcp")) {
    throw new Error("brain-daily.yml no longer records both test batteries");
  }
  return {
    "brain-brief": brief,
    "brain-mine": mine,
    "brain-night-shift": night,
    "brain-health": health,
    "brain-battery-retrieval": health,
    "brain-battery-mcp": health,
  };
}
