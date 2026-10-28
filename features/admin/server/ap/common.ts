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
  QUOTED_FROM,
  SOURCE_FROM,
  STEP_DEVICE_FROM,
  VISITOR_FROM,
  VISITS_FROM,
  draftsKeptFrom,
  inScope,
  mean,
  median,
  subsIn,
  untaggedShares,
  visitorsPerSource,
  visitsByTag,
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
  /** What the trend line draws, where it isn't the tile's own figure ("€ per submission"). */
  line?: string;
  /**
   * A grey line under the change, where the design gives a count its share as well ("Tour
   * started": "62% of the 480 readers who opened their report"). A row of its own, so not for
   * a tile in a `level` grid.
   */
  share?: string;
}

export interface Column {
  label: string;
  unit: Unit | "text";
  /** Its info card's field key (features/admin/ui/ap/fields). */
  info?: string;
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
  /** Its info card's field key (features/admin/ui/ap/fields). */
  info?: string;
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

/** Visitors per source (visitorSplit), or blank with the reason. */
export interface VisitorSplit {
  /** Each source's visitors and share of the visits; empty while blank. */
  bySource: Map<Source, { visitors: number; share: number }>;
  /** Shown: the "Sample split" badge goes with it. */
  ok: boolean;
  /** How the estimate is made, or why it is blank. */
  note: string;
}

/**
 * Why the visit log's untagged visits can't be split by source under these filters, or null.
 * The split is of all traffic: a device, tier or visitor filter blanks it (a source filter
 * doesn't, as each source's row is that source's own), and PostHog, which splits them, starts
 * on 23 Aug 2026. Google Ads' visits need no split: see visitorSplit.
 */
export function splitBlocked(f: ApFilters): string | null {
  if (f.device !== "all" || f.tier !== "all" || f.visitor !== "all")
    return "Visitors per source are of all traffic, so a device, tier or visitor filter leaves them blank.";
  if (f.from < POSTHOG_FROM)
    return `Visitors per source other than Google Ads are estimated from PostHog, which starts on ${rangeLabel(POSTHOG_FROM, POSTHOG_FROM)}: pick a range from that day on.`;
  return null;
}

/**
 * Why the free survey's EUR 1.99 figures are blank, or null: it sells the pre-unlock only
 * through the report's own gate (pay to start's EUR 1.99 page is its own funnel). Not when the
 * gate is on, nor when the range's free finishers bought one anyway (a sale is never hidden).
 * `gateOn`: the switch now, null when it couldn't be read.
 */
export function freePreBlocked(
  gateOn: boolean | null | undefined,
  soldInFree: boolean
): string | null {
  if (soldInFree || gateOn === true) return null;
  return gateOn === false
    ? "Not sold in the free survey: the report's €1.99 gate is switched off."
    : "Not known for the free survey: the report's €1.99 gate's switch couldn't be read.";
}

/** Why a figure of all traffic is blank under a narrowing filter, or null. */
export function allTrafficBlocked(f: ApFilters): string | null {
  return activeNarrowing(f).length
    ? "This is of all traffic, so a source, device, tier or visitor filter leaves it blank."
    : null;
}

/**
 * Visitors per source, as the design's "Sample split · totals are live": the visits each
 * source's link tagged, counted by the visit log (Google Ads tags every click), and the untagged
 * visits split by the sources of the untagged visits PostHog saw, sorted by our own source
 * rules. PostHog sees almost every Google Ads visit but only a small part of the rest, so its
 * share of all visits would hand Google Ads several times its visitors. Never a number when the
 * filters or PostHog can't support one.
 */
export function visitorSplit(
  f: ApFilters,
  facts: Pick<Facts, "visits">,
  sessions: PostHogResult<SessionTags[]> | null
): VisitorSplit {
  const blank = (note: string): VisitorSplit => ({ bySource: new Map(), ok: false, note });
  const blocked = splitBlocked(f);
  // Visits carry no device, tier or visitor history: under those filters nothing is known.
  if (blocked && (f.device !== "all" || f.tier !== "all" || f.visitor !== "all"))
    return blank(blocked);
  if (f.from < SOURCE_FROM)
    return blank(
      `Visitors per source are counted from ${rangeLabel(SOURCE_FROM, SOURCE_FROM)}, when Google Ads' links began tagging every click: pick a range from that day on.`
    );
  const v = visitsByTag(facts, f.from, f.to);
  const total = [...v.tagged.values()].reduce((a, n) => a + n, 0) + v.untagged;
  const why =
    blocked ??
    (!sessions ? "PostHog was not read for this range." : !sessions.ok ? sessions.error : null);
  const split = sessions?.ok && !why ? untaggedShares(sessions.value) : null;
  const partWhy =
    why ?? (!split && v.untagged > 0 ? "PostHog saw no untagged visits to split here." : null);
  if (partWhy) {
    // Google Ads' visits are counted (its links tag every click): only the rest need PostHog.
    const g = v.tagged.get("google_ads") ?? 0;
    return {
      bySource: new Map([["google_ads", { visitors: g, share: total ? g / total : 0 }]]),
      ok: false,
      note: `Visitors per source: Google Ads' are counted by the visit log (its links tag every click); the other sources' are blank. ${partWhy} Starts, submissions and revenue are live.`,
    };
  }
  const per = visitorsPerSource(v, split);
  return {
    bySource: new Map(
      SOURCE_ROWS.map((s) => {
        const n = per.get(s.value) ?? 0;
        return [s.value, { visitors: Math.round(n), share: total ? n / total : 0 }];
      })
    ),
    ok: true,
    note: `Visitors per source: visits whose link names its source (every Google Ads click, email, AI assistants) are counted by the visit log; its ${v.untagged.toLocaleString("en-US")} untagged ones are split by the sources of the ${(split?.seen ?? 0).toLocaleString("en-US")} untagged visits PostHog recorded, so that split is an estimate. Starts, submissions and revenue are live.`,
  };
}

/** How each of LATE_SOURCES read before SURVEY_TRACKING_FROM, for the note under a filter. */
const LATE_SOURCE_BEFORE: Partial<Record<Source, string>> = {
  organic_search:
    "an untagged visit from a search engine counts as Direct / untagged, so those days read low",
  direct:
    "Direct / untagged also holds untagged visits from search engines, emails, social sites, AI assistants and other sites, and Meta links without tags, so those days read high",
  social:
    "a Meta link without tags or an untagged visit from a social site counts as Direct / untagged, so those days read low",
  email:
    "an untagged click in an email (the Gmail app, webmail) counts as Direct / untagged, so those days read low",
  ai: "an untagged visit from an AI assistant counts as Direct / untagged, so those days read low",
  referral:
    "an untagged visit from another site counts as Direct / untagged, so those days read low",
};

export function head(
  f: ApFilters,
  today: string,
  now: Date,
  /** False on a page that compares nothing with an earlier period (Payment). */
  compare = true,
  /** The range's facts, where the page shows sales: under the visitor filter, what it leaves out. */
  facts?: Pick<Facts, "money">
): PageHead {
  const cmp = compare ? comparisonRange(f) : null;
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
  // The visit log is whole from VISITS_FROM: visits, and the rates over them, are blank before.
  const visitsDay = rangeLabel(VISITS_FROM, VISITS_FROM);
  if (!beforeData(f) && f.from < VISITS_FROM) {
    notes.push(
      `The visit log counts every visitor from ${visitsDay} (from 23 May only those who accepted cookies, and nothing earlier): visitors, and the rates over them, are blank for this range.`
    );
  } else if (cmp && !beforeData(cmp) && cmp.from < VISITS_FROM) {
    notes.push(
      `The visit log counts every visitor from ${visitsDay}, so the comparison period's visitors, and the rates over them, are blank.`
    );
  }
  if (!beforeData(f) && f.from < SOURCE_FROM) {
    notes.push(
      `A person's source is recorded from ${rangeLabel(SOURCE_FROM, SOURCE_FROM)}: an earlier finisher whose link carried no tag is "Not recorded", not Direct.`
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
  // A finisher's tier comes from their price quote, which every finisher has from QUOTED_FROM;
  // the device from the quotes made when the report first loads, else the survey's own steps
  // (from STEP_DEVICE_FROM): a finisher who left before it loaded has none before then.
  if (f.tier !== "all" && f.from < QUOTED_FROM) {
    notes.push(
      `A finisher's country tier comes from their price quote, which every finisher has from ${rangeLabel(QUOTED_FROM, QUOTED_FROM)}: the 94 earlier ones without are in no tier, so under a tier filter those days read low.`
    );
  }
  if (f.device !== "all" && f.from < STEP_DEVICE_FROM) {
    notes.push(
      `Before ${rangeLabel(STEP_DEVICE_FROM, STEP_DEVICE_FROM)} a finisher's device comes from the price quotes made when their report first loaded: one who left before it loaded has none (most finishers before 15 May 2026, about 3 in 100 since), so under a device filter those days read low.`
    );
  }
  if (f.visitor !== "all") {
    notes.push(
      `New or returning comes from PostHog: whether it saw the person more than half an hour before the visit they finished the survey in. Finished surveys keep that visit from ${rangeLabel(VISITOR_FROM, VISITOR_FROM)}; one PostHog didn't see is in neither group. Visits, survey starts, ad spend and the price quotes can't be split this way.${
        cmp && !beforeData(cmp) && cmp.from < VISITOR_FROM
          ? " The comparison period starts before then, so nothing is compared."
          : ""
      }`
    );
    // A sale by someone PostHog didn't see is in neither group: say how much, never a quiet €0.
    // Before the visits were kept, the figures are blank anyway (and say why).
    // The page's own sales: the filters' (the Funnel filter's too), whoever PostHog saw.
    const sold = {
      ...f,
      assessment: f.assessment,
      visitor: "all" as const,
      funnel: f.funnel ?? "all",
    };
    const unseen =
      f.from < VISITOR_FROM
        ? []
        : (facts?.money ?? []).filter(
            (m) => m.amount > 0 && (m.visitorNew ?? null) === null && inScope(m, sold)
          );
    if (unseen.length) {
      const eur = unseen.reduce((a, m) => a + m.amount, 0);
      notes.push(
        `${unseen.length === 1 ? "One sale" : `${unseen.length} sales`} in this range (${fmt("eur", eur)}) ${unseen.length === 1 ? "is" : "are"} by people whose visit PostHog didn't see, so neither new nor returning counts ${unseen.length === 1 ? "it" : "them"}.`
      );
    }
  }
  if (
    f.source !== "all" &&
    f.from >= SOURCE_FROM &&
    cmp &&
    !beforeData(cmp) &&
    cmp.from < SOURCE_FROM
  ) {
    notes.push(
      `Sources are recorded from ${rangeLabel(SOURCE_FROM, SOURCE_FROM)}, and the comparison period starts before then, so people's figures aren't compared under a source filter.`
    );
  }
  const tracking = rangeLabel(SURVEY_TRACKING_FROM, SURVEY_TRACKING_FROM);
  if (f.device !== "all" && f.from < SURVEY_TRACKING_FROM) {
    notes.push(
      `Tablets are told apart in ranges from ${tracking}: in one starting earlier, they count as Mobile, or as Desktop for newer iPads, which present themselves as Macs.`
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
      activeNarrowing(f).length > 0 || f.funnel === "free"
        ? "All traffic: its records carry no funnel, source, device, tier or visitor history, so the filters do not apply here."
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
