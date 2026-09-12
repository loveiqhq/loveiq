/**
 * Comparing two periods, and aggregating days into weeks or months.
 *
 * `get_business_numbers` only ever took "days back from today", and its own description
 * told the caller that "comparing two months is two calls with two ranges" — so every
 * comparison meant two fetches and arithmetic at the call site, each step a chance to be
 * off by one silently.
 *
 * TWO THINGS HERE ARE EASY TO GET WRONG AND EXPENSIVE TO GET WRONG.
 *
 * Ad spend is unknown outside GA4's window, never zero. The corpus builder learned this
 * the hard way: pairing FULL revenue with PARTIAL spend published "Net: EUR 291.68" for a
 * month that actually lost several hundred. Summing days into a week or a month, or
 * subtracting one period from another, is exactly where an unknown silently becomes a
 * zero — so a bucket containing an uncovered day reports spend as unknown and says how
 * many days it could not see.
 *
 * And a bucket can be PARTIAL. The current week is three days old on a Wednesday; summed
 * against a full week it looks like a collapse. A partial bucket says so rather than
 * being quietly compared.
 */

export interface DayRow {
  day: string;
  [k: string]: unknown;
}

export interface Bucket {
  bucket: string;
  days: number;
  /** Days in the calendar bucket that have no row at all — the range simply ended. */
  partial: boolean;
  /** Days with no ad-spend coverage. Non-zero means `ad_spend` is unknown, not zero. */
  uncoveredSpendDays: number;
  totals: Record<string, number>;
  adSpend: number | null;
}

const NUMERIC_KEYS = [
  "unique_visitors",
  "survey_starts",
  "intro_completed",
  "submissions",
  "reports_created",
  "reports_paid",
  "revenue",
  "report_opens",
  "invites_sent",
] as const;

export type Granularity = "day" | "week" | "month";

/** ISO week start (Monday), so a "week" means the same thing to everyone reading it. */
export function bucketKey(day: string, g: Granularity): string {
  if (g === "day") return day;
  if (g === "month") return day.slice(0, 7);
  const d = new Date(`${day}T00:00:00Z`);
  /**
   * A DAY THAT WILL NOT PARSE BECOMES ITS OWN BUCKET, rather than throwing.
   *
   * `toISOString()` on an invalid Date raises, and this runs inside the rendering of an
   * answer — so one malformed row would have cost the caller the whole month rather than
   * that row. Every `day` here comes from a Postgres date column and is therefore always
   * valid, which is exactly why the throw would have been a surprise. Found by a test
   * fixture that generated "2026-09-013".
   */
  if (Number.isNaN(d.getTime())) return day;
  // getUTCDay: 0 is Sunday, so Sunday belongs to the week that started six days earlier.
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** How many days a calendar bucket holds, so a short one can be called short. */
export function bucketLength(key: string, g: Granularity): number {
  if (g === "day") return 1;
  if (g === "week") return 7;
  const [y, m] = key.split("-");
  // Day 0 of the NEXT month is the last day of this one.
  return new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
}

export function bucketRows(rows: DayRow[], g: Granularity): Bucket[] {
  const byKey = new Map<string, DayRow[]>();
  for (const r of rows) {
    const k = bucketKey(r.day, g);
    byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, days]) => {
      const totals: Record<string, number> = {};
      for (const k of NUMERIC_KEYS) {
        const sum = days.reduce(
          (acc, d) => acc + (typeof d[k] === "number" ? (d[k] as number) : 0),
          0
        );
        if (days.some((d) => typeof d[k] === "number")) totals[k] = Math.round(sum * 100) / 100;
      }
      // A day with no `ad_spend` key is a day GA4 did not cover. Summing the rest and
      // presenting it as the period's spend is the understatement that overstates profit.
      const uncovered = days.filter((d) => typeof d.ad_spend !== "number").length;
      const adSpend =
        uncovered > 0
          ? null
          : Math.round(days.reduce((a, d) => a + (d.ad_spend as number), 0) * 100) / 100;
      return {
        bucket: key,
        days: days.length,
        partial: days.length < bucketLength(key, g),
        uncoveredSpendDays: uncovered,
        totals,
        adSpend,
      };
    });
}

export interface Period {
  since: string;
  until: string;
}

/**
 * `compare_to`, as either an explicit range or the word `previous`.
 *
 * `previous` is the equally-long window ending the day before `since` — the comparison
 * people mean by "versus last month" when they said "this month", and the one that is
 * wrong if the lengths differ silently.
 */
