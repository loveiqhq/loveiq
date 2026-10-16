/**
 * Assessment A · Traffic (Marcus's artboard of 16 Oct 2026): which sources bring people who
 * finish, pay, read and come back, and what they cost. Attribution, nine headline figures and a
 * scorecard from spend to contribution, traffic and submissions per channel over time, the
 * performance and funnel of ten breakdowns, buyers against curiosity per keyword, cohorts by
 * acquisition source, the running experiments, the audience per source, and cost against
 * quality per campaign.
 *
 * People and money are cohort figures: the range's finishers and what they bought so far, the
 * earlier period read at the same age. Visitors per source, campaign, keyword, device, tier and
 * new or returning are PostHog's split of the live visit total (a sample split, as elsewhere).
 */
import type { AdCost } from "@features/brain/server/ingest/analytics";
import { countryTierOf } from "@features/pricing/logic/reportPricing";
import { twoProportionSignal } from "@features/admin/server/statistics";
import { LANDING_TEST_START_DAY } from "@shared/experiments/landingVariant";
import { PRICE_TEST_START_DAY } from "@features/checkout/server/reportPurchase";
import { COUNTRIES } from "@/data/countries";

import type { AdsResult, AdsLine } from "./ads";
import { addDays, shortDate } from "./days";
import {
  classifySource,
  deviceClass,
  type Facts,
  type SourceClass,
  type StartFact,
  type SubFact,
} from "./facts";
import {
  grainOf,
  rangeLabel,
  SOURCES,
  SURVEY_TRACKING_FROM,
  TIERS,
  trendBuckets,
  type ApFilters,
  type Bucket,
  type Grain,
  type Source,
} from "./filters";
import { head, type PageHead } from "./common";
import {
  armStartsComplete,
  draftsKeptFrom,
  LATE_SOURCES,
  lateSourceNote,
  launched,
  median,
  ratio,
  spend,
  STEP_DEVICE_FROM,
  startsComplete,
  subsIn,
  tabletBlocked,
  totals,
  visitsBlocked,
  type Scope,
} from "./metrics";
import { assessmentScope } from "./assessment";
import { LANDING_TESTS } from "./landing";
import type { PostHogResult, SessionGroup, VisitDim, VisitGroup } from "./posthog";
import { armLabel } from "@features/attribution/server/labels";
import type { Counts } from "./traffic-math";

// ---------------------------------------------------------------------------------------------
// Payload

export interface TrafficTiles {
  now: Counts;
  prev: Counts | null;
  /** One per point of the sparkline (the range's whole weeks or months). */
  points: Counts[];
  /** Why a figure is blank, by what it needs. */
  blocked: { visitors: string | null; spend: string | null; people: string | null };
}

export interface ChannelSeries {
  key: string;
  name: string;
  /** The label at the line's end. */
  short: string;
}

export interface ChannelTrend {
  grain: Grain;
  points: Array<{ label: string; from: string; to: string; full: boolean }>;
  channels: ChannelSeries[];
  /** Visitors per channel and point (PostHog's split of the live total), or why there are none. */
  visitors: number[][] | null;
  visitorsWhy: string | null;
  /** Submissions per channel and point. */
  submissions: number[][];
  /** Ad spend per submission per point; null where spend isn't complete. */
  costPerSub: Array<number | null>;
  /** Organic search, Direct and Social sorted differently before the tracking day, or null. */
  note: string | null;
}

export type BreakdownKey =
  | "channel"
  | "campaign"
  | "creative"
  | "keyword"
  | "audience"
  | "landing"
  | "assessment"
  | "device"
  | "tier"
  | "visitor";

export interface PerfRow {
  key: string;
  name: string;
  sub: string;
  counts: Counts;
  /** Visitors are PostHog's split of the live total, not counted. */
  sampleVisitors: boolean;
  /** Why this row can't be read at all (its figures are left blank). */
  blocked?: string;
  /** Median reading time of the row's readers, ms. */
  readMs: number | null;
  /** Distinct people who finished, for assessments per user and lifetime value. */
  people: number;
  /** Everything those people paid, all time (refunds out). */
  lifetimeRevenue: number;
  /** Their sales, all time, and how many of them were refunded. */
  allSales: number;
  refunded: number;
  muted?: boolean;
}

export interface PerfTable {
  key: BreakdownKey;
  label: string;
  /** Why the whole breakdown is empty (not tracked), or null. */
  blocked: string | null;
  rows: PerfRow[];
  total: PerfRow | null;
  /** What some columns can't show here, and why. */
  notes: string[];
}

export interface IntentRow {
  name: string;
  sub: string;
  counts: Counts;
}

export interface CohortRow {
  source: string;
  users: number;
  /** Revenue per acquired user within 0, 7, 30 and 90 days of their first finished survey. */
  rev: [number | null, number | null, number | null, number | null];
  /** People old enough for each column. */
  eligible: [number, number, number, number];
  /** Day 90 over day 0, over the people old enough for day 90. */
  growth: number | null;
  repeat: number | null;
  crossSell: number | null;
  refund: number | null;
}

export interface ExperimentArm {
  test: string;
  note: string;
  arm: string;
  control: boolean;
  visitors: number | null;
  startCvr: number | null;
  submissions: number | null;
  paymentCvr: number | null;
  revPerSub: number | null;
  revPerVisitor: number | null;
  /** On the test's primary metric. */
  metric: string;
  lift: number | null;
  chance: number | null;
  confidence: number | null;
  /** Why lift, chance and confidence are blank, when they are. */
  why: string | null;
}

export interface AudienceDim {
  key: string;
  title: string;
  kind: "visit" | "survey";
  base: string;
  /** Shares of all sources, in order. */
  values: Array<{ label: string; share: number }>;
  /** The same per source (the design's six columns); null where a source had none. */
  bySource: Array<{ source: string; shares: Array<number | null>; n: number }>;
  /** How each group does across sources. */
  perf: Array<{
    label: string;
    share: number;
    completeRate: number | null;
    preRate: null;
    fullRate: number | null;
    readMs: number | null;
  }>;
  /** Why a performance column is blank for this dimension. */
  perfNote: string | null;
  blocked: string | null;
}

export interface QualityDot {
  name: string;
  spend: number;
  clicks: number;
  cpc: number | null;
  /** Payers from its clicks over its clicks. */
  clickToPaid: number | null;
  payers: number;
}

export interface TrafficPayload extends PageHead {
  launched: boolean;
  attribution: {
    visitorsWithSource: number | null;
    unattributed: { n: number; of: number } | null;
    purchasesWithSource: { n: number; of: number } | null;
    why: string | null;
  };
  tiles: TrafficTiles;
  trend: ChannelTrend;
  breakdowns: Record<BreakdownKey, PerfTable>;
  intent: { creative: { blocked: string }; keyword: { rows: IntentRow[]; why: string | null } };
  cohorts: { rows: CohortRow[]; why: string | null; note: string };
  experiments: { arms: ExperimentArm[]; note: string };
  audience: { dims: AudienceDim[] };
  quality: { dots: QualityDot[]; why: string | null };
}

