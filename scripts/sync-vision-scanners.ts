/**
 * Push the review protocol in `features/ux-review/server/scanners.ts` to PostHog.
 *
 * Git is the source of truth for what the scanners look for; PostHog holds the
 * live copy. This imports the prompts rather than restating them, so the two
 * cannot drift through a typo — retyping four long prompts into an API call by
 * hand is exactly how a criterion goes missing.
 *
 *   npx tsx scripts/sync-vision-scanners.ts            # dry run, prints the diff
 *   npx tsx scripts/sync-vision-scanners.ts --apply    # create/update, DISABLED
 *
 * Scanners are created disabled on purpose. PostHog's own guidance: "Hold off on
 * the automatic background sweep until you trust the scanner's on-demand
 * results — every sweep observation spends credits." Enable them only after the
 * benchmark passes.
 *
 * The key is read from the environment or `.env.local` at RUNTIME and never
 * printed, the same way `scripts/probes/supa.mjs` does it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { UX_SCANNERS, type UxScanner } from "../features/ux-review/server/scanners";

const PROJECT = "244778";
const BASE = `https://eu.posthog.com/api/projects/${PROJECT}`;
const APPLY = process.argv.includes("--apply");

function apiKey(): string {
  const fromEnv = process.env.POSTHOG_API_KEY;
  if (fromEnv) return fromEnv.trim();
  const env = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  const match = env.match(/^POSTHOG_API_KEY=(.*)$/m);
  const key = match?.[1]?.trim().replace(/^["']|["']$/g, "");
  if (!key) throw new Error("POSTHOG_API_KEY missing from env and .env.local");
  return key;
}

async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

function body(scanner: UxScanner) {
  return {
    name: scanner.name,
    description: `Review protocol — see features/ux-review/server/scanners.ts (${scanner.triggerEvent})`,
    scanner_type: "monitor",
    scanner_config: { prompt: scanner.prompt, allow_inconclusive: false },
    query: {
      kind: "RecordingsQuery",
      events: [{ id: scanner.triggerEvent, type: "events", name: scanner.triggerEvent }],
    },
    sampling_mode: scanner.samplingMode,
    sampling_rate: 1,
    provider: "google",
    model: "gemini-3.5-flash-lite",
    credit_limit: scanner.creditLimit,
    // Never enabled by this script. Turning on the 5-minute sweep is a
    // deliberate, separate act once the benchmark passes.
    enabled: false,
  };
}

async function main(): Promise<void> {
  const existing = (await call("/vision/scanners/")) as {
    results: Array<{ id: string; name: string; scanner_config?: { prompt?: string } }>;
  };
  const byName = new Map(existing.results.map((s) => [s.name, s]));

  const quota = (await call("/vision/quota/")) as { remaining: number; credit_limit: number };
  const projected = UX_SCANNERS.reduce((n, s) => n + s.estimatedMonthlyCredits, 0);
  console.log(
    `quota: ${quota.remaining}/${quota.credit_limit} credits left this period · ` +
      `these scanners project ${projected}/month` +
      (projected > quota.credit_limit ? "  ⚠ OVER the free allowance — needs a card" : "")
  );

  for (const scanner of UX_SCANNERS) {
    const live = byName.get(scanner.name);
    if (!live) {
      console.log(
        `${APPLY ? "CREATE" : "would create"}  ${scanner.name}  (${scanner.triggerEvent}, cap ${scanner.creditLimit})`
      );
      if (APPLY) {
        const made = (await call("/vision/scanners/", {
          method: "POST",
          body: JSON.stringify(body(scanner)),
        })) as { id: string };
        console.log(`   id=${made.id}  ← paste into scanners.ts`);
      }
      continue;
    }
    if (live.scanner_config?.prompt === scanner.prompt) {
      console.log(`ok        ${scanner.name}  (prompt matches)`);
      continue;
    }
    console.log(`${APPLY ? "UPDATE" : "would update"}  ${scanner.name}  (prompt drifted from git)`);
    if (APPLY) {
      await call(`/vision/scanners/${live.id}/`, {
        method: "PATCH",
        body: JSON.stringify(body(scanner)),
      });
    }
  }
  if (!APPLY) console.log("\ndry run — nothing written. Re-run with --apply.");
}

main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
