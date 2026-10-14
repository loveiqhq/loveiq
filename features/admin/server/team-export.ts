/**
 * The team's copy of the production data: every customer and product table, one CSV each,
 * in a Google Drive folder only the team can open, for the team to explore freely.
 *
 * Two ways to run it: Jarvis's `export_all_data` tool starts it on the server
 * (app/api/cron/team-export), and `scripts/team-data-export.ts` runs it from a laptop. Either
 * way the data goes from the database to Drive and never through a chat.
 *
 * WHAT IDENTIFIES A PERSON IS MASKED, BY DECISION. Eman, 2026-10-11: "mask the emails and
 * names and those sensitive info", replacing the unmasked copy decided on 2026-10-10. What
 * people answered and did stays, because that is what the copy is for; maskRow says what goes.
 * The folder is shared with the team (Eman, Marcus, Mark, Fatih, Sanjin, Ajna) and nobody
 * else, and `assertTeamOnly` stops an upload to a folder anyone else can open.
 *
 * Not exported, because none of it is customer or product data, or because copying it would
 * defeat its purpose:
 *   - `brain_*`: Jarvis's index of the company's own email, Slack, WhatsApp and documents,
 *     which everyone can already search through Jarvis;
 *   - plumbing: `cron_run`, `rate_limits`, `system_flags`, `slack_*`;
 *   - `data_subject_request_log`: the people who asked us to delete or restrict their data.
 * And while anyone has asked us to restrict processing (`app_user.processing_restricted_at`,
 * GDPR Art. 18), the export does not run at all (assertNobodyRestricted says why).
 *
 * Test and staff rows stay in, flagged `is_likely_test` with the reason, by the admin
 * panel's own rule, on `survey_submission` and `survey_partial_save`.
 * See docs/runbooks/TEAM_DATA_EXPORT.md.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";

import { POSTGREST_MAX_ROWS, supabaseFetch } from "@features/admin/server/supabase";
import { evaluateTestSubmission } from "@features/admin/server/test-submission";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";

type Row = Record<string, unknown>;

/** A table as the database describes it: its columns in order, and its primary key. */
export interface TableSpec {
  name: string;
  columns: string[];
  key: string[];
}

export interface ExportFile {
  name: string;
  body: string;
}

/** Thrown when a run passes its deadline, so the run is recorded as a timeout. */
export class OutOfTime extends Error {}

/** Whether a table goes into the export. See the header for why each exclusion exists. */
export function isExported(table: string): boolean {
  if (table.startsWith("brain_") || table.startsWith("slack_")) return false;
  return !["cron_run", "rate_limits", "system_flags", "data_subject_request_log"].includes(table);
}

/** The admin panel's test rule, as two columns, on the two tables it judges. */
export function withTestFlag(table: string, row: Row, emailOfUser: Map<unknown, string>): Row {
  let verdict: ReturnType<typeof evaluateTestSubmission> | null = null;
  if (table === "survey_submission") {
    verdict = evaluateTestSubmission({
      recordType: "submission",
      email: emailOfUser.get(row.user_id),
      durationMs: typeof row.duration_ms === "number" ? row.duration_ms : null,
    });
  } else if (table === "survey_partial_save") {
    const answers = (row.answers ?? {}) as Record<string, unknown>;
    verdict = evaluateTestSubmission({
      recordType: "partial",
      // 00000 is the survey's email question.
      email: typeof answers["00000"] === "string" ? answers["00000"] : null,
      durationMs: null,
      answerCount: Object.keys(answers).length,
      startedAt: typeof row.started_at === "string" ? row.started_at : null,
      savedAt: typeof row.saved_at === "string" ? row.saved_at : null,
    });
  }
  return verdict
    ? { ...row, is_likely_test: verdict.isLikelyTest, test_reasons: verdict.reasons.join("|") }
    : row;
}

/** What a masked value reads. */
export const MASKED = "[masked]";
/** An address, also with its @ written as %40, as it travels inside a link. */
const EMAIL = /[A-Za-z0-9._%+-]+(?:@|%40)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gi;
/**
 * A report's access token (`rpt_`), a share link's (`rpts_`) or a prepaid one's (`rpp_`), in a
 * link's path or in `?token=`. Also
 * `rpt_<redacted>`, the stand-in an earlier fix left in old analytics rows, so a check for
 * `rpt_` finds nothing at all.
 */
const REPORT_TOKEN = /rp(?:ts?|p)_[A-Za-z0-9_<>-]*/g;
/** Masked in every table that has a column of this name. */
const PERSONAL_COLUMNS = new Set([
  "first_name",
  "last_name",
  "birthday",
  "password_hash",
  "ip",
  "client_ip",
  "ip_address",
  "card_last4",
  "card_exp_month",
  "card_exp_year",
  "receipt_url",
  "regeneration_url",
  "share_token",
  "prepaid_token",
  "personal_message",
  // Sessions in PostHog and Hotjar, whose recordings show the person: our own session ids,
  // which join the tables, stay.
  "posthog_session_id",
  "hotjar_user_id",
  // An answer's edits: the email answer is the one most often corrected.
  "old_answer_text",
  "new_answer_text",
]);
/**
 * Masked in one table, where the name alone says too little: a report's link and token, and
 * the raw Calendly and Stripe payloads, which repeat a person's name, email and card.
 */
