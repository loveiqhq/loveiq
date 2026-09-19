/**
 * The verifier must bound its WORK, never its lookback.
 *
 * Both halves of this pipeline shipped the same bug. The cron sliced the newest
 * six findings out of twenty-five and then skipped the already-handled ones
 * among them; the verifier did it in SQL, with `LIMIT 10` on a newest-first
 * query. Either way, once that many findings arrived inside one window every
 * older one ranked below them and was never reached — not claimed, not
 * verified, not counted, simply absent — and the drop arrived exactly when the
 * scanners were busiest, which is when it matters.
 *
 * A source test rather than a behavioural one because the verifier is a script
 * with top-level await that runs on import; this is the same technique
 * ux-finding-ledger.test.ts uses for the same file.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = readFileSync(resolve(process.cwd(), "scripts/verify-ux-findings.mjs"), "utf8");

describe("the verifier's per-run budget", () => {
  it("fetches more findings than it will probe, so the query is not the bound", () => {
    const limit = Number(/ORDER BY timestamp DESC\s*\n\s*LIMIT (\d+)/.exec(SRC)?.[1]);
    const budget = Number(
      /PROBE_BUDGET\s*=\s*Number\(process\.env\.PROBE_BUDGET\s*\?\?\s*(\d+)\)/.exec(SRC)?.[1]
    );

    expect(limit, "the findings query must have a LIMIT this test can read").toBeGreaterThan(0);
    expect(budget, "PROBE_BUDGET must have a readable numeric default").toBeGreaterThan(0);
    // The whole bug: when the query caps at or below what a run can process,
    // the cap is on the lookback and the tail is invisible.
    expect(
      limit,
      "LIMIT must exceed the probe budget or the tail is dropped in SQL"
    ).toBeGreaterThan(budget);
  });

  it("defers what it cannot probe instead of dropping it silently", () => {
    expect(SRC).toMatch(/deferred \+= 1/);
    // Reported in the run summary — a standing backlog has to be visible.
    expect(SRC).toMatch(/left for the next run/);
  });

  it("does not mark a deferred finding verified", () => {
    // It is already claimed by this point; the claim going stale in ten minutes
    // is what returns it on the next run. Marking it delivered here would
    // finalise a finding that was never probed, losing it for good.
    const branch = /probeRuns >= PROBE_BUDGET\) \{([\s\S]*?)\n  \}/.exec(SRC)?.[1] ?? "";
    expect(branch, "the budget branch must exist").not.toBe("");
    expect(branch).not.toMatch(/markVerified|recordFinding/);
  });
});
