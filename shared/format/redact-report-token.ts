/**
 * A REPORT TOKEN IS A CREDENTIAL, and it must not land in our own database.
 *
 * `/report/<token>` is how a paid report is opened — the token IS the auth, it
 * does not expire, there is no second factor, and the page behind it is an
 * intimate psychological profile.
 *
 * DECIDED 2026-09-20: the token in PostHog's URLs is accepted (it cannot be
 * removed from the replay's own rrweb stream without dropping the recordings
 * the UX-review pipeline exists to watch), and the DATABASE is explicitly out
 * of scope. `ux_finding` was closed then. `analytics_event` was not looked at,
 * and had been storing it since 2026-05-22 — 2,424 rows across five event
 * types, still writing, found by sweeping every text and jsonb column in the
 * schema rather than re-checking the table the last fix named.
 *
 * WHY THE SERVER SIDE. The pathname arrives from the browser, on a public
 * endpoint. Redacting in the client would leave the guard somewhere an
 * attacker chooses whether to run, and would also strip the token from the
 * PostHog event, which is the half we decided to keep. The route is the only
 * place that sees exactly what is about to be persisted.
 *
 * NOTHING ANALYTICAL IS LOST: every `analytics_event` row already carries
 * `survey_submission_id`, so the report is identified without the key to it.
 *
 * STOPS AT WHITESPACE. `[^/?#]+` is greedy and only a URL delimiter ends it, so
 * on free text it swallows everything after the token. A real path never
 * contains a space.
 *
 * TWO PATTERNS, because the token does not only live in a path. 403 of the
 * 2,424 leaked rows carry it as a QUERY PARAMETER —
 * `/checkout?plan=all_reports&token=rpt_…` — and a guard keyed on `/report/`
 * leaves every one of them, plus every future checkout event, while reporting
 * that the table was cleaned. So the path form is handled first (it keeps the
 * `/report/<redacted>` shape the digest reads), then the credential is matched
 * wherever else it appears.
 *
 * The bare pattern keys on the token's own shape: every one of the 2,114 rows
 * in `report_access_token` is exactly `rpt_` plus 20 alphanumerics, no
 * exceptions. `{8,}` is well below that and well above anything that could be
 * a word, and over-redacting is the safe direction to be wrong in.
 *
 * There is a sibling copy at `scripts/lib/redact-report-token.mjs` for the
 * verifier, which runs outside the Next build. Consolidating the two needs
 * PR #239 to land first, because it edits both consumers.
 */
const REPORT_PATH = /\/report\/[^/?#\s]+/g;
const BARE_TOKEN = /rpt_[A-Za-z0-9]{8,}/g;

export const redactReportToken = (value: string): string =>
  value.replace(REPORT_PATH, "/report/<redacted>").replace(BARE_TOKEN, "rpt_<redacted>");

/**
 * Walk an arbitrary analytics payload and redact every string in it.
 *
 * Keyed on nothing: the leak today is `metadata.pathname`, but the schema
 * accepts any flat object a client sends, and a guard that only knows the one
 * field that leaked is a guard that will be wrong the next time somebody adds
 * `referrer` or `url`. Arrays and nested objects are walked because the schema
 * does not forbid them.
 *
 * Returns the input unchanged when there is nothing to redact, so the common
 * path allocates nothing.
 */
export function redactReportTokensDeep<T>(value: T): T {
  if (typeof value === "string") {
    const cleaned = redactReportToken(value);
    return (cleaned === value ? value : cleaned) as T;
  }
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item) => {
      const next = redactReportTokensDeep(item);
      if (next !== item) changed = true;
      return next;
    });
    return (changed ? out : value) as T;
  }
  if (value && typeof value === "object") {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const next = redactReportTokensDeep(v);
      if (next !== v) changed = true;
      out[k] = next;
    }
    return (changed ? out : value) as T;
  }
  return value;
}
