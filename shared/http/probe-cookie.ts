/**
 * The cookie a probe sets so the server knows it is not a reader.
 *
 * Shared because `scripts/probes/staging-cookie.mjs` sets it and
 * the server reads it (`app/api/report/route.ts`, `proxy.ts`,
 * `app/api/funnel-event/route.ts`), and those live on opposite sides of
 * the Next build — scripts/ is deliberately outside it, so the app cannot
 * import the probe helper and the name would otherwise be a literal in two
 * places. A rename that reached only one of them would silently restore the
 * pollution this exists to stop, and nothing would fail.
 *
 * WHAT IT SUPPRESSES: one `report_session` row, PostHog for the whole visit
 * (instrumentation-client.ts reads it off `document.cookie`, so the probe sets
 * it readable), and every `funnel_event` row: the proxy's visit and survey-page
 * counts and the /api/funnel-event pings (16 Oct 2026: once every visitor's
 * survey intro was measured, one probe run read as eight people). Probes open production pages with a real phone's user agent, so
 * without this each one was a visitor to every PostHog measure and replay: one
 * report was opened in 17 sessions by 17 fresh visitors in the 30 days to
 * 2026-09-30. Nothing about access, rendering or fulfilment reads it, so a
 * visitor who forged it would only remove themselves from our own analytics.
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