// ---------------------------------------------------------------------------------------------
// Sources and their channel groups

/** The design's channel rows, our source classes behind each. */
const CHANNELS: Array<{ key: string; name: string; short: string; sources: Source[] }> = [
  { key: "google_ads", name: "Google Ads", short: "Google Ads", sources: ["google_ads"] },
  { key: "direct", name: "Direct / unattributed", short: "Direct", sources: ["direct"] },
  { key: "meta_ads", name: "Meta Ads", short: "Meta Ads", sources: ["meta_ads"] },
  { key: "organic", name: "Organic search", short: "Organic", sources: ["organic_search"] },
  { key: "owned", name: "Owned (email, referral)", short: "Owned", sources: ["email", "referral"] },
  { key: "other", name: "Other (AI, social)", short: "Other", sources: ["ai", "social"] },
];

/** The performance table's channel rows: every source, in the design's words. */
const CHANNEL_ROWS: Array<{ source: Source; name: string; sub: string }> = [
  { source: "google_ads", name: "Google Ads", sub: "Paid" },
  { source: "meta_ads", name: "Meta Ads", sub: "Paid" },
  { source: "organic_search", name: "Organic search", sub: "Organic" },
  { source: "ai", name: "AI assistants", sub: "Organic" },
  { source: "social", name: "Social (organic)", sub: "Organic" },
  { source: "referral", name: "Referral & invites", sub: "Owned" },
  { source: "email", name: "Email", sub: "Owned" },
  { source: "direct", name: "Direct / unattributed", sub: "Not tracked" },
];

/** The audience matrix's columns, as drawn. */
const MATRIX_SOURCES: Array<{ source: Source; name: string }> = [
  { source: "google_ads", name: "Google Ads" },
  { source: "meta_ads", name: "Meta Ads" },
  { source: "organic_search", name: "Organic search" },
  { source: "ai", name: "AI assistants" },
  { source: "referral", name: "Referral & invites" },
  { source: "email", name: "Email" },
];

const real = (c: SourceClass): c is Source => c !== "test" && c !== "unknown";

// ---------------------------------------------------------------------------------------------
// Counting helpers

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A row's counts from its finishers; visitors, starts and spend as given. */
function countsOf(
  subs: SubFact[],
  extra: Partial<Pick<Counts, "spend" | "clicks" | "impressions" | "visitors" | "starts">>
): Counts {
  return {
    spend: extra.spend ?? null,
    clicks: extra.clicks ?? null,
    impressions: extra.impressions ?? null,
    visitors: extra.visitors ?? null,
    starts: extra.starts ?? null,
    completes: subs.length,
    payers: subs.filter((s) => s.paidAt).length,
    sales: subs.reduce((n, s) => n + s.sales, 0),
    revenue: round2(subs.reduce((n, s) => n + s.revenue, 0)),
    fullPayers: subs.filter((s) => s.full).length,
  };
}

/** Lifetime figures of the people behind some finishers, each person once. */
function people(subs: SubFact[]): {
  people: number;
  lifetimeRevenue: number;
  allSales: number;
  refunded: number;
} {
  const byUser = new Map<number, SubFact>();
  for (const s of subs) byUser.set(s.uid ?? -s.id, s);
  let lifetimeRevenue = 0;
  let allSales = 0;
  let refunded = 0;
  for (const s of byUser.values()) {
    for (const p of s.userPays) {
      allSales += 1;
      if (p.refunded) refunded += 1;
      else lifetimeRevenue += p.amount;
    }
  }
  return { people: byUser.size, lifetimeRevenue: round2(lifetimeRevenue), allSales, refunded };
}

function readMedian(subs: SubFact[]): number | null {
  return median(subs.filter((s) => s.closed > 0).map((s) => s.readMs));
}

function perfRow(
  key: string,
  name: string,
  sub: string,
  subs: SubFact[],
  extra: Parameters<typeof countsOf>[1],
  sampleVisitors: boolean,
  muted = false
): PerfRow {
  return {
    key,
    name,
    sub,
    counts: countsOf(subs, extra),
    sampleVisitors,
    readMs: readMedian(subs),
    ...people(subs),
    ...(muted ? { muted } : {}),
  };
}

/** Starts in [from, to] that pass the filters and `keep`, or null when they can't be split. */
function startsWhere(
  facts: Facts,
  scope: Scope,
  keep: (s: StartFact) => boolean,
  from = facts.from,
  to = facts.to
): number {
  return facts.starts
    .filter(
      (s) =>
        s.day >= from &&
        s.day <= to &&
        !(s.known && classifySource(s) === "test") &&
        (scope.source === "all" || (s.known && classifySource(s) === scope.source)) &&
        (scope.device === "all" || deviceClass(s.device) === scope.device) &&
        keep(s)
    )
    .reduce((n, s) => n + s.n, 0);
}

/** Visits in [from, to], without our own probes. */
function visitTotal(facts: Facts, from = facts.from, to = facts.to): number {
  return facts.visits
    .filter(
      (v) =>
        v.day >= from &&
        v.day <= to &&
        classifySource({ src: v.src, med: null, ads: false }) !== "test"
    )
    .reduce((n, v) => n + v.n, 0);
}

/** PostHog's sessions grouped by a key, over the groups of the range, with their total. */
function sessionShares<K>(
  groups: SessionGroup[],
  keyOf: (g: SessionGroup) => K | null
): { by: Map<K, number>; total: number } {
  const by = new Map<K, number>();
  let total = 0;
  for (const g of groups) {
    const c = classifySource(g);
    if (c === "test" || c === "unknown") continue;
    total += g.sessions;
    const k = keyOf(g);
    if (k === null) continue;
    by.set(k, (by.get(k) ?? 0) + g.sessions);
  }
  return { by, total };
}

// ---------------------------------------------------------------------------------------------
// Statistics for the experiments

function normal(z: number): number {
  // Abramowitz-Stegun 7.1.26 via erf, as the admin's statistics module reads it.
  const t = 1 / (1 + 0.3275911 * Math.abs(z / Math.SQRT2));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return 0.5 * (1 + Math.sign(z) * y);
}

/** Lift, chance B beats A and 1 − p (pooled two-proportion z), or why there is none. */
export function proportionTest(
  kA: number,
  nA: number,
  kB: number,
  nB: number
): { lift: number | null; chance: number | null; confidence: number | null; why: string | null } {
  if (nA === 0 || nB === 0)
    return { lift: null, chance: null, confidence: null, why: "No one in an arm yet" };
  const pA = kA / nA;
  const pB = kB / nB;
  const lift = pA > 0 ? pB / pA - 1 : null;
  const signal = twoProportionSignal(nA, kA, nB, kB);
  if (signal.significance === "insufficient-data")
    return { lift, chance: null, confidence: null, why: "Too few to call" };
  const pooled = (kA + kB) / (nA + nB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / nA + 1 / nB));
  if (se === 0) return { lift, chance: null, confidence: null, why: "No difference" };
  const z = (pB - pA) / se;
  return { lift, chance: normal(z), confidence: 1 - (signal.pValue ?? 1), why: null };
}

