/**
 * The counting rules of AP-Analytics: which facts a filter keeps, the totals of a range, and
 * which figures a filter cannot split (those read null, and the page says why rather than
 * showing a number that quietly ignores the filter).
 *
 * Pure: facts in, numbers out. Every page builds on `totals`.
 */
import { addDays } from "./days";
import type { AdCost } from "@features/brain/server/ingest/analytics";

import { classifySource, deviceClass, type Facts, type SubFact } from "./facts";
import {
  rangeLabel,
  SURVEY_TRACKING_FROM,
  trendBuckets,
  type ApFilters,
  type Source,
} from "./filters";
import type { SessionTags } from "./posthog";

/** Survey steps record the device from this day (migration 20261012093000). */
export const STEP_DEVICE_FROM = "2026-10-12";
/**
 * Survey steps and the report's own events are written without cookie consent from this
 * day (60924b5a). Earlier, everyone who declined the banner is missing from them.
 */
export const EVENTS_COMPLETE_FROM = "2026-09-18";
/** Drafts of people who never finish are cleared after about this many days. */
export const DRAFT_DAYS = 30;

export type Scope = Pick<ApFilters, "assessment" | "source" | "device" | "tier" | "visitor">;

export const ALL: Scope = {
  assessment: "all",
  source: "all",
  device: "all",
  tier: "all",
  visitor: "all",
};

/** Only Assessment A has launched: B and C have no data at all. */
export function launched(scope: Scope): boolean {
  return scope.assessment === "all" || scope.assessment === "a";
}

interface Attributes {
  src: string | null;
  med: string | null;
  ads: boolean;
  device: string | null;
  tier: string | null;
  /** From PostHog, set only while the visitor filter is on (fetchFacts); null: unknown. */
  visitorNew?: boolean | null;
}

/** Whether one person's facts pass the narrowing filters. Unknown never matches a filter. */
export function inScope(a: Attributes, scope: Scope, known = true): boolean {
  if (!launched(scope)) return false;
  if (scope.source !== "all" && classifySource(a, known) !== scope.source) return false;
  if (scope.device !== "all" && deviceClass(a.device) !== scope.device) return false;
  if (scope.tier !== "all" && a.tier !== scope.tier) return false;
  if (scope.visitor !== "all" && (a.visitorNew ?? null) !== (scope.visitor === "new")) return false;
  return true;
}

/** Never counted: our own probes and verification runs. */
function isTest(a: { src: string | null; med: string | null; ads: boolean }): boolean {
  return classifySource(a) === "test";
}

/** Why a figure is blank under the filters, or null when it can be counted. */
export function visitsBlocked(scope: Scope): string | null {
  if (scope.source !== "all")
    return "Visits can't be split by source: the visit log misses most ad clicks.";
  if (scope.device !== "all") return "Visits don't record the device.";
  if (scope.tier !== "all") return "Visits don't record the country.";
  if (scope.visitor !== "all")
    return "Visits can't be split into new and returning: the visit log keeps no visitor history.";
  return null;
}

/**
 * Why every figure about people (starts, finishers, readers, payers, prices) is blank under the
 * tablet filter for a range from `from`, or null. Tablets are told apart from
 * SURVEY_TRACKING_FROM: before, nobody counts as one, so each count would read a false zero.
 */
export function tabletBlocked(scope: Pick<Scope, "device">, from: string): string | null {
  return scope.device === "tablet" && from < SURVEY_TRACKING_FROM
    ? `Tablets are told apart from ${rangeLabel(SURVEY_TRACKING_FROM, SURVEY_TRACKING_FROM)}: pick a range from that day on.`
    : null;
}

/** Why starts are blank under the filters for a range from `from`, read on `today`. */
export function startsBlocked(scope: Scope, from: string, today: string): string | null {
  if (scope.tier !== "all") return "Survey starts don't record the country tier.";
  if (scope.visitor !== "all")
    return "Survey starts can't be split into new and returning: an unfinished start isn't linked to PostHog.";
  const tablet = tabletBlocked(scope, from);
  if (tablet) return tablet;
  if (scope.device !== "all" && from < STEP_DEVICE_FROM) {
    return "Survey starts record the device from 12 Oct 2026.";
  }
  if (scope.source !== "all" && from < draftsKeptFrom(today)) {
    return "An unfinished start keeps its source only while its draft does (30 days): older starts can't be split by source.";
  }
  return null;
}

