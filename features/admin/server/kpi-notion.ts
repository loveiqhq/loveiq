/**
 * Where the kpi-weekly job writes in Notion, with its own connection (NOTION_KPI_TOKEN,
 * "LoveIQ KPI reports"; see dropoff-notion.ts for why it is not the brain's):
 *
 *  - "KPI weekly numbers" on the team page "KPI report data": one row per KPI, week and
 *    slice. The charts on the KPI pages are views of it. Kept out of the brain's reach,
 *    like the drop-off table, because its rows would crowd the brain's 2,500-page listing.
 *  - 📊 KPI: the live columns of each measured KPI's row.
 */
import { queryNotionDatabase } from "@features/brain/server/act/notion";
import { selectName } from "@features/admin/server/dropoff-notion";
import type { KpiColumns, KpiRow } from "@features/admin/server/kpi-weekly";
import type { ExistingRow } from "@features/admin/server/notion-row-sync";

/** 📊 KPI, Marcus's database of every KPI (5 Oct 2026). */
export const KPI_DATABASE_ID = "6860b617-d5a9-4663-8570-5872d2bb2e99";

/** 🗂️ KPI report data › KPI weekly numbers. */
export const KPI_NUMBERS_DATABASE_ID = "3f7e0cbe-f1a3-810d-91b5-de64e80ed7c5";

const text = (content: string) => ({
  rich_text: content ? [{ type: "text", text: { content } }] : [],
});
const number = (v: number | null) => ({ number: v });

/**
 * One row's properties, in Notion's shape. Each unit has its own number property, because
 * Notion formats a number by its property: 0.475 shows as 47.5% only under Percent.
 */
export function kpiRowProperties(row: KpiRow): Record<string, unknown> {
  const as = (unit: KpiRow["unit"]) => number(row.unit === unit ? row.value : null);
  return {
    Name: { title: [{ type: "text", text: { content: row.kpi } }] },
    Key: text(row.key),
    KPI: { select: { name: selectName(row.kpi) } },
    Week: { date: { start: row.week } },
    Days: number(row.days),
    Segment: { select: { name: row.segment } },
    Count: as("count"),
    Percent: as("percent"),
    Euro: as("euro"),
    Minutes: as("minutes"),
    Shown: text(row.shown),
    Numerator: number(row.num),
    Denominator: number(row.den),
  };
}

/** What a row says, as one string both sides produce the same way. */
export function kpiRowValue(row: KpiRow): string {
  const at = (unit: KpiRow["unit"]) => (row.unit === unit ? row.value : null);
  return JSON.stringify([
    row.kpi,
    row.week,
    row.days,
    selectName(row.kpi),
    row.segment,
    at("count"),
    at("percent"),
    at("euro"),
    at("minutes"),
    row.shown,
    row.num,
    row.den,
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

/** A row as Notion holds it, read back into `kpiRowValue`'s form. */
export function readKpiRow(page: { id: string; properties: Record<string, unknown> }): ExistingRow {
  const p = new Map(Object.entries(page.properties as Record<string, NotionProp>));
  const week = ((p.get("Week")?.date as { start?: string } | null | undefined)?.start ?? "").slice(
    0,
    10
  );
  return {
    id: page.id,
    key: plain(p.get("Key"), "rich_text"),
    week,
    value: JSON.stringify([
      plain(p.get("Name"), "title"),
      week,
      numberOf(p.get("Days")),
      selectOf(p.get("KPI")),
      selectOf(p.get("Segment")),
      numberOf(p.get("Count")),
      numberOf(p.get("Percent")),
      numberOf(p.get("Euro")),
      numberOf(p.get("Minutes")),
      plain(p.get("Shown"), "rich_text"),
      numberOf(p.get("Numerator")),
      numberOf(p.get("Denominator")),
    ]),
  };
}

/** The rows of the weeks from `fromWeek` on that Notion holds. */
export async function readKpiRows(
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
  return pages.map(readKpiRow);
}

/** The live columns of a KPI's row in 📊 KPI, in Notion's shape. */
export function kpiColumnProperties(c: KpiColumns, today: string): Record<string, unknown> {
  return {
    "Last full week": text(c.lastFullWeek),
    "Week before": text(c.weekBefore),
    Change: text(c.change),
    "Last 8 weeks": text(c.lastWeeks),
    "This week so far": text(c.thisWeekSoFar),
    Updated: { date: { start: today } },
  };
}

/** Every KPI row of 📊 KPI by its title, so the job finds each KPI's page. */
export async function readKpiPages(token?: string): Promise<Map<string, string>> {
  const pages = await queryNotionDatabase(KPI_DATABASE_ID, { maxRows: 1_000, token });
  const byTitle = new Map<string, string>();
  for (const page of pages) {
    const title = plain(
      new Map(Object.entries(page.properties as Record<string, NotionProp>)).get("KPI"),
      "title"
    );
    if (title && !byTitle.has(title)) byTitle.set(title, page.id);
  }
  return byTitle;
}
