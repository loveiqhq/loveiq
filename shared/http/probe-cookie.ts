/**
 * The cookie a probe sets so the server knows it is not a reader.
 *
 * Shared because `scripts/probes/staging-cookie.mjs` sets it and
 * `app/api/report/route.ts` reads it, and those two live on opposite sides of
 * the Next build — scripts/ is deliberately outside it, so the app cannot
 * import the probe helper and the name would otherwise be a literal in two
 * places. A rename that reached only one of them would silently restore the
 * pollution this exists to stop, and nothing would fail.
 *
 * WHAT IT SUPPRESSES: one `report_session` row. Nothing about access, rendering
 * or fulfilment reads it, so a visitor who forged it would only remove
 * themselves from our own analytics.
 */
export const PROBE_COOKIE = "loveiq_probe";

/**
 * Is this request one of our own probes?
 *
 * A FUNCTION, not a regex each caller rebuilds. The first version left the
 * pattern inline in the route and asserted an identical copy in the test, so
 * loosening the route's match to a bare substring changed nothing the suite
 * could see — `not_loveiq_probe=1` and `loveiq_probe=10` would both have
 * counted, and the test still passed because it was grading its own copy.
 *
 * Anchored on a cookie boundary for that reason, and on `=1` exactly.
 */
export const isProbeRequest = (cookieHeader: string | null | undefined): boolean =>
  new RegExp(`(?:^|;\\s*)${PROBE_COOKIE}=1(?:;|$)`).test(cookieHeader ?? "");
