import { supabaseFetch } from "@features/admin/server/supabase";
import { sweepStale, upsertChunks, type BrainRow, type IngestResult } from "./upsert";

/**
 * Turns the funnel into dated, readable facts the brain can retrieve.
 *
 * WHY THIS IS THE PRIMARY ANALYTICS SOURCE, NOT GA4. Conversion and revenue only
 * exist in our tables, `funnel_event.utm_source` already measures Google traffic
 * first-party, and this needs no third-party credential at all — so it answers
 * most questions on its own and never breaks when a token expires. GA4 and Search
 * Console are additive (see `google.ts`): they contribute the two things we
 * genuinely cannot see ourselves, search queries and ad spend. PostHog is not an
 * alternative for either — it only began ingesting on 2026-08-23.
 *
 * WHY THREE GRAINS. Retrieval matches text, not date ranges. Given only daily
 * rows, "how did we do last week" pulls seven chunks and asks the model to add
 * them up, which is exactly the kind of arithmetic it gets quietly wrong. Weekly
 * and monthly rows are pre-totalled, so the answer is read rather than computed.
 *
 * THE WORDING IS THE RETRIEVAL INDEX, AND IT WAS MEASURED. A first version wrote
 * "Period: 2026-08" and "Survey completions", and "how many people signed up in
 * August" then matched NOTHING — the word "August" never appeared anywhere in the
 * corpus, and nobody asks about "completions". Hence spelled-out month names and
 * weekday names, and phrasing that carries both the human word and ours
 * ("Signups (completed surveys)", "Paid customers"). This is not keyword
 * stuffing: every line still reads as a sentence a person would write.
 *
 * AD SPEND IS FOLDED IN FROM THE GA4 CHUNKS, and that is the point of this file.
 * "What did we spend and what did we earn" is ONE question, but spend lives only
 * in GA4 and revenue only in our tables — so with the two split across sources,
 * keyword retrieval returned five GA4 chunks and no revenue at all, and the model
 * correctly answered only half. Reading `ad_cost` back off the `ga4` rows this
 * cron just wrote costs no extra API call and makes cost per signup and cost per
 * paying customer readable from a single chunk.
 *
 * This is why `ingestAnalytics` runs AFTER `ingestGa4` in the cron.
 *
 * EMPTY DAYS ARE NOT INDEXED. Four hundred rows of zeroes would match loosely on
 * every date-shaped question and crowd out the days that actually say something.
 */

const DAYS = 400;
const SOURCE = "analytics";

interface RollupRow {
  day: string;
  unique_visitors: number;
  survey_starts: number;
  intro_completed: number;
  submissions: number;
  reports_created: number;
  reports_paid: number;
  revenue: string | number;
  report_opens: number;
  invites_sent: number;
  /** `{ direct: 952, google: 47 }` — a map, so coarser grains can sum it rather
   *  than re-parse a rendered string. */
  top_sources: Record<string, number> | null;
}

interface Totals {
  visitors: number;
  starts: number;
  submissions: number;
  reports: number;
  paid: number;
  revenue: number;
  opens: number;
  invites: number;
  sources: Record<string, number>;
  adSpend: number;
  firstDay: string;
  lastDay: string;
}

function seed(r: RollupRow, day: string, adCost: Map<string, number>): Totals {
  return {
    visitors: r.unique_visitors,
    starts: r.survey_starts,
    submissions: r.submissions,
    reports: r.reports_created,
    paid: r.reports_paid,
    revenue: Number(r.revenue ?? 0),
    opens: r.report_opens,
    invites: r.invites_sent,
    sources: { ...(r.top_sources ?? {}) },
    adSpend: adCost.get(day) ?? 0,
    firstDay: day,
    lastDay: day,
  };
}

