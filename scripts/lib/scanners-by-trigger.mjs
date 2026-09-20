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
