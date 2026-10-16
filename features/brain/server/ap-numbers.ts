/**
 * get_business_numbers, counted by AP-Analytics: the team's dashboard (/admin/ap).
 *
 * Marcus and Mark read the dashboard; Jarvis read `brain_daily_rollup`, and the two disagreed.
 * The rollup's survey starts are funnel_event's survey_engine_mount, posted only once a visitor
 * accepted the cookie banner, so its visit-to-start rate read about 6% where the dashboard
 * reads about 17%. It also counts UTC days, staff, every survey_submission row and payments
 * net of refunds. The team trusts the dashboard, so every figure the dashboard shows is read
 * here through the dashboard's own code: its facts (ap_facts), its counting (totals, spend,
 * the same-age rule) and the Assessment A page's builder for the rates. Nothing is counted a
 * second way. What the dashboard does not show keeps the rollup's counting, labelled so.
 */
import { buildDashboard } from "@features/admin/server/ap/assessment";
import { spendCoverage, type Tile } from "@features/admin/server/ap/common";
import { addDays } from "@features/admin/server/ap/days";
import {
  classifySource,
  deviceClass,
  fetchFacts,
  type Facts,
} from "@features/admin/server/ap/facts";
import {
  beforeData,
  DATA_START,
  DEVICES,
  filterQuery,
  MAX_DAYS,
  parseFilters,
  PERIODS,
  previousRange,
  rangeLabel,
  SOURCES,
  TIERS,
  type ApFilters,
} from "@features/admin/server/ap/filters";
import { delta, fmt } from "@features/admin/server/ap/format";
import {
  ageMatched,
  ALL,
  comparableStarts,
  salesIn,
  sameAge,
  spend,
  tabletBlocked,
  totals,
} from "@features/admin/server/ap/metrics";
import { wholeDays, type DayRow, type Period } from "@features/brain/server/compare";
import type { AdCost } from "@features/brain/server/ingest/analytics";
import { reportingDay } from "@shared/time/reporting-day";

/** Where the team reads it. Every page asks for the team's sign-in. */
export const AP_ORIGIN = "https://www.loveiq.org";

/** The rollup's figures the dashboard has none for: they keep the rollup's counting. */
export const NOT_ON_DASHBOARD = ["reports_created", "invites_sent", "top_sources"] as const;

/**
 * The figures that count what a period's finishers have done "so far": they grow with the
 * finishers' age, so they compare only at the same age (ageMatched), which exists only for
 * the equal-length period just before. The rows' keys, and the Assessment A tiles built on
 * them (buildDashboard's Payment CVR, paid so far over submissions, and Report open rate).
 */
const AGE_KEYS = ["reports_opened", "paid_so_far"] as const;
const AGE_TILES: ReadonlySet<string> = new Set(["pay-cvr", "open-rate"]);

/**
 * Said, and nothing else, when the dashboard's numbers cannot be read. No other counting stands
 * in for them: one counted another way reads as the dashboard's, and a wrong number is worse
 * than none when the team decides from it. `what` is what the outage must not be taken for.
 */
export const apUnreadable = (what = "a result"): string =>
  "The AP-Analytics dashboard's numbers could not be read right now, so there are none to " +
  `give, and none counted another way in their place. This is an outage, not ${what}. Ask ` +
  "again in a few minutes.";

/**
 * Said for a period that ends before LoveIQ's first records: there is nothing to count, and a
 * row of zeroes would read as "nothing happened" (the old rollup generates every day it is asked
 * for, so it would have served exactly that).
 */
export function beforeRecords(since: string, until: string): string {
  return (
    `No numbers for ${since} to ${until}: that range is outside the data. LoveIQ's records ` +
    `start on ${rangeLabel(DATA_START, DATA_START)}, so nothing was counted before then. That ` +
    "is no data, not a quiet period: never report it as zero activity."
  );
}

