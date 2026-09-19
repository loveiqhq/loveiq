/**
 * Does the brain's arithmetic agree with itself?
 *
 * Three defects shipped in the daily conversion digest and survived for months in data
 * this system already held: staff sandbox purchases counted as sales, two charts drawing
 * the same arms in opposite colours, and a funnel whose heading covered rows it did not
 * describe. Nothing noticed, because nothing ever computed the same quantity twice.
 *
 * Each check below derives ONE number two independent ways. Agreement is silence; only a
 * disagreement is worth a person's attention. That asymmetry is the whole design — a
 * reconciler that reports its successes becomes a daily message nobody opens, which is how
 * `funnel-digest` was unscheduled for being FYI-only.
 *
 * Pure on purpose: every check takes numbers already fetched and returns findings, so the
 * thresholds can be tested without a database. A reconciler that has never been SEEN to
 * fire is indistinguishable from a broken one.
 */

export interface Reading {
  /** What is being counted, in words a person would use. */
  what: string;
  /** Where each number came from, and what it says. */
  left: { source: string; value: number };
  right: { source: string; value: number };
  /**
   * How far apart the two may legitimately sit.
   *
   * Not always zero. A cohort followed forward and an event-day count differ by whoever
   * crossed the boundary between them, and calling that a defect every morning would train
   * the reader to ignore the message. Zero means "these must match exactly".
   */
  tolerance: number;
  /** Why they can differ at all, printed when they do, so the reader is not sent guessing. */
  because?: string;
}

export interface Disagreement {
  what: string;
  detail: string;
  gap: number;
}

export function reconcile(readings: Reading[]): Disagreement[] {
  const out: Disagreement[] = [];
  for (const r of readings) {
    const gap = Math.abs(r.left.value - r.right.value);
    if (gap <= r.tolerance) continue;
    out.push({
      what: r.what,
      gap,
      detail:
        `${r.what}: ${r.left.source} says ${r.left.value}, ${r.right.source} says ` +
        `${r.right.value} — a gap of ${gap}` +
        (r.tolerance > 0 ? ` against a tolerance of ${r.tolerance}` : "") +
        (r.because ? `. ${r.because}` : ""),
    });
  }
  return out;
}

/**
 * One message for however many disagreements there are, because four separate alerts about
 * one bad number is how a channel gets muted.
 */
export function summarise(found: Disagreement[], checked: number): string | null {
  if (found.length === 0) return null;
  const lines = found.map((f) => `• ${f.detail}`).join("\n");
  return (
    `${found.length} of ${checked} cross-checks disagree.\n${lines}\n\n` +
    "Each of these is one number derived two ways. A gap means one of the two paths is " +
    "wrong, not that the business moved."
  );
}