const PERSONAL_IN: Record<string, string[]> = {
  personal_report: ["url"],
  report_access_token: ["token"],
  booking_event: ["raw"],
  payment_webhook_event: ["event_data"],
};
/**
 * Keys inside JSON values that hold a credential, an address, a name or an answer, written
 * snake_case: a key is compared after `firstName` becomes `first_name`. The masked column
 * names count as keys too.
 */
const PERSONAL_KEYS = new Set([
  "report_token",
  "token",
  "request_ip",
  "answer",
  "promo_code",
  "promotion_code",
  "nurture_promo_codes",
  // An admin's search, which can be a customer's name.
  "query",
  // A person's name, under the names payment and booking systems give it.
  "full_name",
  "display_name",
  "customer_name",
  "invitee_name",
  "cardholder_name",
  "billing_name",
  "contact_name",
  "partner_name",
  "recipient_name",
  "sender_name",
  "phone",
  "phone_number",
  "address",
  "postal_code",
  // The postcode answer, copied into the scoring engine's diagnostics as OVL_POSTAL_CODE:
  // found on 2026-10-11 by the check below, in 2,470 scoring results.
  "ovl_postal_code",
  "zip",
  "city",
  "street",
]);
/** `firstName` and `first_name` alike. */
const snakeKey = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
/** The survey's questions for the email, the name and the ZIP or postal code. */
export const PERSONAL_QUESTIONS = ["00000", "00001", "15002"];
/** `email`, `owner_email`, `subscriber_emails`; not `email_position`, the A/B arm. */
const isEmailColumn = (column: string) => /(^|_)emails?$/.test(column);

/**
 * A column whose name suggests it may hold someone's details. Each one must be classified,
 * as masked above or as not personal below, or the export stops: the masking is a list, and
 * a new column must not go out unmasked because nobody added it to the list.
 */
const LOOKS_PERSONAL =
  /(mail|name|phone|(^|_)ip($|_)|addr|zip|postal|birth|(^|_)dob($|_)|password|passwd|token|secret|url|href|link|card|iban|bank|account_number|receipt|message|ssn|passport|national|tax_id|license|street|city|location|(^|_)geo|latitude|longitude|(^|_)(lat|lng|lon)($|_)|social|instagram|facebook|twitter|linkedin|tiktok|handle|posthog|hotjar|clarity|fingerprint|visitor)/i;
/** Names that look personal but hold no one's details, checked against the data on 2026-10-11. */
const NOT_PERSONAL = new Set([
  // Links between admin records, and to sources the team cites.
  "linked_href",
  "source_href",
  "evidence_links",
  "linked_metric_key",
  "linked_chart_key",
  "linked_experiment_id",
  "linked_release_id",
  "linked_action_id",
  "linked_question_ids",
  "source_url",
  "pr_url",
  "url_path",
  // Names of things, not of people.
  "competitor_name",
  "source_name",
  "scanner_name",
  "item_name",
  // Where the email question sat (an A/B arm), and when a reminder went.
  "email_position",
  "early_access_email_sent_at",
  // Visa or Mastercard, and the bank's reason a payment failed.
  "card_brand",
  "failure_message",
  // Our own first-party visitor id (it joins funnel events), and a count of visitors.
  "visitor_id",
  "unique_visitors",
]);
/** JSON keys that look personal but hold no one's details, checked against the data on 2026-10-11. */
const NOT_PERSONAL_KEYS = new Set([
  // A page's path: any report token in it is masked as text.
  "pathname",
  // Where the email question sat (an A/B arm), and which reminder emails went.
  "survey_email_position",
  "nurture_emails_sent",
  "discount_emails_sent",
  // A coupon's name, a hash of a scoring payload, a metric in a test walk.
  "coupon_name",
  "payload_fingerprint",
  "metric_name",
]);
/**
 * Keys safe at one place only, by table.column.key path: a generic key such as `location`
 * stays checked everywhere else.
 */
const NOT_PERSONAL_PATHS = new Set([
  // The page an automated persona walk was on: the walks are our own tests, not people.
  "ux_walk_record.events.props.location",
]);
/** A column that names a thing in these tables and nothing personal. */
const NOT_PERSONAL_IN: Record<string, string[]> = {
  admin_experiment: ["name"],
  admin_export_preset: ["name"],
  admin_saved_view: ["name"],
  admin_segment: ["name"],
  submission_tag: ["name"],
  digest_recommendation_history: ["message", "fingerprint"],
  // The country someone lives in (82 values), as the country answer the copy keeps.
  user_profile: ["location_primary"],
};

/**
 * How a column reads in the masked copy: `masked` (every value), `partly` (the email, name and
 * postcode answers, or keys inside a draft's answers), or null (kept as it is, with any email
 * address or report token inside text masked). The admin's data catalog shows it per field.
 */