export function parseComparePeriod(
  raw: string,
  base: Period
): { period: Period } | { error: string } {
  const value = raw.trim();
  if (value.toLowerCase() === "previous") {
    const from = Date.parse(`${base.since}T00:00:00Z`);
    const to = Date.parse(`${base.until}T00:00:00Z`);
    if (Number.isNaN(from) || Number.isNaN(to))
      return { error: "the base period is not a valid range" };
    const lengthDays = Math.round((to - from) / 86_400_000) + 1;
    const prevUntil = new Date(from - 86_400_000);
    const prevSince = new Date(from - lengthDays * 86_400_000);
    return {
      period: {
        since: prevSince.toISOString().slice(0, 10),
        until: prevUntil.toISOString().slice(0, 10),
      },
    };
  }
  const m = value.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
  if (!m) {
    return {
      error:
        `\`compare_to\` must be a range like 2026-08-01..2026-08-31, or the word ` +
        `\`previous\` for the equally-long window immediately before this one. ` +
        `"${value}" is neither.`,
    };
  }
  const [, from, to] = m;
  if (!from || !to) return { error: "`compare_to` did not parse as a range." };
  if (to < from) return { error: `\`compare_to\` ends (${to}) before it starts (${from}).` };
  return { period: { since: from, until: to } };
}

const lengthOf = (p: Period): number =>
  Math.round(
    (Date.parse(`${p.until}T00:00:00Z`) - Date.parse(`${p.since}T00:00:00Z`)) / 86_400_000
  ) + 1;

/** One period's totals, plus the caveats that make them readable. */
function totalsOf(rows: DayRow[]): {
  totals: Record<string, number>;
  adSpend: number | null;
  uncovered: number;
} {
  const totals: Record<string, number> = {};
  for (const k of NUMERIC_KEYS) {
    if (rows.some((d) => typeof d[k] === "number")) {
      totals[k] =
        Math.round(
          rows.reduce((a, d) => a + (typeof d[k] === "number" ? (d[k] as number) : 0), 0) * 100
        ) / 100;
    }
  }
  const uncovered = rows.filter((d) => typeof d.ad_spend !== "number").length;
  return {
    totals,
    adSpend:
      uncovered > 0
        ? null
        : Math.round(rows.reduce((a, d) => a + (d.ad_spend as number), 0) * 100) / 100,
    uncovered,
  };
}

export function renderComparison(
  a: { period: Period; rows: DayRow[] },
  b: { period: Period; rows: DayRow[] }
): string {
  const A = totalsOf(a.rows);
  const B = totalsOf(b.rows);
  const la = lengthOf(a.period);
  const lb = lengthOf(b.period);

  const lines: string[] = [];
  lines.push(
    `${a.period.since} to ${a.period.until} (${la} days, ${a.rows.length} with data) ` +
      `versus ${b.period.since} to ${b.period.until} (${lb} days, ${b.rows.length} with data).`
  );
  /**
   * UNEQUAL LENGTHS ARE ALLOWED AND MUST BE SAID. A 31-day month against a 30-day one is
   * not a like-for-like percentage, and a reader who is not told will read it as one.
   */
  if (la !== lb) {
    lines.push(
      `THESE PERIODS ARE DIFFERENT LENGTHS (${la} vs ${lb} days), so the percentages below ` +
        `are not like-for-like — a longer period accumulates more of everything.`
    );
  }
  if (a.rows.length < la || b.rows.length < lb) {
    lines.push(
      `Some days in these ranges have no row in the rollup at all, so a total is over the ` +
        `days that exist, not over the calendar.`
    );
  }
  lines.push("");

  const keys = [...new Set([...Object.keys(A.totals), ...Object.keys(B.totals)])];
  for (const k of keys) {
    const x = A.totals[k] ?? 0;
    const y = B.totals[k] ?? 0;
    const delta = Math.round((x - y) * 100) / 100;
    const pct = y === 0 ? null : Math.round((delta / y) * 1000) / 10;
    lines.push(
      `  ${k.padEnd(18)} ${String(x).padStart(10)}  vs ${String(y).padStart(10)}  ` +
        `${delta >= 0 ? "+" : ""}${delta}${pct === null ? "" : ` (${pct >= 0 ? "+" : ""}${pct}%)`}`
    );
  }

  /**
   * SPEND IS THE ONE THAT MUST NOT BE SUMMED THROUGH A GAP. Understating spend overstates
   * profit, which is the direction that costs money to believe.
   */
  if (A.adSpend === null || B.adSpend === null) {
    lines.push(
      "",
      `  ad_spend           unknown — ` +
        [
          A.uncovered ? `${A.uncovered} of ${a.rows.length} days in the first period` : null,
          B.uncovered ? `${B.uncovered} of ${b.rows.length} days in the second` : null,
        ]
          .filter(Boolean)
          .join(" and ") +
        ` are outside the window GA4 covers. Absent spend means UNKNOWN, never zero — ` +
        `summing the rest would understate spend and so overstate profit.`
    );
  } else {
    const delta = Math.round((A.adSpend - B.adSpend) * 100) / 100;
    lines.push(
      "",
      `  ad_spend           ${A.adSpend} vs ${B.adSpend}  ${delta >= 0 ? "+" : ""}${delta}`
    );
  }
  return lines.join("\n");
}
