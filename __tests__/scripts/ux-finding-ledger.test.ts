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

// @ts-expect-error -- .mjs helper, no types
import { redactReportToken } from "../../scripts/lib/redact-report-token.mjs";

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

/**
 * A REPORT TOKEN IS A CREDENTIAL, AND THE LEDGER WAS STORING IT.
 *
 * `/report/<token>` is how a paid report is opened: the token IS the auth, it
 * does not expire, and the report is an intimate psychological profile.
 * `ux_finding.url_path` held the live path verbatim — 14 rows carrying 13
 * distinct working tokens by 2026-09-20, three days after the table was
 * created, one more with every report finding.
 *
 * The probe still gets the real path inside the run; only what is PERSISTED is
 * redacted. The ledger needs the shape of the page, never the key to it.
 */
describe("the ledger never stores a report token", () => {
  it("redacts the token and keeps the shape", () => {
    expect(redactReportToken("/report/rpt_Ey6yShdpUPQmOUvbZrti")).toBe("/report/<redacted>");
    expect(redactReportToken("/report/rpt_abc123?archetype=spiritual-lover")).toBe(
      "/report/<redacted>?archetype=spiritual-lover"
    );
    // The fragment is where the most sensitive part of the URL lives.
    expect(redactReportToken("/report/rpt_abc#typical_sexual_fantasy")).toBe(
      "/report/<redacted>#typical_sexual_fantasy"
    );
  });

  it("leaves every other path alone", () => {
    // Redacting more than the credential would blind the digest's "where did
    // this happen" line, which is the whole value of the column.
    expect(redactReportToken("/survey")).toBe("/survey");
    expect(redactReportToken("/")).toBe("/");
    expect(redactReportToken("/reports/overview")).toBe("/reports/overview");
    expect(redactReportToken(null)).toBe(null);
    expect(redactReportToken(undefined)).toBe(undefined);
  });

  it("is actually applied to what gets written", () => {
    // The function existing proves nothing; a mutation removing the call at the
    // write sites has to fail. Both recordFinding calls must use it.
    const src = readFileSync(resolve(process.cwd(), "scripts/verify-ux-findings.mjs"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    const writes = src.match(/url_path:/g) ?? [];
    const redacted = src.match(/url_path: redactReportToken\(/g) ?? [];
    expect(writes.length, "there should be url_path writes to check").toBeGreaterThan(0);
    expect(redacted.length, "every url_path write must be redacted").toBe(writes.length);

    /**
     * probe_runs[].tail, the sibling column this fix originally missed.
     *
     * `verify-dead-click-target.mjs` prints "what this reader tapped at
     * /report/rpt_…" and that line is stored verbatim. One live token was
     * already in the table this way while url_path beside it was clean —
     * redacting one column of a row and not the next is not a fix.
     */
    const tails = src.match(/tail: [^,\n]*String\(r\.tail/g) ?? [];
    const tailsRedacted = src.match(/tail: redactReportToken\(String\(r\.tail/g) ?? [];
    expect(tails.length, "there should be a probe_runs tail write to check").toBeGreaterThan(0);
    expect(tailsRedacted.length, "every probe_runs tail must be redacted").toBe(tails.length);
  });

  /**
   * The greedy-match bug, pinned.
   *
   * `[^/?#]+` ended only at a URL delimiter, so applied to a sentence it ate
   * everything after the token too — the verdict word included. Harmless while
   * this only ever saw bare paths; destructive the moment it was pointed at
   * probe output, which is exactly what it is now used for.
   */
  it("catches the token as a QUERY PARAMETER too", () => {
    /**
     * `/checkout?plan=…&token=rpt_…` is the other shape the token travels in —
     * 403 of the 2,424 rows found in `analytics_event` are that form, and a
     * probe tail can quote a checkout URL just as easily as a report one. A
     * guard keyed on `/report/` leaves them and still reports success.
     */
    expect(redactReportToken("/checkout?plan=all_reports&token=rpt_a9LY0Obbla1FVsclJ1nM")).toBe(
      "/checkout?plan=all_reports&token=rpt_<redacted>"
    );
    // The page and the plan are the analytical value and must survive.
    expect(
      redactReportToken("/checkout?plan=all_reports&token=rpt_aaaaaaaaaaaaaaaaaaaa")
    ).toContain("plan=all_reports");
    // A checkout with no token is untouched.
    expect(redactReportToken("/checkout?plan=all_reports")).toBe("/checkout?plan=all_reports");
  });

  it("redacts inside a sentence without eating the sentence", () => {
    const tail = "PASS — what this reader tapped at /report/rpt_a9LY0Obbla1FVsclJ1nM behaves";
    const out = redactReportToken(tail);
    expect(out).toBe("PASS — what this reader tapped at /report/<redacted> behaves");
    expect(out).not.toMatch(/rpt_[A-Za-z0-9]{6,}/);

    // Two in one line, which a multi-device tail really can carry.
    expect(redactReportToken("a /report/rpt_aaaaaaaaaa b /report/rpt_bbbbbbbbbb c")).toBe(
      "a /report/<redacted> b /report/<redacted> c"
    );
  });
});
