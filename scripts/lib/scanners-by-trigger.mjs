/**
 * Map each trigger event to EVERY scanner watching it.
 *
 * SPLIT OUT SO IT CAN BE TESTED. `scripts/ux-review-coverage.mjs` runs its
 * whole flow as top-level statements, so importing it queries PostHog and
 * Supabase.
 *
 * This was a plain `Map` holding one scanner per trigger, so the last one
 * declared won. Harmless while each trigger had exactly one scanner, and broken
 * the moment a challenger joined `report_viewed` on 2026-09-20: the challenger
 * silently displaced `LoveIQ report UX`, so a coverage gap was re-queued to the
 * EXPERIMENT and never to the scanner that speaks to the team. Those readers
 * then stay MISSED for good — the coverage figure counts production
 * observations only, and rightly — while every run spends challenger credits on
 * a gap it cannot close.
 *
 * Returning all of them also keeps the champion/challenger comparison honest:
 * the two are comparable only while they see the same recordings, and a
 * re-queue that picked one would quietly pull them apart.
 *
 * This module has no side effects on import.
 *
 * @param {Array<{id: string, name: string, query?: {events?: Array<{id?: string}>}}>} scannerList
 * @returns {Map<string, Array<object>>}
 */
export function scannersByTrigger(scannerList) {
  const byTrigger = new Map();
  for (const sc of scannerList ?? []) {
    for (const ev of sc?.query?.events ?? []) {
      if (!ev?.id) continue;
      const key = String(ev.id);
      byTrigger.set(key, [...(byTrigger.get(key) ?? []), sc]);
    }
  }
  return byTrigger;
}

/**
 * The scanners that still owe this reader a look.
 *
 * A reader used to count as covered the moment ANY scanner opened them. The
 * rage-click scanner opens everything it is given, so on 2026-09-24 five
 * finishers with 11 to 65 dead taps each (submissions 2115, 2131, 2150, 2176,
 * 2183) had been opened by it alone: skipped by the survey and report scanners
 * while those were throttled, and never sent back, while the digest told
 * Marcus that unwatched readers "are not lost". The digest had already been
 * narrowed to the survey scanner on 2026-09-23; this was the other half.
 *
 * A comprehensive scanner is meant to see every session its trigger matches,
 * so any one it skipped is owed. A focused scanner skips by design, which is a
 * spend decision, so it is owed only a reader nothing else opened, as before.
 *
 * @param {number[]} counts  trigger counts, in the order of `triggers`
 * @param {string[]} triggers
 * @param {Map<string, Array<object>>} byTrigger  from scannersByTrigger()
 * @param {Set<string>} seenBy  ids of the scanners that observed this session
 * @returns {Array<object>} each owed scanner once
 */
export function owedScanners(counts, triggers, byTrigger, seenBy) {
  const owed = new Map();
  triggers.forEach((t, i) => {
    if ((counts[i] ?? 0) === 0) return;
    for (const sc of byTrigger.get(t) ?? []) {
      if (seenBy.has(sc.id)) continue;
      if (sc.sampling_mode === "comprehensive" || seenBy.size === 0) owed.set(sc.id, sc);
    }
  });
  return [...owed.values()];
}