/** The period, and any narrowing filters, as the dashboard's filter bar reads them from a link. */
export function apFilters(
  from: string,
  to: string,
  today: string,
  narrow: Record<string, string> = {}
): ApFilters {
  // A period that is one of the bar's presets ("Last 7 days" and the rest) is linked as that
  // preset, the view the team opens; any other as a custom range. Matched on the range the bar
  // reads, so 365 days that reach before the first records are its "Last 12 months".
  const custom = parseFilters({ period: "custom", from, to, ...narrow }, today);
  for (const { value } of PERIODS) {
    if (value === "custom") continue;
    const preset = parseFilters({ period: value, ...narrow }, today);
    if (preset.from === custom.from && preset.to === custom.to) return preset;
  }
  return custom;
}

/** A link that opens that dashboard page on that period with those filters. */
export function apLink(page: "assessment-a" | "assessment-a/payment", f: ApFilters): string {
  return `${AP_ORIGIN}/admin/ap/${page}${filterQuery(f)}`;
}

export interface ApAsk {
  since: string | null;
  /** Null: up to today, the dashboard's (Berlin) today. */
  until: string | null;
  /** With no `since`: the last N whole days, to yesterday, as the dashboard's "Last N days". */
  days: number;
  /** compare_to: "previous" is the dashboard's own comparison, or a period of its own. */
  other: Period | "previous" | null;
}

export interface ApRead {
  /** The period as the dashboard reads it: within its records and at most MAX_DAYS long. */
  f: ApFilters;
  facts: Facts;
  asked: Period;
  /**
   * compare_to's period; no facts when it lies before the records begin. `sameAge` when it is
   * the equal-length period just before, the one comparison the dashboard makes and the only
   * one whose "so far" figures can be read at the same age.
   */
  other: { f: ApFilters; facts: Facts | null; sameAge: boolean } | null;
  /** What the reading left out of the comparison, and why. */
  notes: string[];
  today: string;
  now: Date;
}

/**
 * The dashboard's facts for a period and for compare_to's. Null when the period ends before
 * LoveIQ's records begin: there is nothing to read, and the caller says so its own way.
 */
export async function readAp(ask: ApAsk, now = new Date()): Promise<ApRead | null> {
  const today = reportingDay(now);
  // No `since`: the dashboard's "Last N days", the N whole days before today.
  const asked = ask.since
    ? { since: ask.since, until: ask.until ?? today }
    : { since: addDays(today, -ask.days), until: addDays(today, -1) };
  let f = apFilters(asked.since, asked.until, today);
  if (beforeData(f)) return null;
  const notes: string[] = [];
  let o: ApFilters | null = null;
  let sameAge = false;
  if (ask.other) {
    /**
     * A COMPARISON IS OF WHOLE DAYS. The dashboard compares nothing while today runs, because
     * part of a day against whole ones reads as a fall every morning (comparisonRange). So the
     * compared period is worked out first, and only once a comparison is made is the asked
     * period, if it reaches today, read to yesterday. With none, it is read as asked.
     */
    const explicit = ask.other === "previous" ? null : ask.other;
    // A range that IS the period just before the one asked counts as "previous", and moves
    // with it when today is cut off: 10 to 16 Oct against 3 to 9 Oct compares 10 to 15 Oct
    // with 4 to 9 Oct, never 6 days with 7.
    const justBefore = previousRange(f);
    const previous =
      !explicit || (explicit.since === justBefore.from && explicit.until === justBefore.to);
    const whole = wholeDays({ since: f.from, until: f.to }, today);
    if (!whole) {
      notes.push(
        "No comparison: the period is only today, which is still running, and the " +
          "dashboard compares whole days only."
      );
    } else {
      const wf = whole.until === f.to ? f : apFilters(whole.since, whole.until, today);
      const before = previousRange(wf);
      let other: ApFilters | null = null;
      if (previous) {
        // The dashboard's own comparison (comparisonRange), worked out from the period it
        // reads rather than the one asked for: until the 31st asked on the 16th compares 1
        // to 15 Oct with 16 to 30 Sep. Unclamped, as its route reads it.
        other = { ...wf, period: "custom", from: before.from, to: before.to, running: false };
      } else {
        const theirs = wholeDays(explicit!, today);
        if (!theirs) {
          notes.push("Nothing to compare with: the compared period has no whole day yet.");
        } else {
          other = apFilters(theirs.since, theirs.until, today);
          if (theirs.until !== explicit!.until)
            notes.push(
              `The compared period is read to yesterday, ${theirs.until}: today is running.`
            );
        }
      }
      // Before the first records there is nothing to compare with: no comparison at all,
      // never a column of zeroes, and the asked period is then read as asked.
      if (other && beforeData(other)) {
        notes.push(
          `The compared period ends before LoveIQ's records start on ${rangeLabel(DATA_START, DATA_START)}, so there is nothing to compare with.`
        );
        other = null;
      }
      if (other) {
        if (wf !== f) {
          notes.push(
            `Today is still running, so ${previous ? "the comparison is of the whole days" : "this period is compared over its whole days"}, ` +
              `${wf.from} to ${wf.to}${previous ? ", against the same number of days before" : ""}: ` +
              "today's part-day is left out."
          );
          f = wf;
        }
        o = other;
        sameAge = previous || (o.from === before.from && o.to === before.to);
      }
    }
  }
  const [facts, otherFacts] = await Promise.all([
    fetchFacts(f.from, f.to),
    o ? fetchFacts(o.from, o.to) : Promise.resolve(null),
  ]);
  return {
    f,
    facts,
    asked,
    other: o ? { f: o, facts: otherFacts, sameAge } : null,
    notes,
    today,
    now,
  };
}

