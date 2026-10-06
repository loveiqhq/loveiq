/**
 * How long real readers spent on their report, from `report_session`.
 *
 * ONE implementation, because two /admin cards compute this and they had
 * already drifted apart on their sanity cap (4h on the core KPIs, 24h on the
 * reports overview). Both now ask the same question and differ only in the
 * argument they pass.
 *
 * STAFF SESSIONS ARE EXCLUDED. Nothing closed a session before 2026-09-18, so
 * this pollution could not surface while `ended_at` went unwritten and both
 * cards rendered blank. The moment the close beacon shipped it mattered
 * immediately: of the first 32 closed sessions 18 were ours — one internal
 * report carried 16 by itself — and including them reported a 6-second median
 * against a real 44.
 */

import { isStaffEmail } from "@shared/env/staff-email";

export interface ReaderSessionRow {
  started_at: string;
  ended_at: string | null;
  /** Embedded from `report_session.user_id -> app_user`. */
  app_user?: { email: string | null } | null;
}

/**
 * Durations in ms for every CLOSED session belonging to a non-staff reader,
 * discarding anything outside `(0, maxMs)`.
 *
 * The upper bound is a sanity cap, not a business rule: a tab left open
 * overnight and closed the next morning is not a reading session, and one such
 * row moves an average far more than it moves a median.
 */
export function readerSessionDurationsMs(sessions: ReaderSessionRow[], maxMs: number): number[] {
  const out: number[] = [];
  for (const session of sessions) {
    // Redundant in behaviour and kept on purpose: `new Date(null)` is the
    // epoch, so an unclosed session already fails the `ms <= 0` test below. A
    // mutation that deletes this line therefore survives — the guard states the
    // intent rather than carrying it, and the alternative is a null case that
    // depends on a 1970 coincidence three lines away.
    if (!session.ended_at) continue;
    if (isStaffEmail(session.app_user?.email)) continue;
    const ms = new Date(session.ended_at).getTime() - new Date(session.started_at).getTime();
    if (!Number.isFinite(ms)) continue;
    if (ms <= 0 || ms >= maxMs) continue;
    out.push(ms);
  }
  return out;
}