function merge(
  a: Totals | undefined,
  r: RollupRow,
  day: string,
  adCost: Map<string, number>
): Totals {
  if (!a) return seed(r, day, adCost);
  const sources = { ...a.sources };
  for (const [k, v] of Object.entries(r.top_sources ?? {})) {
    sources[k] = (sources[k] ?? 0) + Number(v ?? 0);
  }
  return {
    visitors: a.visitors + r.unique_visitors,
    starts: a.starts + r.survey_starts,
    submissions: a.submissions + r.submissions,
    reports: a.reports + r.reports_created,
    paid: a.paid + r.reports_paid,
    revenue: a.revenue + Number(r.revenue ?? 0),
    opens: a.opens + r.report_opens,
    invites: a.invites + r.invites_sent,
    sources,
    adSpend: a.adSpend + (adCost.get(day) ?? 0),
    firstDay: day < a.firstDay ? day : a.firstDay,
    lastDay: day > a.lastDay ? day : a.lastDay,
  };
}

function isEmpty(t: Totals): boolean {
  return t.visitors === 0 && t.submissions === 0 && t.reports === 0 && t.paid === 0;
}

export interface AdCost {
  byDay: Map<string, number>;
  /**
   * Earliest day GA4 data exists for, or null when there is none.
   *
   * This is REQUIRED, not decoration. GA4 is ingested over 90 days
   * (`google.ts` DAYS) while this rollup covers 400, so a month that straddles
   * the GA4 floor pairs a FULL month of revenue with a PARTIAL month of ad
   * spend. Measured: May 2026 had 4 of 31 days of spend (GA4 data starts
   * 2026-05-28) and the chunk published "Net: EUR 291.68" when the real figure
   * is a loss of several hundred. An exec comparing that to June's real
   * EUR -1,178 concludes the business collapsed in June. It did not.
   */
  from: string | null;
}

/** Spend per day, read back from the `ga4` chunks written earlier in this run. */
async function adCostByDay(): Promise<AdCost> {
  const out = new Map<string, number>();
  let from: string | null = null;
  try {
    const res = await supabaseFetch(
      // eslint-disable-next-line no-secrets/no-secrets -- a PostgREST query path, not a secret
      "/rest/v1/brain_chunk?source=eq.ga4&select=meta&meta->>grain=eq.day",
      { headers: { Range: "0-999" } }
    );
    if (!res.ok) return { byDay: out, from };
    const rows = (await res.json()) as Array<{ meta?: Record<string, unknown> }>;
    for (const r of rows) {
      const day = typeof r.meta?.day === "string" ? r.meta.day : null;
      if (!day) continue;
      // The floor tracks every day GA4 COVERS, including zero-spend days — a day
      // with no spend is still a day we know about, and treating it as uncovered
      // would suppress the spend lines for a period that is genuinely complete.
      if (from === null || day < from) from = day;
      const cost = Number(r.meta?.ad_cost ?? 0);
      if (Number.isFinite(cost) && cost > 0) out.set(day, cost);
    }
  } catch {
    // Optional enrichment: without GA4 the rollup simply omits the spend lines.
  }
  return { byDay: out, from };
}