/** The part of a `brain_daily_rollup` row read here. */
type RollupDay = { day: string } & Partial<Record<(typeof NOT_ON_DASHBOARD)[number], unknown>>;

/** Each day of the facts, newest first: the dashboard's counts for that day alone. */
function dayRows(facts: Facts, extras: Map<string, RollupDay>): DayRow[] {
  const rows: DayRow[] = [];
  for (let d = facts.to; d >= facts.from; d = addDays(d, -1)) {
    const t = totals(facts, ALL, d, d);
    const r = extras.get(d);
    rows.push({
      day: d,
      unique_visitors: t.visits,
      survey_starts: t.starts,
      // The Survey page's slide 4 "reached": the same funnel_event rows the rollup counted.
      intro_completed: facts.intro
        .filter((x) => x.day === d && x.step === "intro_slide_4")
        .reduce((n, x) => n + x.n, 0),
      submissions: t.subs,
      reports_opened: t.opened,
      paid_so_far: t.paidCohort,
      paid_sales: t.sales,
      free_unlocks: t.gifts,
      revenue: t.revenue,
      ...(r
        ? Object.fromEntries(NOT_ON_DASHBOARD.filter((k) => k in r).map((k) => [k, r[k]]))
        : {}),
    });
  }
  return rows;
}

const plural = (n: number, one: string) => `${fmt("count", n)} ${one}${n === 1 ? "" : "s"}`;

/** A headline tile as the page writes it: the value, its change, then the line under it. */
function tileLine(t: Tile): string {
  if (t.blocked) return `- ${t.label}: no figure (${t.blocked})`;
  const d = delta(t.unit, t.value, t.prev, t.goodWhen, t.deltaAs);
  return `- ${t.label}: ${fmt(t.unit, t.value)}${d ? ` (${d.text})` : ""}${t.foot ? ` · ${t.foot}` : ""}`;
}

export interface ApView {
  period: Period;
  rows: DayRow[];
  /** compare_to's period and its rows (none before the records begin); null without one. */
  other: { period: Period; rows: DayRow[] } | null;
  /** What the dashboard shows for the period, how to open it, and what each row key is. */
  header: string;
}

/**
 * The period's day rows, compare_to's, and the header. `rollup` is the old daily rollup's
 * rows, which are read only for the figures NOT_ON_DASHBOARD names.
 */
