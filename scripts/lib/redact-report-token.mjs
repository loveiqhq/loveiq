/**
 * A REPORT TOKEN IS A CREDENTIAL. It must not be written to our database.
 *
 * `/report/<token>` is how a paid report is opened — the token IS the auth, it
 * does not expire, and the report is an intimate psychological profile. The
 * ledger stored the live path verbatim in `ux_finding.url_path`: 14 rows
 * holding 13 distinct working tokens by 2026-09-20, three days after the table
 * was created, one more with every report finding. That is a durable,
 * queryable credential store sitting outside the access controls of the system
 * the token belongs to — and it is ours, so it is the part we can close.
 *
 * SPLIT OUT SO IT CAN BE TESTED: `verify-ux-findings.mjs` runs its whole flow
 * as top-level statements, so importing it reaches PostHog, Supabase and Slack.
 *
 * Only what is PERSISTED is redacted. The probe still receives the real path
 * inside the run, because reproducing on the reader's own report is the point
 * of the pipeline. The ledger needs the shape of the page, never the key to it.
 *
 * NOT CLAIMED: PostHog still holds these URLs, in `$current_url` and in the
 * replay's own rrweb stream, and no event-property filter reaches the latter.
 * This is an honest partial fix — see docs/runbooks/SECURITY.md.
 *
 * STOPS AT WHITESPACE, which matters once this is used on anything but a bare
 * path. `[^/?#]+` is greedy and a URL delimiter is the only thing that ended
 * it, so on a sentence — `probe_runs[].tail` holds "what this reader tapped at
 * /report/rpt_… behaves" — it swallowed the rest of the line along with the
 * token. A real path never contains a space, so excluding whitespace loses
 * nothing and stops the redactor destroying the evidence around the token.
 *
 * This module has no side effects on import.
 *
 * @param {string | null | undefined} path
 * @returns {string | null | undefined}
 */
const REPORT_PATH = /\/report\/[^/?#\s]+/g;
/**
 * TWO SHAPES. The token does not only live in a path: `/checkout?plan=…&token=rpt_…`
 * carries it as a query parameter, and 403 of the 2,424 rows found in
 * `analytics_event` are that form. A guard keyed on `/report/` cleans most of
 * them, leaves the rest, and reports the job done.
 *
 * Keyed on the credential's own shape: every one of the 2,114 rows in
 * `report_access_token` is exactly `rpt_` plus 20 alphanumerics. `{8,}` is well
 * below that and well above anything that could be a word, and over-redacting
 * is the safe direction to be wrong in.
 */
const BARE_TOKEN = /rpt_[A-Za-z0-9]{8,}/g;

export const redactReportToken = (path) =>
  typeof path === "string"
    ? path.replace(REPORT_PATH, "/report/<redacted>").replace(BARE_TOKEN, "rpt_<redacted>")
    : path;