/** Last calendar day of a `YYYY-MM`, so "whole month" can be checked not assumed. */
function monthEnd(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  // Day 0 of the NEXT month is the last day of this one, and it handles February.
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function money(n: number): string {
  return `EUR ${n.toFixed(2)}`;
}

function pct(part: number, whole: number): string | null {
  if (!whole) return null;
  // A funnel step cannot exceed the step above it. When it does, the two metrics
  // have different tracking start dates — `funnel_event.unique_visitor` only
  // begins 2026-05-23 while `survey_submission` goes back much further — and May
  // 2026 published "Signups: 453 (115.9% of starts)" as if it were a conversion
  // rate. Returning null drops the ratio and keeps the two honest counts.
  if (part > whole) return null;
  return `${((part / whole) * 100).toFixed(1)}%`;
}

/** `123 (45.6% of x)`, or just `123` when the ratio would be misleading. */
function withPct(count: number, part: number, whole: number, ofWhat: string): string {
  const p = pct(part, whole);
  return p ? `${count} (${p} of ${ofWhat})` : `${count}`;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Wednesday 19 August 2026" — the way a person says a date, so their words are
 *  the ones in the index. */
export function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "August 2026" from "2026-08". */
export function longMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTHS[Number(m) - 1] ?? ym} ${y}`;
}

/**
 * ISO-8601 week key, e.g. `2026-W34`.
 *
 * ISO weeks run Monday–Sunday, and a week belongs to the year containing its
 * THURSDAY — which is why a date in early January can belong to the previous
 * year's week 52 or 53. Week 1 is the week containing 4 January.
 *
 * The anchor must be week 1's THURSDAY, not 4 January itself. Anchoring on the
 * 4th directly is off by one whenever the 4th is not a Thursday: it produced
 * `2026-W00` (not a real week) for 2026-01-01 and `2026-W52` for 2027-01-01,
 * which belongs to `2026-W53`.
 */
export function isoWeek(iso: string): string {
  const thursdayOfWeek = (d: Date): Date => {
    const t = new Date(d);
    // (getUTCDay() + 6) % 7 maps Monday→0 … Sunday→6, so +3 lands on Thursday.
    t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7));
    return t;
  };

  const target = thursdayOfWeek(new Date(`${iso}T00:00:00Z`));
  const isoYear = target.getUTCFullYear();
  const week1Thursday = thursdayOfWeek(new Date(Date.UTC(isoYear, 0, 4)));
  const week = 1 + Math.round((target.getTime() - week1Thursday.getTime()) / 604800000);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

function renderSources(sources: Record<string, number>): string | null {
  const entries = Object.entries(sources)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  if (entries.length === 0) return null;
  return entries.map(([name, n]) => `${name} ${n}`).join(", ");
}

/** The shared body all three grains use, so a reader sees one consistent shape. */
function renderBody(period: string, t: Totals, adFrom: string | null): string {
  const sources = renderSources(t.sources);

  // Is the ad spend for this period complete, or does the period start before
  // GA4 has any data? A partial figure is fine to state as long as it is not
  // then divided into a cost-per-customer or subtracted into a Net.
  const adPartial = t.adSpend > 0 && (adFrom === null || t.firstDay < adFrom);

  return [
    `Period: ${period}`,
    // Never state 0. `unique_visitor` tracking only starts 2026-05-23, so a zero
    // here means NOT MEASURED, and "how many visitors did we have in April?" was
    // answered "0" as though it were a fact.
    t.visitors > 0
      ? `Website visits: ${t.visitors} (a returning person counts once per day)`
      : null,
    // Same rule one step down the funnel: a zero with a NON-ZERO step below it is
    // impossible as a fact, so it is a tracking gap. March 2026 stated
    // "Survey starts: 0" next to "Signups: 4" — you cannot complete a survey you
    // never started.
    t.starts === 0 && t.submissions > 0
      ? null
      : t.visitors > 0
        ? `Survey starts: ${withPct(t.starts, t.starts, t.visitors, "visits")}`
        : `Survey starts: ${t.starts}`,
    `Signups (completed surveys): ${withPct(t.submissions, t.submissions, t.starts, "starts")}`,
    `Reports created: ${t.reports} · Reports first opened: ${t.opens}`,
    `Paid customers: ${withPct(t.paid, t.paid, t.reports, "reports")} · Revenue: EUR ${t.revenue.toFixed(2)}`,
    t.invites ? `Invites sent: ${t.invites}` : null,
    sources ? `Traffic sources: ${sources}` : null,
    // The two numbers everyone actually wants, next to each other and already
    // divided — a model asked to compute these from two separate chunks gets
    // them wrong or declines.
    t.adSpend > 0
      ? `Google Ads spend: ${money(t.adSpend)}${
          adPartial
            ? ` — INCOMPLETE: ad data only exists from ${adFrom ?? "an unknown date"}, and this period starts ${t.firstDay}. Do not treat this as the period's total spend.`
            : ""
        }`
      : null,
    // Deliberately suppressed when spend is partial: dividing full-period
    // customers by part-period spend, or subtracting it from full revenue, turns
    // a known gap into a confident wrong number.
    !adPartial && t.adSpend > 0 && t.submissions > 0
      ? `Cost per signup: ${money(t.adSpend / t.submissions)} · Cost per paying customer: ${
          t.paid > 0 ? money(t.adSpend / t.paid) : "no paying customers"
        }`
      : null,
    !adPartial && t.adSpend > 0
      ? `Net: ${money(t.revenue - t.adSpend)} (revenue ${money(t.revenue)} minus ad spend ${money(t.adSpend)})`
      : null,
    adPartial
      ? `Cost per customer and net profit are omitted for this period on purpose, because the ad spend above covers only part of it.`
      : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function buildAnalyticsRows(
  rows: RollupRow[],
  stampedAt: string,
  adCost: AdCost = { byDay: new Map(), from: null }
): BrainRow[] {
  const out: BrainRow[] = [];
  const byWeek = new Map<string, Totals>();
  const byMonth = new Map<string, Totals>();

  for (const r of rows) {
    const day = String(r.day).slice(0, 10);
    const week = isoWeek(day);
    byWeek.set(week, merge(byWeek.get(week), r, day, adCost.byDay));
    const month = day.slice(0, 7);
    byMonth.set(month, merge(byMonth.get(month), r, day, adCost.byDay));

    const totals = seed(r, day, adCost.byDay);
    if (isEmpty(totals)) continue;
    const label = longDate(day);
    out.push({
      source: SOURCE,
      source_id: `daily:${day}`,
      title: `LoveIQ numbers — ${label}`,
      url: null,
      body: renderBody(`${label} (${day})`, totals, adCost.from),
      meta: {
        grain: "day",
        day,
        visitors: totals.visitors,
        revenue: totals.revenue,
        ad_spend: totals.adSpend,
      },
      updated_at: stampedAt,
      period_end: day,
    });
  }

  for (const [week, t] of byWeek) {
    if (isEmpty(t)) continue;
    // A date range beats "2026-W34": nobody asks a question using a week number.
    const label = `week of ${longDate(t.firstDay)} to ${longDate(t.lastDay)}`;
    out.push({
      source: SOURCE,
      source_id: `weekly:${week}`,
      title: `LoveIQ numbers — ${label}`,
      url: null,
      body: renderBody(`${label} (${week})`, t, adCost.from),
      meta: { grain: "week", week, visitors: t.visitors, revenue: t.revenue, ad_spend: t.adSpend },
      updated_at: stampedAt,
      // The LAST day covered, so a part-week sorts by how recent it actually is.
      period_end: t.lastDay,
    });
  }

  for (const [month, t] of byMonth) {
    if (isEmpty(t)) continue;
    const label = longMonth(month);
    out.push({
      source: SOURCE,
      source_id: `monthly:${month}`,
      title: `LoveIQ numbers — ${label} (monthly total)`,
      url: null,
      // Three sources each labelled a DIFFERENT partial range "whole month" —
      // analytics ran to today, GA4 to yesterday, GSC to two days ago — so the
      // same month carried three different "whole month" totals and nothing in
      // the text said which days were actually covered.
      body: renderBody(
        `${label} — ${
          t.lastDay >= monthEnd(month)
            ? "whole month"
            : `month so far, ${longDate(t.firstDay)} to ${longDate(t.lastDay)}`
        } (${month})`,
        t,
        adCost.from
      ),
      // The LAST day covered, so the current part-month sorts as the most recent.
      period_end: t.lastDay,
      meta: {
        grain: "month",
        month,
        visitors: t.visitors,
        revenue: t.revenue,
        ad_spend: t.adSpend,
      },
      updated_at: stampedAt,
    });
  }

  return out;
}

export async function ingestAnalytics(stampedAt: string): Promise<IngestResult> {
  const res = await supabaseFetch("/rest/v1/rpc/brain_daily_rollup", {
    method: "POST",
    body: JSON.stringify({ days: DAYS }),
  });
  if (!res.ok) {
    throw new Error(`brain_daily_rollup failed: ${res.status}`);
  }
  const rows = (await res.json()) as RollupRow[];
  if (!Array.isArray(rows)) {
    throw new Error("brain_daily_rollup returned a non-array");
  }

  const chunks = buildAnalyticsRows(rows, stampedAt, await adCostByDay());
  const written = await upsertChunks(chunks);
  // Safe to sweep: this ingester always rewrites the whole window in one call,
  // so anything older is a day that aged out or a grain that emptied.
  const swept = await sweepStale(SOURCE, stampedAt, written);

  return { source: SOURCE, rows: written, swept };
}
