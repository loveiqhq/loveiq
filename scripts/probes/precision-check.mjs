/**
 * Probe PRECISION: how often a probe claims a defect that is not one.
 *
 * Everything else in this repo measures the scanners. Nothing measured the
 * probes — and the probes are the thing the pipeline actually trusts. A scanner
 * being wrong costs CI minutes, because a probe gates it. A PROBE being wrong
 * posts a verdict into a reader's thread and, for the criteria in
 * AUTO_PR_CRITERIA, opens a draft pull request.
 *
 * The two existing guards do not cover this direction:
 *
 *   probe-guard.yml (daily)  — probes run against a healthy production. A probe
 *                              given no target exits 3 and looks fine.
 *   falsifiability (weekly)  — MUTATE=1 proves a probe CAN fail. It says
 *                              nothing about whether it fails on the wrong
 *                              things.
 *
 * On 2026-09-19 verify-dead-click-target reported the survey consent gate as a
 * dead control. The button is deliberately disabled until both consent boxes
 * are ticked — correct behaviour, reproduced convincingly, and D1 is in
 * AUTO_PR_CRITERIA. Both jobs above were green. It was caught by hand.
 *
 * So: a corpus of inputs that are NOT defects, and the rule that every probe
 * must answer 0 or 3 on all of them. Exit 1 on any case is a false positive and
 * the run fails loudly, because that is the number that decides whether this
 * pipeline can be trusted without someone reading every verdict.
 *
 *   node scripts/probes/precision-check.mjs
 *   REPORT_ORIGIN=http://localhost:3000 node scripts/probes/precision-check.mjs
 *
 * Exit 0 every case clean · 1 a probe claimed a defect that is not one ·
 * 2 could not measure (cases unreadable).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

let cases;
try {
  cases = JSON.parse(readFileSync(join(HERE, "_known-good.json"), "utf8")).cases;
} catch (err) {
  console.error(`could not read the known-good corpus: ${err.message}`);
  process.exit(2);
}
if (!Array.isArray(cases) || cases.length === 0) {
  console.error("the known-good corpus is empty — nothing would be measured");
  process.exit(2);
}

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
console.log(`probe precision — ${cases.length} inputs that are NOT defects, against ${ORIGIN}\n`);

let falsePositives = 0;
let unmeasured = 0;

for (const c of cases) {
  let code = 0;
  let out = "";
  try {
    out = execFileSync("node", [join(HERE, c.probe)], {
      encoding: "utf8",
      timeout: 10 * 60_000,
      env: { ...process.env, REPORT_ORIGIN: ORIGIN, ...c.env },
    });
  } catch (err) {
    code = err.status ?? 1;
    out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }
  const target = c.env?.TARGET_SELECTOR ? ` ${c.env.TARGET_SELECTOR}` : "";
  const label = `${c.probe}${target}`;
  if (code === 1) {
    falsePositives += 1;
    console.log(`FALSE POSITIVE  ${label}`);
    console.log(`                this is not a defect: ${c.why}`);
    console.log(`                ${out.trim().split("\n").slice(-2).join(" | ")}`);
  } else if (code === 3) {
    unmeasured += 1;
    console.log(`inconclusive    ${label}`);
  } else if (code === 0) {
    console.log(`ok              ${label}`);
  } else {
    // Any other code is the probe itself breaking, which is not a precision
    // result and must not be counted as one.
    unmeasured += 1;
    console.log(`ERRORED (${code})     ${label}`);
  }
}

const measured = cases.length - unmeasured;
console.log(
  `\n${falsePositives} false positive(s) of ${measured} measured ` +
    `(${unmeasured} inconclusive, not counted either way)`
);

if (falsePositives > 0) {
  console.log(
    `\nA probe claimed a defect on an input that is not one. Until it is fixed, ` +
      `a verdict from it is a claim nobody should act on unreviewed.`
  );
  process.exit(1);
}
if (measured === 0) {
  console.log("\nnothing could be measured — precision is unknown, not clean");
  process.exit(2);
}
console.log("\nclean — no probe claimed a defect that is not one");
process.exit(0);
