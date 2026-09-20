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
 * This module has no side effects on import.
 *
 * @param {string | null | undefined} path
 * @returns {string | null | undefined}
 */
export const redactReportToken = (path) =>
  typeof path === "string" ? path.replace(/\/report\/[^/?#]+/g, "/report/<redacted>") : path;
