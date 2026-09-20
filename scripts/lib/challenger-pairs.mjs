/**
 * Pair each challenger scanner with the champion it is being tried against.
 *
 * SPLIT OUT SO IT CAN BE TESTED. `scripts/replay-bench/score.mjs` runs its
 * whole flow as top-level statements — importing it reads `.env.local` and
 * queries PostHog — so nothing could exercise this in place. It is the report
 * that decides whether an experiment is working, and it only renders once a
 * challenger has findings, which is exactly when a silent bug in it costs most.
 *
 * The pairing is by NAME, because `scanner_name` is the only thing a
 * `$recording_observed` event carries and the ledger scores by it. A challenger
 * is named `"<champion name> (challenger: …)"`; see
 * `features/ux-review/server/scanners.ts`.
 *
 * This module has no side effects on import.
 */

/** `"LoveIQ report UX (challenger: observation only)"` -> `"LoveIQ report UX"`. */
const CHALLENGER_NAME = /^(.*) \(challenger[^)]*\)$/;

/**
 * @param {Map<string, {right: number, wrong: number, contradicted?: number}>} byScanner
 * @returns {Array<{base: string, champion: object, challenger: object}>}
 */
export function championChallengerPairs(byScanner) {
  const pairs = [];
  for (const [name, challenger] of byScanner) {
    const m = CHALLENGER_NAME.exec(name);
    if (!m) continue;
    // No champion means nothing to compare against. Substituting a zero
    // baseline would hand the challenger a win it never earned.
    const champion = byScanner.get(m[1]);
    if (champion) pairs.push({ base: m[1], champion, challenger });
  }
  return pairs;
}
