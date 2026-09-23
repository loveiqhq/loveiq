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

function body(scanner: UxScanner, forCreate: boolean) {
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
    // `enabled` is sent ONLY when creating. A new scanner starts off: turning
    // on the five-minute sweep is a deliberate, separate act. But PATCHing a
    // live scanner with enabled:false SWITCHES IT OFF, so a routine prompt
    // edit would have silently stopped all four. Omitting the key leaves
    // whatever state the scanner is actually in.
    ...(forCreate ? { enabled: false } : {}),
  };
}

async function main(): Promise<void> {
  const existing = (await call("/vision/scanners/")) as {
    results: Array<{
      id: string;
      name: string;
      scanner_config?: { prompt?: string };
      sampling_mode?: string;
      credit_limit?: number | null;
    }>;
  };
  const byName = new Map(existing.results.map((s) => [s.name, s]));

  const quota = (await call("/vision/quota/")) as {
    remaining: number;
    credit_limit: number;
    free_monthly_credits?: number;
  };
  const projected = UX_SCANNERS.reduce((n, s) => n + s.estimatedMonthlyCredits, 0);
  console.log(
    `quota: ${quota.remaining}/${quota.credit_limit} credits left this period · ` +
      `these scanners project ${projected}/month` +
      // credit_limit is the hard stop (7500), NOT the free allowance (2500).
      // Comparing against it kept this warning silent while we were already
      // paying for the overage.
      (projected > (quota.free_monthly_credits ?? quota.credit_limit)
        ? `  ⚠ OVER the ${quota.free_monthly_credits ?? quota.credit_limit} free allowance — the excess is billed`
        : "")
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
          body: JSON.stringify(body(scanner, true)),
        })) as { id: string };
        console.log(`   id=${made.id}  ← paste into scanners.ts`);
      }
      continue;
    }
    /**
     * EVERY FIELD THIS FILE PINS, not just the prompt.
     *
     * This compared the prompt and nothing else, so a scanner was "ok" as long
     * as its wording matched git — and `samplingMode` and `creditLimit`, which
     * scanners.ts also pins and `body()` also sends, could sit out of step with
     * PostHog forever. Nothing had drifted when this was found (2026-09-23);
     * it was found because the first change to a non-prompt field — moving two
     * scanners off `focused`, which was skipping a third of their sessions —
     * dry-ran as "ok (prompt matches)" and would have merged as a no-op.
     *
     * The convergence check in sync-vision-scanners.yml re-runs this dry, so it
     * now verifies every field landed rather than only the prompt.
     */
    const drifted: string[] = [];
    if (live.scanner_config?.prompt !== scanner.prompt) drifted.push("prompt");
    if (live.sampling_mode !== scanner.samplingMode) {
      drifted.push(`sampling_mode ${live.sampling_mode} -> ${scanner.samplingMode}`);
    }
    if (live.credit_limit !== scanner.creditLimit) {
      drifted.push(`credit_limit ${live.credit_limit} -> ${scanner.creditLimit}`);
    }
    if (drifted.length === 0) {
      console.log(`ok        ${scanner.name}  (prompt, sampling and cap all match)`);
      continue;
    }
    console.log(`${APPLY ? "UPDATE" : "would update"}  ${scanner.name}  (${drifted.join("; ")})`);
    if (APPLY) {
      await call(`/vision/scanners/${live.id}/`, {
        method: "PATCH",
        body: JSON.stringify(body(scanner, false)),
      });
    }
  }
  if (!APPLY) console.log("\ndry run — nothing written. Re-run with --apply.");
}

main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
