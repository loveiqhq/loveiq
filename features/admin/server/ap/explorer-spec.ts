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
}
