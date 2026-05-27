/**
 * Persisted weekly Slack-digest recommendations + reader.
 *
 * Read by next Monday's cron to render the "Revisited from last week" Slack
 * section that classifies prior recommendations as resolved / ongoing /
 * worsened.
 *
 * Both functions are best-effort: a Supabase outage during persist does NOT
 * block the (successful) Slack send, and a read failure simply returns []
 * which omits the loop-closure section entirely. The digest survives.
 */

import { supabaseFetch } from "@features/admin/server/supabase";
import type { Recommendation } from "@features/admin/server/digest-recommendations";
import logger from "@shared/observability/logger";

export interface HistoricalRecommendation {
  weekKey: string;
  rule: string;
  severity: "high" | "med" | "low";
  message: string;
  evidence: string;
  fingerprint: Record<string, number | string>;
  createdAt: string;
}

/**
 * Persist this week's recommendations. Idempotent via the
 * (week_key, rule) UNIQUE constraint in the migration — re-running the same
 * Monday cron upserts cleanly.
 *
 * Never throws — Supabase failures are logged with logger.warn and the cron
 * continues. The next Monday's lookback will just see no history for the
 * skipped week.
 */
export async function persistRecommendations(
  weekKey: string,
  recs: Recommendation[]
): Promise<void> {
  if (recs.length === 0) return;
  try {
    const rows = recs.map((r) => ({
      week_key: weekKey,
      rule: r.rule,
      severity: r.severity,
      message: r.message,
      evidence: r.evidence,
      fingerprint: r.fingerprint ?? {},
    }));
    const res = await supabaseFetch("/rest/v1/digest_recommendation_history", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // resolution=merge-duplicates → upsert on (week_key, rule) UNIQUE.
        // return=minimal → smaller response, lower cron latency.
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logger.warn(
        { weekKey, count: recs.length, status: res.status, detail: detail.slice(0, 200) },
        "persistRecommendations: non-2xx; loop-closure section will skip this week next time"
      );
    }
  } catch (err) {
    logger.warn(
      { err, weekKey, count: recs.length },
      "persistRecommendations: threw; loop-closure section will skip this week next time"
    );
  }
}

/**
 * Fetch the last `weeks` weeks of historical recommendations, sorted newest
 * first. Returns [] on any failure (network, parse, etc) — caller treats
 * empty as "no history yet" and omits the section.
 *
 * Window is in days for simplicity: `weeks * 7` days back from now. The
 * Slack section only cares about "last week vs this week"; older rows are
 * used only for the consecutive-week tag, so a few extra days of slack
 * doesn't hurt.
 */
export async function fetchRecommendationHistory(
  weeks: number
): Promise<HistoricalRecommendation[]> {
  if (!Number.isFinite(weeks) || weeks <= 0) return [];
  const sinceIso = new Date(Date.now() - weeks * 7 * 86_400_000).toISOString();
  try {
    const res = await supabaseFetch(
      `/rest/v1/digest_recommendation_history?select=week_key,rule,severity,message,evidence,fingerprint,created_at&created_at=gte.${encodeURIComponent(sinceIso)}&order=created_at.desc`,
      { headers: { Range: "0-999" } }
    );
    if (!res.ok) {
      logger.warn(
        { status: res.status, weeks },
        "fetchRecommendationHistory: non-2xx; returning empty"
      );
      return [];
    }
    const rows = (await res.json()) as Array<{
      week_key: string;
      rule: string;
      severity: string;
      message: string;
      evidence: string;
      fingerprint: unknown;
      created_at: string;
    }>;
    const out: HistoricalRecommendation[] = [];
    for (const row of rows) {
      const severity =
        row.severity === "high" || row.severity === "med" || row.severity === "low"
          ? row.severity
          : null;
      if (!severity) continue; // schema drift defense
      // Coerce JSONB to a plain object of number|string values; drop anything
      // that doesn't fit so the comparator sees clean input.
      const fingerprint: Record<string, number | string> = {};
      if (row.fingerprint && typeof row.fingerprint === "object") {
        for (const [k, v] of Object.entries(row.fingerprint as Record<string, unknown>)) {
          if (typeof v === "number" || typeof v === "string") fingerprint[k] = v;
        }
      }
      out.push({
        weekKey: row.week_key,
        rule: row.rule,
        severity,
        message: row.message,
        evidence: row.evidence,
        fingerprint,
        createdAt: row.created_at,
      });
    }
    return out;
  } catch (err) {
    logger.warn({ err, weeks }, "fetchRecommendationHistory: threw; returning empty");
    return [];
  }
}
