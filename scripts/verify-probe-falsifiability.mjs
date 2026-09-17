/**
 * Prove that the probes allowed to open a pull request can actually fail.
 *
 * WHY A SCRIPT AND NOT A UNIT TEST. `__tests__/scripts/auto-pr-criteria.test.ts`
 * asserts that an auto-PR probe's source contains "MUTATE". That is a proxy, and
 * on 2026-09-17 the proxy was wrong: `verify-consent-return.mjs` carried a
 * MUTATE block that polled every 100ms to bind a listener to a button, which is
 * a race against the tap that follows. Measured over three runs it lost one, so
 * MUTATE=1 exited 0 — the probe claimed to be falsifiable and was not, while B1
 * sat in AUTO_PR_CRITERIA.
 *
 * The only honest check is to run the thing. A probe that PASSES with its own
 * defect injected is measuring nothing, and a clean result from it means
 * nothing either.
 *
 *   node scripts/verify-probe-falsifiability.mjs
 *   RUNS=3 ...      # repeat each probe, to catch a flaky mutation like the above
 *   DEVICES=…       # narrow the device list for speed
 *
 * Exit 0 every probe failed as it should · 1 one did not · 3 nothing to check.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { AUTO_PR_CRITERIA } from "./lib/replay-pr.mjs";

const RUNS = Math.max(1, Number(process.env.RUNS ?? 1));
/**
 * Do NOT pick a device for the probe.
 *
 * The first version defaulted to "Pixel 7" for speed and reported
 * `verify-consent-banner-clearance.mjs` as unfalsifiable. It is not: Pixel 7 has
 * an 839px viewport, the one device where the CTA already clears the consent
 * banner, so removing the reserved space changes nothing there. A probe's own
 * default list is chosen so its mutation means something; overriding it tests a
 * scenario its author never claimed.
 */
const DEVICES = process.env.DEVICES ?? null;
const VERIFIER = "scripts/verify-ux-findings.mjs";

/** criterion id -> probe files, read from the verifier's own CRITERIA list. */
function criteriaProbes() {
  const src = readFileSync(VERIFIER, "utf8");
  const out = new Map();
  const re = /id:\s*"([A-Z]\d)",[\s\S]*?probes:\s*\[([\s\S]*?)\]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    out.set(
      m[1],
      m[2]
        .split(",")
        .map((p) => p.trim().replace(/^"|"$/g, ""))
        .filter(Boolean)
    );
  }
  return out;
}

const probes = criteriaProbes();
const targets = [];
for (const id of AUTO_PR_CRITERIA) {
  for (const file of probes.get(id) ?? []) {
    const src = readFileSync(`scripts/probes/${file}`, "utf8");
    // A probe with no MUTATE mode is not checked here — the unit test already
    // requires at least one per criterion, and inventing a mutation for it in
    // this script would be testing a thing nobody wrote.
    if (!src.includes("MUTATE")) continue;
    if (!targets.some((t) => t.file === file)) targets.push({ id, file });
  }
}

if (targets.length === 0) {
  console.log("INCONCLUSIVE — no auto-PR probe declares a MUTATE mode");
  process.exit(3);
}

let unfalsifiable = 0;
for (const { id, file } of targets) {
  const codes = [];
  for (let i = 0; i < RUNS; i += 1) {
    let code = 0;
    try {
      execFileSync("node", [`scripts/probes/${file}`], {
        encoding: "utf8",
        timeout: 10 * 60_000,
        env: {
          ...process.env,
          MUTATE: "1",
          ...(DEVICES ? { DEVICES } : {}),
          REPORT_ORIGIN: process.env.REPORT_ORIGIN ?? "https://www.loveiq.org",
        },
      });
    } catch (err) {
      code = typeof err.status === "number" ? err.status : -1;
    }
    codes.push(code);
  }
  // Every run must report the defect. One pass in three is what made the B1
  // mutation useless, so "mostly fails" is not the bar.
  const ok = codes.every((c) => c === 1);
  if (!ok) unfalsifiable += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${id} ${file.padEnd(38)} exit codes with the defect injected: ${codes.join(",")}` +
      (ok ? "" : "  <- must be 1 every time")
  );
}

console.log("");
if (unfalsifiable > 0) {
  console.log(
    `FAIL (${unfalsifiable}) — a probe that may open a pull request passed with its own defect injected`
  );
  process.exit(1);
}
console.log(`PASS — all ${targets.length} auto-PR probes report their own defect`);
