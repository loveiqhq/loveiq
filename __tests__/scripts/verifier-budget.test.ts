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
import { parse } from "yaml";

const RAW = readFileSync(resolve(process.cwd(), "scripts/verify-ux-findings.mjs"), "utf8");
/**
 * Comments stripped before matching. A source test that reads the prose around
 * the code passes on a sentence describing the bug, which has happened three
 * times in this repo. Only the code may satisfy these.
 */
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1")
  // SQL line comments too: the queries are template literals, so `--`
  // survives a JS-comment strip and could satisfy these on prose alone.
  .replace(/^\s*--.*$/gm, "");

describe("the verifier's per-run budget", () => {
  it("fetches more findings than it will probe, so the query is not the bound", () => {
    // The query's LIMIT is the named constant now, so read that. Kept as a
    // separate assertion from the window test below: this one is about the
    // WORK (a fetch smaller than the budget makes the budget unreachable),
    // that one is about the WINDOW.
    const limit = Number(
      /FINDINGS_FETCH_LIMIT\s*=\s*Number\(process\.env\.FINDINGS_FETCH_LIMIT\s*\?\?\s*(\d+)\)/.exec(
        SRC
      )?.[1]
    );
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

  /**
   * THE HALF THAT WAS STILL BROKEN after the LIMIT was fixed.
   *
   * Bounding the work is only safe if the deferred tail is still REACHABLE on
   * the next run. The code assumed the workflow runs every three hours, which
   * it does not: GitHub fires about five of the eight scheduled runs a day,
   * with gaps up to 6h36m measured 2026-09-20. With a 6-hour window the tail
   * aged out before anything looked at it again — 9 of 60 findings (15%) have
   * no ledger row and never will.
   */
  it("keeps a deferred finding reachable for longer than the schedule can slip", () => {
    const lookback = Number(
      /LOOKBACK_HOURS\s*=\s*Number\(process\.env\.LOOKBACK_HOURS\s*\?\?\s*(\d+)\)/.exec(SRC)?.[1]
    );
    expect(lookback, "LOOKBACK_HOURS must have a readable numeric default").toBeGreaterThan(0);
    // The declared cadence is hourly (every 3 hours until 2026-09-25). GitHub
    // has produced gaps of 6h36m, and a window shorter than the real gap loses
    // the tail.
    expect(
      lookback,
      "the lookback must survive several skipped scheduled runs, not just one"
    ).toBeGreaterThanOrEqual(12);
  });

  /**
   * A DEFAULT THE CALLER OVERRIDES IS NOT A DEFAULT.
   *
   * The script default moved from 6 to 24 and the workflow kept passing
   * `LOOKBACK_HOURS: ${{ inputs.lookback_hours || '6' }}`, so the fix was a
   * no-op on the only path that runs unattended — caught by reading the next
   * live run's output ("28 finding(s) in the last 6h"), not by any test.
   * The number belongs in one place; this fails if the two disagree.
   */
  it("is not silently overridden by the workflow that runs it", () => {
    const wf = readFileSync(
      resolve(process.cwd(), ".github/workflows/ux-review-verify.yml"),
      "utf8"
    );
    const scriptDefault = Number(
      /LOOKBACK_HOURS\s*=\s*Number\(process\.env\.LOOKBACK_HOURS\s*\?\?\s*(\d+)\)/.exec(SRC)?.[1]
    );
    // The workflow's fallback, i.e. what an unattended run actually gets.
    const wfFallback = Number(
      /LOOKBACK_HOURS:\s*\$\{\{\s*inputs\.lookback_hours\s*\|\|\s*'(\d+)'\s*\}\}/.exec(wf)?.[1]
    );
    expect(wfFallback, "the workflow must pass a readable LOOKBACK_HOURS fallback").toBeGreaterThan(
      0
    );
    expect(
      wfFallback,
      "the workflow fallback must match the script default, or the default is decorative"
    ).toBe(scriptDefault);

    /**
     * And the DISPATCH INPUT must not carry a default of its own.
     *
     * A `default:` there makes `inputs.lookback_hours` non-empty on every
     * manual run, so the `|| '<fallback>'` above never fires — a third copy of
     * the same number, and the least visible one wins. It really did: the
     * script, the workflow fallback and the docs all said 24 while every
     * dispatched run quietly used 6.
     */
    const inputBlock = /lookback_hours:\n((?:\s{8}.*\n)+)/.exec(wf)?.[1] ?? "";
    expect(inputBlock, "the lookback_hours input must exist").not.toBe("");
    expect(
      inputBlock.replace(/^\s*#.*$/gm, ""),
      "lookback_hours must have no default, or it overrides the real window"
    ).not.toMatch(/^\s*default:/m);
  });

  /**
   * THE SCORING STEP RAN THE WRONG SOURCE.
   *
   * `--ledger` scores from what the probes actually concluded; it costs nothing
   * to collect and never expires. The fixtures are seven hand-curated
   * recordings that EXPIRE 2026-09-28 and cannot be re-scanned, because a
   * scanner observes a given session once ever. The ledger mode was written,
   * tested and documented as the replacement — and the weekly step called the
   * bare script, so every scheduled score came from the seven rows about to
   * die. The gap was not cosmetic: 0.02 precision on 84 ledger findings against
   * 0.20 on the fixtures.
   */
  it("scores the scanners from the ledger, not only from expiring fixtures", () => {
    /**
     * Parsed, and scoped to THIS STEP. The first version matched the whole
     * file, so deleting the secret from the scoring step still passed — the
     * verify step further down has the same one. A workflow-wide `toMatch` for
     * a name that appears five times is not an assertion.
     */
    const doc = parse(
      readFileSync(resolve(process.cwd(), ".github/workflows/ux-review-verify.yml"), "utf8")
    ) as { jobs: Record<string, { steps: { name?: string; run?: string; env?: object }[] }> };
    const steps = Object.values(doc.jobs).flatMap((j) => j.steps);
    const step = steps.find((x) => x.name === "Score the scanners (weekly)");

    expect(step, "the weekly scoring step must exist under that name").toBeDefined();
    expect(step!.run, "the weekly step must run the ledger scorer").toMatch(
      /score\.mjs\s+--ledger/
    );
    // --ledger reads Supabase; without these it exits 3 and scores nothing.
    expect(Object.keys(step!.env ?? {})).toEqual(
      expect.arrayContaining(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])
    );
  });

  /**
   * THE MIRROR OF THE ORDERING BUG, and the budget test above is blind to it.
   *
   * That test asserts LIMIT > PROBE_BUDGET, which is about the WORK. This is
   * about the WINDOW. Oldest-first stops the tail starving; a fetch LIMIT below
   * the number of findings in the window then starves the HEAD — the newest are
   * never fetched, so they are not claimed, not verified, not counted, and
   * nothing says they existed.
   *
   * Measured 2026-09-20, hours after the window widened 6h -> 24h: 57 findings
   * in the window, `LIMIT 50` returned the 50 oldest, and the 7 newest were
   * absent — including both findings from the challenger the pipeline had just
   * been set up to measure. `LIMIT 50` passed the budget test the entire time.
   */
  it("can fetch a whole window, not just a page of it", () => {
    const fetchLimit = Number(
      /FINDINGS_FETCH_LIMIT\s*=\s*Number\(process\.env\.FINDINGS_FETCH_LIMIT\s*\?\?\s*(\d+)\)/.exec(
        SRC
      )?.[1]
    );
    const budget = Number(
      /PROBE_BUDGET\s*=\s*Number\(process\.env\.PROBE_BUDGET\s*\?\?\s*(\d+)\)/.exec(SRC)?.[1]
    );
    expect(fetchLimit, "the fetch limit must be readable").toBeGreaterThan(0);
    // Not "bigger than the budget" — bigger than a BUSY WINDOW. ~11 findings a
    // day against 24 hours, and a backfill can multiply that for a day.
    expect(
      fetchLimit,
      "the fetch limit must exceed anything a lookback window can hold, not merely the budget"
    ).toBeGreaterThanOrEqual(20 * budget);
    // And the query must actually use it rather than a literal.
    expect(SRC).toMatch(/LIMIT \$\{FINDINGS_FETCH_LIMIT\}/);
  });

  it("shouts when the fetch limit is actually reached", () => {
    // Silence here is the whole failure mode: a truncated fetch looks exactly
    // like a quiet day. The check must compare against the limit, not a literal.
    expect(SRC).toMatch(/findings\.length >= FINDINGS_FETCH_LIMIT/);
    expect(SRC).toMatch(/::error::/);
  });

  it("drains the oldest finding first, so a busy day cannot starve it", () => {
    // Newest-first plus a per-run budget is a starvation queue: the newest
    // always outrank the tail, so the same findings are deferred every run
    // until they leave the window. This is the ordering, not the limit.
    expect(SRC).toMatch(/ORDER BY timestamp ASC/);
    expect(SRC).not.toMatch(/ORDER BY timestamp DESC/);
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