export function apView(read: ApRead, rollup: RollupDay[], ad: AdCost): ApView {
  const { f, facts, other, today, now } = read;
  const extras = new Map(rollup.map((r) => [String(r.day).slice(0, 10), r]));
  const rows = dayRows(facts, extras);
  const period = { since: f.from, until: f.to };
  const notes: string[] = [...read.notes];

  let compared: ApView["other"] = null;
  if (other) {
    const otherRows = other.facts
      ? dayRows(
          // As the dashboard compares: the earlier finishers read at the same age as these.
          // Only the equal-length period just before has a same age; for any other, the
          // figures that depend on it are left out below.
          other.sameAge ? ageMatched(other.facts, sameAge(facts, other.facts, now)) : other.facts,
          extras
        )
      : [];
    if (!other.sameAge) {
      for (const r of [...rows, ...otherRows]) for (const k of AGE_KEYS) delete r[k];
      notes.push(
        `${AGE_KEYS.join(", ")}, Payment CVR and Report open rate are not compared: they count ` +
          "what a period's finishers have done so far, which grows the longer ago they " +
          "finished, and only the equal-length period just before can be read at the same " +
          "age, the one comparison the dashboard makes (compare_to previous)."
      );
    }
    // Survey starts are compared only when both periods hold every start, or the change
    // would be the gap.
    const startsOk =
      other.facts !== null &&
      comparableStarts(totals(other.facts, ALL), f.from, other.facts.from, today)?.starts !== null;
    if (!startsOk) {
      for (const r of [...rows, ...otherRows]) delete r.survey_starts;
      notes.push(
        "survey_starts is not compared: one of the periods starts before every start was " +
          "recorded (18 Sep 2026, or within the last 30 days), as the dashboard leaves it."
      );
    }
    compared = { period: { since: other.f.from, until: other.f.to }, rows: otherRows };
  }

  const dash = buildDashboard({
    facts,
    previous: other?.facts ?? null,
    ad,
    filters: f,
    today,
    now,
    newReturning: null,
  });
  // The builder reads any earlier period at "the same age", which is right only for the one
  // just before: for another, the tiles counting finishers "so far" carry no change.
  if (other && !other.sameAge)
    dash.tiles = dash.tiles.map((x) => (AGE_TILES.has(x.key) ? { ...x, prev: null } : x));
  const t = totals(facts, ALL);
  const s = spend(ad, ALL, f.from, f.to);
  const asked = read.asked;
  if (f.running) notes.push("Today is still running, so its figures are part of a day.");
  if (asked.since < f.from) {
    notes.push(
      asked.since < DATA_START && f.from === DATA_START
        ? `LoveIQ's records start on ${rangeLabel(DATA_START, DATA_START)}, so the dashboard's figures start there.`
        : `The dashboard reads at most ${MAX_DAYS} days, so its figures start on ${f.from}; the days before are not in them.`
    );
  }
  if (rollup.length === 0) {
    notes.push(
      `The old daily rollup returned no rows, so ${NOT_ON_DASHBOARD.join(", ")} are missing: ` +
        "a fault in the query or the database, not zero."
    );
  }
  const journey = dash.journey
    .filter((j) => j.value !== null)
    .map((j) => `${j.label} ${fmt("count", j.value)} (${j.step})`)
    .join(" → ");
  // The scorecard's own figures; those a tile already gave (start and payment CVR) once.
  const tiled = new Set(dash.tiles.map((x) => `${x.unit}:${x.value}`));
  const scorecard = dash.scorecard
    .filter((r) => r.value !== null && !tiled.has(`${r.unit}:${r.value}`))
    .map((r) => `${r.label} ${fmt(r.unit, r.value)}: ${r.note}`)
    .join(" · ");
  const spent =
    s.eur === null
      ? `Google Ads spend: no figure (${s.why ?? "not recorded for these days"})`
      : `Google Ads spend ${fmt("eur", s.eur, 2)}` +
        (s.complete ? "" : ` (${spendCoverage(s)}, so not every day of the period is in it)`);

  const lines = [
    `AP-ANALYTICS NUMBERS for ${f.from} to ${f.to}: the team dashboard's own figures, counted ` +
      "by its code (Berlin days; staff and our own test traffic left out). Quote them as the " +
      `dashboard's. The same view: ${apLink("assessment-a", f)} (team sign-in required).`,
    "",
    `As the dashboard shows the period${compared ? ", with its change against the compared one" : ""}:`,
    ...dash.tiles.map(tileLine),
    `Journey: ${journey}`,
    scorecard ? `Scorecard: ${scorecard}` : null,
    `Behind those: ${plural(t.sales, "paid sale")} by ${plural(t.payers, "paying customer")} ` +
      `and ${plural(t.gifts, "free unlock")} (EUR 0, never a sale); ${spent}.`,
    dash.notes.length ? `The dashboard's notes on this period: ${dash.notes.join(" ")}` : null,
    compared && other
      ? `Compared with ${compared.period.since} to ${compared.period.until}` +
        (other.sameAge
          ? ", the period just before, as the dashboard compares it: that period's " +
            "reports_opened and paid_so_far are read at the same age as this one's, and ad " +
            "spend only when both have every day of it."
          : ".") +
        ` That period on the dashboard: ${apLink("assessment-a", other.f)}.`
      : null,
    ...notes,
    "",
    "Row keys, as the dashboard counts them: unique_visitors (its Visitors: unique daily " +
      "visits); survey_starts (people who began the survey, by the day they began); " +
      "intro_completed (reached the intro's last slide, the Survey page's slide 4); submissions " +
      "(finished surveys); reports_opened and paid_so_far (of that day's finishers, how many " +
      "have opened their report, and paid, so far); paid_sales and free_unlocks (sales above " +
      "EUR 0 and EUR 0 unlocks, by the day paid); revenue (EUR, what those sales charged).",
    `NOT ON THE DASHBOARD: ${NOT_ON_DASHBOARD.join(", ")} have no figure there, so they keep ` +
      "the old daily rollup's counting (UTC days, with staff and our test visits).",
    "",
  ];
  return {
    period,
    rows,
    other: compared,
    header: lines.filter((l): l is string => l !== null).join("\n") + "\n",
  };
}

