/**
 * The raw data explorer of AP-Analytics (Marcus's "Raw data explorer" artboard): any table of
 * the catalog, a date field and range, filters, columns, sorting and pages, as rows.
 *
 * MASKED BY DEFAULT, as the team's copy of the data is (team-export.ts, decision 2026-10-11):
 * every row goes through the export's own maskRow. While masked, a filter or sort may not use a
 * personal field, and no filter value may look like an email address or a report link, so the
 * filters cannot test whether someone is in the data. An admin can unlock one table for 15
 * minutes with a reason, which is logged (admin_audit_log); the unlock is a signed token naming
 * the admin, the table and its end, checked on every read.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { countRows, fetchAllRows, supabaseFetch } from "@features/admin/server/supabase";
import {
  masker,
  maskRow,
  MASKED,
  PERSONAL_QUESTIONS,
  type Masker,
} from "@features/admin/server/team-export";
import { hogqlTable } from "@features/ux-review/server/review";
import logger from "@shared/observability/logger";
import { reportingDay } from "@shared/time/reporting-day";

import { GA4_DAYS, SOURCE_KEYS, type CatalogTable, type SourceKey } from "./catalog";
import { windowOf } from "./filters";

import {
  isNumeric,
  isTextLike,
  MASKED_TEXT_OPS,
  OPS,
  PAGE_SIZES,
  type ExplorerQuery,
  type ExplorerResult,
  type Filter,
  type Row,
} from "./explorer-spec";

export {
  EXPORT_MAX,
  OPS,
  PAGE_SIZES,
  UNLOCK_MINUTES,
  type ExplorerQuery,
  type ExplorerResult,
  type Filter,
  type Op,
} from "./explorer-spec";

/** Thrown for a query the explorer refuses; its message is safe to show. */
export class Refused extends Error {}

const JSONISH = new Set(["json", "jsonb"]);
const isArrayType = (type: string) => type.endsWith("[]");
/** An address, or a report, share or prepaid link's token, typed into a filter. */
export const LOOKS_PERSONAL_VALUE = /@|%40|rp(?:ts?|p)_/i;

/**
 * The query, checked against the table: known columns only, filters a column's type can take,
 * and, while masked, nothing that could find or rank a person by a personal field.
 */
export function checkQuery(table: CatalogTable, q: ExplorerQuery, masked: boolean): void {
  const field = new Map(table.fields.map((f) => [f.name, f]));
  for (const c of q.columns)
    if (!field.has(c)) throw new Refused(`${table.name} has no field ${c}.`);
  if (q.columns.length === 0) throw new Refused("Pick at least one column.");
  if (q.dateField && !table.dateFields.includes(q.dateField))
    throw new Refused(`${q.dateField} is not a date field of ${table.name}.`);
  if (masked && q.dateField && field.get(q.dateField)?.privacy)
    throw new Refused(`Ranging over ${q.dateField} needs the table unlocked: it is personal.`);
  if (q.sort) {
    const f = field.get(q.sort);
    if (!f) throw new Refused(`${table.name} has no field ${q.sort}.`);
    if (masked && f.privacy)
      throw new Refused(`Sorting by ${q.sort} needs the table unlocked: it is personal.`);
    if (JSONISH.has(f.type) || isArrayType(f.type))
      throw new Refused(`${q.sort} cannot be sorted.`);
  }
  if (q.filters.length > 10) throw new Refused("At most 10 filters.");
  for (const flt of q.filters) {
    const f = field.get(flt.column);
    if (!f) throw new Refused(`${table.name} has no field ${flt.column}.`);
    if (masked && f.privacy)
      throw new Refused(`Filtering on ${flt.column} needs the table unlocked: it is personal.`);
    if (masked && LOOKS_PERSONAL_VALUE.test(flt.value)) {
      throw new Refused(
        "While masked, a filter cannot search for an email address or a report link."
      );
    }
    // Greater or less than on text brackets a value letter by letter, and "contains" spells
    // it out a letter at a time (an address or a report link inside a page address), both
    // without ever showing it: while masked, text is matched whole.
    if (masked && isTextLike(f.type) && !MASKED_TEXT_OPS.includes(flt.op)) {
      throw new Refused(
        flt.op === "contains"
          ? `While masked, ${flt.column} is matched whole, not searched inside: unlock the table to search inside it.`
          : `While masked, ${flt.column} can be matched, not ranged.`
      );
    }
    if ((JSONISH.has(f.type) || isArrayType(f.type)) && flt.op !== "null" && flt.op !== "notnull") {
      throw new Refused(`${flt.column} can only be filtered on empty or not empty.`);
    }
    if (["gt", "gte", "lt", "lte"].includes(flt.op) && f.type === "boolean")
      throw new Refused(`${flt.column} is yes or no.`);
    if (
      isNumeric(f.type) &&
      ["eq", "neq", "gt", "gte", "lt", "lte"].includes(flt.op) &&
      !/^-?\d+(\.\d+)?$/.test(flt.value.trim())
    ) {
      throw new Refused(`${flt.column} takes a number.`);
    }
    if (flt.op !== "null" && flt.op !== "notnull" && flt.value.trim() === "")
      throw new Refused(`The filter on ${flt.column} needs a value.`);
  }
}

