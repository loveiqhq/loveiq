import { readFileSync } from "node:fs";

/**
 * The brain crons GitHub Actions schedules instead of Vercel, with their cron strings.
 *
 * `brain-brief` and `brain-mine` need the `claude` binary, so they moved out of vercel.json
 * into `.github/workflows/brain-daily.yml`. The tests that pin a schedule read it from
 * there, so they check the schedule that actually fires. Throws rather than returning
 * nothing when the workflow stops matching, so a rewrite fails loudly instead of leaving
 * every assertion below with nothing to check.
 */
export function brainDailySchedules(): Record<
  "brain-brief" | "brain-mine" | "brain-night-shift",
  string
> {
  const workflow = readFileSync(".github/workflows/brain-daily.yml", "utf8");
  const crons = [...workflow.matchAll(/^\s*- cron: "([^"]+)"/gm)].map((m) => m[1]!);
  const scheduleOf = (job: string) =>
    new RegExp(`github\\.event\\.schedule == '([^']+)' && '${job}'`).exec(workflow)?.[1];
  const mine = scheduleOf("brain-mine");
  const night = scheduleOf("brain-night-shift");
  const brief = crons.find((c) => c !== mine && c !== night);
  const runs = (job: string) => workflow.includes(`scripts/brain-cron.ts ${job}`);
  if (
    crons.length !== 3 ||
    !mine ||
    !night ||
    !crons.includes(mine) ||
    !crons.includes(night) ||
    !brief
  ) {
    throw new Error(
      "brain-daily.yml no longer has one schedule each for the brief, miner and Night Shift"
    );
  }
  if (!runs("brain-brief") || !runs("brain-mine") || !runs("brain-night-shift")) {
    throw new Error("brain-daily.yml no longer runs brain-brief, brain-mine and brain-night-shift");
  }
  return { "brain-brief": brief, "brain-mine": mine, "brain-night-shift": night };
}