/**
 * What get_business_numbers' `group_by` splits a period's sales by. A sale's plan, price list,
 * device and source live in its payment's metadata, which query_product_data cannot select, so
 * "revenue by plan" had no answer before this (asked four times, Mark's first session included).
 */
export const SALE_GROUPS = [
  "plan",
  "price_list",
  "device",
  "source",
  "country_tier",
  "landing",
  "month",
] as const;
export type SaleGroup = (typeof SALE_GROUPS)[number];

/** What each sale is grouped by, as the dashboard names it. */
const GROUP_LABEL: Record<SaleGroup, (m: Facts["money"][number]) => string> = {
  plan: (m) => m.plan ?? "not recorded",
  price_list: (m) => m.priceArm ?? "not recorded",
  device: (m) => DEVICES.find((d) => d.value === deviceClass(m.device))?.label ?? "not recorded",
  source: (m) => SOURCES.find((s) => s.value === classifySource(m))?.label ?? "not recorded",
  country_tier: (m) => TIERS.find((t) => t.value === m.tier)?.label ?? "not recorded",
  landing: (m) => m.arm ?? "not recorded",
  month: (m) => m.day.slice(0, 7),
};

/** The groupings that are filters on the dashboard, as its links write them. */
const FILTER_OF: Partial<
  Record<SaleGroup, (m: Facts["money"][number]) => [string, string] | null>
