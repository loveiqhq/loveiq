/**
 * The Overview page (Marcus's "Overall performance" artboard): five headline tiles, then
 * traffic, submissions, engagement, revenue and costs, each per assessment or per source.
 */
import type { AdCost } from "@features/brain/server/ingest/analytics";

import type { Facts } from "./facts";
import {
  ASSESSMENTS,
  SOURCES,
  buckets,
  bucketCaption,
  trendBuckets,
  activeNarrowing,
  beforeData,
  comparisonRange,
  DATA_START,
  periodRange,
  rangeLabel,
  SURVEY_TRACKING_FROM,
  type ApFilters,
  type Source,
} from "./filters";
import { fmt, type GoodWhen, type Unit } from "./format";
import { POSTHOG_FROM } from "./posthog";
import {
  EVENTS_COMPLETE_FROM,
  STEP_DEVICE_FROM,
  draftsKeptFrom,
  launched,
  mean,
  median,
  ratio,
  spend,
  spendBlocked,
  startsBlocked,
  comparableStarts,
  startsComplete,
  subsIn,
  totals,
  trend,
  visitsBlocked,
  type Scope,
  type Totals,
  ageMatched,
  sameAge,
} from "./metrics";

export interface Tile {
  key: string;
  label: string;
  unit: Unit;
  value: number | null;
  prev: number | null;
  goodWhen: GoodWhen;
  spark: Array<number | null>;
  /** The line under the value; the page adds the change before it. */
  foot: string;
  /** Why the value is blank under the filters. */
  blocked: string | null;
  trend: string;
  href?: string;
  /** The change as a plain difference ("−€3.25") rather than a percentage. */
  deltaAs?: "abs";
}

export interface Column {
  label: string;
  unit: Unit | "text";
}

export interface TableRow {
  label: string;
  values: Array<number | string | null>;
  /** "Not launched" rows are greyed. */
  muted?: boolean;
  /** A share bar after the numbers, 0..1, relative to the largest row. */
  bar?: number;
}

export interface Table {
  columns: Column[];
  rows: TableRow[];
  note?: string;
  /** The heading over the bar column, when the rows have bars. */
  barLabel?: string;
}

export interface FunnelStep {
  label: string;
  value: number | null;
  /** Share of the first step. */
  ofFirst: number | null;
  /** Share of the step before. */
  ofPrev: number | null;
}

export interface MiniStat {
  label: string;
  unit: Unit;
  value: number | null;
  prev?: number | null;
  goodWhen?: GoodWhen;
  /** "abs": the change as a plain difference ("−3"), as the design shows a count of sales. */
  deltaAs?: "abs";
  note?: string;
}

/** Everything a page shows above its sections. */
export interface PageHead {
  range: { from: string; to: string; label: string };
  compare: { from: string; to: string; label: string } | null;
  generatedAt: string;
  /** Plain notes on what the figures cannot see in this range. */
  notes: string[];
  /** Set while a source, device or tier filter is on: what the all-traffic parts say. */
  narrowed: string | null;
}

export interface OverviewPayload extends PageHead {
  tiles: Tile[];
  traffic: {
    /** `days` below 7 (or a month's length) marks a week or month cut short by the range. */
    bars: Array<{ label: string; value: number | null; days: number; full: boolean }>;
    caption: string;
    byAssessment: Table;
    bySource: Table;
  };
  submissions: { funnel: FunnelStep[]; byAssessment: Table; bySource: Table };
  engagement: {
    survey: MiniStat[];
    report: MiniStat[];
    byAssessment: Table;
    bySource: Table;
  };
  revenue: { stats: MiniStat[]; byAssessment: Table };
  costs: { stats: MiniStat[]; byAssessment: Table };
}

/** The sources a per-source table lists: every one that has people in the range. */
export const SOURCE_ROWS: Array<{ value: Source; label: string }> = SOURCES.filter(
  (s): s is { value: Source; label: string } & (typeof SOURCES)[number] => s.value !== "all"
).map((s) => ({ value: s.value as Source, label: s.label }));

