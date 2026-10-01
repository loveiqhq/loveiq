/**
 * The persona walks the proofs are judged on: each one's events and what it knows it did,
 * written by scripts/walkers/check-signals.ts after the nightly walks.
 */
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

import type { WalkRecord } from "../logic/proof";

/** How far back a proof looks: four weeks of nightly walks. */
export const PROOF_DAYS = 28;

/** Far above four weeks of walks; a result this size means the read was cut short. */
const ROW_LIMIT = 1000;

export async function readWalkRecords(now = new Date()): Promise<WalkRecord[] | null> {
  const since = new Date(now.getTime() - PROOF_DAYS * 86_400_000).toISOString();
  try {
    const res = await supabaseFetch(
      `/rest/v1/ux_walk_record?select=walk,walked_at,events,truth` +
        `&walked_at=gte.${encodeURIComponent(since)}&order=walked_at.desc&limit=${ROW_LIMIT}`,
      // About 20 KB a walk, four a night: some 2 MB for four weeks, past the 8 s read default.
      { timeoutMs: 20_000 }
    );
    if (!res.ok) {
      logger.warn({ status: res.status }, "ux-signals: could not read the walk records");
      return null;
    }
    const rows = (await res.json()) as Array<{
      walk: string;
      walked_at: string;
      events: WalkRecord["events"];
      truth: WalkRecord["truth"];
    }>;
    if (!Array.isArray(rows) || rows.length >= ROW_LIMIT) return null;
    // A walk's plants are drawn from its UTC day (walk.ts seeds them `date|walk`), so a second
    // run of the same walk that day repeats the first exactly. Counted twice, one scenario
    // would stand in for two cases toward the proof's minimums; the newest run is kept.
    const seen = new Set<string>();
    const once = rows.filter((r) => {
      const key = `${r.walk}|${String(r.walked_at).slice(0, 10)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return once.map((r) => ({
      walk: r.walk,
      walkedAt: r.walked_at,
      events: Array.isArray(r.events) ? r.events : [],
      truth: r.truth && typeof r.truth === "object" ? r.truth : {},
    }));
  } catch (err) {
    logger.warn({ err }, "ux-signals: the walk records read failed");
    return null;
  }
}
