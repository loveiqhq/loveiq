/**
 * Records one run of a GitHub Actions job in `cron_run`, so the stall watchdog
 * (features/cron/server/cron-stall.ts, run hourly by the Vercel anomaly-watcher)
 * can alert when the job stops firing.
 *
 * WHY. GitHub drops scheduled runs under load: from 2026-09-14 the verifier
 * ran 4-6 times a day on an 8-a-day cron, and the digest audit's first
 * scheduled run never happened. A job that is never invoked cannot report its
 * own absence; only something that definitely runs can notice the gap.
 *
 *   npx tsx scripts/record-cron-run.mjs <cron-name> <success|error>
 *
 * START_MS (epoch milliseconds) sets the start time when the caller has it.
 */
import { recordCronRun } from "../shared/observability/slack-alert-dedup.ts";

const [name, outcome] = process.argv.slice(2);
if (!name || !["success", "error"].includes(outcome)) {
  console.error("usage: record-cron-run.mjs <cron-name> <success|error>");
  process.exit(2);
}
const started = Number(process.env.START_MS) || Date.now();
await recordCronRun(name, started, outcome);
console.log(`recorded ${name}: ${outcome}`);