/** A value inside PostgREST's in.(…) list, quoted. */
const listItem = (v: string) => `"${v.trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

function postgrestFilter(f: Filter): string {
  const col = encodeURIComponent(f.column);
  const v = f.value.trim();
  switch (f.op) {
    case "null":
      return `${col}=is.null`;
    case "notnull":
      return `${col}=not.is.null`;
    case "contains":
      // `_` is a one-letter wildcard (it would stand in for an @): matched as itself.
      return `${col}=ilike.${encodeURIComponent(
        `*${v.replace(/[*%]/g, "").replace(/\\/g, "\\\\").replace(/_/g, "\\_")}*`
      )}`;
    case "in":
      return `${col}=in.${encodeURIComponent(
        `(${v
          .split(",")
          .filter((x) => x.trim())
          .map(listItem)
          .join(",")})`
      )}`;
    default:
      return `${col}=${f.op}.${encodeURIComponent(v)}`;
  }
}

/** The date range as a field compares it: a day column by its days, a time by Berlin's day bounds. */
function dateBounds(
  table: CatalogTable,
  q: ExplorerQuery
): { gte: string; lt: string; days: boolean } | null {
  if (!q.dateField) return null;
  const type = table.fields.find((f) => f.name === q.dateField)?.type;
  if (type === "date") {
    const next = new Date(`${q.to}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return { gte: q.from, lt: next.toISOString().slice(0, 10), days: true };
  }
  const { since, until } = windowOf({ from: q.from, to: q.to });
  return { gte: since.toISOString(), lt: until.toISOString(), days: false };
}

/** A Berlin day as the URL carries it. */
export const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The URL's filters: [column, op, value] triples, exactly three each, at most 10. */
const FILTERS = z.array(z.tuple([z.string().max(80), z.enum(OPS), z.string().max(200)])).max(10);

/** The filters JSON of a URL or a saved view, or null when it is not a valid list. */
export function parseFilterJson(s: string | undefined): Filter[] | null {
  if (!s) return [];
  try {
    return FILTERS.parse(JSON.parse(s)).map(([column, op, value]) => ({ column, op, value }));
  } catch {
    return null;
  }
}

/**
 * A saved explorer view: the URL state it reopens and nothing else (no page, cursor or
 * unlock). Strict, so no other key, and nothing a person typed, can ride along.
 */
export const VIEW = z
  .object({
    source: z.enum(SOURCE_KEYS as [SourceKey, ...SourceKey[]]),
    table: z.string().min(1).max(63),
    date: z.string().max(63).optional(),
    from: DAY.optional(),
    to: DAY.optional(),
    filters: z.string().max(4000).optional(),
    cols: z.string().max(4000).optional(),
    sort: z.string().max(80).optional(),
    dir: z.enum(["asc", "desc"]).optional(),
    size: z.enum(PAGE_SIZES.map(String) as [string, ...string[]]).optional(),
  })
  .strict();

