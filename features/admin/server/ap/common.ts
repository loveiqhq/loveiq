/**
 * What every AP-Analytics page shares: the tile, table and box shapes the pages draw, the
 * banner notes over a range (head), visitors per source as PostHog splits them, and reading
 * time. (The Overview this began in was replaced by the Dashboard on 16 Oct 2026.)
 */
import type { Facts } from "./facts";
import {
  ASSESSMENTS,
  SOURCES,
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
import { POSTHOG_FROM, type PostHogResult, type SessionTags } from "./posthog";
import {
  EVENTS_COMPLETE_FROM,
  STEP_DEVICE_FROM,
  draftsKeptFrom,
  mean,
  median,
  sourceShares,
  subsIn,
  type Scope,
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
  /**
   * The design's tiles since 16 Oct 2026 (label, value, change, line): a grey line in place
   * of the change, where the design writes what the figure is rather than how it moved.
   */
  note?: string;
  /** That line's colour, where the design colours it (checkout success in red). */
  noteTone?: "good" | "bad" | "flat";
}

export interface Column {
  label: string;
  unit: Unit | "text";
  /** Decimals, where the design fixes them (a share in whole percent, money with cents). */
  digits?: number;
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
  /** Its visitors are estimated (visitorSplit): the page marks it "Sample split". */
  sample?: boolean;
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
  /**
   * The line under the value, as the design's Revenue and Costs boxes write it: "change", the
   * change alone ("flat vs prev." under 1%); "prev", the previous value in grey; "prev-toned",
   * the previous value coloured by whether the change is good. Unset: the change, then the
   * previous value.
   */
  foot?: "change" | "prev" | "prev-toned";
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

/** The rows of a per-source table: every source, in the filter's order, empty ones too. */
export const SOURCE_ROWS: Array<{ value: Source; label: string }> = SOURCES.filter(
  (s): s is { value: Source; label: string } & (typeof SOURCES)[number] => s.value !== "all"
).map((s) => ({ value: s.value as Source, label: s.label }));

/** Visitors per source, estimated (visitorSplit), or blank with the reason. */
export interface VisitorSplit {
  /** Each source's estimated visitors and share of the visits; empty while blank. */
  bySource: Map<Source, { visitors: number; share: number }>;
  /** Shown: the "Sample split" badge goes with it. */
  ok: boolean;
  /** How the estimate is made, or why it is blank. */
  note: string;
}

/**
 * Why visitors can't be split by source under these filters, or null. The split is of all
 * traffic, so a narrowing filter blanks it, and it needs PostHog, which starts on 23 Aug 2026.
 */
export function splitBlocked(f: ApFilters): string | null {
  if (activeNarrowing(f).length)
    return "Visitors per source are estimated over all traffic, so a source, device, tier or visitor filter leaves them blank.";
  if (f.from < POSTHOG_FROM)
    return `Visitors per source are estimated from PostHog, which starts on ${rangeLabel(POSTHOG_FROM, POSTHOG_FROM)}: pick a range from that day on.`;
  return null;
}

/**
 * Visitors per source, as the design's "Sample split · totals are live": the live visit
 * total split by each source's share of the visits PostHog saw (fetchSessionSources), sorted
 * by our own source rules. Never a number when the filters or PostHog can't support one.
 */
export function visitorSplit(
  f: ApFilters,
  visits: number | null,
  sessions: PostHogResult<SessionTags[]> | null
): VisitorSplit {
  const blank = (note: string): VisitorSplit => ({ bySource: new Map(), ok: false, note });
  const blocked = splitBlocked(f);
  if (blocked) return blank(blocked);
  if (!sessions) return blank("Visitors per source: PostHog was not read for this range.");
  if (!sessions.ok) return blank(`Visitors per source: ${sessions.error}`);
  const shares = sourceShares(sessions.value);
  if (visits === null || !shares) return blank("Visitors per source: PostHog saw no visits here.");
  return {
    bySource: new Map(
      SOURCE_ROWS.map((s) => {
        const share = shares.get(s.value) ?? 0;
        return [s.value, { visitors: Math.round(visits * share), share }];
      })
    ),
    ok: true,
    note: "Visitors per source: the live visit total, split by each source's share of the visits PostHog saw. Starts, submissions and revenue are live.",
  };
}

/** How each of LATE_SOURCES read before SURVEY_TRACKING_FROM, for the note under a filter. */
const LATE_SOURCE_BEFORE: Partial<Record<Source, string>> = {
  organic_search:
    "an untagged visit from a search engine counts as Direct / untagged, so those days read low",
  direct:
    "Direct / untagged also holds untagged visits from search engines and Meta links without tags, so those days read high",
  social: "a Meta link without tags counts as Direct / untagged, so those days read low",
};

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
  const tracking = rangeLabel(SURVEY_TRACKING_FROM, SURVEY_TRACKING_FROM);
  if (f.device !== "all" && f.from < SURVEY_TRACKING_FROM) {
    notes.push(
      `Tablets are told apart from ${tracking}: before, they count as Mobile, or as Desktop for newer iPads, which present themselves as Macs.`
    );
  } else if (f.device !== "all" && cmp && !beforeData(cmp) && cmp.from < SURVEY_TRACKING_FROM) {
    // The range is after the day but its comparison is not: tablets there read as phones or
    // computers, so a change against it is partly that; under the tablet filter, nobody is one.
    notes.push(
      f.device === "tablet"
        ? `Tablets are told apart from ${tracking}, but the comparison period starts before then, when nobody counts as a tablet.`
        : `Tablets are told apart from ${tracking}, but the comparison period starts before then: in it, tablets count as Mobile, or as Desktop for newer iPads, which present themselves as Macs, so part of the change comes from that.`
    );
  }
  // A source the tracker tells apart only from that day, filtered on.
  const before = f.source !== "all" ? LATE_SOURCE_BEFORE[f.source] : undefined;
  if (before) {
    const label = SOURCES.find((s) => s.value === f.source)?.label ?? f.source;
    if (f.from < SURVEY_TRACKING_FROM) {
      notes.push(`${label} is told apart from ${tracking}: before, ${before}.`);
    } else if (cmp && !beforeData(cmp) && cmp.from < SURVEY_TRACKING_FROM) {
      notes.push(
        `${label} is told apart from ${tracking}, but the comparison period starts before then: in it, ${before}, so part of the change comes from that.`
      );
    }
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

/** The readers who came back to their report on a later visit (the design's "Returns"). */
export function returners(facts: Facts, scope: Scope): number {
  return subsIn(facts, scope).filter((s) => s.openedAt && s.visits > 1).length;
}

/** "spend recorded from 28 May 2026" when part of the range has no spend figure. */
export function spendCoverage(s: { from: string | null; to: string | null }): string {
  if (!s.from || !s.to) return "ad spend not recorded for this range";
  return `spend recorded ${rangeLabel(s.from, s.to)}`;
}