export function columnPrivacy(table: string, column: string): "masked" | "partly" | null {
  if (
    PERSONAL_COLUMNS.has(column) ||
    (PERSONAL_IN[table] ?? []).includes(column) ||
    isEmailColumn(column)
  ) {
    return "masked";
  }
  if (
    (table === "survey_submission_answer" &&
      (column === "answer_text" || column === "normalized_value")) ||
    (table === "survey_partial_save" && column === "answers")
  ) {
    return "partly";
  }
  return null;
}

/** Columns whose names suggest personal data that are neither masked nor known to be safe. */
export function unclassifiedColumns(specs: TableSpec[]): string[] {
  return specs.flatMap((s) =>
    s.columns
      .filter(
        (c) =>
          LOOKS_PERSONAL.test(c) &&
          !PERSONAL_COLUMNS.has(c) &&
          !(PERSONAL_IN[s.name] ?? []).includes(c) &&
          !isEmailColumn(c) &&
          !NOT_PERSONAL.has(c) &&
          !(NOT_PERSONAL_IN[s.name] ?? []).includes(c)
      )
      .map((c) => `${s.name}.${c}`)
  );
}

export interface Masker {
  email(value: string): string;
  text(value: string): string;
  /** `where` (table.column) names the value in the list of unclassified keys. */
  json(value: unknown, where?: string): unknown;
  /** JSON keys seen that look personal but are neither masked nor known to be safe. */
  unclassified(): string[];
}

/**
 * Masking for one copy. An email becomes `masked-` and a code: the same address gets the same
 * code in every table of the copy, so tables still join on it, and the key is new for every
 * copy and never kept, so nobody can work back from a code to an address.
 */
export function masker(key: Buffer = randomBytes(32)): Masker {
  const email = (value: string) =>
    `masked-${createHmac("sha256", key)
      .update(value.trim().toLowerCase().replace(/%40/g, "@"))
      .digest("hex")
      .slice(0, 12)}`;
  const text = (value: string) => value.replace(EMAIL, email).replace(REPORT_TOKEN, MASKED);
  const unknown = new Set<string>();
  /**
   * A JSON value, key by key, as deep as it goes. A key is masked like the column of the same
   * name; an email key keeps a code; and a key that looks personal but is in no list is
   * recorded, so the run stops before anything is written: a new key inside a JSON value
   * must not go out unmasked any more than a new column may.
   */
  const json = (value: unknown, where = "json"): unknown => {
    if (typeof value === "string") return text(value);
    if (Array.isArray(value)) return value.map((v) => json(v, where));
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([raw, v]) => {
          // A key can itself be personal (a map keyed by address or token): it is masked like
          // text, here and in the error that names it, which reaches logs, Slack and cron_run.
          const k = text(raw);
          // A key that had to be masked is about a person, and so is what it holds.
          if (k !== raw) return [k, v === null || v === undefined ? v : MASKED];
          const key = snakeKey(k);
          if (v === null || v === undefined) return [k, v];
          if (PERSONAL_KEYS.has(key) || PERSONAL_COLUMNS.has(key)) return [k, MASKED];
          if (isEmailColumn(key)) {
            return [k, typeof v === "string" ? email(v) : json(v, `${where}.${key}`)];
          }
          if (
            LOOKS_PERSONAL.test(key) &&
            !NOT_PERSONAL.has(key) &&
            !NOT_PERSONAL_KEYS.has(key) &&
            !NOT_PERSONAL_PATHS.has(`${where}.${key}`)
          ) {
            unknown.add(`${where}.${key}`);
          }
          return [k, json(v, `${where}.${key}`)];
        })
      );
    }
    return value;
  };
  return { email, text, json, unclassified: () => [...unknown].sort() };
}

/**
 * One row as the copy holds it. Masked: emails (as codes), names, birthdays, IP addresses,
 * report links and tokens, card details, receipt links, promo codes, messages to a partner,
 * the email, name and postcode answers, and the raw Stripe and Calendly payloads. Every other
 * text keeps its words with any email address or report token in it masked; a name typed
 * into free text (the two open questions, feedback comments) can remain.
 */
export function maskRow(
  table: string,
  row: Row,
  m: Masker,
  personalQuestionIds: Set<unknown>
): Row {
  const whole = PERSONAL_IN[table] ?? [];
  const personalAnswer =
    table === "survey_submission_answer" && personalQuestionIds.has(row.survey_question_id);
  const out: Row = {};
  for (const [column, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      out[column] = value;
    } else if (
      PERSONAL_COLUMNS.has(column) ||
      whole.includes(column) ||
      (personalAnswer && (column === "answer_text" || column === "normalized_value"))
    ) {
      out[column] = MASKED;
    } else if (isEmailColumn(column)) {
      // The whole value, not only the part that looks like an address: a typo is still one.
      out[column] =
        typeof value === "string"
          ? m.email(value)
          : Array.isArray(value)
            ? value.map((v) =>
                typeof v === "string" ? m.email(v) : m.json(v, `${table}.${column}`)
              )
            : m.json(value, `${table}.${column}`);
    } else if (
      table === "survey_partial_save" &&
      column === "answers" &&
      typeof value === "object"
    ) {
      const answers = { ...(value as Row) };
      for (const qid of PERSONAL_QUESTIONS) if (qid in answers) answers[qid] = MASKED;
      out[column] = m.json(answers, `${table}.${column}`);
    } else {
      out[column] = typeof value === "string" ? m.text(value) : m.json(value, `${table}.${column}`);
    }
  }
  return out;
}