export function spendBlocked(scope: Scope): string | null {
  if (scope.device !== "all") return "Ad spend can't be split by device here.";
  if (scope.tier !== "all") return "Ad spend can't be split by country tier.";
  if (scope.visitor !== "all") return "Ad spend can't be split into new and returning visitors.";
  if (scope.source === "meta_ads") return "Meta's ad spend isn't read: only Google Ads spend is.";
  return null;
}

export interface Totals {
  /** null: the filters can't apply (see visitsBlocked). */
  visits: number | null;
  starts: number | null;
  /** Of those starts, finished (by the start day). */
  startsFinished: number | null;
  subs: number;
  /** Of the range's finishers, how many did each next step, so far. */
  opened: number;
  paywall: number;
  clicked: number;
  checkout: number;
  paidCohort: number;
  /** Money in the range, by payment day. */
  revenue: number;
  sales: number;
  payers: number;
  gifts: number;
  /** Of the range's finishers, how many invited a friend. */
  inviters: number;
  /** ... shared their report, and rated at least one chapter. */
  sharers: number;
  raters: number;
  /** Finished surveys with a recorded duration, and their median, in ms. */
  surveyMedianMs: number | null;
}

const within = (day: string, from: string, to: string) => day >= from && day <= to;

export function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The finishers of a range that pass the filters (staff and probes are already out). */
export function subsIn(facts: Facts, scope: Scope, from = facts.from, to = facts.to): SubFact[] {
  return facts.subs.filter((s) => within(s.day, from, to) && !isTest(s) && inScope(s, scope));
}

/** The totals of [from, to] (inside the facts' own range) under the filters. */
export function totals(facts: Facts, scope: Scope, from = facts.from, to = facts.to): Totals {
  const on = launched(scope);
  const visits: number | null =
    visitsBlocked(scope) !== null
      ? null
      : on
        ? facts.visits
            .filter(
              (v) =>
                within(v.day, from, to) &&
                classifySource({ src: v.src, med: null, ads: false }) !== "test"
            )
            .reduce((n, v) => n + v.n, 0)
        : 0;

  let starts: number | null = null;
  let startsFinished: number | null = null;
  if (startsBlocked(scope, from, facts.asOf) === null) {
    const kept = facts.starts.filter(
      (s) =>
        within(s.day, from, to) &&
        !(s.known && isTest(s)) &&
        inScope({ ...s, tier: null }, { ...scope, tier: "all" }, s.known)
    );
    starts = kept.reduce((n, s) => n + s.n, 0);
    startsFinished = kept.filter((s) => s.finished).reduce((n, s) => n + s.n, 0);
  }

  const subs = subsIn(facts, scope, from, to);
  const money = facts.money.filter(
    (m) => within(m.day, from, to) && !isTest(m) && inScope(m, scope)
  );
  const sales = money.filter((m) => m.amount > 0);
  const durations = subs.map((s) => s.durationMs).filter((d): d is number => d !== null && d > 0);

  return {
    visits,
    starts,
    startsFinished,
    subs: subs.length,
    opened: subs.filter((s) => s.openedAt).length,
    paywall: subs.filter((s) => s.paywallAt || s.clickedAt).length,
    clicked: subs.filter((s) => s.clickedAt).length,
    checkout: subs.filter((s) => s.checkoutAt).length,
    paidCohort: subs.filter((s) => s.paidAt).length,
    revenue: Math.round(sales.reduce((n, m) => n + m.amount, 0) * 100) / 100,
    sales: sales.length,
    payers: new Set(sales.map((m) => m.sid)).size,
    gifts: money.filter((m) => m.amount <= 0).length,
    inviters: subs.filter((s) => s.invited).length,
    sharers: subs.filter((s) => s.shared).length,
    raters: subs.filter((s) => s.votes > 0).length,
    surveyMedianMs: median(durations),
  };
}

/** The sales (over EUR 0) paid in [from, to] whose finisher passes the filters. */
export function salesIn(facts: Facts, scope: Scope, from = facts.from, to = facts.to) {
  return facts.money.filter(
    (m) => within(m.day, from, to) && m.amount > 0 && !isTest(m) && inScope(m, scope)
  );
}