/**
 * Why a saved view is refused, or null. A view keeps only a query that works masked, so it
 * never holds anyone's address, link or personal field, whoever opens it later (and the team
 * copy of the data never carries one out in admin_ap_saved_filter).
 */
export function viewRefusal(
  table: CatalogTable | undefined,
  v: z.infer<typeof VIEW>
): string | null {
  if (!table) return "No such table.";
  if (table.closed) return table.closed;
  const filters = parseFilterJson(v.filters);
  if (filters === null) return "Invalid filters.";
  if (table.source === "posthog" && v.sort && v.sort !== "timestamp")
    return "Not saved: PostHog's events sort by time only.";
  const cols = (v.cols ?? "").split(",").filter(Boolean);
  try {
    checkQuery(
      table,
      {
        dateField: v.date !== undefined ? v.date || null : (table.dateFields[0] ?? null),
        from: v.from ?? "",
        to: v.to ?? "",
        filters,
        columns: cols.length ? cols : table.fields.slice(0, 1).map((f) => f.name),
        sort: v.sort || null,
        dir: "desc",
        page: 1,
        size: 50,
        cursor: null,
      },
      true
    );
  } catch (err) {
    if (err instanceof Refused)
      return `Not saved: ${err.message} A saved view always opens masked.`;
    throw err;
  }
  return null;
}

/**
 * The order a page is read in: the chosen sort, else newest first by date, key or the first
 * column. While masked, never a personal field: the order alone would rank people by it.
 */
export function effectiveOrder(
  table: CatalogTable,
  q: ExplorerQuery,
  masked = false
): { column: string; dir: "asc" | "desc" } {
  if (q.sort) return { column: q.sort, dir: q.dir };
  const ok = (c: string) => !masked || !table.fields.find((f) => f.name === c)?.privacy;
  const column = [q.dateField, ...table.key, ...q.columns, ...table.fields.map((f) => f.name)].find(
    (c): c is string => !!c && ok(c)
  );
  return { column: column ?? q.columns[0]!, dir: "desc" };
}

const sqlText = (v: string) => `'${v.replace(/'/g, "''")}'`;
const SQL_OPS: Record<string, string> = {
  eq: "=",
  neq: "<>",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
};

/** The query as SQL a person can read (and run as read-only), with the masking noted. */
export function readableSql(table: CatalogTable, q: ExplorerQuery, masked: boolean): string {
  const where: string[] = [];
  const b = dateBounds(table, q);
  if (b && q.dateField)
    where.push(`${q.dateField} >= ${sqlText(b.gte)}`, `${q.dateField} < ${sqlText(b.lt)}`);
  for (const f of q.filters) {
    if (f.op === "null") where.push(`${f.column} IS NULL`);
    else if (f.op === "notnull") where.push(`${f.column} IS NOT NULL`);
    else if (f.op === "contains") where.push(`${f.column} ILIKE ${sqlText(`%${f.value.trim()}%`)}`);
    else if (f.op === "in")
      where.push(
        `${f.column} IN (${f.value
          .split(",")
          .filter((x) => x.trim())
          .map((x) => sqlText(x.trim()))
          .join(", ")})`
      );
    else where.push(`${f.column} ${SQL_OPS[f.op]} ${sqlText(f.value.trim())}`);
  }
  const from = table.source === "production" ? table.name : `${table.source}.${table.name}`;
  return [
    `-- ${masked ? "Masked as the team copy is: personal fields read [masked]." : "Unlocked: personal fields as stored."}`,
    `SELECT ${q.columns.join(", ")}`,
    `FROM ${from}`,
    ...(where.length ? [`WHERE ${where.join("\n  AND ")}`] : []),
    `ORDER BY ${effectiveOrder(table, q, masked).column} ${effectiveOrder(table, q, masked).dir.toUpperCase()} NULLS LAST`,
    table.source === "posthog"
      ? `LIMIT ${q.size};`
      : `LIMIT ${q.size} OFFSET ${(q.page - 1) * q.size};`,
  ].join("\n");
}

/** Columns maskRow needs to decide, read even when not shown. */
const NEEDED_FOR_MASKING: Record<string, string[]> = {
  survey_submission_answer: ["survey_question_id"],
};