/**
 * People who asked us to restrict processing (GDPR Art. 18) must not be in the export. No
 * filter can promise that: their details also sit in payloads, URLs and free text, in more
 * encodings than any matcher decodes, and each attempt at one was shown a way past it. So the
 * export does not try. It stops, before writing anything, while anyone is restricted, and a
 * person decides (see docs/runbooks/TEAM_DATA_EXPORT.md). Nobody had been on 2026-10-10.
 */
export function assertNobodyRestricted(users: Row[]): void {
  const restricted = users.filter((u) => u.processing_restricted_at != null);
  if (restricted.length) {
    throw new Error(
      `${restricted.length} people asked us to restrict processing their data (app_user.processing_restricted_at); ` +
        "the export stops rather than risk copying them: see docs/runbooks/TEAM_DATA_EXPORT.md. Nothing written."
    );
  }
}

/**
 * One CSV cell. Text Excel would run as a formula (=, +, -, @ first) gets a leading quote,
 * as the admin export does; a number does not, so a negative value stays a number.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^[-+]?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The table's own columns first, so an empty table still has its header; added ones after. */
export function toCsv(rows: Row[], columns: string[] = []): string {
  const all = [...new Set([...columns, ...rows.flatMap((row) => Object.keys(row))])];
  const lines = [all.map(csvCell).join(",")];
  for (const row of rows) lines.push(all.map((c) => csvCell(row[c])).join(","));
  return `${lines.join("\n")}\n`;
}

export function readme(
  specs: TableSpec[],
  counts: Record<string, number>,
  generatedAt: string
): string {
  return [
    "# LoveIQ team data export",
    "",
    `Generated ${generatedAt} from the production database.`,
    "Names, emails and other details that identify a person are masked; what people answered",
    "and did is all here. For the LoveIQ team only (Eman, Marcus, Mark, Fatih, Sanjin, Ajna):",
    "it is still about people's sex lives, so keep it in this folder and do not forward it.",
    "For a fresh copy, ask Claude (Jarvis) to export all the data; it takes a few minutes.",
    "",
    "| File | Rows |",
    "| --- | --- |",
    ...specs.map((s) => `| ${s.name}.csv | ${counts[s.name] ?? 0} |`),
    "",
    "- Masked: every email address reads `masked-` and a code. The same address has the same",
    "  code in every file of this copy, so tables still join on it; the codes change with every",
    "  copy. Names, birthdays, IP addresses, report links and access tokens, card details,",
    "  receipt links, promo codes, messages to a partner, PostHog and Hotjar session ids, the",
    "  email, name and postcode answers, and the raw Stripe and Calendly payloads read [masked].",
    "- Kept: every answer, including the two open questions as typed (any email address or",
    "  report link in them masked; a name someone typed can remain), demographics, archetypes",
    "  and scores, payments (amounts, plans, dates) and events.",
    "- One CSV per database table, same columns. JSON columns hold JSON text.",
    "- Not exported: Jarvis's own index (brain_*), job and alert plumbing (cron_run,",
    "  rate_limits, system_flags, slack_*), and the log of people who asked us to delete their",
    "  data.",
    "- Nobody had asked us to restrict processing their data. The export stops while anyone has.",
    "- `is_likely_test` and `test_reasons` on survey_submission and survey_partial_save flag",
    "  staff emails and runs too fast to be real, as the admin panel does. Filter on them.",
    "- Every refresh replaces the files named after a table. Keep your own work under another",
    "  name or in a subfolder, or the next refresh overwrites it.",
    "- Read table by table over a few minutes, not as one snapshot: a row written meanwhile can",
    "  be in one file and not in its partner.",
    "- Excel: Data -> From Text/CSV, file origin UTF-8, and set id columns such as q_id and",
    "  frontend_qid to Text, or `00000` becomes `0`. Text that starts with = + - or @ has a",
    "  leading ' so Excel shows it instead of running it.",
    "",
  ].join("\n");
}

