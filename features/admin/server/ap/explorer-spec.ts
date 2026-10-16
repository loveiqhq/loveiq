/**
 * The raw data explorer's query and answer, shared by the server and the page (no server
 * imports: the page runs in the browser).
 */
import { reportingDay, reportingHour } from "@shared/time/reporting-day";

import { shortDate } from "./days";

export const OPS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "in",
  "null",
  "notnull",
] as const;
export type Op = (typeof OPS)[number];
export const PAGE_SIZES = [12, 50, 200, 1000] as const;

const NUMERIC = /^(int|integer|bigint|smallint|numeric|real|float8|double precision)$/;
const DATEISH = new Set(["timestamptz", "timestamp", "date"]);
/** Text that could hold a person's details: while masked, matched whole, never by part. */
export const isTextLike = (type: string) =>
  !NUMERIC.test(type) && !DATEISH.has(type) && type !== "boolean";
/** The conditions text takes while masked: whole values only, no parts and no ranges. */
export const MASKED_TEXT_OPS: readonly Op[] = ["eq", "neq", "in", "null", "notnull"];
/** For display: numbers are right-aligned, days and times written in Berlin time. */
export const isNumeric = (type: string) => NUMERIC.test(type);
export const isDateType = (type: string) => DATEISH.has(type);

interface FieldLike {
  name: string;
  type: string;
  pk?: boolean;
  joins?: string | null;
}

/**
 * An id: a link to another table, a uuid, or a field named like one (id, session_id). Not
 * every key: funnel_event's step and GA4's channel are keys, and categories too.
 */
export const isIdColumn = (f: FieldLike) =>
  Boolean(f.joins) || /(^|_)id$/i.test(f.name) || f.type === "uuid";

/**
 * Whether the results header offers a filter on a field, as the design does on status,
 * archetype, country, utm_source and the yes-or-no fields: words and yes or no, not ids,
 * times, amounts or JSON. "+ Add filter" still takes any field.
 */
export const headerFilters = (f: FieldLike) =>
  (f.type === "boolean" || (isTextLike(f.type) && !/^jsonb?$|\[\]$/.test(f.type))) &&
  !isIdColumn(f);

/**
 * The columns a table opens with: the "Raw data explorer" design's nine, each a real field
 * of the submission facts (survey_submission joined to its score, profile, report and
 * payment), and on survey_submission the ones it holds itself (utm_source sits inside
 * utm_tracker). Any other table opens with its first nine fields, as the design shows.
 */
const DEFAULT_COLUMNS: Record<string, string[]> = {
  admin_submission_facts: [
    "submission_id",
    "created_date_time",
    "status",
    "duration_ms",
    "archetype",
    "country",
    "utm_source",
    "has_report",
    "has_payment",
  ],
  survey_submission: ["id", "created_date_time", "status", "duration_ms", "utm_tracker"],
};

export function defaultColumns(table: { name: string; fields: FieldLike[] }): string[] {
  const names = table.fields.map((f) => f.name);
  const preset = (DEFAULT_COLUMNS[table.name] ?? []).filter((c) => names.includes(c));
  return preset.length ? preset : names.slice(0, 9);
}

/** A time in milliseconds as the design writes it: "8m 41s", "41s", "3.5s", "1h 02m 03s". */
export function msDuration(ms: number): string {
  const sign = ms < 0 ? "−" : "";
  const a = Math.abs(ms);
  // A tenth under ten seconds: a few seconds must not all read alike.
  if (a < 9_950) return `${sign}${(a / 1000).toFixed(1)}s`;
  const s = Math.round(a / 1000);
  const two = (n: number) => String(n).padStart(2, "0");
  const [h, m] = [Math.floor(s / 3600), Math.floor(s / 60) % 60];
  if (h) return `${sign}${h}h ${two(m)}m ${two(s % 60)}s`;
  return m ? `${sign}${m}m ${two(s % 60)}s` : `${sign}${s}s`;
}

/**
 * A stored day or time as the pages write it: "12 Oct 2026 10:53" in Berlin time (`sep` goes
 * between the day and the time), "12 Oct 2026" for a day, null for anything else.
 */
export function berlinTime(value: string, sep = " "): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${shortDate(value)} ${value.slice(0, 4)}`;
  if (!/^\d{4}-\d{2}-\d{2}T\d/.test(value)) return null;
  // PostgREST and PostHog send six decimals of a second; Safari reads three at most.
  const at = new Date(value.replace(/(\.\d{3})\d+/, "$1"));
  if (Number.isNaN(at.getTime())) return null;
  const day = reportingDay(at);
  const hh = String(reportingHour(at)).padStart(2, "0");
  // Berlin is a whole number of hours from UTC, so its minutes are UTC's.
  const mm = String(at.getUTCMinutes()).padStart(2, "0");
  return `${shortDate(day)} ${day.slice(0, 4)}${sep}${hh}:${mm}`;
}
/** A CSV export reads at most this many rows. */
export const EXPORT_MAX = 10_000;
export const UNLOCK_MINUTES = 15;

export interface Filter {
  column: string;
  op: Op;
  value: string;
}

export interface ExplorerQuery {
  dateField: string | null;
  from: string;
  to: string;
  filters: Filter[];
  columns: string[];
  sort: string | null;
  dir: "asc" | "desc";
  page: number;
  size: number;
  /** PostHog pages by time, not by number: the last row's time on the page before. */
  cursor: string | null;
}

export type Row = Record<string, unknown>;

export interface ExplorerResult {
  columns: string[];
  rows: Row[];
  total: number | null;
  masked: boolean;
  /** A readable SQL version of the query, for "Copy query". */
  sql: string;
  /** PostHog: the cursor of the next page, null on the last. */
  next?: string | null;
  /** The Google tables: false before their first sync, when they hold no row at all. */
  synced?: boolean;
}