export function head(f: ApFilters, today: string, now: Date): PageHead {
  const cmp = comparisonRange(f);
  const notes: string[] = [];
  if (beforeData(f)) {
    notes.push(
      `Nothing to show for these days: LoveIQ's records start on ${rangeLabel(DATA_START, DATA_START)}.`
    );
  } else if (
    f.period !== "custom" &&
    f.from === DATA_START &&
    periodRange(f.period, today).from < DATA_START
  ) {
    notes.push(
      `LoveIQ's records start on ${rangeLabel(DATA_START, DATA_START)}, so this range starts there.`
    );
  }
  if (!beforeData(f) && cmp && cmp.from < DATA_START) {
    notes.push(
      beforeData(cmp)
        ? `Nothing to compare with: the comparison period is before LoveIQ's records start (${rangeLabel(DATA_START, DATA_START)}).`
        : `The comparison period starts before LoveIQ's records (${rangeLabel(DATA_START, DATA_START)}), so it holds fewer days.`
    );
  }
  if (!beforeData(f) && f.from < EVENTS_COMPLETE_FROM) {
    notes.push(
      "Before 18 Sep 2026 the survey steps and the report's events were recorded only for people who accepted cookies: report figures for those days are incomplete (most read low; returns can read high), and survey starts read low once their drafts are cleared (30 days on)."
    );
  }
  if (!beforeData(f) && f.from < draftsKeptFrom(today)) {
    notes.push(
      "Unfinished survey starts older than 30 days have no source or landing arm: their drafts are deleted after 30 days."
    );
  }
  // A finisher's tier comes from the price quote made when the report is opened (so does the
  // device before the survey's own steps recorded it): under these filters the figures cover
  // readers only.
  if (f.tier !== "all") {
    notes.push(
      "The country tier is known only for people who opened their report (it comes from the price quote), so under a tier filter the figures cover those readers: submissions read low and the report open rate near 100%."
    );
  } else if (f.device !== "all" && f.from < STEP_DEVICE_FROM) {
    notes.push(
      "Before 12 Oct 2026 the device is known only for people who opened their report, so under a device filter those days cover readers only: submissions read low and the report open rate high."
    );
  }
  if (f.visitor !== "all") {
    notes.push(
      `New or returning comes from PostHog (from ${rangeLabel(POSTHOG_FROM, POSTHOG_FROM)}), which saw almost every finisher's visit: one it didn't see is in neither group. Visits, survey starts, ad spend and prices can't be split this way.`
    );
  }
  if (f.device !== "all" && f.from < SURVEY_TRACKING_FROM) {
    notes.push(
      `Tablets are told apart from ${rangeLabel(SURVEY_TRACKING_FROM, SURVEY_TRACKING_FROM)}: before, they count as Mobile, or as Desktop for newer iPads, which present themselves as Macs.`
    );
  }
  return {
    range: { from: f.from, to: f.to, label: rangeLabel(f.from, f.to) },
    compare: cmp ? { ...cmp, label: rangeLabel(cmp.from, cmp.to) } : null,
    generatedAt: now.toISOString(),
    notes,
    narrowed:
      activeNarrowing(f).length > 0
        ? "All traffic: its records carry no source, device, tier or visitor history, so the filters do not apply here."
        : null,
  };
}

/** Rows B and C of an "Assessment" table: not launched, so empty by definition. */
export function laterAssessments(width: number): TableRow[] {
  return ASSESSMENTS.filter((a) => a.value === "b" || a.value === "c").map((a) => ({
    label: a.label,
    values: Array(width).fill(null),
    muted: true,
  }));
}

/** What an average reading time counts, and the median beside it. */
export function readFoot(medianMs: number | null): string {
  return `per reader, all visits, each up to 30 min${medianMs === null ? "" : ` · median ${fmt("mmss", medianMs)}`}`;
}

/** Reading time per reader (all their visits), over readers whose reading was recorded. */
function readTimes(facts: Facts, scope: Scope): number[] {
  return subsIn(facts, scope)
    .filter((s) => s.closed > 0)
    .map((s) => s.readMs);
}

export function readMedianMs(facts: Facts, scope: Scope): number | null {
  return median(readTimes(facts, scope));
}

export function readMeanMs(facts: Facts, scope: Scope): number | null {
  return mean(readTimes(facts, scope));
}

/** Of the readers, how many came back on a later visit. */
export function returnRate(facts: Facts, scope: Scope): number | null {
  const readers = subsIn(facts, scope).filter((s) => s.openedAt);
  return ratio(readers.filter((s) => s.visits > 1).length, readers.length);
}