// ---------------------------------------------------------------------------------------------
// Countries: PostHog's ISO codes, the survey's English names

const regionName = new Intl.DisplayNames(["en"], { type: "region" });
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z]+/g, " ")
    .trim();
const SURVEY_COUNTRY = new Map(COUNTRIES.map((c) => [norm(c), c]));

/** "US" -> "United States"; the survey's own spelling where it has the country. */
export function countryName(code: string): string {
  if (code === "Other" || !code) return code || "Unknown";
  let name: string;
  try {
    name = regionName.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
  return SURVEY_COUNTRY.get(norm(name)) ?? name;
}

// ---------------------------------------------------------------------------------------------
// The builder

export function buildTraffic(input: {
  facts: Facts;
  /** The earlier period at the same age (ageMatched), or null. */
  previous: Facts | null;
  ad: AdCost;
  filters: ApFilters;
  today: string;
  now: Date;
  /** PostHog's visit groups by the range's trend grain (fetchSessionGroups), or null. */
  sessions: PostHogResult<SessionGroup[]> | null;
  /** PostHog's audience groups (fetchVisitAudience), or null. */
  audience: PostHogResult<VisitGroup[]> | null;
  /** Google Ads per campaign and keyword over the range (fetchAdsSplit). */
  ads: AdsResult | null;
}): TrafficPayload {
  const { facts, previous, ad, filters: f, today, now } = input;
  const scope = assessmentScope(f);
  const on = launched(scope);
  const tablet = tabletBlocked(scope, facts.from);
  const subs = tablet ? [] : subsIn(facts, scope);
  const vB = visitsBlocked(scope);
  const visits = vB ? null : visitTotal(facts);
  const s = spend(ad, scope, facts.from, facts.to);
  const sumDays = (m: Map<string, number> | undefined, from: string, to: string) => {
    if (!m || ad.from === null || ad.to === null || from < ad.from || to > ad.to) return null;
    let n = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) n += m.get(d) ?? 0;
    return n;
  };
  const adClicks = (from: string, to: string) =>
    s.eur === null ? null : sumDays(ad.clicksByDay, from, to);
  const adImpressions = (from: string, to: string) =>
    s.eur === null ? null : sumDays(ad.impressionsByDay, from, to);

  const periodCounts = (x: Facts, from: string, to: string, sc: Scope): Counts => {
    const sp = spend(ad, sc, from, to);
    const t = totals(x, sc, from, to);
    return countsOf(tabletBlocked(sc, x.from) ? [] : subsIn(x, sc, from, to), {
      spend: sp.complete ? sp.eur : null,
      clicks: sp.complete && sp.eur !== null ? sumDays(ad.clicksByDay, from, to) : null,
      impressions: sp.complete && sp.eur !== null ? sumDays(ad.impressionsByDay, from, to) : null,
      visitors: t.visits,
      starts: startsComplete(from, today, sc) ? t.starts : null,
    });
  };

  // ---- the nine figures and the scorecard
  const nowCounts = periodCounts(facts, facts.from, facts.to, scope);
  // An incomplete spend still reads as the scorecard's first step; the tiles compare only whole.
  if (nowCounts.spend === null && s.eur !== null) nowCounts.spend = s.eur;
  const tiles: TrafficTiles = {
    now: nowCounts,
    prev:
      previous && !tabletBlocked(scope, previous.from)
        ? periodCounts(previous, previous.from, previous.to, scope)
        : null,
    points: trendBuckets(facts.from, facts.to).map((b) => periodCounts(facts, b.from, b.to, scope)),
    blocked: {
      visitors: vB ?? tablet,
      spend: s.why,
      people: tablet,
    },
  };

  // ---- attribution coverage (PostHog's visits; our own sales)
  const groups = input.sessions?.ok ? input.sessions.value : null;
  const attrWhy = vB
    ? "Attribution is read over all traffic, so a source, device, tier or visitor filter leaves it blank."
    : !input.sessions
      ? "PostHog was not read for this range."
      : !input.sessions.ok
        ? input.sessions.error
        : null;
  const attrShares = groups ? sessionShares(groups, (g) => classifySource(g)) : null;
  const directN = attrShares?.by.get("direct") ?? 0;
  const payers = subs.filter((x) => x.paidAt);
  const attribution: TrafficPayload["attribution"] = {
    visitorsWithSource:
      attrWhy || !attrShares || attrShares.total === 0 ? null : 1 - directN / attrShares.total,
    unattributed:
      attrWhy || !attrShares || attrShares.total === 0
        ? null
        : { n: directN, of: attrShares.total },
    purchasesWithSource: payers.length
      ? { n: payers.filter((x) => classifySource(x) !== "direct").length, of: payers.length }
      : null,
    why: attrWhy,
  };

  // ---- traffic and submissions per channel over time
  const grain = grainOf(facts.from, facts.to);
  // Whole weeks or months only: one cut short by the range reads as a drop (as on every trend).
  const points = trendBuckets(facts.from, facts.to);
  const bucketOf = (day: string) =>
    points.findIndex((b) => (day < facts.from ? facts.from : day) >= b.from && day <= b.to);
  const channelOf = (c: SourceClass) =>
    CHANNELS.findIndex((ch) => real(c) && ch.sources.includes(c));
  const trendSubs = CHANNELS.map(() => points.map(() => 0));
  for (const x of subs) {
    const ci = channelOf(classifySource(x));
    const bi = bucketOf(x.day);
    if (ci >= 0 && bi >= 0) trendSubs[ci]![bi]! += 1;
  }
  let trendVisitors: number[][] | null = null;
  let trendWhy: string | null = vB ?? attrWhy;
  if (!trendWhy && groups) {
    const perBucket = points.map(() => CHANNELS.map(() => 0));
    const totalPerBucket = points.map(() => 0);
    for (const g of groups) {
      const c = classifySource(g);
      if (!real(c)) continue;
      const bi = bucketOf(g.bucket);
      const ci = channelOf(c);
      if (bi < 0 || ci < 0) continue;
      perBucket[bi]![ci]! += g.sessions;
      totalPerBucket[bi]! += g.sessions;
    }
    trendVisitors = CHANNELS.map((_, ci) =>
      points.map((b, bi) => {
        const tot = totalPerBucket[bi]!;
        return tot ? Math.round((visitTotal(facts, b.from, b.to) * perBucket[bi]![ci]!) / tot) : 0;
      })
    );
  }
  const trend: ChannelTrend = {
    grain,
    points: points.map((b) => ({ label: b.label, from: b.from, to: b.to, full: b.full })),
    channels: CHANNELS.map(({ key, name, short }) => ({ key, name, short })),
    visitors: trendVisitors,
    visitorsWhy: trendVisitors ? null : (trendWhy ?? "PostHog was not read for this range."),
    note: lateSourceNote(facts.from),
    submissions: trendSubs,
    costPerSub: points.map((b) => {
      const sp = spend(ad, scope, b.from, b.to);
      const n = subsIn(facts, scope, b.from, b.to).length;
      return sp.complete && sp.eur !== null && !tablet ? ratio(sp.eur, n) : null;
    }),
  };

  // ---- the ten breakdowns
  const total = visits ?? null;
  const estimate = (share: number | undefined, of: number) =>
    total === null || of === 0 ? null : Math.round((total * (share ?? 0)) / of);
  const sourceShare = groups ? sessionShares(groups, (g) => classifySource(g)) : null;
  const campShare = groups ? sessionShares(groups, (g) => g.camp) : null;
  const termShare = groups
    ? sessionShares(groups, (g) => (g.term ? `${g.camp ?? ""}|${g.term}` : null))
    : null;
  const splitWhy = vB ?? attrWhy;
  const late = lateSourceNote(facts.from);
  const sourceSplitOk = startsSplit(facts.from, today);

  const adsOk = input.ads?.ok ? input.ads.value : null;
  const adsWhy =
    s.why ?? (!input.ads ? "Google Ads was not read." : !input.ads.ok ? input.ads.error : null);

  const tables = {} as Record<BreakdownKey, PerfTable>;
  const allRow = (label: string): PerfRow =>
    perfRow(
      "all",
      label,
      "",
      subs,
      {
        visitors: total,
        starts:
          startsComplete(facts.from, today, scope) && !tablet ? totals(facts, scope).starts : null,
        spend: s.eur,
        clicks: adClicks(facts.from, facts.to),
        impressions: adImpressions(facts.from, facts.to),
      },
      false
    );

  // Channel
  {
    const rows = CHANNEL_ROWS.map(({ source, name, sub }) => {
      const mine = subs.filter((x) => classifySource(x) === source);
      const isGoogle = source === "google_ads";
      return perfRow(
        source,
        name,
        sub,
        mine,
        {
          // Organic search, Direct and Social: our records tell them apart only from the
          // tracking day, PostHog always, so their people over these visitors would mislead.
          visitors:
            splitWhy || !sourceShare || (late && LATE_SOURCES.has(source))
              ? null
              : estimate(sourceShare.by.get(source), sourceShare.total),
          starts: sourceSplitOk
            ? startsWhere(facts, scope, (st) => st.known && classifySource(st) === source)
            : null,
          spend: s.eur === null ? null : isGoogle ? s.eur : source === "meta_ads" ? null : 0,
          clicks: isGoogle ? adClicks(facts.from, facts.to) : null,
          impressions: isGoogle ? adImpressions(facts.from, facts.to) : null,
        },
        true
      );
    });
    tables.channel = {
      key: "channel",
      label: "Channel",
      blocked: null,
      rows,
      total: allRow("All channels"),
      notes: [
        ...(splitWhy ? [`Visitors per channel: ${splitWhy}`] : []),
        ...(late ? [late] : []),
        ...(sourceSplitOk ? [] : [STARTS_BY_SOURCE]),
        "Meta Ads spend isn't read: only Google Ads spend is. Every other channel costs nothing.",
      ],
    };
  }

  // Campaign (Google Ads): the Ads API's cost, our finishers by the link's utm_campaign
  {
    const keys = new Set<string>();
    for (const l of adsOk?.campaigns ?? []) keys.add(l.key);
    const googleSubs = subs.filter((x) => classifySource(x) === "google_ads");
    for (const x of googleSubs) if (x.camp) keys.add(x.camp.toLowerCase());
    const line = (k: string): AdsLine | undefined => adsOk?.campaigns.find((l) => l.key === k);
    const rows = [...keys].map((k) => {
      const l = line(k);
      const mine = googleSubs.filter((x) => x.camp?.toLowerCase() === k);
      return perfRow(
        k,
        l?.name ?? prettyKey(k),
        "Google Ads",
        mine,
        {
          visitors: splitWhy || !campShare ? null : estimate(campShare.by.get(k), campShare.total),
          starts: sourceSplitOk
            ? startsWhere(
                facts,
                scope,
                (st) =>
                  st.known && st.camp?.toLowerCase() === k && classifySource(st) === "google_ads"
              )
            : null,
          spend: adsOk ? (l?.cost ?? 0) : null,
          clicks: adsOk ? (l?.clicks ?? 0) : null,
          impressions: adsOk ? (l?.impressions ?? 0) : null,
        },
        true
      );
    });
    const untagged = googleSubs.filter((x) => !x.camp);
    if (untagged.length)
      rows.push(
        perfRow(
          "untagged",
          "No campaign tag",
          "Google Ads click without utm_campaign",
          untagged,
          {},
          true
        )
      );
    rows.sort(
      (a, b) =>
        (b.counts.spend ?? 0) - (a.counts.spend ?? 0) || b.counts.completes - a.counts.completes
    );
    tables.campaign = {
      key: "campaign",
      label: "Campaign",
      blocked: null,
      rows,
      total: null,
      notes: [
        ...(adsWhy ? [`Spend, clicks and impressions: ${adsWhy}`] : []),
        "Google Ads campaigns only: Meta's campaigns aren't read. Visitors are PostHog's split by the link's campaign tag.",
        ...(sourceSplitOk ? [] : [STARTS_BY_SOURCE]),
      ],
    };
  }

  tables.creative = {
    key: "creative",
    label: "Creative",
    blocked:
      "Not tracked: the ads' links carry the campaign and the keyword, not the creative, so a finisher can't be tied to the ad they saw. Adding the creative's id to the tracking suffix would make this possible.",
    rows: [],
    total: null,
    notes: [],
  };

  // Search term (the keyword a Search ad matched)
  {
    const googleSubs = subs.filter((x) => classifySource(x) === "google_ads" && x.term);
    const keys = new Map<string, { camp: string; term: string }>();
    for (const l of adsOk?.keywords ?? [])
      keys.set(`${l.campaign}|${l.key}`, { camp: l.campaign ?? "", term: l.key });
    for (const x of googleSubs)
      keys.set(`${(x.camp ?? "").toLowerCase()}|${x.term!.toLowerCase()}`, {
        camp: (x.camp ?? "").toLowerCase(),
        term: x.term!.toLowerCase(),
      });
    const campName = (k: string) => adsOk?.campaigns.find((l) => l.key === k)?.name ?? prettyKey(k);
    const rows = [...keys.entries()].map(([key, { camp, term }]) => {
      const l = adsOk?.keywords.find((k) => k.campaign === camp && k.key === term);
      const mine = googleSubs.filter(
        (x) => (x.camp ?? "").toLowerCase() === camp && x.term!.toLowerCase() === term
      );
      return perfRow(
        key,
        term,
        campName(camp),
        mine,
        {
          visitors:
            splitWhy || !termShare ? null : estimate(termShare.by.get(key), termShare.total),
          starts: sourceSplitOk
            ? startsWhere(
                facts,
                scope,
                (st) =>
                  st.known &&
                  (st.camp ?? "").toLowerCase() === camp &&
                  (st.term ?? "").toLowerCase() === term
              )
            : null,
          spend: adsOk ? (l?.cost ?? 0) : null,
          clicks: adsOk ? (l?.clicks ?? 0) : null,
          impressions: adsOk ? (l?.impressions ?? 0) : null,
        },
        true
      );
    });
    rows.sort(
      (a, b) =>
        (b.counts.spend ?? 0) - (a.counts.spend ?? 0) || b.counts.completes - a.counts.completes
    );
    // A keyword nobody clicked and nobody finished from has nothing to show.
    const shown = rows.filter(
      (r) => (r.counts.clicks ?? 0) > 0 || (r.counts.visitors ?? 0) > 0 || r.counts.completes > 0
    );
    rows.length = 0;
    rows.push(...shown);
    tables.keyword = {
      key: "keyword",
      label: "Search term",
      blocked: null,
      rows,
      total: null,
      notes: [
        "The keyword each Search ad matched (utm_term). Performance Max shows no keyword, so its clicks aren't here.",
        ...(adsWhy ? [`Spend, clicks and impressions: ${adsWhy}`] : []),
        ...(sourceSplitOk ? [] : [STARTS_BY_SOURCE]),
      ],
    };
  }

  tables.audience = {
    key: "audience",
    label: "Audience",
    blocked:
      "Not tracked: every campaign is prospecting (none is set up for retargeting), and the links don't say which audience an ad reached.",
    rows: [],
    total: null,
    notes: [],
  };

  // Landing page (the visit log records the arm: visitors are counted, not estimated)
  {
    const arms = new Set<string>();
    for (const v of facts.visits) if (v.arm && v.arm !== "unknown") arms.add(v.arm);
    for (const x of subs) if (x.arm) arms.add(x.arm);
    const armOk = armStartsComplete(facts.from, today);
    const rows = [...arms].map((arm) => {
      const test = LANDING_TESTS.find((t) => t.arms.includes(arm));
      const mine = subs.filter((x) => x.arm === arm);
      return perfRow(
        arm,
        armLabel("landing", arm).long,
        test ? `${test.name} · ${test.arms[0] === arm ? "A" : "B"}` : "",
        mine,
        {
          visitors: vB
            ? null
            : facts.visits
                .filter(
                  (v) =>
                    v.arm === arm &&
                    classifySource({ src: v.src, med: null, ads: false }) !== "test"
                )
                .reduce((n, v) => n + v.n, 0),
          starts: armOk ? startsWhere(facts, scope, (st) => st.arm === arm) : null,
        },
        false
      );
    });
    rows.sort((a, b) => (b.counts.visitors ?? 0) - (a.counts.visitors ?? 0));
    tables.landing = {
      key: "landing",
      label: "Landing page",
      blocked: null,
      rows,
      total: allRow("All landing pages"),
      notes: [
        "Ad spend isn't split by landing page: both versions get the same ads.",
        ...(armOk
          ? []
          : [
              "Unfinished starts keep their landing version only while their draft does (30 days), and only from 20 Sep 2026.",
            ]),
      ],
    };
  }

  // Assessment
  tables.assessment = {
    key: "assessment",
    label: "Assessment",
    blocked: null,
    rows: [
      { ...allRow("Assessment A"), key: "a", sub: "Live" },
      perfRow("b", "Assessment B", "Not live", [], {}, false, true),
      perfRow("c", "Assessment C", "Not live", [], {}, false, true),
    ],
    total: null,
    notes: [],
  };

  // Device, country tier and new or returning: PostHog's split of the visits
  const aud = input.audience?.ok ? input.audience.value : null;
  const audWhy = vB
    ? "split over all traffic, so a source, device, tier or visitor filter leaves it blank"
    : !input.audience
      ? "PostHog was not read for this range"
      : !input.audience.ok
        ? input.audience.error
        : null;
  const dimShare = (dim: VisitDim, keyOf: (value: string) => string | null) => {
    const by = new Map<string, number>();
    let all = 0;
    for (const g of aud ?? []) {
      if (g.dim !== dim || !real(classifySource(g))) continue;
      all += g.sessions;
      const k = keyOf(g.value);
      if (k !== null) by.set(k, (by.get(k) ?? 0) + g.sessions);
    }
    return { by, all };
  };
  {
    const share = dimShare("device", (v) =>
      v === "Mobile" ? "phone" : v === "Desktop" ? "computer" : v === "Tablet" ? "tablet" : null
    );
    const deviceOk = facts.from >= STEP_DEVICE_FROM;
    const rows = (
      [
        ["phone", "Mobile"],
        ["computer", "Desktop"],
        ["tablet", "Tablet"],
      ] as const
    ).map(([key, name]) => {
      const mine = subs.filter((x) => deviceClass(x.device) === key);
      const tabletEarly = key === "tablet" && facts.from < SURVEY_TRACKING_FROM;
      const row = perfRow(
        key,
        name,
        aud && !audWhy && share.all
          ? `${Math.round(((share.by.get(key) ?? 0) / share.all) * 100)}% of PostHog's visits`
          : "",
        tabletEarly ? [] : mine,
        {
          visitors:
            tabletEarly || audWhy || !share.all ? null : estimate(share.by.get(key), share.all),
          starts:
            deviceOk && !tabletEarly
              ? startsWhere(facts, scope, (st) => deviceClass(st.device) === key)
              : null,
        },
        true
      );
      return tabletEarly
        ? {
            ...row,
            blocked: `Tablets are told apart from ${rangeLabel(SURVEY_TRACKING_FROM, SURVEY_TRACKING_FROM)}: pick a range from that day on.`,
          }
        : row;
    });
    tables.device = {
      key: "device",
      label: "Device",
      blocked: null,
      rows,
      total: null,
      notes: [
        "Ad spend isn't split by device here.",
        ...(audWhy ? [`Visitors per device: ${audWhy}.`] : []),
        ...(deviceOk ? [] : ["Survey starts record the device from 12 Oct 2026."]),
        ...(facts.from < SURVEY_TRACKING_FROM
          ? [
              `Tablets are told apart from ${rangeLabel(SURVEY_TRACKING_FROM, SURVEY_TRACKING_FROM)}: before, they count as Mobile or Desktop.`,
            ]
          : []),
      ],
    };
  }
  {
    // Every country PostHog saw, each put in its price tier as the pricing code does.
    const share = dimShare("countryAll", (v) => (v ? countryTierOf(v) : null));
    const rows = TIERS.filter((t) => t.value !== "all").map((t) => {
      const mine = subs.filter((x) => x.tier === t.value);
      return perfRow(
        t.value,
        t.label,
        t.value === "default" ? "Countries in no tier" : "",
        mine,
        {
          visitors: audWhy || !share.all ? null : estimate(share.by.get(t.value), share.all),
        },
        true
      );
    });
    tables.tier = {
      key: "tier",
      label: "Country tier",
      blocked: null,
      rows,
      total: null,
      notes: [
        "Ad spend isn't split by country tier, and survey starts don't record it.",
        "A finisher's tier comes from the price quote made when the report opens; a visitor's from the country PostHog placed the visit in.",
        ...(audWhy ? [`Visitors per tier: ${audWhy}.`] : []),
      ],
    };
  }
  {
    const share = dimShare("visitor", (v) => (v === "new" || v === "returning" ? v : null));
    const known = subs.filter((x) => x.visitorNew !== undefined);
    const rows = (
      [
        ["new", "New", "First visit in the period"],
        ["returning", "Returning", "Visited before"],
      ] as const
    ).map(([key, name, sub]) =>
      perfRow(
        key,
        name,
        sub,
        known.filter((x) => x.visitorNew === (key === "new")),
        { visitors: audWhy || !share.all ? null : estimate(share.by.get(key), share.all) },
        true
      )
    );
    tables.visitor = {
      key: "visitor",
      label: "Visitor type",
      blocked:
        known.length === 0 && subs.length > 0
          ? "PostHog could not tell new from returning finishers just now."
          : null,
      rows,
      total: null,
      notes: [
        "New or returning comes from PostHog: whether it had seen the person more than half an hour before the visit. A finisher it never saw is in neither row.",
        "Ad spend and survey starts can't be split this way.",
        ...(audWhy ? [`Visitors: ${audWhy}.`] : []),
      ],
    };
  }

  // ---- buyers against curiosity: keywords
  const keywordRows: IntentRow[] = tables.keyword.rows.map((r) => ({
    name: r.name,
    sub: r.sub,
    counts: r.counts,
  }));

  // ---- cohorts by acquisition source
  const nowMs = now.getTime();
  const acquired = subs.filter(
    (x) =>
      x.uid !== null && x.userFirstAt !== null && Date.parse(x.userFirstAt) === Date.parse(x.at)
  );
  const DAYS = [0, 7, 30, 90] as const;
  const cohortRows: CohortRow[] = SOURCES.filter((o) => o.value !== "all")
    .map((o) => {
      const src = o.value as Source;
      const mine = acquired.filter((x) => classifySource(x) === src);
      const first = (x: SubFact) => Date.parse(x.userFirstAt!);
      const within = (x: SubFact, days: number) =>
        x.userPays
          .filter((p) => !p.refunded && Date.parse(p.at) <= first(x) + (days + 1) * 86_400_000)
          .reduce((n, p) => n + p.amount, 0);
      const old = (days: number) => mine.filter((x) => first(x) + (days + 1) * 86_400_000 <= nowMs);
      const rev = DAYS.map((d) => {
        const o2 = old(d);
        return o2.length ? round2(o2.reduce((n, x) => n + within(x, d), 0) / o2.length) : null;
      }) as CohortRow["rev"];
      const o90 = old(90);
      const r0 = o90.reduce((n, x) => n + within(x, 0), 0);
      const r90 = o90.reduce((n, x) => n + within(x, 90), 0);
      const sales = mine.reduce((n, x) => n + x.userPays.length, 0);
      return {
        source: CHANNEL_ROWS.find((c) => c.source === src)?.name ?? o.label,
        users: mine.length,
        rev,
        eligible: DAYS.map((d) => old(d).length) as CohortRow["eligible"],
        growth: o90.length && r0 > 0 ? r90 / r0 : null,
        repeat: mine.length ? mine.filter((x) => x.userSubs >= 2).length / mine.length : null,
        crossSell: mine.length
          ? mine.filter((x) => x.userPays.filter((p) => !p.refunded).length >= 2).length /
            mine.length
          : null,
        refund: sales
          ? mine.reduce((n, x) => n + x.userPays.filter((p) => p.refunded).length, 0) / sales
          : null,
      };
    })
    .filter((r) => r.users > 0);

  // ---- the running experiments
  const experiments = buildExperiments(facts, scope, today);

  // ---- the audience per source
  const audience = buildAudience(subs, aud, audWhy, facts, total, f);

  // ---- cost against quality: Google Ads campaigns
  const dots: QualityDot[] = (adsOk?.campaigns ?? [])
    .filter((l) => l.clicks > 0)
    .map((l) => {
      const mine = subs.filter(
        (x) => classifySource(x) === "google_ads" && x.camp?.toLowerCase() === l.key
      );
      const payersN = mine.filter((x) => x.paidAt).length;
      return {
        name: l.name,
        spend: l.cost,
        clicks: l.clicks,
        cpc: ratio(l.cost, l.clicks),
        clickToPaid: ratio(payersN, l.clicks),
        payers: payersN,
      };
    });

  return {
    ...head(f, today, now),
    launched: on,
    attribution,
    tiles,
    trend,
    breakdowns: tables,
    intent: {
      creative: { blocked: tables.creative.blocked! },
      keyword: { rows: keywordRows, why: adsWhy },
    },
    cohorts: {
      rows: cohortRows,
      why: tablet,
      note: "People whose first finished survey falls in the range, by where it came from; revenue is what they paid within that many days of it (refunds out). A column counts only people that many days on.",
    },
    experiments,
    audience: { dims: audience },
    quality: {
      dots,
      why: adsWhy ?? (dots.length ? null : "No Google Ads campaign had clicks in this range."),
    },
  };
}

