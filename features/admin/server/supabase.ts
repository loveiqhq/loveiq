import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { getBreaker } from "@shared/http/circuit-breaker";
import logger from "@shared/observability/logger";

const TIMEOUT_MS = 8000;

/**
 * PostgREST's `max-rows`. A request for more comes back capped at this with NO
 * error, NO warning and NO truncation flag — just fewer rows than exist.
 */
export const POSTGREST_MAX_ROWS = 1000;

/**
 * Warn when a response was silently truncated.
 *
 * Found 2026-09-15: a friction query asked for 50,000 rows of
 * survey_behavior_event, 26,109 existed, and 1,000 came back. Nothing failed.
 * On that 4% slice the worst drop-off question was Q11 at 14%; on the full data
 * it is Q58, the email question, at 21%. The cap did not slow anything down, it
 * changed the answer — and the same shape sits in other callers, e.g.
 * channel-efficiency reads survey_submission with no limit at all and crosses
 * 1,000 rows at a 90-day window.
 *
 * `Content-Range: 0-999/*` says it happened without touching the body, so this
 * costs nothing. A caller that explicitly asked for exactly 1000 is paginating
 * on purpose (the brain ingest loops do) and is left alone.
 */
function warnIfTruncated(path: string, res: Response): void {
  const range = res.headers.get("content-range");
  if (!range) return;
  const end = Number(range.split("/")[0]?.split("-")[1]);
  if (end !== POSTGREST_MAX_ROWS - 1) return;
  if (/[?&]limit=1000(&|$)/.test(path)) return;
  logger.warn(
    { path: path.split("?")[0], returned: POSTGREST_MAX_ROWS },
    "supabase: response hit PostgREST's max-rows cap — rows are MISSING and no error was raised; aggregate in SQL or paginate"
  );
}

interface SupabaseFetchOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  /**
   * Override the 8s default. Needed for the few endpoints whose cost is
   * SERVER-side generation rather than transfer — PostgREST builds its 490 KB
   * OpenAPI document from the schema on every request, which reliably exceeds 8s
   * from a Vercel function even though it is fast from a laptop. Keep the default
   * everywhere else: a slow query should fail, not hang.
   */
  timeoutMs?: number;
}

/**
 * Shared Supabase REST API fetch helper for admin routes.
 * Wraps fetchWithTimeout + circuit breaker with standard auth headers.
 */
export async function supabaseFetch(
  path: string,
  options: SupabaseFetchOptions = {}
): Promise<Response> {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase not configured");
  }

  const { method = "GET", body, headers = {} } = options;

  const res = await getBreaker("supabase").fire(() =>
    fetchWithTimeout(`${url}${path}`, {
      method,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body,
      timeoutMs: options.timeoutMs ?? TIMEOUT_MS,
    })
  );
  warnIfTruncated(path, res);
  return res;
}

/**
 * How many rows match, without transferring any.
 *
 * `Prefer: count=exact` puts the true total after the slash in `Content-Range`,
 * and `Range: 0-0` asks for a single row, so the count is exact however large
 * the table is. This is the answer to `warnIfTruncated` above: a caller that
 * wants a NUMBER should never fetch rows to measure their length, because
 * PostgREST caps the body at 1,000 with no error and the number then freezes
 * there forever.
 *
 * Found on 2026-09-17 in the admin health check, which asked for `Range:
 * 0-49999` on five whole tables and believed it. Every count it reported was
 * exactly 1,000: submissions 1,000 of a real 2,061, reports 1,000 of 2,051,
 * analytics events 1,000 of 21,328.
 *
 * A DISTINCT count has no equivalent header, but an inner embed gets one for
 * free: `personal_report?select=id,report_session!inner(id)` counts the reports
 * that have at least one session, which is `count(DISTINCT personal_report_id)`
 * over rows that still exist. Verified against the SQL: both say 1,968.
 *
 * Returns null when the count cannot be read, never 0 — a failed count and an
 * empty table must not look the same.
 */
export async function countRows(path: string): Promise<number | null> {
  const res = await supabaseFetch(path, {
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  if (!res.ok) return null;
  const total = res.headers.get("content-range")?.split("/")[1];
  if (!total || total === "*") return null;
  const n = Number(total);
  return Number.isFinite(n) ? n : null;
}

/**
 * Every matching row, by paging past PostgREST's cap.
 *
 * For callers that genuinely need the ROWS, not a count. `Range: 0-49999` does
 * not get you fifty thousand rows — it gets you a thousand, silently — so a
 * caller that wants them all has to ask repeatedly.
 *
 * ORDER IS REQUIRED, and not as a style preference: without a deterministic
 * `order=`, PostgreSQL may return rows in a different physical order between
 * requests, so pages can overlap or skip and the result is quietly wrong in a
 * way that looks like flaky data. A path with no `order=` is refused.
 *
 * Returns null if any page fails. A partial array is the failure this whole
 * family of bugs is made of, so it is never returned.
 */
export async function fetchAllRows<T>(
  path: string,
  options: { maxRows?: number } = {}
): Promise<T[] | null> {
  if (!/[?&]order=/.test(path)) {
    throw new Error(`fetchAllRows needs a deterministic order=: ${path.split("?")[0]}`);
  }
  const maxRows = options.maxRows ?? 100_000;
  const out: T[] = [];
  for (let offset = 0; offset < maxRows; offset += POSTGREST_MAX_ROWS) {
    const end = Math.min(offset + POSTGREST_MAX_ROWS, maxRows) - 1;
    const res = await supabaseFetch(path, { headers: { Range: `${offset}-${end}` } });
    if (!res.ok) return null;
    const page = (await res.json()) as T[];
    out.push(...page);
    // A short page is the last page. Asking again would cost a round trip to
    // learn nothing.
    if (page.length < end - offset + 1) break;
  }
  return out;
}
