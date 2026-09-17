/**
 * The ledger's outcomes and the constraint that accepts them must not drift.
 *
 * `recordFinding` is best-effort by design — a bookkeeping table must never take
 * down the verification it records — so a row the CHECK constraint rejects is
 * logged and dropped. That is the right failure mode and a silent one: add an
 * outcome to the verifier, forget the migration, and findings stop being
 * recorded with nothing going red.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const VERIFIER = resolve(process.cwd(), "scripts/verify-ux-findings.mjs");
const MIGRATION = resolve(
  process.cwd(),
  "supabase/migrations/20260917143510_ux_finding_ledger.sql"
);

/** Outcome literals the verifier can actually write. */
function outcomesInCode(): string[] {
  const src = readFileSync(VERIFIER, "utf8");
  const direct = [...src.matchAll(/outcome:\s*"([a-z_]+)"/g)].map((m) => m[1]);
  // The final path picks between three in one expression.
  const ternary = [...src.matchAll(/outcome:\s*[^,\n]*?\?[^,\n]*/g)].flatMap((m) =>
    [...m[0].matchAll(/"([a-z_]+)"/g)].map((x) => x[1])
  );
  return [...new Set([...direct, ...ternary])].sort();
}

/** Outcomes the CHECK constraint permits. */
function outcomesInMigration(): string[] {
  const sql = readFileSync(MIGRATION, "utf8");
  const m = /outcome IN \(([^)]*)\)/.exec(sql);
  if (!m) return [];
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
}

describe("ux_finding ledger", () => {
  it("reads both sides at all", () => {
    // Without this, a regex that stops matching makes every assertion vacuous.
    expect(outcomesInCode().length).toBeGreaterThan(3);
    expect(outcomesInMigration().length).toBeGreaterThan(3);
  });

  it("only writes outcomes the constraint accepts", () => {
    const allowed = new Set(outcomesInMigration());
    for (const o of outcomesInCode()) {
      expect(
        allowed.has(o),
        `the verifier writes outcome "${o}" and the CHECK constraint rejects it — ` +
          `those rows would be logged and dropped, silently`
      ).toBe(true);
    }
  });

  it("records every terminal path, not just the happy one", () => {
    // A finding that is contradicted, unclassifiable or a duplicate is still a
    // finding, and each used to leave no trace outside a CI log.
    const outcomes = outcomesInCode();
    for (const required of [
      "contradicted",
      "gap",
      "duplicate",
      "reproduced",
      "clear",
      "inconclusive",
    ]) {
      expect(outcomes, `no exit point records "${required}"`).toContain(required);
    }
  });

  it("never claims delivery for a verdict that reached no thread", () => {
    // deliverVerdict returned a bare boolean, true for BOTH "posted" and "there
    // was no thread" — so this column, the one the table exists for, was always
    // true. Sessions with no thread are the readers who never submitted.
    const src = readFileSync(VERIFIER, "utf8");
    expect(src).not.toMatch(/delivered:\s*delivered\b/);
    expect(src.match(/delivered:\s*sent === "posted"/g) ?? []).toHaveLength(3);
    // And a truthiness test on the status string would finalise a failed claim.
    expect(src).not.toMatch(/if \(delivered\)\s*await markVerified/);
  });
});
