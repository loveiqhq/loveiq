/**
 * The merge click is the only signal in this pipeline that does not come from
 * our own machinery judging itself, and it was never collected: measured
 * 2026-09-19, the ledger held 37 findings and 0 human labels.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = readFileSync(resolve(process.cwd(), "scripts/label-findings-from-prs.mjs"), "utf8");

/**
 * Comments stripped before asserting on CODE.
 *
 * The first version of the `state === "closed"` assertion failed against a
 * correct script, because the comment ABOVE that line explains the trap and
 * quotes the very string being searched for. A source test that matches prose
 * is a source test that reports on the wrong thing in both directions.
 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
const WORKFLOW = readFileSync(
  resolve(process.cwd(), ".github/workflows/ux-review-verify.yml"),
  "utf8"
);

describe("labelling findings from pull requests", () => {
  /**
   * The inversion that would have made this worse than useless. GitHub reports
   * a MERGED pull request as `state: "closed"` too, so reading state alone
   * labels every merge a disagreement — training the score on the exact
   * opposite of the truth.
   */
  it("reads `merged`, never `state === closed`", () => {
    expect(CODE).toContain("pr.merged");
    expect(CODE).not.toMatch(/state\s*===\s*["']closed["']/);
  });

  it("uses the vocabulary the ledger actually permits", () => {
    // human_label is CHECK-constrained to 'agree' / 'disagree'. The first
    // version wrote 'real' / 'false_alarm' and every write was refused with a
    // 400 — caught by running it, not by reading it.
    expect(CODE).toContain('pr.merged ? "agree" : "disagree"');
    expect(CODE).not.toContain("false_alarm");
  });

  it("is dry unless --write is passed", () => {
    expect(SRC).toContain('process.argv.includes("--write")');
    expect(SRC).toMatch(/if \(WRITE\)/);
  });

  it("only touches findings that have no label yet", () => {
    // Re-labelling on every 3-hourly run would overwrite a human's later
    // correction with whatever GitHub currently says.
    expect(SRC).toContain("human_label=is.null");
  });

  it("leaves an open pull request alone", () => {
    expect(SRC).toMatch(/pr\.state === "open"/);
  });

  it("fails loudly rather than silently skipping a refused write", () => {
    expect(SRC).toMatch(/FAILED to label/);
    expect(SRC).toMatch(/process\.exit\(2\)/);
  });

  it("runs in CI", () => {
    expect(WORKFLOW).toContain("node scripts/label-findings-from-prs.mjs --write");
  });
});
