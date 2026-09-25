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

/**
 * What to do about a (session, scanner) pair that is still owed a look, given
 * that scanner's latest PostHog observation of the session, if any.
 *
 * PostHog keeps ONE observation per pair and `/observe/` does nothing once it
 * exists, even a failed one. Every miss used to go to `/observe/`: it answered
 * 202 and nothing ran, so readers sat "re-queued" for a week behind failures
 * from 2026-09-18 ("infra_transient: Activity task timed out"). A temporary
 * failure is retried through its own endpoint; a permanent one is reported,
 * not resent forever.
 *
 * @param {{id?: string, status?: string, error_reason?: string} | null | undefined} existing
 * @returns {{action: "observe"} | {action: "retry", id: string} | {action: "wait" | "give-up", reason: string}}
 */
export function requeueAction(existing) {
  if (!existing) return { action: "observe" };
  const status = String(existing.status ?? "");
  const reason = String(existing.error_reason ?? "");
  if (status === "failed") {
    // Read from PostHog's own reasons on 2026-09-25: every failure then was
    // infra_transient (35) or provider_transient (2), plus one internal_error
    // saying "Queries are a little too busy right now". The category can be
    // wrong; the words cannot.
    const temporary =
      /_transient$/.test(reason.split(":")[0]) || /too busy|timed out/i.test(reason);
    return temporary && existing.id
      ? { action: "retry", id: existing.id }
      : { action: "give-up", reason: reason || "failed" };
  }
  if (status === "ineligible") return { action: "give-up", reason: reason || "ineligible" };
  if (status === "succeeded")
    return { action: "wait", reason: "succeeded; its event has not landed yet" };
  return { action: "wait", reason: status || "in progress" };
}

/**
 * Whether a recording is over, so PostHog may be asked to watch it.
 *
 * PostHog watches a recording the moment it is asked and keeps that one look
 * for good, so asking while the reader is still on their report freezes a
 * partial look. Measured 2026-09-25 over 567 looks this re-queue had asked
 * for: 9 started before their recording ended (up to 30 minutes of a visit
 * never seen) and 31 more within 15 minutes of its end, before the last of it
 * may have been stored. PostHog ends a session after 30 minutes without
 * activity and its own sweep waits about 38; an hour clears both.
 *
 * @param {string | null | undefined} lastActivity the recording's max_last_timestamp
 * @param {number} [now]
 */
export const SETTLED_MS = 3_600_000;
export function recordingSettled(lastActivity, now = Date.now()) {
  // An unreadable end parses to NaN, and NaN is never old enough.
  return Date.parse(String(lastActivity ?? "")) <= now - SETTLED_MS;
}