> = {
  device: (m) => {
    const v = deviceClass(m.device);
    return v ? ["device", v] : null;
  },
  source: (m) => {
    const v = classifySource(m);
    return SOURCES.some((s) => s.value === v) ? ["source", v] : null;
  },
  country_tier: (m) => (TIERS.some((t) => t.value === m.tier) ? ["tier", m.tier!] : null),
};

/**
 * A period's sales split by one or two groupings, as the dashboard counts sales: succeeded, not
 * a test, by the Berlin day paid, staff and our test traffic out, EUR 0 unlocks beside them.
 * Null when the period ends before the records begin.
 */
export async function apSales(
  ask: ApAsk,
  by: SaleGroup[],
  now = new Date()
): Promise<string | null> {
  const read = await readAp({ ...ask, other: null }, now);
  return read && renderApSales(read.facts, by, read.f, read.today);
}

export function renderApSales(facts: Facts, by: SaleGroup[], f: ApFilters, today: string): string {
  const sales = salesIn(facts, ALL, f.from, f.to);
  // The free unlocks as the Payment page reads them beside its paid sales.
  const comps = facts.money.filter(
    (m) => m.day >= f.from && m.day <= f.to && m.amount <= 0 && classifySource(m) !== "test"
  );
  const groups = new Map<
    string,
    { sales: number; revenue: number; comps: number; filter: Record<string, string> | null }
  >();
  for (const [m, sale] of [
    ...sales.map((m) => [m, true] as const),
    ...comps.map((m) => [m, false] as const),
  ]) {
    const key = by.map((g) => GROUP_LABEL[g](m)).join(" · ");
    const pairs = by.map((g) => FILTER_OF[g]?.(m) ?? null);
    const g = groups.get(key) ?? {
      sales: 0,
      revenue: 0,
      comps: 0,
      filter: pairs.every((p) => p !== null) ? Object.fromEntries(pairs) : null,
    };
    if (sale) {
      g.sales += 1;
      g.revenue += m.amount;
    } else g.comps += 1;
    groups.set(key, g);
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  const eur = (n: number) => fmt("eur", round(n), 2);
  const total = round(sales.reduce((n, m) => n + m.amount, 0));
  const head =
    `Sales by ${by.join(" and ").replace(/_/g, " ")}, ${f.from} to ${f.to} (Berlin days, by the ` +
    `day paid), as AP-Analytics counts them: ${plural(sales.length, "sale")}, ${eur(total)}` +
    (comps.length ? `, and ${plural(comps.length, "free unlock")}` : "") +
    ".\n" +
    `The dashboard's Payment page shows the same Revenue and Paid sales: ` +
    `${apLink("assessment-a/payment", f)} (team sign-in required).\n` +
    "A sale is a succeeded payment above EUR 0 that is not a test, at what was charged; staff " +
    "and our own test traffic are left out, as on the dashboard. A free unlock is a EUR 0 " +
    "unlock, never a sale. Device, source and country tier are the dashboard's own filters, " +
    "so each of those groups links to the Payment page under it, where Revenue and Paid sales " +
    "are that group's. Price lists A and B are the 2.x price test, A3 and B3 Pricing 3.0.";
  if (!groups.size) return `${head}\nNo sales or free unlocks in that period.`;
  const lines = [...groups.entries()]
    .sort(([, a], [, b]) => b.revenue - a.revenue || b.sales - a.sales || b.comps - a.comps)
    .map(([key, g]) => {
      const filtered = g.filter ? apFilters(f.from, f.to, today, g.filter) : null;
      const blank = filtered ? tabletBlocked(filtered, filtered.from) : null;
      return (
        `- ${key}: ${plural(g.sales, "sale")}, ${eur(g.revenue)}` +
        (g.sales ? ` (average ${eur(g.revenue / g.sales)})` : "") +
        (g.comps ? `; ${plural(g.comps, "free unlock")}` : "") +
        (filtered
          ? ` · on the dashboard: ${apLink("assessment-a/payment", filtered)}` +
            (blank ? ` (blank there: ${blank})` : "")
          : "")
      );
    });
  return [head, ...lines].join("\n");
}
