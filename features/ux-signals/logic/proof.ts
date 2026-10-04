/**
 * When a signal's measure has earned being shown: checked against persona walks, where what
 * really happened is known, and right often enough.
 *
 * Each walk stores its events and what it knows it did (scripts/walkers/check-signals.ts).
 * The measure is run again here, on every read, over every stored walk. So a measure that
 * changes is judged at once on all the walks there are, never on a verdict the old code gave.
 */
import { SIGNALS, type SignalDef, type SignalValue, type UxVisit } from "./signals";

/** The bar Eman set on 2026-09-30: right at least 80% of the time. */
export const PROOF_SHARE = 0.8;
/** Fewer cases than this proves nothing either way. */
export const PROOF_MIN_CASES = 10;
/** For a signal with a rare outcome, the fewest cases of each side. */
export const PROOF_MIN_EACH_SIDE = 3;

/** One walk as stored: its events, and the value of each signal it knows the truth of. */
export interface WalkRecord {
  walk: string;
  walkedAt: string;
  events: UxVisit;
  truth: Record<string, SignalValue>;
}

/** Durations agree within a second or a fifth, whichever is larger. */
const TOLERANCE: Partial<Record<string, { ms: number; share: number }>> = {
  // A median of answers a few seconds long: a whole second would hide a real error.
  "Step completion time": { ms: 400, share: 0.15 },
};

/** Whether what the measure said matches what the walk knows. */
export function agrees(def: SignalDef, truth: SignalValue, measured: SignalValue | null): boolean {
  if (measured === null) return false;
  if (def.kind === "duration" && typeof truth === "number" && typeof measured === "number") {
    const tol = TOLERANCE[def.name] ?? { ms: 1000, share: 0.2 };
    return Math.abs(measured - truth) <= Math.max(tol.ms, tol.share * truth);
  }
  return measured === truth;
}

interface Tally {
  cases: number;
  right: number;
}

export interface Proof {
  signal: string;
  /** Shown only when true. */
  proven: boolean;
  cases: number;
  right: number;
  /** For signals with a rare outcome: the behaviour happening, and not happening. */
  positives?: Tally;
  negatives?: Tally;
  /** Distinct true values seen, so a measure never tested on variety is not "proven". */
  variety: number;
  /** Why, in one plain sentence. */
  why: string;
  /** The first few walks it got wrong, for whoever fixes the measure. */
  misses: Array<{ walk: string; truth: SignalValue; measured: SignalValue | null }>;
}

const pct = (t: Tally) => (t.cases ? Math.round((100 * t.right) / t.cases) : 0);

export function prove(def: SignalDef, walks: readonly WalkRecord[]): Proof {
  const all: Tally = { cases: 0, right: 0 };
  const pos: Tally = { cases: 0, right: 0 };
  const neg: Tally = { cases: 0, right: 0 };
  const seen = new Set<string>();
  const misses: Proof["misses"] = [];
  for (const w of walks) {
    if (!(def.name in w.truth) || !def.measure) continue;
    const truth = w.truth[def.name]!;
    const measured = def.measure(w.events);
    const ok = agrees(def, truth, measured);
    all.cases += 1;
    if (ok) all.right += 1;
    else if (misses.length < 5) misses.push({ walk: w.walk, truth, measured });
    seen.add(def.kind === "duration" && typeof truth === "number" ? "number" : String(truth));
    if (def.positive) {
      const side = def.positive(truth) ? pos : neg;
      side.cases += 1;
      if (ok) side.right += 1;
    }
  }
  const base = {
    signal: def.name,
    cases: all.cases,
    right: all.right,
    ...(def.positive ? { positives: pos, negatives: neg } : {}),
    variety: seen.size,
    misses,
  };
  const fail = (why: string): Proof => ({ ...base, proven: false, why });

  if (def.missing) return fail(`Cannot be measured yet: ${def.missing}`);
  if (all.cases < PROOF_MIN_CASES) {
    return fail(
      `Tested on ${all.cases} walk${all.cases === 1 ? "" : "s"} so far; it needs ${PROOF_MIN_CASES}.`
    );
  }
  if (def.positive) {
    if (pos.cases < PROOF_MIN_EACH_SIDE || neg.cases < PROOF_MIN_EACH_SIDE) {
      return fail(
        `Needs at least ${PROOF_MIN_EACH_SIDE} walks where it happened and ${PROOF_MIN_EACH_SIDE} where it did not; has ${pos.cases} and ${neg.cases}.`
      );
    }
    // Both sides, or a measure that always says "nothing" would pass on the quiet walks.
    if (pos.right < PROOF_SHARE * pos.cases || neg.right < PROOF_SHARE * neg.cases) {
      return fail(
        `Right on ${pct(pos)}% of the walks where it happened and ${pct(neg)}% where it did not; both must be ${PROOF_SHARE * 100}%.`
      );
    }
  } else {
    // A duration varies by itself; anything else must be tried on more than one answer.
    if (def.kind !== "duration" && seen.size < 2) {
      return fail(
        "Every walk so far had the same true value, so it has not been tested on variety."
      );
    }
    if (all.right < PROOF_SHARE * all.cases) {
      return fail(`Right on ${pct(all)}% of ${all.cases} walks; it must be ${PROOF_SHARE * 100}%.`);
    }
  }
  return {
    ...base,
    proven: true,
    why: `Right on ${all.right} of ${all.cases} walks (${pct(all)}%).`,
  };
}

/** Every signal's proof over the stored walks. */
export function proveAll(walks: readonly WalkRecord[]): Proof[] {
  return SIGNALS.map((s) => prove(s, walks));
}
