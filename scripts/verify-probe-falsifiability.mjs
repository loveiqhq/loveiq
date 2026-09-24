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
 * TWO CHECKS, TWO COSTS.
 *
 *   --contract-only   every GATE probe, pointed at a refused connection, must
 *                     exit 3. Seconds, because the connection fails instantly.
 *   (default)         the above, then every AUTO-PR probe run with its own
 *                     defect injected across its real device list. Minutes.
 *
 * The contract check exists because an uncaught throw exits 1, and the verifier
 * reads 1 as "the defect reproduced". Six gate probes did exactly that on
 * 2026-09-17, two of them on criteria allowed to open a pull request, and the
 * stdout backstop does not catch it: a Playwright stack says
 * "net::ERR_CONNECTION_REFUSED", which matches neither "INCONCLUSIVE" nor
 * "exception:".
 *
 *   npx tsx scripts/verify-probe-falsifiability.mjs
 *   npx tsx scripts/verify-probe-falsifiability.mjs --contract-only
 *
 * `tsx`, not `node`: this imports replay-pr.mjs, which imports review.ts and
 * its `@shared/*` path aliases. Under plain node it dies at import with
 * "Cannot find package '@shared/http'" before running a single probe, which
 * reads exactly like the whole corpus being broken. probe-guard.yml has always
 * used tsx; only this usage block was wrong.
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

const CONTRACT_ONLY = process.argv.includes("--contract-only");

const probes = criteriaProbes();

/**
 * Every probe a criterion points at, deduplicated. Wider than the auto-PR set
 * on purpose: a false "reproduced" is wrong wherever it lands, it is only
 * costlier when it can open a pull request.
 */
function appendedProbes() {
  // verify-dead-click-target.mjs is added by the SESSION rather than listed
  // under a criterion, so criteriaProbes() cannot see it — and it runs for D1,
  // which may open a pull request.
  const src = readFileSync(VERIFIER, "utf8");
  return [
    ...[...src.matchAll(/probeFiles\.push\("([^"]+)"\)/g)].map((m) => m[1]),
    // replay-session.mjs is appended to the RESULTS rather than to probeFiles,
    // so the pattern above cannot see it. Left out, the one probe that drives a
    // whole visit would be the only one never checked for the contract.
    ...[...src.matchAll(/runProbe\("([^"]+)"/g)].map((m) => m[1]),
    // `_`-prefixed files are fixtures, not probes. `_selftest-exit.mjs` exists
    // to return a chosen exit code to the verifier's own selftest, so it exits
    // 0 on an unreachable site by design and reported a contract breach the
    // moment this list started reading runProbe() call sites.
  ].filter((f) => !f.startsWith("_"));
}

/**
 * Probes the daily probe-guard job runs directly. They are gates too — the
 * job fails on their exit 1 — so they owe the same contract, and until
 * 2026-09-24 nothing held them to it: this list was read from the verifier
 * alone, so verify-icon-label-gap, shipped the day before, was never checked.
 */
function guardProbes() {
  const src = readFileSync(".github/workflows/probe-guard.yml", "utf8");
  return [...src.matchAll(/scripts\/probes\/(verify-[\w-]+\.mjs)/g)].map((m) => m[1]);
}

const gateProbes = [
  ...new Set([...[...probes.values()].flat(), ...appendedProbes(), ...guardProbes()]),
].sort();

let contractBreaches = 0;
for (const file of gateProbes) {
  let code = 0;
  try {
    execFileSync("node", [`scripts/probes/${file}`], {
      encoding: "utf8",
      timeout: 120_000,
      env: {
        ...process.env,
        // Refused instantly, so this costs about a second per probe.
        REPORT_ORIGIN: "http://localhost:1",
        DEVICES: "Pixel 7",
        DEVICE: "Pixel 7",
        WIDTHS: "320",
        URL_PATH: "/survey",
        TARGET_SELECTOR: "p.probe-contract-check",
        // A route for replay-session.mjs. Without one it exits 3 before it
        // tries to reach the site, which would pass this check vacuously.
        REPLAY_STEPS: "scroll_depth_25",
      },
    });
  } catch (err) {
    code = typeof err.status === "number" ? err.status : -1;
  }
  const ok = code === 3;
  if (!ok) contractBreaches += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"} contract ${file.padEnd(38)} unreachable origin -> exit ${code}` +
      (ok ? "" : "  <- must be 3; 1 means a defect nobody measured")
  );
}
console.log("");
if (contractBreaches > 0) {
  console.log(
    `FAIL (${contractBreaches}) — a probe reports a defect when it cannot reach the site at all`
  );
  process.exit(1);
}
console.log(
  `PASS — all ${gateProbes.length} gate probes stay inconclusive when the site is unreachable`
);

if (CONTRACT_ONLY) process.exit(0);
console.log("");
/**
 * Probes that need an input before they can do anything.
 *
 * `verify-dead-click-target.mjs` is handed the page and element from the
 * session's own dead_click event, and exits 3 without them — correctly, but
 * that made it untestable here. `main` rather than a real dead-click target
 * like `p.font-sans`: the question is whether the probe can report a defect at
 * all, and `main` survives a markup change that would turn this check red for
 * the wrong reason.
 */
const PROBE_ENV = {
  "verify-dead-click-target.mjs": { URL_PATH: "/survey", TARGET_SELECTOR: "main" },
};

const targets = [];
// Appended probes count. verify-dead-click-target runs for D1, which may open a
// pull request, and it is not listed under a criterion — so the loop below
// could not see it, and its MUTATE had never been run once. It was broken:
// setting aria-disabled on the decoration these targets usually are does
// nothing, so it exited 0 with its own defect injected.
for (const file of appendedProbes()) {
  const src = readFileSync(`scripts/probes/${file}`, "utf8");
  if (src.includes("MUTATE")) targets.push({ id: "appended", file });
}
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
          ...(PROBE_ENV[file] ?? {}),
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