export function specsOf(
  definitions: Record<string, { properties?: Record<string, { description?: string }> }>
): TableSpec[] {
  const specs = Object.entries(definitions)
    .filter(([name]) => isExported(name))
    .map(([name, def]) => {
      const props = Object.entries(def.properties ?? {});
      return {
        name,
        columns: props.map(([column]) => column),
        key: props.filter(([, p]) => p.description?.includes("<pk/>")).map(([column]) => column),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  /**
   * A schema read that came back short must stop the run, not shrink it: with no tables the
   * export would upload a README over the real one and report success, and without app_user's
   * restriction column the check for restricted people would pass without looking.
   */
  const has = (table: string, column?: string) =>
    specs.some((s) => s.name === table && (!column || s.columns.includes(column)));
  const missing = [
    ["app_user", "processing_restricted_at"],
    // Masking finds the email, name and postcode answers through it.
    ["survey_question", "frontend_qid"],
    ["survey_submission"],
    ["personal_report"],
    ["survey_submission_answer"],
  ].filter(([table, column]) => !has(table!, column));
  if (missing.length) {
    throw new Error(
      `the schema read is missing ${missing.map((m) => m.join(".")).join(", ")}; nothing written`
    );
  }
  return specs;
}

/** Every table the database exposes, with its columns and keys, from its own API. */
export async function tableSpecs(): Promise<TableSpec[]> {
  // 60 s, not the default 8: the description of every table is large and slow to build.
  const res = await supabaseFetch("/rest/v1/", {
    headers: { Accept: "application/openapi+json" },
    timeoutMs: 60_000,
  });
  if (!res.ok) throw new Error(`could not read the schema (${res.status}); nothing written`);
  const spec = (await res.json()) as {
    definitions?: Record<string, { properties?: Record<string, { description?: string }> }>;
  };
  return specsOf(spec.definitions ?? {});
}

/**
 * Every row of a table. With a single-column key, a page at a time after the last key seen:
 * paging by offset slowed past the fetch timeout near the end of the 168,000 behaviour events
 * on 2026-10-10, because the database walks every skipped row again for each page. A table
 * keyed on several columns, or none, is paged by offset in key (or column) order instead, and
 * a row seen twice is kept once: an insert that sorts before the page boundary while the read
 * runs (funnel_event is written all the time) shifts the next page by one.
 */
async function readAll(spec: TableSpec, isOutOfTime: () => boolean): Promise<Row[]> {
  const rows: Row[] = [];
  const keyset = spec.key.length === 1 ? spec.key[0]! : null;
  const order = (keyset ? [keyset] : spec.key.length ? spec.key : spec.columns)
    .map((c) => `${c}.asc`)
    .join(",");
  let after: unknown = null;
  for (let offset = 0; ; offset += POSTGREST_MAX_ROWS) {
    // Every page, not every table: the largest table is over a hundred pages.
    if (isOutOfTime()) throw new OutOfTime(`ran out of time reading ${spec.name}; nothing written`);
    const from =
      keyset && after !== null ? `&${keyset}=gt.${encodeURIComponent(String(after))}` : "";
    const page = keyset ? "" : `&offset=${offset}`;
    const res = await supabaseFetch(
      `/rest/v1/${spec.name}?select=*&order=${order}&limit=${POSTGREST_MAX_ROWS}${from}${page}`,
      { timeoutMs: 60_000, paginated: true }
    );
    if (!res.ok) throw new Error(`could not read ${spec.name} (${res.status}); nothing written`);
    const batch = (await res.json()) as Row[];
    rows.push(...batch);
    if (batch.length < POSTGREST_MAX_ROWS) break;
    if (keyset) after = batch[batch.length - 1]![keyset];
  }
  return keyset ? rows : uniqueRows(rows, spec.key.length ? spec.key : spec.columns);
}

/** Rows with the same values in `identity` kept once, first seen first. */
export function uniqueRows(rows: Row[], identity: string[]): Row[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const id = JSON.stringify(identity.map((c) => row[c]));
    return seen.has(id) ? false : (seen.add(id), true);
  });
}

/**
 * Every file of the export, the README last. App users are read first, so a restriction stops
 * the run before anything else is read. Each table becomes CSV as soon as it is read and its
 * rows are dropped: holding every table's rows until the end peaked at 1.1 GB on 2026-10-11,
 * over half of what a server function has.
 */
export async function buildExport(
  specs: TableSpec[],
  read: (spec: TableSpec, isOutOfTime: () => boolean) => Promise<Row[]> = readAll,
  isOutOfTime: () => boolean = () => false,
  generatedAt: () => string = () => new Date().toISOString()
): Promise<ExportFile[]> {
  const unclassified = unclassifiedColumns(specs);
  if (unclassified.length) {
    throw new Error(
      `columns whose names suggest personal data are not classified yet: ${unclassified.join(", ")}. ` +
        "Mark each as masked or not personal in features/admin/server/team-export.ts. Nothing written."
    );
  }
  const usersSpec = specs.find((s) => s.name === "app_user");
  const questionsSpec = specs.find((s) => s.name === "survey_question");
  if (!usersSpec || !questionsSpec) {
    throw new Error("the schema read has no app_user or survey_question; nothing written");
  }
  const users = await read(usersSpec, isOutOfTime);
  assertNobodyRestricted(users);
  // Before masking: the test flag reads the real address (a loveiq.org one is staff).
  const emailOfUser = new Map(users.map((u) => [u.id, String(u.email ?? "")]));
  const questions = await read(questionsSpec, isOutOfTime);
  const personal = questions.filter((q) => PERSONAL_QUESTIONS.includes(String(q.frontend_qid)));
  // Fail closed: an answer to a question we cannot find would go out unmasked.
  if (personal.length !== PERSONAL_QUESTIONS.length) {
    throw new Error(
      "could not find the survey's email, name and postcode questions to mask; nothing written"
    );
  }
  const personalQuestionIds = new Set(personal.map((q) => q.id));
  const m = masker();
  const counts: Record<string, number> = {};
  const files: ExportFile[] = [];
  for (const spec of specs) {
    if (isOutOfTime()) throw new OutOfTime(`ran out of time before ${spec.name}; nothing written`);
    const rows =
      spec === usersSpec
        ? users
        : spec === questionsSpec
          ? questions
          : await read(spec, isOutOfTime);
    counts[spec.name] = rows.length;
    // In place, so each original row can go as soon as its masked one exists.
    for (let i = 0; i < rows.length; i++) {
      rows[i] = maskRow(
        spec.name,
        withTestFlag(spec.name, rows[i]!, emailOfUser),
        m,
        personalQuestionIds
      );
    }
    files.push({ name: `${spec.name}.csv`, body: toCsv(rows, spec.columns) });
  }
  const unknownKeys = m.unclassified();
  if (unknownKeys.length) {
    throw new Error(
      `keys inside JSON values whose names suggest personal data are not classified yet: ${unknownKeys.join(", ")}. ` +
        "Mark each as masked or not personal in features/admin/server/team-export.ts. Nothing written."
    );
  }
  // Last, so a run that fails part-way never shows a README dated after files it did not write.
  files.push({ name: "README.md", body: readme(specs, counts, generatedAt()) });
  return files;
}

/** The Drive property the server finds the team's folder by, so renaming the folder is safe. */
export const TEAM_FOLDER_TAG = { key: "loveiq_team_export", value: "production" } as const;
/**
 * The Drive property every exported file carries, so Jarvis's Drive walk can leave a file out
 * wherever it ends up: moved out of the folder, or the folder's tag gone.
 */
export const TEAM_FILE_TAG = { key: "loveiq_team_export_file", value: "production" } as const;
/** The account that owns the folder and writes the export. */
export const TEAM_EXPORT_OWNER = "ec@loveiq.org";

export function folderUrl(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`;
}

/** A value inside a quoted Drive query term: backslashes and single quotes escaped. */
export function driveQuoted(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

interface Permission {
  type?: string;
  emailAddress?: string;
  displayName?: string;
  role?: string;
}

interface FolderMeta {
  mimeType?: string;
  trashed?: boolean;
  ownedByMe?: boolean;
  writersCanShare?: boolean;
  permissions?: Permission[];
}

interface DriveFile {
  id: string;
  name: string;
  ownedByMe?: boolean;
  permissions?: Permission[];
}

/**
 * Why a permission list lets in more than loveiq.org people: a link, the whole domain, a group
 * (Drive does not list a group's members, and a group can hold outside accounts), or an
 * outside account. Empty when only loveiq.org people can open it.
 */
function openTo(permissions: Permission[] | undefined): string[] {
  // Fail closed: a reply without the list says nothing about who can open it.
  if (!Array.isArray(permissions)) return ["Drive did not say who can open it"];
  return permissions.flatMap((p) => {
    if (p.type === "anyone" || p.type === "domain") return [`it is shared by ${p.type} link`];
    if (p.type !== "user") {
      return [
        `it is shared with a ${p.type ?? "kind of account"} whose members Drive does not list`,
      ];
    }
    const email = (p.emailAddress ?? "").toLowerCase();
    return email.endsWith("@loveiq.org") ? [] : ["someone outside loveiq.org can open it"];
  });
}

/**
 * The folder must be ours and closed: owned by the account the export writes as, open only to
 * loveiq.org people (no link, domain or group), and editors unable to share it on. Checked
 * right before every upload, because the data goes there unattended and a folder's sharing
 * can change after the decision that made it.
 */
export function assertTeamOnly(folder: FolderMeta): void {
  const problems: string[] = [];
  if (folder.mimeType !== "application/vnd.google-apps.folder" || folder.trashed) {
    problems.push("it is not a folder in use");
  }
  if (folder.ownedByMe !== true) problems.push("ec@loveiq.org does not own it");
  if (folder.writersCanShare !== false) problems.push("its editors can share it on");
  problems.push(...openTo(folder.permissions));
  if (problems.length) {
    throw new Error(
      `refusing to upload: the Drive folder is not team-only (${[...new Set(problems)].join("; ")}). Nothing written.`
    );
  }
}

/**
 * One Drive request. A 429, a 5xx or a rate-limit 403 is retried once, after 2 s: a run makes
 * about 300 requests, and one passing error would otherwise leave the folder half refreshed.
 * Not the upload itself (`once`): resending a body to a session that may hold part of it is
 * not how Drive resumes, and its 90 s would break the run's time budget. A timeout is never
 * retried, for the same budget. A request that throws fails without its URL: an upload's URL
 * is a session link that takes content without a login for a week, and these messages reach
 * Slack, cron_run and the chat.
 */
async function drive(
  url: string,
  init: RequestInit & { timeoutMs: number; once?: boolean },
  what: string
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      const { once: _once, ...request } = init;
      res = await fetchWithTimeout(url, request);
    } catch (err) {
      const why = err instanceof Error && /timeout/i.test(err.message) ? "timed out" : "failed";
      throw new Error(`Drive ${what} ${why}`);
    }
    const passing =
      res.status === 429 ||
      res.status >= 500 ||
      (res.status === 403 && /rateLimitExceeded/i.test(await res.clone().text()));
    if (!passing || attempt === 1 || init.once) return res;
    await new Promise((r) => setTimeout(r, 2_000));
  }
}

const FOLDER_FIELDS =
  "mimeType,trashed,ownedByMe,writersCanShare,permissions(type,role,emailAddress,displayName)";

/** Who can open the team's folder: names for replies, addresses for checking its files. */
export interface FolderPeople {
  people: string[];
  emails: string[];
  /** The one person who can add someone: editors cannot share the folder on. */
  owner: string;
}

/** Checks a folder by id before anything goes into it, and returns who can open it. */
export async function checkFolder(token: string, id: string): Promise<FolderPeople> {
  const res = await drive(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=${FOLDER_FIELDS}`,
    { headers: { Authorization: `Bearer ${token}` }, timeoutMs: 30_000 },
    "read of the folder"
  );
  if (!res.ok) throw new Error(`Drive could not read the folder (${res.status}). Nothing written.`);
  const folder = (await res.json()) as FolderMeta;
  assertTeamOnly(folder);
  const permissions = folder.permissions ?? [];
  return {
    people: permissions.map((p) => p.displayName || p.emailAddress || "someone"),
    emails: permissions.map((p) => (p.emailAddress ?? "").toLowerCase()),
    owner: (() => {
      const o = permissions.find((p) => p.role === "owner");
      return o?.displayName || o?.emailAddress || "the folder's owner";
    })(),
  };
}

