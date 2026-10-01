/**
 * Real visits, from PostHog: every production session's events the signals read.
 *
 * PostHog, not our own tables, because it is the one place that has them all. `track()`
 * sends every event there with no consent gate (features/analytics/client.ts), while
 * `analytics_event` keeps only a subset and only once a survey is submitted. Our own probes
 * never reach it (instrumentation-client.ts), and staging is labelled apart by `deploy_env`.
 */
import { sessionQuery } from "@features/ux-review/server/review";

import { SIGNAL_EVENTS, SIGNAL_PROPS, type UxEvent, type UxVisit } from "../logic/signals";

/** sessionQuery's own cap. A read that fills it was cut short. */
export const ROW_CAP = 50_000;

/** Events from `from` days ago up to `to` days ago (0 is now). */
export function windowQuery(from: number, to: number): string {
  const props = SIGNAL_PROPS.map((p) => `properties.${p}`).join(", ");
  const events = SIGNAL_EVENTS.map((e) => `'${e}'`).join(", ");
  return [
    `SELECT $session_id, toUnixTimestamp64Milli(timestamp), event, ${props}`,
    "FROM events",
    `WHERE timestamp > now() - INTERVAL ${from} DAY`,
    `  AND timestamp <= now() - INTERVAL ${to} DAY`,
    "  AND properties.deploy_env = 'production'",
    `  AND event IN (${events})`,
    // HogQL reads `x != ''` as true when x is NULL; notEmpty() does not.
    "  AND notEmpty(toString($session_id))",
    "ORDER BY timestamp",
    `LIMIT ${ROW_CAP}`,
  ].join("\n");
}

/** Rows (session, ms, event, …props in SIGNAL_PROPS order) grouped into visits in time order. */
export function toVisits(rows: readonly unknown[][]): Map<string, UxVisit> {
  const bySession = new Map<string, UxEvent[]>();
  for (const row of rows) {
    const [sid, t, event, ...values] = row;
    if (typeof sid !== "string" || typeof event !== "string" || typeof t !== "number") continue;
    const props: Record<string, unknown> = {};
    SIGNAL_PROPS.forEach((p, i) => {
      const v = values[i];
      if (v !== null && v !== undefined && v !== "") props[p] = v;
    });
    const list = bySession.get(sid) ?? [];
    list.push({ t, event, props });
    bySession.set(sid, list);
  }
  for (const list of bySession.values()) list.sort((a, b) => a.t - b.t);
  return bySession;
}

export type VisitsResult =
  { ok: true; visits: UxVisit[]; events: number } | { ok: false; why: string };

/**
 * The last `days` days of visits, a week per read (about 31,000 events on 2026-09-30), and
 * a day per read for any week too big for one. Fails whole rather than in part: a missing
 * stretch would quietly shift every share, and a reader could not tell.
 */
export async function fetchVisits(days: number): Promise<VisitsResult> {
  if (!process.env.POSTHOG_API_KEY) return { ok: false, why: "POSTHOG_API_KEY is not set" };
  const rows: unknown[][] = [];
  for (let from = days; from > 0; from -= 7) {
    const to = Math.max(0, from - 7);
    const week = await sessionQuery(windowQuery(from, to));
    if (week === null) return { ok: false, why: "PostHog did not answer" };
    if (week.length < ROW_CAP) {
      rows.push(...week);
      continue;
    }
    for (let d = from; d > to; d -= 1) {
      const day = await sessionQuery(windowQuery(d, d - 1));
      if (day === null) return { ok: false, why: "PostHog did not answer" };
      if (day.length >= ROW_CAP) {
        return { ok: false, why: `${d} days ago held more events than one read returns` };
      }
      rows.push(...day);
    }
  }
  return { ok: true, visits: [...toVisits(rows).values()], events: rows.length };
}
