import { supabaseFetch } from "@features/admin/server/supabase";

/**
 * Is the brain answering, and are its answers empty?
 *
 * `brain_query` records every MCP tool call -- surface, tool, args, top_score,
 * source_count, latency, error -- and until now NOTHING READ IT. The columns were
 * added so that "what does the team ask, which answers were empty, did a ranking
 * change help" could be answered, and that was solved on the write side only.
 *
 * This is the read. It is deliberately small: MCP on claude.ai and in the terminal is
 * the surface people actually use, so the questions worth asking hourly are "is it
 * up" and "is it coming back empty" -- not a dashboard.
 *
 * WHAT IS NOT MEASURED HERE, and why:
 *
 *  * `error IS NOT NULL` is NOT a fault signal. The MCP route stores the refusal text
 *    in that column on purpose -- "path must be a simple path inside that service's
 *    API" IS the diagnosis, and a guard refusing a bad path is the system working.
 *    Measured 2026-09-07: both errors in the window were a deliberate path refusal
 *    and an upstream 404. Alerting on the column would alert on correct behaviour.
 *  * `top_score` is NOT thresholded. Scores are not comparable between questions --
 *    the tool guidance says so in as many words, and measured on this corpus an
 *    unanswerable question outscored six of eight answerable ones. A fixed cutoff
 *    would report confident nonsense as healthy and hard-but-answered questions as
 *    broken.
 *
 * What IS unambiguous: the corpus being unreachable, a tool throwing, and a search
 * that returned nothing at all.
 */

/** Hours of history each check looks at. One hourly run, one day of dedup. */
export const WINDOW_HOURS = 24;

/**
 * The sentence `app/api/mcp/route.ts` returns when `retrieve` raises
 * `CorpusUnavailableError`. Matched on rather than re-derived: it is deliberately
 * distinct from "no results" so a model never reads an outage as absence.
 */
const OUTAGE_PHRASE = "knowledge base is unreachable";

/** The catch-all the route returns when a tool throws. A real fault, unlike a refusal. */
const FAILURE_PHRASE = "That lookup failed";

/**
 * An empty search is only worth a word when there are enough of them to be a pattern.
 * One miss on one question is a question the corpus does not cover, which is honest
 * and not a fault.
 */
const MIN_EMPTY_SEARCHES = 3;
const EMPTY_SEARCH_SHARE = 0.3;

export interface BrainHealth {
  calls: number;
  searches: number;
  emptySearches: number;
  outages: number;
  failures: number;
}

/** `undefined` = could not tell, which is distinct from zero. */
async function countWhere(filter: string): Promise<number | undefined> {
  const since = new Date(Date.now() - WINDOW_HOURS * 3_600_000).toISOString();
  const res = await supabaseFetch(
    `/rest/v1/brain_query?select=id&created_at=gte.${encodeURIComponent(since)}&${filter}`,
    { headers: { Prefer: "count=exact", Range: "0-0" } }
  );
  if (!res.ok) return undefined;
  const total = Number(res.headers.get("content-range")?.split("/")[1]);
  return Number.isFinite(total) ? total : undefined;
}

/**
 * Null when the database could not be read. Reporting "zero calls, all healthy"
 * because the query failed would be the same class of lie the outage phrase exists to
 * prevent.
 */
export async function readBrainHealth(): Promise<BrainHealth | null> {
  const like = (phrase: string) => `error=like.${encodeURIComponent(`*${phrase}*`)}`;
  const [calls, searches, emptySearches, outages, failures] = await Promise.all([
    countWhere("id=gt.0"),
    countWhere("tool=eq.search_company_context"),
    countWhere("tool=eq.search_company_context&source_count=eq.0"),
    countWhere(like(OUTAGE_PHRASE)),
    countWhere(like(FAILURE_PHRASE)),
  ]);
  if (
    calls === undefined ||
    searches === undefined ||
    emptySearches === undefined ||
    outages === undefined ||
    failures === undefined
  ) {
    return null;
  }
  return { calls, searches, emptySearches, outages, failures };
}

/**
 * One line, or null for "say nothing".
 *
 * Silent by default on purpose. Seven informational Slack pushes were switched off in
 * one commit on 2026-07-26 for being noise, and a channel that reports routine news
 * trains everyone to ignore the channel it shares with real alerts. NO USAGE IS NOT A
 * FAULT either -- nobody asking is a fact about the team, not about the brain.
 */
export function describeBrainHealth(h: BrainHealth): string | null {
  const parts: string[] = [];
  if (h.outages > 0) {
    parts.push(
      `the corpus was unreachable on ${h.outages} of ${h.calls} calls (an outage, not an empty result)`
    );
  }
  if (h.failures > 0) {
    parts.push(`${h.failures} of ${h.calls} calls failed outright`);
  }
  if (
    h.emptySearches >= MIN_EMPTY_SEARCHES &&
    h.searches > 0 &&
    h.emptySearches / h.searches >= EMPTY_SEARCH_SHARE
  ) {
    parts.push(
      `${h.emptySearches} of ${h.searches} searches came back with nothing ` +
        `(${Math.round((h.emptySearches / h.searches) * 100)}%)`
    );
  }
  if (parts.length === 0) return null;
  return `brain, last ${WINDOW_HOURS}h: ${parts.join("; ")}.`;
}