/**
 * The team's folder: the one carrying TEAM_FOLDER_TAG that ec@ owns. Owned, because anyone
 * can share a folder with ec@ and set the same tag on it (this repository is public), and the
 * export must never go into a folder somebody else controls.
 */
export async function findTeamFolder(
  token: string
): Promise<{ id: string; people: string[]; owner: string }> {
  const q = encodeURIComponent(
    `properties has { key=${driveQuoted(TEAM_FOLDER_TAG.key)} and value=${driveQuoted(TEAM_FOLDER_TAG.value)} } ` +
      "and mimeType='application/vnd.google-apps.folder' and 'me' in owners and trashed=false"
  );
  const res = await drive(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` }, timeoutMs: 30_000 },
    "search for the team folder"
  );
  if (!res.ok) throw new Error(`Drive could not search for the team folder (${res.status})`);
  const found = ((await res.json()) as { files?: Array<{ id: string }> }).files ?? [];
  if (found.length !== 1) {
    throw new Error(
      `${found.length} of ec@'s Drive folders carry the team export's tag (one must): ` +
        "see docs/runbooks/TEAM_DATA_EXPORT.md. Nothing written."
    );
  }
  const { people, owner } = await checkFolder(token, found[0]!.id);
  return { id: found[0]!.id, people, owner };
}

/** Every file in the folder, with its owner and who can open it: one request for all. */
async function folderFiles(token: string, folderId: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  const q = encodeURIComponent(`${driveQuoted(folderId)} in parents and trashed=false`);
  let page = "";
  do {
    const res = await drive(
      `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=1000` +
        "&fields=nextPageToken,files(id,name,ownedByMe,permissions(type,emailAddress))" +
        (page ? `&pageToken=${encodeURIComponent(page)}` : ""),
      { headers: { Authorization: `Bearer ${token}` }, timeoutMs: 30_000 },
      "listing of the folder"
    );
    if (!res.ok)
      throw new Error(`Drive could not list the folder (${res.status}). Nothing written.`);
    const body = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
    files.push(...(body.files ?? []));
    page = body.nextPageToken ?? "";
  } while (page);
  return files;
}

/**
 * The file each export file replaces (null: create it), checked for every file before any is
 * written, so a problem stops the run with the folder untouched:
 *   - two files with a table's name (an editor's copy saved under it): refreshing only one
 *     would leave the other holding old data, people erased since included;
 *   - a file ec@ does not own: its owner, not ec@, decides who it is shared with;
 *   - a file anyone can open who cannot open the folder: sharing a single file does not show
 *     on the folder, and the replies say exactly who can open it.
 */
export function plan(
  files: ExportFile[],
  existing: DriveFile[],
  folderEmails: string[]
): Array<string | null> {
  const problems: string[] = [];
  const ids = files.map((f) => {
    const same = existing.filter((e) => e.name === f.name);
    if (same.length > 1) problems.push(`${same.length} files are named ${f.name}`);
    const file = same.length === 1 ? same[0]! : null;
    if (file && file.ownedByMe !== true)
      problems.push(`${f.name} belongs to someone other than ec@`);
    if (file) problems.push(...openTo(file.permissions).map((why) => `${f.name}: ${why}`));
    const extra = (file?.permissions ?? []).filter(
      (p) => !folderEmails.includes((p.emailAddress ?? "").toLowerCase())
    );
    if (extra.length) problems.push(`${f.name} is shared with someone the folder is not`);
    return file?.id ?? null;
  });
  if (problems.length) {
    throw new Error(
      `refusing to upload: ${[...new Set(problems)].join("; ")}. Rename, unshare or delete those ` +
        "files in the Drive folder, then run again. Nothing written."
    );
  }
  return ids;
}

async function driveUpload(
  token: string,
  folderId: string,
  file: ExportFile,
  existing: string | null
): Promise<void> {
  const auth = { Authorization: `Bearer ${token}` };
  /**
   * `writersCanShare: false` on every file, new or replaced. The folder's own setting does not
   * reach the files in it: until 2026-10-11 all 77 let an editor share them with anyone.
   */
  const start = await drive(
    existing
      ? `https://www.googleapis.com/upload/drive/v3/files/${existing}?uploadType=resumable`
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
    {
      method: existing ? "PATCH" : "POST",
      headers: { ...auth, "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(
        existing
          ? { writersCanShare: false, properties: { [TEAM_FILE_TAG.key]: TEAM_FILE_TAG.value } }
          : {
              name: file.name,
              parents: [folderId],
              writersCanShare: false,
              properties: { [TEAM_FILE_TAG.key]: TEAM_FILE_TAG.value },
            }
      ),
      timeoutMs: 15_000,
    },
    `start of the upload of ${file.name}`
  );
  // Resumable, because a simple upload stops at 5 MB and the larger tables pass it.
  const session = start.headers.get("location");
  if (!start.ok || !session) throw new Error(`Drive refused ${file.name}: ${start.status}`);
  const put = await drive(
    session,
    {
      method: "PUT",
      headers: { "Content-Type": file.name.endsWith(".md") ? "text/markdown" : "text/csv" },
      body: file.body,
      timeoutMs: 90_000,
      once: true,
    },
    `upload of ${file.name}`
  );
  if (!put.ok) throw new Error(`Drive upload of ${file.name} failed: ${put.status}`);

  /**
   * Drive keeps each replaced version for about 30 days, and editors can open them. The old
   * versions go, or a person erased from the database (or an unmasked copy) would live on in
   * last week's version. Which version is current comes from Drive itself, and its content is
   * checked against what was sent, because the order of the version list is not promised: the
   * last one listed is not necessarily the one just uploaded.
   */
  const id = existing ?? ((await put.json()) as { id?: string }).id;
  if (!id) throw new Error(`Drive did not say which file ${file.name} became`);
  const meta = await drive(
    `https://www.googleapis.com/drive/v3/files/${id}?fields=${["headRevisionId", "md5Checksum"].join(",")}`,
    { headers: auth, timeoutMs: 15_000 },
    `read of ${file.name}`
  );
  if (!meta.ok) throw new Error(`Drive could not read ${file.name} (${meta.status})`);
  const { headRevisionId: head, md5Checksum } = (await meta.json()) as {
    headRevisionId?: string;
    md5Checksum?: string;
  };
  if (!head) throw new Error(`Drive did not say which version of ${file.name} is current`);
  if (md5Checksum !== createHash("md5").update(file.body).digest("hex")) {
    throw new Error(`the current version of ${file.name} is not what was uploaded`);
  }
  const old: string[] = [];
  let page = "";
  do {
    const listed = await drive(
      `https://www.googleapis.com/drive/v3/files/${id}/revisions?fields=nextPageToken,revisions(id)&pageSize=1000` +
        (page ? `&pageToken=${encodeURIComponent(page)}` : ""),
      { headers: auth, timeoutMs: 15_000 },
      `listing of ${file.name}'s versions`
    );
    if (!listed.ok) {
      throw new Error(`Drive could not list ${file.name}'s versions (${listed.status})`);
    }
    const body = (await listed.json()) as {
      revisions?: Array<{ id: string }>;
      nextPageToken?: string;
    };
    old.push(...(body.revisions ?? []).map((r) => r.id).filter((r) => r !== head));
    page = body.nextPageToken ?? "";
  } while (page);
  for (const revision of old) {
    const gone = await drive(
      `https://www.googleapis.com/drive/v3/files/${id}/revisions/${revision}`,
      { method: "DELETE", headers: auth, timeoutMs: 15_000 },
      `deletion of an old version of ${file.name}`
    );
    // 404: already gone, as after a retry whose first attempt worked but lost its answer.
    if (!gone.ok && gone.status !== 404) {
      throw new Error(`Drive kept an old version of ${file.name} (${gone.status})`);
    }
  }
}

/**
 * Each file into the folder, replacing its namesake, in order (the README is last). The folder
 * and every file it will replace are checked first, so a check that fails writes nothing; a
 * request that fails part-way leaves the files before it refreshed and the README older than
 * them, and the next run completes it.
 */
export async function uploadExport(
  token: string,
  folderId: string,
  files: ExportFile[],
  isOutOfTime: () => boolean = () => false
): Promise<void> {
  if (isOutOfTime()) throw new OutOfTime("ran out of time before uploading; nothing written");
  const { emails } = await checkFolder(token, folderId);
  const ids = plan(files, await folderFiles(token, folderId), emails);
  for (const [i, f] of files.entries()) {
    if (isOutOfTime()) throw new OutOfTime(`ran out of time before uploading ${f.name}`);
    await driveUpload(token, folderId, f, ids[i]!);
  }
}