export interface Spend {
  /** EUR, or null when the filters can't split spend or no day of the range has a figure. */
  eur: number | null;
  /** Why `eur` is null, for the page to say in its place; null while it is a figure. */
  why: string | null;
  /** False when some days of the range have no spend figure yet. */
  complete: boolean;
  /** The first and last day with a spend figure, for the note. */
  from: string | null;
  to: string | null;
}

/** Google Ads spend over [from, to]. Every source but Google Ads costs nothing. */
export function spend(ad: AdCost, scope: Scope, from: string, to: string): Spend {
  const base = { from: ad.from, to: ad.to, why: null };
  if (!launched(scope)) return { eur: 0, complete: true, ...base };
  const blocked = spendBlocked(scope);
  if (blocked) return { eur: null, complete: false, ...base, why: blocked };
  let complete = true;
  let covered = false;
  let eur = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (ad.from === null || ad.to === null || d < ad.from || d > ad.to) complete = false;
    else covered = true;
    eur += ad.byDay.get(d) ?? 0;
  }
  if (scope.source !== "all" && scope.source !== "google_ads")
    return { eur: 0, complete: true, ...base };
  // No day of the range has a spend figure: unknown, never €0, and said why. No window at all
  // is a failed read (adCostByDay swallows its errors), not a range outside it.
  if (!covered) {
    const why =
      ad.from === null || ad.to === null
        ? "Ad spend could not be read just now."
        : "No ad spend recorded for these days.";
    return { eur: null, complete: false, ...base, why };
  }
  return { eur: Math.round(eur * 100) / 100, complete, ...base };
}

/**
 * The sources the survey's tracker tells apart only from SURVEY_TRACKING_FROM, when it began
 * keeping the referrer and Meta's click id: before, an untagged visit from a search engine and
 * a Meta link without tags are Direct / untagged in our records, while PostHog's split of the
 * visitors tells them apart.
 */
export const LATE_SOURCES: ReadonlySet<Source> = new Set(["organic_search", "direct", "social"]);

/**
 * Why a late source's people can't be divided by its estimated visitors in a range starting
 * on `from`, or null: the two would sort the same visits differently.
 */
export function lateSourceNote(from: string): string | null {
  if (from >= SURVEY_TRACKING_FROM) return null;
  return `Organic search, Direct and Social rates are blank for ranges starting before ${rangeLabel(SURVEY_TRACKING_FROM, SURVEY_TRACKING_FROM)}: until then the survey kept no referrer or Meta click id, so its search and Meta visitors are under Direct / untagged, while PostHog's visitor split tells them apart.`;
}

/**
 * Each source's share of the visits PostHog saw (fetchSessionSources), sorted by our own
 * rules; our probes are left out, as they are of the visit total. Null when it saw none.
 */
export function sourceShares(groups: SessionTags[]): Map<Source, number> | null {
  const by = new Map<Source, number>();
  let total = 0;
  for (const g of groups) {
    const c = classifySource(g);
    if (c === "test" || c === "unknown") continue;
    by.set(c, (by.get(c) ?? 0) + g.sessions);
    total += g.sessions;
  }
  return total > 0 ? new Map([...by].map(([s, n]) => [s, n / total])) : null;
}

/** a / b, or null when b is 0 or either is unknown. */
export function ratio(a: number | null, b: number | null): number | null {
  return a === null || b === null || b === 0 ? null : a / b;
}

/** One value per point of the range's trend line (its whole weeks or months). */
export function trend(
  facts: Facts,
  scope: Scope,
  pick: (t: Totals, from: string, to: string) => number | null
): Array<number | null> {
  return trendBuckets(facts.from, facts.to).map((b) =>
    pick(totals(facts, scope, b.from, b.to), b.from, b.to)
  );
}

/**
 * The first day whose unfinished drafts are counted as stored. The sweep (03:30 UTC daily)
 * deletes drafts last saved over 30 days before it runs, so of the day 30 days back only its
 * first hours are gone (before 05:30 Berlin): counted as kept, so that "Last 30 days" is not
 * marked incomplete every day for a few night-time starts.
 */
