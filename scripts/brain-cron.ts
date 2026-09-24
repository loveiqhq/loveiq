#!/usr/bin/env tsx

/**
 * Run a company-brain cron in this process instead of on Vercel.
 *
 * WHY THIS EXISTS. The brief and the decision miner are the two crons that need a language
 * model, and the model we pay for is the Team subscription, which only the `claude` binary
 * may use (see CLI_DEFAULT_MODEL in features/brain/server/llm.ts). Vercel has no such
 * binary; GitHub Actions does. So `.github/workflows/brain-daily.yml` calls the SAME route
 * handlers here, unchanged: the day claim, the cron_run row, the Slack post and the stall
 * watch all behave exactly as they did when Vercel called them.
 *
 * Usage:
 *   npx tsx scripts/brain-cron.ts brain-brief [?day=YYYY-MM-DD]
 *   npx tsx scripts/brain-cron.ts brain-mine [?limit=N]
 *   npx tsx scripts/brain-cron.ts brain-night-shift          # also needs LOVEIQ_MCP_TOKEN
 *   npx tsx scripts/brain-cron.ts brain-brief --dry-run [?day=YYYY-MM-DD]   # print it, post nothing
 *
 * Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SITE_URL=https://loveiq.org (the
 * routes refuse to run for any other site), SLACK_BRAIN_WEBHOOK_URL, and BRAIN_LLM_CLI=claude.
 *
 * Exits 0 when the job ran and did its work, 1 when it failed or could not run (the
 * workflow then posts to the brain channel), 2 on a usage error.
 */

import { randomUUID } from "node:crypto";

const ROUTES = {
  "brain-brief": () => import("@/app/api/cron/brain-brief/route"),
  "brain-mine": () => import("@/app/api/cron/brain-mine/route"),
  "brain-night-shift": () => import("@/app/api/cron/brain-night-shift/route"),
};

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const [name, query = ""] = args.filter((a) => a !== "--dry-run");
  if (!name || !(name in ROUTES) || (dryRun && name !== "brain-brief")) {
    console.error(
      "Usage: npx tsx scripts/brain-cron.ts brain-brief|brain-mine|brain-night-shift [?query]   (--dry-run: brain-brief only)"
    );
    return 2;
  }

  // The whole model path against real records, with no claim taken and nothing posted.
  if (dryRun) {
    const { buildDailyBrief } = await import("@features/brain/server/brief");
    const day =
      new URLSearchParams(query.replace(/^\?/, "")).get("day") ??
      new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const brief = await buildDailyBrief(day);
    console.log(brief ? `${day}\n\n${brief.text}` : `${day}: nothing notable`);
    return 0;
  }

  // The routes check a bearer against CRON_SECRET. This process is the scheduler, so a
  // secret minted for its one request proves as much as the real one and leaks nothing.
  const secret = randomUUID();
  process.env.CRON_SECRET = secret;
  const { GET } = await ROUTES[name as keyof typeof ROUTES]();
  const res = await GET(
    new Request(`https://loveiq.org/api/cron/${name}${query}`, {
      headers: { authorization: `Bearer ${secret}` },
    })
  );
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  console.log(JSON.stringify({ status: res.status, ...body }));

  // `skipped: true` is the host check refusing (the workflow names the wrong site), and
  // `ok: false` on a 200 is brain-mine saying it read no meetings at all.
  return res.ok && body?.ok !== false && body?.skipped !== true ? 0 : 1;
}

/**
 * Exit once in-flight work settles (a log line, a Slack post a route did not await), not the
 * instant the route returns. The timer only bounds a handle that never closes.
 */
main().then(
  (code) => {
    process.exitCode = code;
    setTimeout(() => process.exit(code), 10_000).unref();
  },
  (err) => {
    console.error(err);
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 10_000).unref();
  }
);
