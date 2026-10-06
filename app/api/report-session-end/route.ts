/**
 * Closes the reader's `report_session` when they leave the report.
 *
 * WHY THIS EXISTS. `report_session.ended_at` was created for exactly this and
 * nothing had ever written it — 0 of 11,230 rows — so "how long were they on the
 * report" could only be guessed at from the last thing they happened to click,
 * and the two /admin cards that read the column ("Median session duration",
 * "Avg session duration") had been blank since they shipped.
 *
 * NOT CONSENT-GATED, deliberately, and consistent with the row it closes.
 * `report_session` is written server-side by /api/report for every reader —
 * that is its whole purpose, because the consent-gated `report_viewed` event
 * misses ~44% of real opens. Gating the CLOSE behind consent would reopen that
 * hole from the other end: the readers we can see arriving would be the only
 * ones we could not see leaving. No new personal data is recorded here — only a
 * timestamp on a row that already exists.
 *
 * Strict gates:
 *   - CSRF token required (double-submit cookie; body fallback for sendBeacon)
 *   - IP rate-limited at 30/min
 *   - Nothing is read back to the caller: 204 on every path, including a
 *     submission that does not exist, so this cannot be used to probe ids
 *
 * Body: {
 *   submission_id: number,
 *   _csrf?: string,  // sendBeacon cannot set headers
 * }
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfHeaderOrBody } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

const schema = z.object({
  submission_id: z.number().int().positive(),
  _csrf: z.string().optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  if (!(await verifyCsrfHeaderOrBody(request, parsed.data._csrf))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "report-session-end",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Rate limited." }, { status: 429 });
  }

  const { submission_id } = parsed.data;
  void parsed.data._csrf;

  try {
    /**
     * The NEWEST session for this report, open or already closed.
     *
     * Not `ended_at=is.null`. A reader who hides the tab, comes back and reads
     * for another five minutes sends a second beacon, and if the first one had
     * taken the row out of scope that second visit would be lost — we would
     * record the moment they first looked away as the moment they left, which
     * is worse than recording nothing. Re-stamping is safe because the value is
     * always `now()`, so it can only ever move forward.
     *
     * ponytail: newest row wins, which is wrong if the same report is open on
     * two devices at once — one reader's beacon stamps the other's session. A
     * per-session id threaded through the page would fix it; report_session has
     * no flag distinguishing the two today, and the same limitation already
     * applies to the analytics events a shared viewer fires under the owner's
     * submission id (5 share views have ever happened).
     */
    const lookup = await supabaseFetch(
      `/rest/v1/report_session?select=id,personal_report!inner(survey_submission_id)` +
        `&personal_report.survey_submission_id=eq.${submission_id}` +
        `&order=started_at.desc&limit=1`
    );
    if (!lookup.ok) return new NextResponse(null, { status: 204 });

    const rows = (await lookup.json()) as Array<{ id: string }>;
    const session = rows[0];
    // Unknown submission, or a report nobody has opened — silently drop rather
    // than telling the caller which ids exist.
    if (!session) return new NextResponse(null, { status: 204 });

    const patch = await supabaseFetch(`/rest/v1/report_session?id=eq.${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ ended_at: new Date().toISOString() }),
    });
    if (!patch.ok) {
      // warn-not-error: a missed close costs precision on one reader, and
      // logger.error pages the ops channel in production.
      logger.warn({ status: patch.status, submission_id }, "report-session-end: patch non-2xx");
    }
  } catch (err) {
    logger.warn({ err, submission_id }, "report-session-end: failed");
  }

  return new NextResponse(null, { status: 204 });
}