let personalQuestionCache: { at: number; ids: Promise<Set<unknown>> } | null = null;

/** survey_question ids of the email, name and postcode questions (cached for an hour). */
function personalQuestionIds(): Promise<Set<unknown>> {
  const now = Date.now();
  if (personalQuestionCache && now - personalQuestionCache.at < 3_600_000)
    return personalQuestionCache.ids;
  const ids = (async () => {
    const res = await supabaseFetch(
      `/rest/v1/survey_question?select=id&frontend_qid=in.(${PERSONAL_QUESTIONS.map((q) => `"${q}"`).join(",")})`
    );
    if (!res.ok) throw new Error(`survey_question ${res.status}`);
    const rows = (await res.json()) as Array<{ id: unknown }>;
    // All three must resolve, or an email answer would read as an ordinary one.
    if (rows.length < PERSONAL_QUESTIONS.length) throw new Error("personal questions not found");
    return new Set(rows.map((r) => r.id));
  })();
  personalQuestionCache = { at: now, ids };
  ids.catch(() => {
    if (personalQuestionCache?.ids === ids) personalQuestionCache = null;
  });
  return ids;
}

let restrictedCache: { at: number; n: Promise<number> } | null = null;

/**
 * How many people asked us to restrict processing their data (GDPR Art. 18), cached for five
 * minutes. Fails closed: a count that cannot be read throws, and the explorer does not open.
 */
export function restrictedPeople(): Promise<number> {
  const now = Date.now();
  if (restrictedCache && now - restrictedCache.at < 5 * 60_000) return restrictedCache.n;
  const n = countRows("/rest/v1/app_user?processing_restricted_at=not.is.null&select=id").then(
    (c) => {
      if (c === null) throw new Error("restricted count unavailable");
      return c;
    }
  );
  restrictedCache = { at: now, n };
  n.catch(() => {
    if (restrictedCache?.n === n) restrictedCache = null;
  });
  return n;
}

/** Forget the cached counts and ids (tests, or after a change an admin made by hand). */
export function clearExplorerCaches(): void {
  restrictedCache = null;
  personalQuestionCache = null;
}

function secret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("not configured");
  return key;
}

/** The day's masking key: an email reads as the same code all day, and as another tomorrow. */
function dayMasker(now: Date): Masker {
  return masker(
    createHmac("sha256", secret())
      .update(`ap-explorer-mask|${reportingDay(now)}`)
      .digest()
  );
}

/**
 * A row masked as the team copy masks it. A JSON key that looks personal but is in none of the
 * export's lists stops the export; here its whole column is masked instead.
 */
export function maskForExplorer(
  table: string,
  row: Row,
  makeMasker: () => Masker,
  personal: Set<unknown>
): Row {
  const m = makeMasker();
  const out = maskRow(table, row, m, personal);
  for (const where of m.unclassified()) {
    const column = where.split(".")[1];
    if (column && column in out) out[column] = MASKED;
  }
  return out;
}

const unlockKey = () => createHmac("sha256", secret()).update("ap-explorer-unlock").digest();

/** A signed unlock: who, which table, until when. */
export function signUnlock(email: string, table: string, until: number): string {
  const body = Buffer.from(JSON.stringify({ e: email, t: table, x: until })).toString("base64url");
  return `${body}.${createHmac("sha256", unlockKey()).update(body).digest("base64url")}`;
}

/** Whether a token unlocks this table for this admin now. */
export function checkUnlock(
  token: string | null,
  email: string,
  table: string,
  now = Date.now()
): boolean {
  if (!token) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const want = createHmac("sha256", unlockKey()).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return false;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as {
      e?: string;
      t?: string;
      x?: number;
    };
    return p.e === email && p.t === table && typeof p.x === "number" && p.x > now;
  } catch {
    return false;
  }
}