export function buildOverview(input: {
  facts: Facts;
  previous: Facts | null;
  ad: AdCost;
  filters: ApFilters;
  today: string;
  now: Date;
  /** The question most people leave on, from the survey page's data. */
  topExit?: { id: string; text: string } | null;
  /** Who the top exit counts, when not the filters' people ("all traffic"). */
  topExitScope?: string | null;
}): OverviewPayload {
  const { facts, previous, ad, filters: f, today, now } = input;
  const scope: Scope = {
    assessment: f.assessment,
    source: f.source,
    device: f.device,
    tier: f.tier,
    visitor: f.visitor,
  };
  const t = totals(facts, scope);
  // The earlier period at the same age as this one, so "so far" rates compare like with like.
  const prevAged = previous ? ageMatched(previous, sameAge(facts, previous, now)) : null;
  const pRaw = prevAged ? totals(prevAged, scope) : null;
  // Starts before 18 Sep 2026 miss people who declined cookies: never compared with a range
  // that holds everyone, or the change is made of the gap.
  const startsOk = startsComplete(facts.from, today, scope);
  const p: Totals | null = comparableStarts(pRaw, facts.from, previous?.from ?? null, today, scope);
  const sNow = spend(ad, scope, facts.from, facts.to);
  // Spend is compared only when both periods have every day of it: a partial total reads low.
  const sPrevRaw = previous ? spend(ad, scope, previous.from, previous.to) : null;
  const sPrev =
    sPrevRaw && !(sPrevRaw.complete && sNow.complete) ? { ...sPrevRaw, eur: null } : sPrevRaw;
  const caption = bucketCaption(facts.from, facts.to);
  const vBlocked = visitsBlocked(scope);
  const stBlocked = startsBlocked(scope, facts.from, today);
  const spendNote = !sNow.complete && sNow.eur !== null ? spendCoverage(sNow) : null;
  // A week or month missing some days of spend has no point on the line rather than a low one.
  const bucketSpend = (from: string, to: string) => {
    const s = spend(ad, scope, from, to);
    return s.complete ? s.eur : null;
  };

  const cac = (s: { eur: number | null }, tt: Totals) =>
    s.eur === null ? null : ratio(s.eur, tt.payers);
  const perSub = (s: { eur: number | null }, tt: Totals) =>
    s.eur === null ? null : ratio(s.eur, tt.subs);

  const tiles: Tile[] = [
    {
      key: "visits",
      label: "Visitors",
      unit: "count",
      value: t.visits,
      prev: p?.visits ?? null,
      goodWhen: "up",
      spark: trend(facts, scope, (x) => x.visits),
      foot: `Unique daily visits${p?.visits != null ? ` · prev. ${p.visits.toLocaleString("en-US")}` : ""}`,
      blocked: vBlocked,
      trend: caption,
      href: "#traffic",
    },
    {
      key: "starts",
      label: "Survey starts",
      unit: "count",
      value: t.starts,
      prev: p?.starts ?? null,
      goodWhen: "up",
      spark: trend(facts, scope, (x, from) =>
        startsComplete(from, today, scope) ? x.starts : null
      ),
      foot: [
        ratio(t.starts, t.visits) !== null
          ? `${pctText(ratio(t.starts, t.visits))} of visits start the survey`
          : "Answered at least the first question",
        !startsOk ? "may be low: unfinished starts before 18 Sep 2026 are kept only 30 days" : null,
        pRaw && p && p.starts === null && t.starts !== null
          ? "previous period not comparable"
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
      blocked: stBlocked,
      trend: caption,
      href: "#submissions",
    },
    {
      key: "subs",
      label: "Submissions",
      unit: "count",
      value: t.subs,
      prev: p?.subs ?? null,
      goodWhen: "up",
      spark: trend(facts, scope, (x) => x.subs),
      foot:
        ratio(t.subs, t.starts) !== null
          ? `${pctText(ratio(t.subs, t.starts))} of starts submit`
          : "Finished surveys",
      blocked: null,
      trend: caption,
      href: "#submissions",
    },
    {
      key: "revenue",
      label: "Revenue",
      unit: "eur",
      value: t.revenue,
      prev: p?.revenue ?? null,
      goodWhen: "up",
      spark: trend(facts, scope, (x) => x.revenue),
      foot: `${t.payers} paid report${t.payers === 1 ? "" : "s"}${
        p
          ? ` · prev. ${p.payers} (€${p.revenue.toLocaleString("en-US", { maximumFractionDigits: 2 })})`
          : ""
      }${t.gifts ? ` · ${t.gifts} gifted` : ""}`,
      blocked: null,
      trend: caption,
      href: "#revenue",
    },
    {
      key: "spend",
      label: "Ad spend",
      unit: "eur",
      value: sNow.eur,
      prev: sPrev?.eur ?? null,
      goodWhen: "down",
      spark: trendBuckets(facts.from, facts.to).map((b) => bucketSpend(b.from, b.to)),
      foot:
        sNow.eur === null
          ? "Google Ads"
          : `CAC ${fmt("eur", cac(sNow, t))} · ${eurText(perSub(sNow, t))} per submission${spendNote ? ` · ${spendNote}` : ""}`,
      blocked: spendBlocked(scope),
      trend: caption,
      href: "#costs",
    },
  ];

  const byAssessmentRow = (label: string, values: Array<number | null>): TableRow => ({
    label,
    values,
  });
  const launchedA = launched(scope);
  const aLabel = "Assessment A";

  // Per source: what each source brought, person by person. Visits are never split.
  const sourceTotals = SOURCE_ROWS.map((s) => ({
    ...s,
    t: totals(facts, { ...scope, source: s.value }),
  })).filter((s) => (s.t.starts ?? 0) > 0 || s.t.subs > 0 || s.t.revenue > 0);

  const trafficByAssessment: Table = {
    columns: [
      { label: "Assessment", unit: "text" },
      { label: "Visitors", unit: "count" },
      { label: "Share", unit: "pct" },
      { label: "Start CVR", unit: "pct" },
    ],
    rows: [
      byAssessmentRow(
        aLabel,
        launchedA
          ? [t.visits, t.visits === null ? null : 1, ratio(t.starts, t.visits)]
          : [null, null, null]
      ),
      ...laterAssessments(3),
    ],
    note: vBlocked ?? undefined,
  };

  // Starts carry a source only while their drafts are kept: past that, no row can say
  // where they came from, and "Unknown" would claim them all.
  const sourceStartsBlocked = startsBlocked({ ...scope, source: "google_ads" }, facts.from, today);
  const allTotals = totals(facts, { ...scope, source: "all" });
  const allStarts = allTotals.starts;
  const knownStarts = sourceTotals.reduce((n, s) => n + (s.t.starts ?? 0), 0);
  const knownSubs = sourceTotals.reduce((n, s) => n + s.t.subs, 0);
  const unknownStarts = allStarts === null ? null : allStarts - knownStarts;
  const unknownRow =
    scope.source === "all" && sourceStartsBlocked === null && (unknownStarts ?? 0) > 0
      ? { label: "Unknown source", starts: unknownStarts, subs: allTotals.subs - knownSubs }
      : null;
  const trafficBySource: Table = {
    columns: [
      { label: "Source", unit: "text" },
      { label: "Survey starts", unit: "count" },
      { label: "Share of starts", unit: "pct" },
      { label: "Submissions", unit: "count" },
    ],
    rows: [
      ...sourceTotals.map((s) => ({
        label: s.label,
        values: [s.t.starts, ratio(s.t.starts, allStarts), s.t.subs],
      })),
      ...(unknownRow
        ? [
            {
              label: unknownRow.label,
              values: [unknownRow.starts, ratio(unknownRow.starts, allStarts), unknownRow.subs],
              muted: true,
            },
          ]
        : []),
    ],
    note: `Visits are not split by source: the visit log misses most ad clicks (Google Analytics files 79% of visitors under Direct). ${sourceStartsBlocked ?? "Starts and submissions carry the source the survey recorded."}`,
  };

  const funnelValues: Array<[string, number | null]> = [
    ["Visited", t.visits],
    ["Started survey", t.starts],
    ["Submitted", t.subs],
    ["Opened report", t.opened],
    ["Paid (so far)", t.paidCohort],
  ];
  const first = funnelValues.find(([, v]) => v !== null)?.[1] ?? null;
  const funnel: FunnelStep[] = funnelValues.map(([label, value], i) => ({
    label,
    value,
    ofFirst: ratio(value, first),
    ofPrev: i === 0 ? null : ratio(value, funnelValues[i - 1]![1]),
  }));

  const subsByAssessment: Table = {
    columns: [
      { label: "Assessment", unit: "text" },
      { label: "Starts", unit: "count" },
      { label: "Submissions", unit: "count" },
      { label: "Completion", unit: "pct" },
      { label: "Submission CVR", unit: "pct" },
    ],
    rows: [
      byAssessmentRow(
        aLabel,
        launchedA
          ? [t.starts, t.subs, ratio(t.startsFinished, t.starts), ratio(t.subs, t.visits)]
          : [null, null, null, null]
      ),
      ...laterAssessments(4),
    ],
  };
  const subsBySource: Table = {
    columns: [
      { label: "Source", unit: "text" },
      { label: "Starts", unit: "count" },
      { label: "Submissions", unit: "count" },
      { label: "Completion", unit: "pct" },
      { label: "Paid (so far)", unit: "count" },
    ],
    rows: sourceTotals.map((s) => ({
      label: s.label,
      values: [s.t.starts, s.t.subs, ratio(s.t.startsFinished, s.t.starts), s.t.paidCohort],
    })),
    note: `Completion: of the people who started in the range, how many finished. No submission CVR per source: it needs visits by source, which the visit log cannot give.${sourceStartsBlocked ? ` ${sourceStartsBlocked}` : ""}`,
  };

  const introOf = (step: string) =>
    launchedA ? facts.intro.filter((i) => i.step === step).reduce((n, i) => n + i.n, 0) : 0;
  const read = readMedianMs(facts, scope);
  const engagementRow = (scopeX: Scope, tt: Totals): Array<number | null> => [
    ratio(tt.startsFinished, tt.starts),
    ratio(tt.opened, tt.subs),
    readMeanMs(facts, scopeX),
    returnRate(facts, scopeX),
  ];
  const engagement = {
    survey: [
      {
        label: "Completion",
        unit: "pct" as Unit,
        value: ratio(t.startsFinished, t.starts),
      },
      {
        label: "Intro completed",
        unit: "count" as Unit,
        value: introOf("intro_slide_4"),
        note: `of ${introOf("intro_slide_1").toLocaleString("en-US")} who saw slide 1 (cookie-accepting visitors)${activeNarrowing(f).length ? " · all traffic" : ""}`,
      },
      { label: "Median duration", unit: "mmss" as Unit, value: t.surveyMedianMs },
      {
        label: "Top drop-off card",
        unit: "count" as Unit,
        value: null,
        note: input.topExit
          ? `${input.topExit.id} · ${input.topExit.text}${input.topExitScope ? ` · ${input.topExitScope}` : ""}`
          : undefined,
      },
    ],
    report: [
      { label: "Open rate", unit: "pct" as Unit, value: ratio(t.opened, t.subs) },
      { label: "Reports opened", unit: "count" as Unit, value: t.opened },
      {
        label: "Avg. read time",
        unit: "mmss" as Unit,
        value: readMeanMs(facts, scope),
        note: `${readFoot(read)} · readers whose reading time was recorded`,
      },
      {
        label: "Invites sent",
        unit: "count" as Unit,
        // Invites are counted per day without their sender's source: all traffic under a filter.
        value: launchedA
          ? facts.invites
              .filter((i) => i.day >= facts.from && i.day <= facts.to)
              .reduce((n, i) => n + i.n, 0)
          : 0,
        note: activeNarrowing(f).length ? "all traffic" : undefined,
      },
    ],
    byAssessment: {
      columns: [
        { label: "Assessment", unit: "text" as const },
        { label: "Survey completion", unit: "pct" as const },
        { label: "Report open rate", unit: "pct" as const },
        { label: "Avg. read time", unit: "mmss" as const },
        { label: "Returns", unit: "pct" as const },
      ],
      rows: [
        byAssessmentRow(aLabel, launchedA ? engagementRow(scope, t) : [null, null, null, null]),
        ...laterAssessments(4),
      ],
    },
    bySource: {
      columns: [
        { label: "Source", unit: "text" as const },
        { label: "Survey completion", unit: "pct" as const },
        { label: "Report open rate", unit: "pct" as const },
        { label: "Avg. read time", unit: "mmss" as const },
        { label: "Returns", unit: "pct" as const },
      ],
      rows: sourceTotals.map((s) => ({
        label: s.label,
        values: engagementRow({ ...scope, source: s.value }, s.t),
      })),
      note: sourceStartsBlocked ? `Survey completion: ${sourceStartsBlocked}` : undefined,
    },
  };

  const perVisit = (tt: Totals) => ratio(tt.revenue, tt.visits);
  const revenue = {
    stats: [
      { label: "Revenue", unit: "eur" as Unit, value: t.revenue, prev: p?.revenue ?? null },
      {
        label: "Paid reports",
        unit: "count" as Unit,
        value: t.payers,
        prev: p?.payers ?? null,
        deltaAs: "abs" as const,
      },
      {
        label: "€ per visit",
        unit: "eur3" as Unit,
        value: perVisit(t),
        prev: p ? perVisit(p) : null,
      },
    ],
    byAssessment: {
      columns: [
        { label: "Assessment", unit: "text" as const },
        { label: "Paid", unit: "count" as const },
        { label: "Revenue", unit: "eur" as const },
        { label: "€ / visit", unit: "eur3" as const },
      ],
      rows: [
        byAssessmentRow(
          aLabel,
          launchedA ? [t.payers, t.revenue, perVisit(t)] : [null, null, null]
        ),
        ...laterAssessments(3),
      ],
      note: t.gifts
        ? `${t.gifts} report${t.gifts === 1 ? " was" : "s were"} unlocked for free (gifted) and ${t.gifts === 1 ? "is" : "are"} not counted as paid.`
        : undefined,
    },
  };

  const costs = {
    stats: [
      {
        label: "Ad spend",
        unit: "eur" as Unit,
        value: sNow.eur,
        prev: sPrev?.eur ?? null,
        goodWhen: "down" as const,
        note: spendNote ?? undefined,
      },
      {
        label: "Per submission",
        unit: "eur" as Unit,
        value: perSub(sNow, t),
        prev: sPrev && p ? perSub(sPrev, p) : null,
        goodWhen: "down" as const,
        note: spendNote ?? undefined,
      },
      {
        label: "CAC (paid)",
        unit: "eur" as Unit,
        value: cac(sNow, t),
        prev: sPrev && p ? cac(sPrev, p) : null,
        goodWhen: "down" as const,
        note: t.payers === 0 ? "no paying customer in the range" : (spendNote ?? undefined),
      },
    ],
    byAssessment: {
      columns: [
        { label: "Assessment", unit: "text" as const },
        { label: "Ad spend", unit: "eur" as const },
        { label: "€ / submission", unit: "eur" as const },
        { label: "CAC", unit: "eur" as const },
      ],
      rows: [
        byAssessmentRow(
          aLabel,
          launchedA ? [sNow.eur, perSub(sNow, t), cac(sNow, t)] : [null, null, null]
        ),
        ...laterAssessments(3),
      ],
      note: `Google Ads is the only paid channel; its spend comes from Google Analytics, refreshed every 15 minutes.${spendNote ? ` For this range: ${spendNote}.` : ""}`,
    },
  };

  return {
    ...head(f, today, now),
    tiles,
    traffic: {
      bars: buckets(facts.from, facts.to).map((b) => ({
        label: b.label,
        value: totals(facts, scope, b.from, b.to).visits,
        days: b.days,
        full: b.full,
      })),
      caption,
      byAssessment: trafficByAssessment,
      bySource: trafficBySource,
    },
    submissions: { funnel, byAssessment: subsByAssessment, bySource: subsBySource },
    engagement,
    revenue,
    costs,
  };
}

function pctText(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(v * 100 >= 10 ? 1 : 2)}%`;
}

function eurText(v: number | null): string {
  return v === null
    ? "—"
    : `€${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "spend recorded from 28 May 2026" when part of the range has no spend figure. */
export function spendCoverage(s: { from: string | null; to: string | null }): string {
  if (!s.from || !s.to) return "ad spend not recorded for this range";
  return `spend recorded ${rangeLabel(s.from, s.to)}`;
}
