/**
 * The drop-off rows behind the KPI page "Survey Drop-off Rate per Question %", kept in a
 * Notion database on the team page "KPI report data". The page's charts, table and
 * filters are views of it, set up once in Notion; this file only keeps the rows true.
 *
 * WHY IT IS NOT UNDER THE KPI PAGE, AND WHY ITS OWN CONNECTION. The brain's Notion crawl
 * lists every page its connection can see, 2,500 at most, and these rows were a third of
 * that on day one (2,259 listed on 2026-10-12, 781 of them rows). So the table lives
 * where the brain's connection ("Claude connection") is not, and the job writes with
 * NOTION_KPI_TOKEN, the "LoveIQ KPI reports" connection, which sees only the KPI
 * database and "KPI report data".
 *
 * Daily, for the weeks the job computes: a row that is missing is created, a row whose
 * numbers moved is updated, a row nobody computes any more (a question taken out of the
 * survey, a duplicate) goes to the trash. Unchanged rows are not touched, so a normal day
 * writes the week in progress and little else. Older weeks are left as they were.
 *
 * ponytail: rows are never trashed for age, about 430 are added a week. Fine for a year;
 * when the table nears 20,000 rows, trash the weeks older than half a year here.
 */
import { queryNotionDatabase } from "@features/brain/server/act/notion";
import type { DropoffRow } from "@features/admin/server/dropoff-report";
import {
  applyRowSync,
  planRowSync,
  type ExistingRow,
  type SyncPlan as RowSyncPlan,
  type SyncResult,
} from "@features/admin/server/notion-row-sync";

/** 🗂️ KPI report data › Survey drop-off data. */
export const DROPOFF_DATA_DATABASE_ID = "e233fb12-fff9-4485-a54a-d4c29e8b26ff";

/** Notion refuses a comma in a select option. U+201A looks like one and is not. */
export function selectName(text: string): string {
  return text.replace(/,/g, "\u201a").slice(0, 100);
}

/** One row's properties, in Notion's shape. The property names are the database's. */
export function rowProperties(row: DropoffRow): Record<string, unknown> {
  const num = (v: number | null) => ({ number: v });
  return {
    "Question text": { title: [{ type: "text", text: { content: row.question } }] },
    Key: { rich_text: [{ type: "text", text: { content: row.key } }] },
    Week: { date: { start: row.week } },
    Days: num(row.days),
    "No.": num(row.n),
    Question: { select: { name: selectName(row.question) } },
    "Question id": { rich_text: [{ type: "text", text: { content: row.qId } }] },
    Segment: { select: { name: row.segment } },
    Reached: num(row.reached),
    "Left here": num(row.left),
    "Drop-off": num(row.rate),
    "Of all in survey": num(row.ofEveryone),
    Usual: num(row.usual),
    Flag: { select: { name: row.flag } },
  };
}

/** What a row says, as one string both sides produce the same way. */
export function rowValue(row: DropoffRow): string {
  return JSON.stringify([
    row.question,
    row.week,
    row.days,
    row.n,
    selectName(row.question),
    row.qId,
    row.segment,
    row.reached,
    row.left,
    row.rate,
    row.ofEveryone,
    row.usual,
    row.flag,
  ]);
}

type NotionProp = Record<string, unknown> | undefined;

const plain = (p: NotionProp, kind: "title" | "rich_text") =>
  (
    ((kind === "title" ? p?.title : p?.rich_text) as Array<{ plain_text?: string }> | undefined) ??
    []
  )
    .map((t) => t.plain_text ?? "")
    .join("");
const numberOf = (p: NotionProp) => (typeof p?.number === "number" ? p.number : null);
const selectOf = (p: NotionProp) => (p?.select as { name?: string } | null | undefined)?.name ?? "";

/** A row as Notion holds it, read back into `rowValue`'s form. */
export function readExisting(page: {
  id: string;
  properties: Record<string, unknown>;
}): ExistingRow {
  const p = page.properties as Record<string, NotionProp>;
  return {
    id: page.id,
    key: plain(p.Key, "rich_text"),
    value: JSON.stringify([
      plain(p["Question text"], "title"),
      ((p.Week?.date as { start?: string } | null | undefined)?.start ?? "").slice(0, 10),
      numberOf(p.Days),
      numberOf(p["No."]),
      selectOf(p.Question),
      plain(p["Question id"], "rich_text"),
      selectOf(p.Segment),
      numberOf(p.Reached),
      numberOf(p["Left here"]),
      numberOf(p["Drop-off"]),
      numberOf(p["Of all in survey"]),
      numberOf(p.Usual),
      selectOf(p.Flag),
    ]),
  };
}

/** The rows of these weeks (Week on or after `fromWeek`) that Notion holds. */
export async function readDropoffRows(
  databaseId: string,
  fromWeek: string,
  opts: { token?: string; isOutOfTime?: () => boolean } = {}
): Promise<ExistingRow[]> {
  const pages = await queryNotionDatabase(databaseId, {
    filter: { property: "Week", date: { on_or_after: fromWeek } },
    maxRows: 10_000,
    token: opts.token,
    isOutOfTime: opts.isOutOfTime,
  });
  return pages.map(readExisting);
}

export type SyncPlan = RowSyncPlan<DropoffRow>;
export type { ExistingRow, SyncResult };

/** What to write so Notion holds exactly `desired` for the weeks read. */
export function planSync(desired: DropoffRow[], existing: ExistingRow[]): SyncPlan {
  return planRowSync(desired, existing, rowValue);
}

/**
 * Write the plan, the newest weeks first, so a run cut short by `isOutOfTime` leaves the
 * oldest numbers stale rather than the newest.
 */
export async function applySync(
  databaseId: string,
  plan: SyncPlan,
  isOutOfTime: () => boolean,
  token?: string
): Promise<SyncResult> {
  return applyRowSync(databaseId, plan, isOutOfTime, rowProperties, token);
}
