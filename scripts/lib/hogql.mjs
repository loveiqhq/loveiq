/**
 * One HogQL client, because the row cap is not something each caller can be
 * trusted to remember.
 *
 * PostHog's query API applies a DEFAULT LIMIT OF 100 to any query that does not
 * state one, and reports nothing when it bites: no error, no flag, no count. A
 * bare `SELECT DISTINCT session_id FROM raw_session_replay_events` over eight
 * days returned 100 rows against a true 605. The shape is identical to the
 * PostgREST 1,000-row cap this repo already fought, at a tenth the size.
 *
 * It had already bitten. `ux-review-coverage.mjs` bounds its reads with
 * `session_id IN (…)` and was correct at 56 submissions; its own header
 * documents `DAYS=7`, which is 109 submissions, and at that size all three of
 * its reads truncated. Sessions whose observation row fell off the end read as
 * never-observed, so the script that exists to find blind spots reported 43
 * misses that were mostly its own. Under-reporting is the worse direction and
 * happens just as easily: a truncated recording set makes a real miss look like
 * a reader who declined recording.
 *
 * So: state a LIMIT or get one, and shout if the result arrives exactly at it,
 * which is the only observable signature of a query that wanted more.
 */

/** Far above any set this repo reads, low enough that hitting it means a bug. */
export const HOG_ROW_CAP = 50_000;

/**
 * Matched at the END of the query on purpose. A `LIMIT` inside a subquery says
 * nothing about the outer result, and treating it as "already capped" would
 * leave the silent 100 in place — the exact failure this module exists to stop.
 * A false negative appends a second LIMIT and fails loudly, which is the safe
 * direction to be wrong in.
 */
export const hasOwnLimit = (query) => /\bLIMIT\s+\d+\s*$/i.test(String(query).trim());

export function capQuery(query, cap = HOG_ROW_CAP) {
  return hasOwnLimit(query) ? String(query) : `${String(query).trimEnd()}\nLIMIT ${cap}`;
}

/**
 * Retried, because PostHog sheds load and says so.
 *
 * `503 "Queries are a little too busy right now"` and `429` are the shapes it
 * uses, and both are transient — the first one seen here arrived right after
 * queueing 133 scanner workflows, i.e. caused by our own traffic. The helper
 * this module replaced in features/ux-review/server/review.ts already retried;
 * extracting it without that would have traded a silent truncation bug for a
 * loud crash-on-load bug. Nothing else is retried: a 4xx fails the same way
 * twice, and a bad query must fail fast rather than be asked again.
 */
const RETRYABLE = new Set([429, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function hogQuery(query, { projectId, apiKey, cap = HOG_ROW_CAP, label = "" } = {}) {
  const sql = capQuery(query, cap);
  let res;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    res = await fetch(`https://eu.posthog.com/api/projects/${projectId}/query/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query: sql } }),
    });
    if (res.ok || !RETRYABLE.has(res.status)) break;
    if (attempt < 3) await sleep(2000 * 2 ** attempt); // 2s, 4s, 8s
  }
  if (!res.ok) throw new Error(`posthog ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const payload = await res.json();
  // 200-with-error is how PostHog reports a bad query. Treating that as "no
  // rows" would make a broken caller look permanently healthy and idle.
  if (payload.error) throw new Error(`posthog query error: ${String(payload.error).slice(0, 200)}`);
  const rows = payload.results ?? [];
  const limit = hasOwnLimit(query)
    ? Number(
        String(query)
          .trim()
          .match(/(\d+)\s*$/)?.[1]
      )
    : cap;
  /**
   * `limit > 1` because a deliberate `LIMIT 1` returning one row is the normal
   * case, not a truncation — single-row reads do it constantly. The first
   * version warned on every one of them, and a guard that cries wolf on its
   * most common input is one people learn to scroll past, which is worse than
   * not having it at all.
   */
  if (Number.isFinite(limit) && limit > 1 && rows.length >= limit) {
    console.warn(
      `WARNING: hogql${label ? ` (${label})` : ""} returned exactly ${rows.length} rows — ` +
        `at the limit, so the result is probably truncated.`
    );
  }
  return rows;
}

if (process.argv.includes("--selftest")) {
  const eq = (got, want, what) => {
    if (got !== want) {
      console.error(`FAIL ${what}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
      process.exit(1);
    }
  };
  eq(hasOwnLimit("SELECT 1 LIMIT 5"), true, "trailing limit found");
  eq(hasOwnLimit("SELECT 1 LIMIT 5   "), true, "trailing limit with spaces");
  // The one that matters: a subquery limit must NOT count as capping the outer
  // query, or the silent 100 stays and this module does nothing.
  eq(hasOwnLimit("SELECT a FROM (SELECT b LIMIT 5) GROUP BY a"), false, "subquery limit ignored");
  eq(hasOwnLimit("SELECT DISTINCT x FROM y"), false, "no limit");
  eq(capQuery("SELECT DISTINCT x FROM y").endsWith(`LIMIT ${HOG_ROW_CAP}`), true, "cap appended");
  eq(capQuery("SELECT 1 LIMIT 5"), "SELECT 1 LIMIT 5", "own limit kept");
  eq(
    [429, 503, 504].every((c) => RETRYABLE.has(c)),
    true,
    "load-shed codes retried"
  );
  eq(
    [400, 401, 403, 404].some((c) => RETRYABLE.has(c)),
    false,
    "client errors not retried"
  );
  console.log("selftest ok");
}