export function draftsKeptFrom(today: string): string {
  return addDays(today, -DRAFT_DAYS);
}

/**
 * Whether survey starts are complete for a range starting on `from`: from 18 Sep 2026 the
 * survey steps hold everyone, and within the last 30 days the drafts do. Earlier, people
 * who declined cookies and never finished are missing, so starts read low.
 */
export function startsComplete(
  from: string,
  today: string,
  scope?: Pick<Scope, "source">
): boolean {
  // Split by source, a start needs its draft (the survey steps carry no source).
  if (scope && scope.source !== "all") return from >= draftsKeptFrom(today);
  return from >= EVENTS_COMPLETE_FROM || from >= draftsKeptFrom(today);
}

/**
 * The previous period's totals for a comparison, its starts blanked unless both periods hold
 * every start: a period missing some would read as a change that is only the gap.
 */
export function comparableStarts(
  prev: Totals | null,
  from: string,
  prevFrom: string | null,
  today: string,
  scope?: Pick<Scope, "source">
): Totals | null {
  if (!prev || prevFrom === null) return prev;
  return startsComplete(from, today, scope) && startsComplete(prevFrom, today, scope)
    ? prev
    : { ...prev, starts: null, startsFinished: null };
}

/**
 * An earlier period's finishers as they stood at the same age as the current period's: what
 * they did after `cutoff` is left out, so a "so far" rate (paid, returned, shared) and their
 * reading (visits, reading time, sessions) compare like with like rather than with people who
 * had weeks longer. A reader without their sessions keeps their reading as it is.
 */
export function ageMatched(prev: Facts, cutoff: Date): Facts {
  const limit = cutoff.getTime();
  const by = (t: string | null) => (t !== null && Date.parse(t) > limit ? null : t);
  return {
    ...prev,
    subs: prev.subs.map((s) => {
      const paidAt = by(s.paidAt);
      const sharedAt = by(s.sharedAt);
      const votedAt = by(s.votedAt);
      const invitedAt = by(s.invitedAt);
      const returnedAt = by(s.returnedAt);
      // Their sessions up to the cutoff (a session counts whole when it began by then).
      const kept = s.sessions?.filter(([at]) => at * 1000 <= limit) ?? null;
      return {
        ...s,
        openedAt: by(s.openedAt),
        returnedAt,
        ...(kept
          ? {
              sessions: kept,
              visits: kept.filter((x) => x[3] === 1).length,
              readMs: kept.reduce((a, x) => a + x[1], 0),
              closed: kept.reduce((a, x) => a + x[2], 0),
            }
          : { visits: returnedAt ? s.visits : Math.min(s.visits, 1) }),
        paywallAt: by(s.paywallAt),
        clickedAt: by(s.clickedAt),
        checkoutAt: by(s.checkoutAt),
        paidAt,
        sales: paidAt ? s.sales : 0,
        revenue: paidAt ? s.revenue : 0,
        sharedAt,
        shared: s.shared && sharedAt !== null,
        votedAt,
        votes: votedAt ? s.votes : 0,
        invitedAt,
        invited: s.invited && invitedAt !== null,
        // Their sales up to the same age, so lifetime value compares like with like.
        userPays: s.userPays.filter((pay) => Date.parse(pay.at) <= limit),
      };
    }),
  };
}

/** The moment an earlier period is read up to: as long after its start as now is after ours. */
export function sameAge(
  current: Pick<Facts, "from">,
  previous: Pick<Facts, "from">,
  now: Date
): Date {
  const shift = Date.parse(`${current.from}T00:00:00Z`) - Date.parse(`${previous.from}T00:00:00Z`);
  return new Date(now.getTime() - shift);
}

/** Drafts carry the landing arm from the evening of 19 Sep 2026 (#212). */
export const ARM_STARTS_FROM = "2026-09-20";

/**
 * Whether starts can be split by landing arm for a range starting on `from`. Only drafts
 * and finished surveys carry the arm (the survey steps do not), so an unfinished start
 * keeps its arm only while its draft is stored.
 */
export function armStartsComplete(from: string, today: string): boolean {
  return from >= ARM_STARTS_FROM && from >= draftsKeptFrom(today);
}
