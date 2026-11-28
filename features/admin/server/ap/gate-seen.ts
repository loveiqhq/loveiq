import { reportingDayStart } from "@shared/time/reporting-day";
import { fetchAllRows } from "../supabase";

/**
 * AP-Analytics: who saw the EUR 1.99 page, from the report's initial_gate_seen_at (its first
 * view). The Payment page's "Paywall shown" and Pay to start's "Saw the €1.99 page" count it.
 */

/**
 * The surveys whose report saw the EUR 1.99 page (initial_gate_seen_at, its first view), from
 * the range's first day: a finisher of the range saw it after finishing. A failed read is tried
 * once more, so one failed request doesn't blank the counts; null when it fails again, or the
 * second error, which the route logs.
 */
export async function readGateSeen(from: string): Promise<Set<number> | null> {
  const read = () =>
    fetchAllRows<{ survey_submission_id: number }>(
      "/rest/v1/personal_report?initial_gate_seen_at=gte." +
        encodeURIComponent(reportingDayStart(from).toISOString()) +
        "&select=survey_submission_id&order=id.asc"
    );
  const rows = (await read().catch(() => null)) ?? (await read());
  return rows ? new Set(rows.map((r) => r.survey_submission_id)) : null;
}
