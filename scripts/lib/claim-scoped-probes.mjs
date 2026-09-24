import { pathToFileURL } from "node:url";

/**
 * Which probes can actually speak to the finding that triggered them.
 *
 * Split out of verify-ux-findings.mjs for the same reason challenger-pairs.mjs
 * and session-devices.mjs were: that file imports TypeScript and needs `tsx`,
 * while scripts/replay-bench/score.mjs runs under plain `node`. Restating the
 * list in both is the drift this repo has already paid for twice.
 *
 * WHAT EARNS MEMBERSHIP. The probe must read something the SCANNER CLAIMED, so
 * that its answer can differ between two findings. Today that means URL_PATH
 * and TARGET_SELECTOR — the page this reader was on and the element they hit,
 * taken from our own dead_click/rage_click events for THIS session.
 *
 * Every other probe opens the same canonical page and asserts the same fixed
 * proposition, taking only the device list from the finding. Its verdict is a
 * constant with respect to the claim: the same PASS comes back whoever raised
 * it and whether or not anything was wrong. Useful as a regression test; not
 * evidence that this scanner was wrong about this session.
 *
 * Measured 2026-09-21 on the 21 L1 report findings — both L1 probes pass
 * MUTATE=1, both returned clean 19/19, and neither reads the claim.
 */
export const CLAIM_SCOPED_PROBES = new Set(["verify-dead-click-target.mjs"]);

/**
 * Claim-scoped through the SESSION rather than through a tapped element.
 *
 * `replay-session.mjs` reads this reader's own ordered event stream and
 * performs it. Two findings on two sessions therefore get two different runs,
 * which is the whole test for membership — its answer can differ, so a clean
 * one is evidence rather than a constant.
 *
 * Separate from CLAIM_SCOPED_PROBES because that set is appended only when our
 * telemetry recorded a click target, and this one needs no such thing: every
 * finding has a session.
 */
export const SESSION_REPLAY_PROBES = new Set(["replay-session.mjs"]);

/**
 * Was the replay the only thing that confirmed it? Such a row waits for a
 * person rather than counting as the scanner being right.
 *
 * The twin of `confirmedByReplayAlone` in features/ux-review/server/review.ts,
 * restated because score.mjs runs under plain node and cannot import
 * TypeScript. __tests__/scripts/replay-bench-score.test.ts holds the two to
 * one answer.
 */
export function replayAlone(runs) {
  const failed = (runs ?? []).filter((r) => r.passed === false && !r.inconclusive);
  return failed.length > 0 && failed.every((r) => SESSION_REPLAY_PROBES.has(r.file));
}

/**
 * Did this run include a probe that could have disagreed?
 *
 * Two sources, in order:
 *
 *  - `claimScoped`, stamped on every run since 2026-09-21. Authoritative,
 *    including when it is explicitly `false`.
 *  - the probe's FILE NAME, for rows written before that stamp existed. 22 of
 *    the 87 historical `clear` rows really did run verify-dead-click-target
 *    against the reader's own element, and treating them as unmeasured would
 *    throw away the only claim-scoped evidence the ledger has ever held. The
 *    probe is appended only when a click target was found, so its presence in
 *    probe_runs is itself the proof that one was.
 */
export const clearIsGroundTruth = (finding) =>
  Array.isArray(finding?.probe_runs) &&
  finding.probe_runs.some((r) =>
    r?.claimScoped === undefined
      ? CLAIM_SCOPED_PROBES.has(r?.file) || SESSION_REPLAY_PROBES.has(r?.file)
      : r.claimScoped === true
  );

/**
 * ONLY when this file is what was run.
 *
 * A bare `process.argv.includes("--selftest")` fires on IMPORT too, and this
 * module is imported by verify-ux-findings.mjs — whose CI gate is
 * `tsx scripts/verify-ux-findings.mjs --selftest`. ESM evaluates imports before
 * the importing module's body, so the block below ran first and its
 * `process.exit(0)` ended the process before the verifier's own selftest
 * existed. Verified by breaking a classifier case: the run still printed
 * "selftest ok" and exited 0. A gate that cannot fail is the exact thing this
 * whole change is about, so it does not get to be introduced by its own fix.
 */
if (
  process.argv.includes("--selftest") &&
  import.meta.url === pathToFileURL(process.argv[1] ?? "").href
) {
  const cases = [
    // No probe_runs at all, and a non-array: both must be treated as unmeasured
    // rather than throwing.
    [{}, false],
    [{ probe_runs: null }, false],
    [{ probe_runs: [] }, false],
    // Unscoped probes only — the L1 report findings.
    [{ probe_runs: [{ file: "verify-no-survey-restart.mjs" }] }, false],
    [{ probe_runs: [{ file: "verify-survey-loop.mjs", claimScoped: false }] }, false],
    // The historical fallback: no flag, but the claim-scoped probe is named.
    [{ probe_runs: [{ file: "verify-dead-click-target.mjs" }] }, true],
    // Mixed, which is the real shape of a D1 run.
    [
      {
        probe_runs: [{ file: "verify-tap-targets.mjs" }, { file: "verify-dead-click-target.mjs" }],
      },
      true,
    ],
    // An EXPLICIT false must beat the file name, or the fallback silently
    // overrides the thing it is a fallback for.
    [{ probe_runs: [{ file: "verify-dead-click-target.mjs", claimScoped: false }] }, false],
    [{ probe_runs: [{ file: "verify-no-survey-restart.mjs", claimScoped: true }] }, true],
  ];
  let bad = 0;
  for (const [row, want] of cases) {
    if (clearIsGroundTruth(row) !== want) {
      console.error(`FAIL ${JSON.stringify(row)} → ${clearIsGroundTruth(row)}, wanted ${want}`);
      bad += 1;
    }
  }
  console.log(bad === 0 ? "claim-scoped-probes selftest ok" : `FAILED (${bad})`);
  process.exit(bad === 0 ? 0 : 1);
}