const STARTS_BY_SOURCE =
  "Survey starts: an unfinished start keeps its source only while its draft does (30 days), so older starts can't be split.";

/** Whether starts can be split by their tracker (source, campaign, keyword) from `from` on. */
function startsSplit(from: string, today: string): boolean {
  return from >= draftsKeptFrom(today);
}

/** "price_time_test" -> "Price time test", for a campaign Google Ads didn't name. */
function prettyKey(k: string): string {
  const t = k.replace(/_/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Unknown";
}

// ---------------------------------------------------------------------------------------------
// Experiments

/** The registry's running tests our records can read, from their first whole Berlin day. */
const EMAIL_TEST_START_DAY = "2026-10-09";

function buildExperiments(
  facts: Facts,
  scope: Scope,
  today: string
): { arms: ExperimentArm[]; note: string } {
  const arms: ExperimentArm[] = [];
  const last = addDays(today, -1);
  const win = (start: string) => {
    const from = facts.from > start ? facts.from : start;
    const to = facts.to < last ? facts.to : last;
    return from > to ? null : { from, to };
  };
  const subsW = (w: { from: string; to: string }) => subsIn(facts, scope, w.from, w.to);
  const payersOf = (xs: SubFact[]) => xs.filter((x) => x.paidAt).length;
  const revOf = (xs: SubFact[]) => round2(xs.reduce((n, x) => n + x.revenue, 0));

  // #6 · the landing hero: visits per arm are counted, starts per visit decide it.
  {
    const w = win(LANDING_TEST_START_DAY);
    const test = "Landing hero";
    const note = w
      ? `#6 · from ${rangeLabel(LANDING_TEST_START_DAY, LANDING_TEST_START_DAY)}`
      : "#6 · not in this range";
    const armsOf = [
      ["white_card", "Question card"],
      ["white_video", "Presenter video"],
    ] as const;
    const rows = armsOf.map(([arm, name]) => {
      const visitors = w
        ? facts.visits
            .filter(
              (v) =>
                v.arm === arm &&
                v.day >= w.from &&
                v.day <= w.to &&
                classifySource({ src: v.src, med: null, ads: false }) !== "test"
            )
            .reduce((n, v) => n + v.n, 0)
        : 0;
      const starts =
        w && armStartsComplete(w.from, today)
          ? startsWhere(facts, scope, (st) => st.arm === arm, w.from, w.to)
          : null;
      const xs = w ? subsW(w).filter((x) => x.arm === arm) : [];
      return { arm, name, visitors, starts, xs };
    });
    const [a, b] = rows;
    const t =
      a!.starts !== null && b!.starts !== null
        ? proportionTest(a!.starts, a!.visitors, b!.starts, b!.visitors)
        : {
            lift: null,
            chance: null,
            confidence: null,
            why: w
              ? "Starts per version aren't complete for this range"
              : "Not running in this range",
          };
    for (const [i, r] of rows.entries()) {
      arms.push({
        test,
        note,
        arm: r.name,
        control: i === 0,
        visitors: w ? r.visitors : null,
        startCvr: r.starts === null ? null : ratio(r.starts, r.visitors),
        submissions: w ? r.xs.length : null,
        paymentCvr: w ? ratio(payersOf(r.xs), r.xs.length) : null,
        revPerSub: w ? ratio(revOf(r.xs), r.xs.length) : null,
        revPerVisitor: w ? ratio(revOf(r.xs), r.visitors) : null,
        metric: "Start CVR",
        ...(i === 0 ? { lift: null, chance: null, confidence: null, why: null } : t),
      });
    }
  }

  // #5 · Pricing 3.0: the arm comes with the report, so it starts at the submission.
  {
    const w = win(PRICE_TEST_START_DAY);
    const test = "Pricing 3.0";
    const note = w
      ? `#5 · from ${rangeLabel(PRICE_TEST_START_DAY, PRICE_TEST_START_DAY)}`
      : "#5 · not in this range";
    const rows = (["A3", "B3"] as const).map((arm) => ({
      arm,
      xs: w ? subsW(w).filter((x) => x.priceArm === arm) : [],
    }));
    const [a, b] = rows;
    const t = proportionTest(payersOf(a!.xs), a!.xs.length, payersOf(b!.xs), b!.xs.length);
    for (const [i, r] of rows.entries()) {
      arms.push({
        test,
        note,
        arm: r.arm === "A3" ? "A3 · higher prices" : "B3 · lower prices",
        control: i === 0,
        visitors: null,
        startCvr: null,
        submissions: w ? r.xs.length : null,
        paymentCvr: w ? ratio(payersOf(r.xs), r.xs.length) : null,
        revPerSub: w ? ratio(revOf(r.xs), r.xs.length) : null,
        revPerVisitor: null,
        metric: "Payment CVR",
        ...(i === 0
          ? { lift: null, chance: null, confidence: null, why: null }
          : w
            ? t
            : { lift: null, chance: null, confidence: null, why: "Not running in this range" }),
      });
    }
  }

  // #7 · the email question: of the runs that reached it, the share that finished.
  {
    const w = win(EMAIL_TEST_START_DAY);
    const test = "Email question";
    const note = w
      ? `#7 · from ${rangeLabel(EMAIL_TEST_START_DAY, EMAIL_TEST_START_DAY)}`
      : "#7 · not in this range";
    const ok = w !== null && startsSplit(w.from, today);
    const rows = (
      [
        ["control", "Today's question"],
        ["anonymous", "Anonymous email"],
      ] as const
    ).map(([arm, name]) => {
      const reached = ok
        ? startsWhere(facts, scope, (st) => st.cq === arm && st.email, w!.from, w!.to)
        : 0;
      const finished = ok
        ? startsWhere(
            facts,
            scope,
            (st) => st.cq === arm && st.email && st.finished,
            w!.from,
            w!.to
          )
        : 0;
      const xs = w ? subsW(w).filter((x) => x.cq === arm) : [];
      return { name, reached, finished, xs };
    });
    const [a, b] = rows;
    const t = ok
      ? proportionTest(a!.finished, a!.reached, b!.finished, b!.reached)
      : {
          lift: null,
          chance: null,
          confidence: null,
          why: w ? "Starts per arm are kept only 30 days" : "Not running in this range",
        };
    for (const [i, r] of rows.entries()) {
      arms.push({
        test,
        note,
        arm: r.name,
        control: i === 0,
        visitors: null,
        startCvr: null,
        submissions: w ? r.xs.length : null,
        paymentCvr: w ? ratio(payersOf(r.xs), r.xs.length) : null,
        revPerSub: w ? ratio(revOf(r.xs), r.xs.length) : null,
        revPerVisitor: null,
        metric: ok
          ? `Finished after the email question (${r.finished} of ${r.reached})`
          : "Finished after the email question",
        ...(i === 0 ? { lift: null, chance: null, confidence: null, why: null } : t),
      });
    }
  }

  return {
    arms,
    note: "The registry's running tests whose arms our records keep. The survey's opening order (#4) and the pay pop-up (#3) aren't here: their arms are worked out from an id, not recorded on visits or starts. Pricing and the email question have no visitors: their arms are set at the report and in the survey.",
  };
}

// ---------------------------------------------------------------------------------------------
// Audience

/**
 * Each value's share, in `order` or by size; past `top`, the smallest join "Other" (as does an
 * "Other" already in the data, so there is only ever one).
 */
function shareList(
  values: string[],
  order?: string[],
  top = 8
): Array<{ label: string; share: number }> {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const total = values.length || 1;
  if (order)
    return order
      .filter((k) => counts.has(k))
      .map((k) => ({ label: k, share: counts.get(k)! / total }));
  const named = [...counts.keys()]
    .filter((k) => k !== "Other")
    .sort((a, b) => counts.get(b)! - counts.get(a)!);
  const keep = named.length + (counts.has("Other") ? 1 : 0) > top ? named.slice(0, top - 1) : named;
  const other = values.length - keep.reduce((n, k) => n + counts.get(k)!, 0);
  return [
    ...keep.map((k) => ({ label: k, share: counts.get(k)! / total })),
    ...(other > 0 ? [{ label: "Other", share: other / total }] : []),
  ];
}

/** The survey's relationship answers, shortened as the design writes them. */
export function relationshipShort(r: string | null): string {
  if (!r) return "Not stated";
  const t = r.toLowerCase();
  if (/^single/.test(t)) return "Single";
  if (/mostly exclusive/.test(t)) return "Mostly exclusive";
  if (/one exclusive|exclusive relationship/.test(t)) return "Exclusive relationship";
  if (/figuring|doesn.t fit/.test(t)) return "Figuring it out";
  if (/polyamor/.test(t)) return "Polyamorous";
  if (/'open'|non-exclusive/.test(t)) return "Open";
  if (/independence|multiple connections/.test(t)) return "Multiple, independent";
  if (/monogam/.test(t)) return "Monogamous (old wording)";
  return r;
}

/** The survey's gender answers, as the design writes them. */
export function genderShort(g: string | null): string {
  if (!g) return "Not stated";
  if (/^non-?binary$/i.test(g)) return "Non-binary";
  if (/rather not/i.test(g)) return "Rather not label";
  return g;
}

function buildAudience(
  subs: SubFact[],
  aud: VisitGroup[] | null,
  audWhy: string | null,
  facts: Facts,
  visitTotalN: number | null,
  f: ApFilters
): AudienceDim[] {
  const out: AudienceDim[] = [];
  const range = rangeLabel(facts.from, facts.to);

  // From visits (PostHog)
  const visitDims: Array<{
    key: VisitDim;
    title: string;
    label: (v: string) => string;
    order?: string[];
  }> = [
    { key: "country", title: "Country", label: (v) => (v ? countryName(v) : "Unknown") },
    {
      key: "device",
      title: "Device",
      label: (v) => v || "Unknown",
      order: ["Mobile", "Desktop", "Tablet", "Unknown"],
    },
    {
      key: "visitor",
      title: "New vs returning",
      label: (v) => (v === "new" ? "New" : v === "returning" ? "Returning" : "Unknown"),
      order: ["New", "Returning", "Unknown"],
    },
    {
      key: "daypart",
      title: "Time of day",
      label: (v) =>
        ({
          Morning: "Morning 6–12",
          Afternoon: "Afternoon 12–18",
          Evening: "Evening 18–24",
          Night: "Night 0–6",
        })[v] ?? "Unknown",
      order: ["Morning 6–12", "Afternoon 12–18", "Evening 18–24", "Night 0–6", "Unknown"],
    },
  ];
  for (const d of visitDims) {
    if (!aud || audWhy) {
      out.push({
        key: d.key,
        title: d.title,
        kind: "visit",
        base: "",
        values: [],
        bySource: [],
        perf: [],
        perfNote: null,
        blocked: `From PostHog's visits: ${audWhy ?? "not read"}.`,
      });
      continue;
    }
    const rows = aud.filter((g) => g.dim === d.key && real(classifySource(g)));
    const expand = (gs: VisitGroup[]) =>
      gs.flatMap((g) => Array<string>(g.sessions).fill(d.label(g.value)));
    const allValues = expand(rows);
    const values = shareList(allValues, d.order, 7);
    const labels = values.map((v) => v.label);
    const bySource = MATRIX_SOURCES.map(({ source, name }) => {
      const mine = expand(rows.filter((g) => classifySource(g) === source));
      const sh = new Map(
        shareList(
          mine.map((v) => (labels.includes(v) ? v : "Other")),
          labels
        ).map((x) => [x.label, x.share])
      );
      return {
        source: name,
        n: mine.length,
        shares: labels.map((l) => (mine.length ? (sh.get(l) ?? 0) : null)),
      };
    });
    // Performance per group, where the finishers can be put in the same groups.
    const subValue = (x: SubFact): string | null => {
      if (d.key === "device") {
        const c = deviceClass(x.device);
        return c === "phone"
          ? "Mobile"
          : c === "computer"
            ? "Desktop"
            : c === "tablet"
              ? "Tablet"
              : null;
      }
      if (d.key === "visitor")
        return x.visitorNew === undefined || x.visitorNew === null
          ? null
          : x.visitorNew
            ? "New"
            : "Returning";
      if (d.key === "country") {
        const hit = values.find((v) => v.label !== "Other" && v.label === x.country);
        return x.country ? (hit ? hit.label : "Other") : null;
      }
      return null;
    };
    const perf = values.map((v) => {
      const mine = subs.filter((x) => subValue(x) === v.label);
      const visitors = visitTotalN === null ? null : visitTotalN * v.share;
      return {
        label: v.label,
        share: v.share,
        completeRate:
          d.key === "daypart" || visitors === null || !visitors ? null : mine.length / visitors,
        preRate: null,
        fullRate: mine.length ? mine.filter((x) => x.full).length / mine.length : null,
        readMs: readMedian(mine),
      };
    });
    out.push({
      key: d.key,
      title: d.title,
      kind: "visit",
      base: `${allValues.length.toLocaleString("en-US")} visits PostHog recorded · ${range} (it records about half of all visits)`,
      values,
      bySource,
      perf,
      perfNote:
        d.key === "daypart"
          ? "Complete, unlock and reading rates need the finisher's own local time, which isn't recorded."
          : "Complete rate: finishers in the group over the group's share of the live visit total (an estimate).",
      blocked: null,
    });
  }

  // From the survey (the finishers' own answers)
  const surveyDims: Array<{
    key: string;
    title: string;
    value: (x: SubFact) => string;
    base: string;
    order?: string[];
  }> = [
    { key: "gender", title: "Gender", value: (x) => genderShort(x.gender), base: "question 15010" },
    {
      key: "age",
      title: "Age",
      value: (x) => x.age ?? "Not stated",
      base: "question 15003",
      order: ["18–24", "25–34", "35–44", "45–54", "55–64", "65+", "Not stated"],
    },
    {
      key: "relationship",
      title: "Relationship",
      value: (x) => relationshipShort(x.relationship),
      base: "their relationship answer",
    },
    {
      key: "archetype",
      title: "Archetype",
      value: (x) => x.archetype ?? "Not scored",
      base: "their report's result",
    },
  ];
  for (const d of surveyDims) {
    const values = shareList(subs.map(d.value), d.order, 9);
    const labels = values.map((v) => v.label);
    const valueOf = (x: SubFact) => {
      const v = d.value(x);
      return labels.includes(v) ? v : "Other";
    };
    const bySource = MATRIX_SOURCES.map(({ source, name }) => {
      const mine = subs.filter((x) => classifySource(x) === source);
      const sh = new Map(shareList(mine.map(valueOf), labels).map((x) => [x.label, x.share]));
      return {
        source: name,
        n: mine.length,
        shares: labels.map((l) => (mine.length ? (sh.get(l) ?? 0) : null)),
      };
    });
    const perf = values.map((v) => {
      const mine = subs.filter((x) => valueOf(x) === v.label);
      return {
        label: v.label,
        share: v.share,
        completeRate: null,
        preRate: null,
        fullRate: mine.length ? mine.filter((x) => x.full).length / mine.length : null,
        readMs: readMedian(mine),
      };
    });
    out.push({
      key: d.key,
      title: d.title,
      kind: "survey",
      base: `${subs.length.toLocaleString("en-US")} survey finishers · ${range} (${d.base})`,
      values,
      bySource,
      perf,
      perfNote:
        "Complete rate is blank: only finishers have answered, so the people who left can't be put in a group.",
      blocked: subs.length ? null : "No survey finishers under these filters.",
    });
  }
  void f;
  return out;
}

export { CHANNELS, CHANNEL_ROWS, MATRIX_SOURCES, shortDate as _shortDate };
export type { Bucket };
