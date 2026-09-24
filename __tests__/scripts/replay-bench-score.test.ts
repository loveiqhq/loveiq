import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { replayAlone } from "@/scripts/lib/claim-scoped-probes.mjs";
import { confirmedByReplayAlone } from "@features/ux-review/server/review";

/**
 * Two copies of one rule: score.mjs runs under plain node in probe-guard and
 * cannot import the TypeScript original. If they disagree, the precision gate
 * and the digest would judge the same row differently.
 */
describe("the scorer and the digest hold the same replay-only rows", () => {
  const run = (file: string, passed: boolean, inconclusive = false) => ({
    file,
    passed,
    inconclusive,
  });
  const cases = [
    null,
    [],
    [run("replay-session.mjs", false)],
    [run("replay-session.mjs", false, true)],
    [run("verify-tap-targets.mjs", true), run("replay-session.mjs", false)],
    [run("verify-tap-targets.mjs", false), run("replay-session.mjs", false)],
    [run("paywall-exit-log", false)],
  ];

  it.each(cases.map((c, i) => [i, c]))("case %i", (_i, runs) => {
    expect(replayAlone(runs)).toBe(confirmedByReplayAlone(runs));
  });
});

describe("the precision gate reads the columns its rules need", () => {
  it("asks the ledger for the label and the probe runs", () => {
    // Dropped from select=, both read as undefined and the gate silently goes
    // back to scoring a closed-as-wrong reproduction as the scanner being right.
    const src = readFileSync(resolve(process.cwd(), "scripts/replay-bench/score.mjs"), "utf8");
    const query = src.slice(src.indexOf("rest/v1/ux_finding?select="), src.indexOf("&outcome=in."));
    expect(query).toMatch(/probe_runs/);
    expect(query).toMatch(/human_label/);
  });
});