/** Production rows: one page, or up to `limit` rows for an export. */
export async function productionRows(
  table: CatalogTable,
  q: ExplorerQuery,
  masked: boolean,
  now: Date,
  exportLimit?: number
): Promise<ExplorerResult> {
  const extra = masked
    ? (NEEDED_FOR_MASKING[table.name] ?? []).filter((c) => !q.columns.includes(c))
    : [];
  const select = [...q.columns, ...extra].map(encodeURIComponent).join(",");
  const parts = [`select=${select}`];
  const b = dateBounds(table, q);
  if (b && q.dateField) {
    const col = encodeURIComponent(q.dateField);
    parts.push(`${col}=gte.${encodeURIComponent(b.gte)}`, `${col}=lt.${encodeURIComponent(b.lt)}`);
  }
  parts.push(...q.filters.map(postgrestFilter));
  const order = effectiveOrder(table, q, masked);
  // A tiebreak on the key keeps pages from overlapping when the sort has equal values; while
  // masked, never on a personal key (an email-keyed table would be ranked by address).
  const tiebreak = table.key
    .filter(
      (k) => k !== order.column && !(masked && table.fields.find((f) => f.name === k)?.privacy)
    )
    .map((k) => `${encodeURIComponent(k)}.${order.dir}`);
  parts.push(
    `order=${[`${encodeURIComponent(order.column)}.${order.dir}.nullslast`, ...tiebreak].join(",")}`
  );
  const path = `/rest/v1/${encodeURIComponent(table.name)}?${parts.join("&")}`;

  let rows: Row[];
  let total: number | null = null;
  if (exportLimit) {
    const all = await fetchAllRows<Row>(path, { maxRows: exportLimit });
    if (!all) throw new Error("export read failed");
    rows = all;
  } else {
    const offset = (q.page - 1) * q.size;
    const res = await supabaseFetch(path, {
      headers: { Prefer: "count=exact", Range: `${offset}-${offset + q.size - 1}` },
      paginated: true,
      timeoutMs: 15_000,
    });
    if (res.status === 400)
      throw new Refused("The database refused this query: check the filters' values.");
    // Past the last row PostgREST answers 416: an empty page.
    if (res.status === 416) {
      rows = [];
    } else {
      if (!res.ok) throw new Error(`explorer read ${res.status}`);
      rows = (await res.json()) as Row[];
    }
    const t = res.headers.get("content-range")?.split("/")[1];
    total = t && t !== "*" ? Number(t) : null;
  }

  if (masked) {
    const personal =
      table.name === "survey_submission_answer" ? await personalQuestionIds() : new Set<unknown>();
    const m = () => dayMasker(now);
    // Columns that look personal but are in none of the copy's lists: masked whole here.
    const unlisted = table.fields.filter((f) => f.unlisted).map((f) => f.name);
    rows = rows.map((r) => {
      const out = maskForExplorer(table.name, r, m, personal);
      for (const c of unlisted) if (out[c] !== null && out[c] !== undefined) out[c] = MASKED;
      return out;
    });
  }
  rows = rows.map((r) => Object.fromEntries(q.columns.map((c) => [c, r[c] ?? null])));
  return { columns: q.columns, rows, total, masked, sql: readableSql(table, q, masked) };
}

