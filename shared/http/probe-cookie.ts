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