/** A HogQL string literal. */
const hogText = (v: string) => `'${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/** The catalog's PostHog event fields as HogQL reads them. */
const HOG_FIELDS: Record<string, string> = {
  timestamp: "timestamp",
  event: "event",
  distinct_id: "distinct_id",
  $session_id: "$session_id",
  "properties.$pathname": "properties.$pathname",
  "properties.$device_type": "properties.$device_type",
  "properties.utm_source": "properties.utm_source",
  "properties.landing_variant": "properties.landing_variant",
  elements_chain: "elements_chain",
};

function hogFilter(f: Filter): string {
  const col = HOG_FIELDS[f.column]!;
  const v = f.value.trim();
  switch (f.op) {
    case "null":
      return `${col} IS NULL`;
    case "notnull":
      return `${col} IS NOT NULL`;
    case "contains":
      return `${col} ILIKE ${hogText(`%${v.replace(/[%_]/g, "")}%`)}`;
    case "in":
      return `${col} IN (${v
        .split(",")
        .filter((x) => x.trim())
        .map((x) => hogText(x.trim()))
        .join(", ")})`;
    default:
      return `${col} ${SQL_OPS[f.op]} ${hogText(v)}`;
  }
}

/** A HogQL instant from an ISO time, to the millisecond. */
const hogInstant = (d: Date) =>
  `toDateTime64('${d.toISOString().slice(0, 23).replace("T", " ")}', 3, 'UTC')`;

/**
 * PostHog events (live site only), masked like text in the copy. PostHog refuses OFFSET on an
 * API key, so pages go by time: newest (or oldest) first, the next page after the last row's
 * time. Rows sharing that millisecond can fall between two pages.
 */
export async function posthogRows(
  table: CatalogTable,
  q: ExplorerQuery,
  masked: boolean,
  now: Date
): Promise<ExplorerResult> {
  if (table.name !== "events") throw new Refused("Only PostHog's events can be opened here.");
  if (q.sort && q.sort !== "timestamp") throw new Refused("PostHog's events sort by time only.");
  const { since, until } = windowOf({ from: q.from, to: q.to });
  const where = [
    "properties.$host = 'www.loveiq.org'",
    `timestamp >= ${hogInstant(since)}`,
    `timestamp < ${hogInstant(until)}`,
    ...q.filters.map(hogFilter),
  ];
  const dir = q.sort ? q.dir : "desc";
  const cursor = q.cursor ? new Date(q.cursor) : null;
  if (cursor && Number.isNaN(cursor.getTime())) throw new Refused("Bad page cursor.");
  const pageWhere = cursor
    ? [...where, `timestamp ${dir === "desc" ? "<" : ">"} ${hogInstant(cursor)}`]
    : where;
  const size = Math.min(q.size, 200);
  // The time is always read (for the next page's cursor), and dropped if not shown.
  const select = [
    "timestamp",
    ...q.columns.filter((c) => c !== "timestamp").map((c) => HOG_FIELDS[c]),
  ].join(", ");
  const shown = ["timestamp", ...q.columns.filter((c) => c !== "timestamp")];
  const [page, count] = await Promise.all([
    hogqlTable(
      `SELECT ${select} FROM events WHERE ${pageWhere.join(" AND ")} ORDER BY timestamp ${dir.toUpperCase()} LIMIT ${size}`,
      size
    ),
    hogqlTable(`SELECT count() FROM events WHERE ${where.join(" AND ")} LIMIT 1`, 1),
  ]);
  if (!page.ok) {
    logger.warn({ error: page.error }, "AP explorer: PostHog read failed");
    throw new Refused("PostHog could not be read just now. Try again in a minute.");
  }
  const m = dayMasker(now);
  const privateWhole = new Set(
    table.fields.filter((f) => f.privacy === "masked").map((f) => f.name)
  );
  const read = page.rows.map((r) => Object.fromEntries(shown.map((c, i) => [c, r[i] ?? null])));
  const last = read[read.length - 1]?.timestamp;
  const rows = read.map((r) =>
    Object.fromEntries(
      q.columns.map((c) => {
        const v = r[c];
        if (!masked || v === null || v === undefined) return [c, v];
        // A field the team copy masks whole (the session id opens the visit's recording).
        if (privateWhole.has(c)) return [c, MASKED];
        if (typeof v !== "string") return [c, v];
        // An identified reader's id is their email: masked whole, however it is written.
        return [c, c === "distinct_id" && v.includes("@") ? m.email(v) : m.text(v)];
      })
    )
  );
  return {
    columns: q.columns,
    rows,
    total: count.ok ? Number(count.rows[0]?.[0]) || 0 : null,
    masked,
    next: read.length === size && typeof last === "string" ? new Date(last).toISOString() : null,
    sql: readableSql(table, { ...q, size, sort: "timestamp", dir }, masked).replace(
      "FROM posthog.events",
      "FROM events -- PostHog (HogQL), www.loveiq.org only"
    ),
  };
}

/**
 * The Google tables: each is one breakdown of the brain's GA4 day chunks (`google.ts`), and each
 * of its rows one entry of that breakdown on one day.
 */
const GOOGLE_TABLES: Record<
  string,
  { breakdown: string; row: (date: string, id: string, v: Record<string, unknown>) => Row }
> = {
  sessions_daily: {
    breakdown: "channels",
    row: (date, channel, v) => ({
      date,
      channel,
      sessions: v.sessions ?? null,
      users: v.users ?? null,
      new_users: v.new_users ?? null,
      engaged_sessions: v.engaged_sessions ?? null,
      avg_engagement_time:
        Number(v.sessions) > 0
          ? Math.round((Number(v.engagement_s) / Number(v.sessions)) * 10) / 10
          : null,
    }),
  },
  campaign_daily: {
    breakdown: "ads_campaigns",
    row: (date, id, v) => ({
      date,
      campaign_id: id,
      campaign_name: v.name ?? null,
      impressions: v.impressions ?? null,
      clicks: v.clicks ?? null,
      cost_eur: v.cost ?? null,
      conversions: v.conversions ?? null,
    }),
  },
};

/**
 * Every row of a Google table, oldest day first; null for a table that is not one. A day
 * without the breakdown (not read yet, or nothing that day) has no rows.
 */
export async function googleRows(table: string): Promise<Row[] | null> {
  const spec = GOOGLE_TABLES[table];
  if (!spec) return null;
  const days = await fetchAllRows<{ date: unknown; breakdown: unknown }>(
    `${GA4_DAYS}&meta->>${spec.breakdown}=not.is.null&select=date:meta->>day,breakdown:meta->${spec.breakdown}&order=period_end.asc`,
    { maxRows: 5000 }
  );
  if (!days) throw new Error("ga4 days read failed");
  return days.flatMap(({ date, breakdown }) =>
    typeof date === "string" && breakdown && typeof breakdown === "object"
      ? Object.entries(breakdown as Record<string, Record<string, unknown>>).map(([id, v]) =>
          spec.row(date, id, v ?? {})
        )
      : []
  );
}

/** A Google table's rows, from the brain's copy of Google Analytics and Ads, filtered here. */
export async function dailyRows(table: CatalogTable, q: ExplorerQuery): Promise<ExplorerResult> {
  const all = await googleRows(table.name);
  if (!all) throw new Refused(`${table.name} is not a Google table.`);
  let rows = all.filter((r) => (r.date as string) >= q.from && (r.date as string) <= q.to);
  for (const f of q.filters) {
    rows = rows.filter((r) => {
      const v = r[f.column];
      const s = String(v ?? "");
      const n = Number(f.value);
      switch (f.op) {
        case "null":
          return v === null || v === undefined;
        case "notnull":
          return v !== null && v !== undefined;
        case "contains":
          return s.toLowerCase().includes(f.value.trim().toLowerCase());
        case "in":
          return f.value
            .split(",")
            .map((x) => x.trim())
            .includes(s);
        case "eq":
          return s === f.value.trim();
        case "neq":
          return s !== f.value.trim();
        default: {
          const x = typeof v === "number" ? v : s;
          const y = typeof v === "number" ? n : f.value.trim();
          return f.op === "gt" ? x > y : f.op === "gte" ? x >= y : f.op === "lt" ? x < y : x <= y;
        }
      }
    });
  }
  const key = q.sort ?? "date";
  const dir = q.sort ? (q.dir === "asc" ? 1 : -1) : -1;
  const cmp = (a: Row, b: Row, k: string) =>
    (a[k] as number | string) > (b[k] as number | string)
      ? 1
      : (a[k] as number | string) < (b[k] as number | string)
        ? -1
        : 0;
  // A day holds a row per channel or campaign: ties fall back to the table's key, in order.
  rows.sort((a, b) => cmp(a, b, key) * dir || table.key.reduce((d, k) => d || cmp(a, b, k), 0));
  const total = rows.length;
  const start = (q.page - 1) * q.size;
  return {
    columns: q.columns,
    rows: rows
      .slice(start, start + q.size)
      .map((r) => Object.fromEntries(q.columns.map((c) => [c, r[c] ?? null]))),
    total,
    masked: false,
    sql: readableSql(table, q, false),
  };
}
