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
import { twoProportionSignal } from "@features/admin/server/statistics";
import { LANDING_TEST_START_DAY } from "@shared/experiments/landingVariant";
import { PRICE_TEST_START_AT } from "@features/checkout/server/reportPurchase";
import { countryCodesByTier } from "@features/pricing/logic/reportPricing";
import { reportingDay } from "@shared/time/reporting-day";
import { COUNTRIES, COUNTRY_CODE_MAP } from "@/data/countries";

import type { AdPreview, AdsResult, AdsLine } from "./ads";
import { addDays, shortDate } from "./days";
import {
  classifySource,
  deviceClass,
  type Facts,
  PRE_ON_SALE_FROM,
  preBuysOf,
  type SourceClass,
  type StartFact,
  type SubFact,
  visitSource,
} from "./facts";
import {
  FUNNELS,
  grainOf,
  rangeLabel,
  SURVEY_TRACKING_FROM,
  TIERS,
  trendBuckets,
  type ApFilters,
  type Bucket,
  type Grain,
  type Source,
} from "./filters";
import { allTrafficBlocked, freePreBlocked, head, splitBlocked, type PageHead } from "./common";
import {
  armStartsComplete,
  draftsKeptFrom,
  LATE_SOURCES,
  lateSourceNote,
  launched,
  median,
  peopleBlocked,
  QUOTED_FROM,
  ratio,
  SOURCE_FROM,
  spend,
  spendBlocked,
  startsBlocked,
  STEP_DEVICE_FROM,
  startsComplete,
  subsIn,
  totals,
  untaggedShares,
  VISITOR_FROM,
  visitorsPerSource,
  visitsBlocked,
  visitsByTag,
  type PageAdCost,
  type Scope,
} from "./metrics";
import { assessmentScope } from "./assessment";
import { LANDING_TESTS } from "./landing";
import {
  POSTHOG_FROM,
  type PostHogResult,
  type SessionGroup,
  type SessionTags,
  type VisitDim,
  type VisitGroup,
} from "./posthog";
import { armLabel } from "@features/attribution/server/labels";
import { DEFAULT_ASSUMPTIONS, kpi, KPI_KEYS, type Counts, type KpiKey } from "./traffic-math";

/** Why the pre-unlock figures are blank over a range starting before it was on sale. */
const PRE_NOTE = `Pre-unlock figures start ${rangeLabel(PRE_ON_SALE_FROM, PRE_ON_SALE_FROM)}, the first whole day the €1.99 Core Archetype was on sale (pay to start): pick a range from that day on.`;

// ---------------------------------------------------------------------------------------------
// Payload

type Needs = "visitors" | "spend" | "people" | "starts";

/** What each headline figure is made of: the first of these that is blocked blanks it. */
export const TILE_NEEDS: Record<KpiKey, Needs[]> = {
  spend: ["spend"],
  cpc: ["spend"],
  visitors: ["visitors"],
  submitCvr: ["visitors", "people"],
  contribPerVisitor: ["visitors", "spend", "people"],
  revPerVisitor: ["visitors", "people"],
  roas: ["spend", "people"],
  visitorToPaid: ["visitors", "people"],
  purchaseCvr: ["people"],
};

/**
 * A headline figure's line over the range's points, at the default contribution assumptions:
 * what its info card draws as the last 12 weeks (it finds the line by `key`).
 */
export interface TileLine {
  key: KpiKey;
  spark: Array<number | null>;
  blocked: string | null;
}

export interface TrafficTiles extends Partial<Record<KpiKey, TileLine>> {
  now: Counts;
  prev: Counts | null;
  /** One per point of the sparkline (the range's whole weeks or months). */
  points: Counts[];
  /** Why a figure is blank, by what it needs. */
  blocked: Record<Needs, string | null>;
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
  /** Why the submissions are blank under these filters (peopleBlocked), or null. */
  submissionsWhy: string | null;
  /** Ad spend per submission per point; null where spend isn't complete. */
  costPerSub: Array<number | null>;
  /** The sources a referrer sorts (all but the ads), sorted differently before the tracking day. */
  note: string | null;
}

export type BreakdownKey =
  | "channel"
  | "funnel"
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
  /**
   * A channel no ad spend is paid for (organic, owned, direct, not recorded): its spend and
   * the costs built on it read "—", while its contribution counts its spend as €0.
   */
  noAdSpend?: boolean;
  /**
   * Its visitors are an estimate that sorts visits as its people's records can't (a late source
   * before the tracking day): the visitors show, the rates over them are blank.
   */
  noVisitorRates?: boolean;
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

/** A keyword with the ad its searchers saw, and what its clicks brought (Marcus, 15 Oct). */
export interface AdSeenRow {
  key: string;
  keyword: string;
  /** Its campaign's name. */
  campaign: string;
  ad: AdPreview;
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
    preRate: number | null;
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

/**
 * Google Ads' own rows per day, campaign and device (device_daily) and per day, campaign and
 * country (geo_daily), as google-live reads them: the split of its spend the device and
 * country-tier rows show.
 */
export type AdsBy =
  | { ok: true; device: Array<Record<string, unknown>>; geo: Array<Record<string, unknown>> }
  | { ok: false; error: string };

export interface TrafficPayload extends PageHead {
  launched: boolean;
  attribution: {
    visitorsWithSource: number | null;
    unattributed: { n: number; of: number } | null;
    why: string | null;
  };
  tiles: TrafficTiles;
  trend: ChannelTrend;
  breakdowns: Record<BreakdownKey, PerfTable>;
  intent: { creative: { blocked: string }; keyword: { rows: IntentRow[]; why: string | null } };
  /** Each keyword's ad as a searcher sees it, by spend; why the section is blank, when it is. */
  adsSeen: { rows: AdSeenRow[]; why: string | null };
  cohorts: { rows: CohortRow[]; why: string | null; note: string };
  experiments: { arms: ExperimentArm[]; note: string; why: string | null };
  audience: { dims: AudienceDim[] };
  /** `note`: what the dots can't hold for this range (finishers without a campaign tag). */
  quality: { dots: QualityDot[]; why: string | null; note: string | null };
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

/**
 * The landing test's two live versions as the design names them (the 21 Oct 2026 call: the
 * labels didn't match); retired versions keep the shared labels' names.
 */
const LIVE_LANDING_NAMES = new Map([
  ["white_card", "Hero · question card"],
  ["white_video", "Hero · presenter video"],
]);

/** The cohorts' rows, in the design's order: paid, organic search, owned, Direct, then the rest. */
const COHORT_ORDER: Array<Source | "unknown"> = [
  "google_ads",
  "meta_ads",
  "organic_search",
  "referral",
  "email",
  "direct",
  "ai",
  "social",
  "unknown",
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

/** Google Ads' devices (device_daily) as the device rows read them; the rest are "other". */
const ADS_DEVICE: Record<string, string> = {
  mobile: "phone",
  desktop: "computer",
  tablet: "tablet",
};

type AdsCounts = Pick<Counts, "spend" | "clicks" | "impressions">;

/** Google Ads' rows' cost, clicks and impressions, added up by a key of each row. */
function adsSum(
  rows: Array<Record<string, unknown>>,
  keyOf: (r: Record<string, unknown>) => string
): Map<string, AdsCounts> {
  const by = new Map<string, { spend: number; clicks: number; impressions: number }>();
  for (const r of rows) {
    const t = by.get(keyOf(r)) ?? { spend: 0, clicks: 0, impressions: 0 };
    t.spend = round2(t.spend + (Number(r.cost_eur) || 0));
    t.clicks += Number(r.clicks) || 0;
    t.impressions += Number(r.impressions) || 0;
    by.set(keyOf(r), t);
  }
  return by;
}

/** A row's part of Google Ads' split, €0 where it had none; nothing while the split is unread. */
const adsOf = (by: Map<string, AdsCounts> | null, key: string): Partial<AdsCounts> =>
  by ? (by.get(key) ?? { spend: 0, clicks: 0, impressions: 0 }) : {};

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
    prePayers: subs.filter((s) => preBuysOf(s).length > 0).length,
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

/**
 * Starts in [from, to] that pass the filters and `keep`, or null when the filters can't apply
 * to starts (a tier or visitor filter, the device before 12 Oct; see startsBlocked).
 */
function startsWhere(
  facts: Facts,
  scope: Scope,
  keep: (s: StartFact) => boolean,
  from = facts.from,
  to = facts.to
): number | null {
  if (startsBlocked(scope, from, facts.asOf)) return null;
  return facts.starts
    .filter(
      (s) =>
        s.day >= from &&
        s.day <= to &&
        !(s.known && classifySource(s) === "test") &&
        !(scope.funnel === "free" && s.pts) &&
        (scope.source === "all" || (s.known && classifySource(s) === scope.source)) &&
        (scope.device === "all" || deviceClass(s.device) === scope.device) &&
        keep(s)
    )
    .reduce((n, s) => n + s.n, 0);
}

/**
 * Visits in [from, to] whose visit-log source passes `source` ("all", or a source the visit log
 * can tell, see visitSource), without our own probes.
 */
function visitTotal(
  facts: Facts,
  from = facts.from,
  to = facts.to,
  source: Source | "all" = "all",
  arm?: string
): number {
  return facts.visits
    .filter((v) => {
      const c = visitSource(v.src);
      return (
        v.day >= from &&
        v.day <= to &&
        c !== "test" &&
        (source === "all" || c === source) &&
        (arm === undefined || v.arm === arm)
      );
    })
    .reduce((n, v) => n + v.n, 0);
}

/**
 * PostHog's split of each source's visits by a dimension's value, applied to that source's own
 * visitors (`perSource`) and added up: PostHog sees almost every Google Ads visit but a small
 * part of the rest, so its split of all its visits would read mostly as Google Ads'. A source
 * PostHog saw none of takes the split of all its visits. Null when PostHog saw none.
 */
function stratified<G extends SessionTags & { sessions: number }>(
  groups: G[],
  perSource: Map<Source, number>,
  keyOf: (g: G) => string | null
): Map<string, number> | null {
  const bySource = new Map<Source, Map<string, number>>();
  const totalOf = new Map<Source, number>();
  const overall = new Map<string, number>();
  let all = 0;
  for (const g of groups) {
    const c = classifySource(g);
    if (!real(c)) continue;
    totalOf.set(c, (totalOf.get(c) ?? 0) + g.sessions);
    all += g.sessions;
    const k = keyOf(g);
    if (k === null) continue;
    const m = bySource.get(c) ?? new Map<string, number>();
    m.set(k, (m.get(k) ?? 0) + g.sessions);
    bySource.set(c, m);
    overall.set(k, (overall.get(k) ?? 0) + g.sessions);
  }
  if (all === 0) return null;
  const out = new Map<string, number>();
  for (const [source, visitors] of perSource) {
    const t = totalOf.get(source);
    const m = t ? (bySource.get(source) ?? new Map<string, number>()) : overall;
    const of = t ?? all;
    for (const [k, n] of m) out.set(k, (out.get(k) ?? 0) + (visitors * n) / of);
  }
  return out;
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

/** The survey's country names by their ISO code: PostHog's codes read as the answers do. */
const SURVEY_BY_CODE = new Map(
  Object.entries(COUNTRY_CODE_MAP).map(([name, code]) => [code, name])
);

/**
 * "US" -> "United States"; the survey's own spelling where it has the country, by its code
 * first: the browser's names ("Czechia", "Türkiye", "Hong Kong SAR China") aren't the survey's.
 */
export function countryName(code: string): string {
  if (code === "Other" || !code) return code || "Unknown";
  const own = SURVEY_BY_CODE.get(code.toUpperCase());
  if (own) return own;
  let name: string;
  try {
    name = regionName.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
  return SURVEY_COUNTRY.get(norm(name)) ?? name;
}

/** "Türkiye" and Google's "Turkiye" read alike: accents dropped, then norm. */
const plain = (s: string) => norm(s.normalize("NFD").replace(/\p{M}/gu, ""));

/**
 * The tier countries' English names (as Google Ads writes them, accents aside: all 28 checked
 * 21 Oct 2026), from the pricing code's own table, to their tier. Every other is "default".
 */
const TIER_OF_NAME = new Map(
  [...countryCodesByTier()].flatMap(([tier, codes]) =>
    codes.map((c) => [plain(regionName.of(c) ?? c), tier] as const)
  )
);

/** The price tier of a country Google Ads names ("United States" -> "tier_1"). */
export function tierOfCountryName(name: string): string {
  return TIER_OF_NAME.get(plain(name)) ?? "default";
}

// ---------------------------------------------------------------------------------------------
// The builder

export function buildTraffic(input: {
  facts: Facts;
  /** The earlier period at the same age (ageMatched), or null. */
  previous: Facts | null;
  /** Under "Free survey", with whether all of it was the free survey's (freeAdsOnly). */
  ad: PageAdCost;
  filters: ApFilters;
  today: string;
  now: Date;
  /** PostHog's visit groups by the range's trend grain (fetchSessionGroups), or null. */
  sessions: PostHogResult<SessionGroup[]> | null;
  /** PostHog's audience groups (fetchVisitAudience), or null. */
  audience: PostHogResult<VisitGroup[]> | null;
  /** Google Ads per campaign and keyword over the range (fetchAdsSplit). */
  ads: AdsResult | null;
  /** Google Ads per device and per country over the range; null where it wasn't read. */
  adsBy?: AdsBy | null;
  /** The report's EUR 1.99 gate now, read under "Free survey" only; null when it couldn't be. */
  gateOn?: boolean | null;
}): TrafficPayload {
  const { facts, previous, ad, filters: f, today, now } = input;
  const scope = assessmentScope(f);
  const on = launched(scope);
  // A filter the records can't follow over this range: every figure about people is blank.
  const tablet = peopleBlocked(scope, facts.from);
  const subs = tablet ? [] : subsIn(facts, scope);
  const vB = visitsBlocked(scope, facts.from);
  const visits = vB ? null : visitTotal(facts, facts.from, facts.to, scope.source);
  const s = spend(ad, scope, facts.from, facts.to);
  // Spend that covers only part of the range (GA4 began later) is never used as the whole:
  // the figures built on it are blank, and say why.
  const partSpend =
    !s.complete && s.eur !== null && s.why === null
      ? s.from
        ? `Ad spend is recorded from ${rangeLabel(s.from, s.from)}: pick a range from that day on.`
        : "Ad spend could not be read for every day of this range."
      : null;
  const wholeSpend = s.complete ? s.eur : null;
  // Google's clicks and impressions are all of its traffic: none of another source's.
  const googleOk = scope.source === "all" || scope.source === "google_ads";
  const sumDays = (m: Map<string, number> | undefined, from: string, to: string) => {
    if (!m || ad.from === null || ad.to === null || from < ad.from || to > ad.to) return null;
    let n = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) n += m.get(d) ?? 0;
    return n;
  };
  const adClicks = (from: string, to: string) =>
    s.eur === null || !googleOk ? null : sumDays(ad.clicksByDay, from, to);
  const adImpressions = (from: string, to: string) =>
    s.eur === null || !googleOk ? null : sumDays(ad.impressionsByDay, from, to);

  const periodCounts = (x: Facts, from: string, to: string, sc: Scope): Counts => {
    const sp = spend(ad, sc, from, to);
    const t = totals(x, sc, from, to);
    return countsOf(peopleBlocked(sc, x.from) ? [] : subsIn(x, sc, from, to), {
      spend: sp.complete ? sp.eur : null,
      clicks: sp.complete && sp.eur !== null && googleOk ? sumDays(ad.clicksByDay, from, to) : null,
      impressions:
        sp.complete && sp.eur !== null && googleOk ? sumDays(ad.impressionsByDay, from, to) : null,
      visitors: t.visits,
      starts: startsComplete(from, today, sc) ? t.starts : null,
    });
  };

  // ---- the nine figures and the scorecard
  const nowCounts = periodCounts(facts, facts.from, facts.to, scope);
  const tiles: TrafficTiles = {
    now: nowCounts,
    prev:
      previous && !peopleBlocked(scope, previous.from)
        ? periodCounts(previous, previous.from, previous.to, scope)
        : null,
    points: trendBuckets(facts.from, facts.to).map((b) => periodCounts(facts, b.from, b.to, scope)),
    blocked: {
      visitors: vB ?? tablet,
      spend: s.why ?? partSpend,
      people: tablet,
      starts:
        startsBlocked(scope, facts.from, today) ??
        (startsComplete(facts.from, today, scope)
          ? null
          : "Survey starts before 18 Sep 2026 are incomplete once their drafts are cleared."),
    },
  };
  // Each headline figure's line, by its key, for its info card's last 12 weeks (the page
  // redraws its own tiles under the assumptions typed in; the card uses the defaults).
  for (const key of KPI_KEYS) {
    // eslint-disable-next-line security/detect-object-injection -- key and n are closed unions.
    const blocked = TILE_NEEDS[key].map((n) => tiles.blocked[n]).find((w) => w !== null) ?? null;
    // eslint-disable-next-line security/detect-object-injection -- key is one of KPI_KEYS.
    tiles[key] = { key, spark: tiles.points.map((p) => kpi(key, p, DEFAULT_ASSUMPTIONS)), blocked };
  }

  // ---- visitors per source: the visit log's tagged visits counted, its untagged ones split by
  // the sources of the untagged visits PostHog saw (visitorSplit's rule). A device, tier or
  // visitor filter, a range before PostHog or a failed read leaves the split blank, and says
  // why; Google Ads' visits are a count (its links tag every click), known without it.
  const groups = input.sessions?.ok ? input.sessions.value : null;
  const tags = visitsByTag(facts, facts.from, facts.to);
  const allVisits = [...tags.tagged.values()].reduce((a, n) => a + n, 0) + tags.untagged;
  const rangeSplit = groups ? untaggedShares(groups) : null;
  const vAll = visitsBlocked({ ...scope, source: "all" }, facts.from);
  const splitWhy =
    splitBlocked(f) ??
    (vAll ||
      (!input.sessions
        ? "PostHog was not read for this range."
        : !input.sessions.ok
          ? input.sessions.error
          : !rangeSplit && tags.untagged > 0
            ? "PostHog saw no untagged visits to split the visit log's by."
            : null));
  const perSource = splitWhy ? null : visitorsPerSource(tags, rangeSplit);
  // Under another source's filter nobody is a Google Ads visitor: no count, no campaign split.
  const otherSource = scope.source !== "all" && scope.source !== "google_ads";
  const googleCount =
    vAll || otherSource || facts.from < SOURCE_FROM ? null : (tags.tagged.get("google_ads") ?? 0);
  // Attribution, the channel trend and the audience are of all traffic: any filter blanks them.
  const attrWhy = allTrafficBlocked(f) ?? splitWhy;
  const directN = perSource?.get("direct") ?? 0;
  const attribution: TrafficPayload["attribution"] = {
    visitorsWithSource: perSource && allVisits ? 1 - directN / allVisits : null,
    unattributed: perSource && allVisits ? { n: Math.round(directN), of: allVisits } : null,
    why: attrWhy,
  };
  const unknownSubs = subs.filter((x) => classifySource(x) === "unknown");

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
  const trendWhy: string | null = attrWhy;
  if (!trendWhy && groups) {
    // Each point's own visits and PostHog's own untagged split, the range's where it saw none.
    const perPoint = points.map((b, bi) => {
      const own = untaggedShares(groups.filter((g) => bucketOf(g.bucket) === bi));
      return visitorsPerSource(visitsByTag(facts, b.from, b.to), own ?? rangeSplit);
    });
    // Each point's channels in whole visitors that add up to that point's own count (largest
    // remainder): rounded one by one, a day's stack read one more or one less than its visits.
    const perChannel = perPoint.map((per) => {
      const exact = CHANNELS.map((ch) => ch.sources.reduce((a, src) => a + (per.get(src) ?? 0), 0));
      const whole = exact.map(Math.floor);
      let left = Math.round(exact.reduce((a, x) => a + x, 0)) - whole.reduce((a, n) => a + n, 0);
      for (const i of exact.map((_x, i) => i).sort((a, b) => (exact[b]! % 1) - (exact[a]! % 1))) {
        if (left-- <= 0) break;
        whole[i]! += 1;
      }
      return whole;
    });
    trendVisitors = CHANNELS.map((_ch, ci) => perChannel.map((w) => w[ci]!));
  }
  const trend: ChannelTrend = {
    grain,
    points: points.map((b) => ({ label: b.label, from: b.from, to: b.to, full: b.full })),
    channels: CHANNELS.map(({ key, name, short }) => ({ key, name, short })),
    visitors: trendVisitors,
    visitorsWhy: trendVisitors ? null : (trendWhy ?? "PostHog was not read for this range."),
    note:
      [
        lateSourceNote(facts.from),
        unknownSubs.length
          ? `${unknownSubs.length.toLocaleString("en-US")} submission${unknownSubs.length === 1 ? " is" : "s are"} in no channel: their source wasn't recorded (before ${rangeLabel(SOURCE_FROM, SOURCE_FROM)}).`
          : null,
      ]
        .filter(Boolean)
        .join(" ") || null,
    submissions: trendSubs,
    submissionsWhy: tablet,
    costPerSub: points.map((b) => {
      const sp = spend(ad, scope, b.from, b.to);
      const n = subsIn(facts, scope, b.from, b.to).length;
      return sp.complete && sp.eur !== null && !tablet ? ratio(sp.eur, n) : null;
    }),
  };

  // ---- the ten breakdowns
  const total = visits ?? null;
  // Google Ads' own visits are counted (its links tag every click); PostHog sees almost all of
  // them, so its split of them by campaign and keyword is a fair split of the count.
  const googleVisits = googleCount;
  const googleGroups = groups ? groups.filter((g) => classifySource(g) === "google_ads") : null;
  const campShare = googleGroups ? sessionShares(googleGroups, (g) => g.camp ?? "") : null;
  const termShare = googleGroups
    ? sessionShares(googleGroups, (g) => (g.term ? `${g.camp ?? ""}|${g.term}` : null))
    : null;
  // In whole visitors that add up to their total (largest remainder), so the rows add up to
  // the "All" row: each rounded alone, three rows of 2.5, 37.5 and 10 would read 51 of 50.
  const apportion = (share: { by: Map<string, number>; total: number } | null) => {
    if (googleVisits === null || !share || share.total === 0) return null;
    const exact = [...share.by].map(([k, n]) => [k, (googleVisits * n) / share.total] as const);
    const out = new Map(exact.map(([k, x]) => [k, Math.floor(x)]));
    let left =
      Math.round(exact.reduce((a, [, x]) => a + x, 0)) -
      [...out.values()].reduce((a, n) => a + n, 0);
    for (const [k] of [...exact].sort((a, b) => (b[1] % 1) - (a[1] % 1))) {
      if (left-- <= 0) break;
      out.set(k, out.get(k)! + 1);
    }
    return out;
  };
  const campVisitors = apportion(campShare);
  const termVisitors = apportion(termShare);
  // Campaign and keyword visitors: Google Ads' counted visits, split as PostHog's Google Ads
  // visits split (it sees nearly all of them), so they need both.
  const campWhy =
    googleCount === null
      ? (vAll ??
        `Google Ads' visits are counted from ${rangeLabel(SOURCE_FROM, SOURCE_FROM)}: pick a range from that day on.`)
      : googleGroups
        ? null
        : facts.from < POSTHOG_FROM
          ? `The split by campaign comes from PostHog's Google Ads visits, which start on ${rangeLabel(POSTHOG_FROM, POSTHOG_FROM)}: pick a range from that day on.`
          : !input.sessions
            ? "PostHog was not read for this range."
            : !input.sessions.ok
              ? input.sessions.error
              : null;
  const late = lateSourceNote(facts.from);
  const sourceSplitOk = startsSplit(facts.from, today);

  // The Ads API's cost, clicks and impressions are all traffic: beside finishers narrowed by a
  // filter spend can't follow (device, tier, visitor), or by a source other than Google Ads,
  // they would describe other people. Then they are left out, and the rows say why.
  const noAds =
    scope.source !== "all" && scope.source !== "google_ads" && scope.source !== "meta_ads";
  const adsBlocked =
    spendBlocked(noAds ? { ...scope, source: "all" } : scope, ad.freeAds) ??
    (noAds ? "Google Ads' figures don't apply under this source filter." : null);
  const adsOk = !adsBlocked && input.ads?.ok ? input.ads.value : null;
  const adsWhy =
    adsBlocked ??
    s.why ??
    (!input.ads ? "Google Ads was not read." : !input.ads.ok ? input.ads.error : null);
  // Google Ads' own split of its spend by device and by country, under the same rule.
  const adsBy = !adsBlocked && input.adsBy?.ok ? input.adsBy : null;
  const adsByWhy =
    adsBlocked ??
    (!input.adsBy ? "Google Ads was not read." : !input.adsBy.ok ? input.adsBy.error : null);
  const devSpend = adsBy
    ? adsSum(adsBy.device, (r) => ADS_DEVICE[String(r.device)] ?? "other")
    : null;
  const tierSpend = adsBy
    ? adsSum(adsBy.geo, (r) => tierOfCountryName(String(r.country ?? "")))
    : null;
  const spendNote = (per: string) =>
    adsBy
      ? `Spend per ${per}: Google Ads' own split of its spend${scope.source === "all" ? ". Cost / complete and CAC set it against every source's finishers there (blended)" : ""}.`
      : `Spend per ${per}: ${adsByWhy}`;

  const tables = {} as Record<BreakdownKey, PerfTable>;
  // Under a source that pays for no ads, the All row is that source's: no spend ("—"), its
  // contribution counting none, as the source's own row.
  const allRow = (label: string): PerfRow => ({
    ...perfRow(
      "all",
      label,
      "",
      subs,
      {
        visitors: total,
        starts:
          startsComplete(facts.from, today, scope) && !tablet ? totals(facts, scope).starts : null,
        spend: wholeSpend,
        clicks: adClicks(facts.from, facts.to),
        impressions: adImpressions(facts.from, facts.to),
      },
      false
    ),
    ...(noAds ? { noAdSpend: true } : {}),
  });

  // The rows added up, as drawn: a figure known for none of them stays unknown, and one
  // missing from some (a row with no campaign tag has no spend of its own) adds what is known.
  // Visitors and starts are those of all the rows' people (a row with no campaign tag has
  // finishers but no visitors or starts of its own), so the caller gives them.
  const sumRow = (
    label: string,
    people: SubFact[],
    rows: PerfRow[],
    reach: { visitors: number | null; starts: number | null }
  ): PerfRow => {
    const sum = (k: "spend" | "clicks" | "impressions") => {
      const known = rows.map((r) => r.counts[k]).filter((v): v is number => v !== null);
      return known.length ? round2(known.reduce((a, v) => a + v, 0)) : null;
    };
    return perfRow(
      "all",
      label,
      "",
      people,
      { ...reach, spend: sum("spend"), clicks: sum("clicks"), impressions: sum("impressions") },
      true
    );
  };

  // Channel: under a source filter, that source's row alone (the others are filtered out).
  {
    const shownRows = CHANNEL_ROWS.filter(
      (c) => scope.source === "all" || c.source === scope.source
    );
    const rows = shownRows.map(({ source, name, sub }) => {
      const mine = subs.filter((x) => classifySource(x) === source);
      const isGoogle = source === "google_ads";
      const row = perfRow(
        source,
        name,
        sub,
        mine,
        {
          // Google Ads' visits are counted; the others' are estimates, shown unfiltered only.
          visitors: isGoogle
            ? googleCount
            : !perSource || scope.source !== "all"
              ? null
              : Math.round(perSource.get(source) ?? 0),
          starts: sourceSplitOk
            ? startsWhere(facts, scope, (st) => st.known && classifySource(st) === source)
            : null,
          // Only Google Ads' spend is read: Meta's is unknown, the rest have none ("—", never
          // a €0 that would rank them cheapest).
          spend: isGoogle ? wholeSpend : null,
          clicks: isGoogle ? adClicks(facts.from, facts.to) : null,
          impressions: isGoogle ? adImpressions(facts.from, facts.to) : null,
        },
        // Google Ads' visitors are a count; the others an estimate (the "Sample split").
        !isGoogle
      );
      // The sources an untagged visit's referrer sorts: our records tell them apart only from
      // the tracking day, PostHog always, so their people over these visitors would mislead.
      const lateRow = late && LATE_SOURCES.has(source) ? { ...row, noVisitorRates: true } : row;
      return isGoogle || source === "meta_ads" ? lateRow : { ...lateRow, noAdSpend: true };
    });
    // Finishers whose source was never recorded: a row of their own, never Direct.
    if (unknownSubs.length && scope.source === "all")
      rows.push({
        ...perfRow(
          "unknown",
          "Not recorded",
          `No source recorded (before ${rangeLabel(SOURCE_FROM, SOURCE_FROM)})`,
          unknownSubs,
          {},
          true,
          true
        ),
        noAdSpend: true,
      });
    tables.channel = {
      key: "channel",
      label: "Channel",
      blocked: null,
      rows,
      total: allRow("All channels"),
      notes: [
        ...(scope.source === "google_ads" && googleCount !== null
          ? ["Visitors: Google Ads' visits, counted by the visit log (its links tag every click)."]
          : splitWhy
            ? [
                googleCount === null
                  ? `Visitors per channel: ${splitWhy}`
                  : `Visitors per channel: Google Ads' are counted by the visit log (its links tag every click); the other channels' are blank. ${splitWhy}`,
              ]
            : [
                `Visitors per channel: visits whose link names its source (every Google Ads click, email, AI assistants) are counted by the visit log; its ${tags.untagged.toLocaleString("en-US")} untagged ones are split by the sources of the ${(rangeSplit?.seen ?? 0).toLocaleString("en-US")} untagged visits PostHog recorded, so that split is an estimate.`,
              ]),
        ...(late && scope.source === "all" ? [late] : []),
        ...(sourceSplitOk ? [] : [STARTS_BY_SOURCE]),
        ...(partSpend ? [partSpend] : []),
        ...(unknownSubs.length && scope.source === "all"
          ? [
              `Not recorded: finishers whose source wasn't recorded (before ${rangeLabel(SOURCE_FROM, SOURCE_FROM)}).`,
            ]
          : []),
        "Spend: only Google Ads' is read. Meta Ads' isn't, so its costs read —. The other channels pay for no ads: their spend and costs read —, and their contribution counts none.",
      ],
    };
  }

  // Funnel: the free survey, without the surveys bought before they were taken (pay to start,
  // live since 22 Oct 2026), and all funnels. Pay to start's own visits, spend and sales by
  // offer are on its page: its rows here point there.
  const free = subs.filter((x) => !x.pts);
  const freeStarts =
    startsComplete(facts.from, today, scope) && !tablet
      ? totals(facts, { ...scope, funnel: "free" }).starts
      : null;
  tables.funnel = {
    key: "funnel",
    label: "Funnel",
    // It compares the funnels: under "Free survey" its total would read as all funnels.
    blocked:
      scope.funnel === "free"
        ? "The Funnel filter is on Free survey: this table compares the funnels, so pick All funnels to see them side by side."
        : null,
    rows: FUNNELS.filter((x) => x.value !== "all").map((x) =>
      x.value === "free"
        ? {
            ...perfRow(x.value, x.label, "", free, { visitors: total, starts: freeStarts }, false),
          }
        : {
            ...perfRow(x.value, x.label, "", [], {}, false, true),
            blocked:
              "Pay to start's visits, spend and sales by offer are on the Pay to start page.",
          }
    ),
    total: allRow("All funnels"),
    notes: [
      ...(wholeSpend === null && s.why ? [`Spend: ${s.why}`] : []),
      "Free survey: its spend is blank, the whole account's is under All funnels (pay to start's campaigns too). Its visitors are the free landing pages' (pay to start's own are on its page).",
    ],
  };

  // Campaign (Google Ads): the Ads API's cost, our finishers by the link's utm_campaign
  {
    const keys = new Set<string>();
    for (const l of adsOk?.campaigns ?? []) keys.add(l.key);
    const googleSubs = subs.filter((x) => classifySource(x) === "google_ads");
    for (const x of googleSubs) if (x.camp) keys.add(x.camp.toLowerCase());
    // A tag only PostHog's Google Ads visits carried (an old campaign's link, still clicked): its
    // visitors get a row too, so the rows add up to all of Google Ads'.
    for (const k of campShare?.by.keys() ?? []) if (k && googleVisits !== null) keys.add(k);
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
          visitors: campVisitors ? (campVisitors.get(k) ?? 0) : null,
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
    if (untagged.length || (googleVisits !== null && (campShare?.by.get("") ?? 0) > 0))
      rows.push(
        perfRow(
          "untagged",
          "No campaign tag",
          "Google Ads click without utm_campaign",
          untagged,
          {
            visitors: campVisitors ? (campVisitors.get("") ?? 0) : null,
            starts: sourceSplitOk
              ? startsWhere(
                  facts,
                  scope,
                  (st) => st.known && classifySource(st) === "google_ads" && !st.camp
                )
              : null,
          },
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
      total:
        rows.length > 1
          ? sumRow("All campaigns", googleSubs, rows, {
              visitors: googleVisits,
              starts: sourceSplitOk
                ? startsWhere(facts, scope, (st) => st.known && classifySource(st) === "google_ads")
                : null,
            })
          : null,
      notes: [
        ...(adsWhy ? [`Spend, clicks and impressions: ${adsWhy}`] : []),
        `Google Ads campaigns only: Meta's campaigns aren't read. Visitors: Google Ads' visits, counted, split by the campaign tag of the Google Ads visits PostHog saw.${campWhy ? ` ${campWhy}` : ""}`,
        ...(facts.from < CAMPAIGN_FROM
          ? [
              `Google Ads links carry the campaign tag on every click from ${rangeLabel(CAMPAIGN_FROM, CAMPAIGN_FROM)}: most earlier Google Ads finishers have none and are under "No campaign tag".`,
            ]
          : []),
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

  // Search term (the keyword a Search ad matched). The links pass it from CAMPAIGN_FROM: before,
  // their utm_term held the ad group's name ("Am I Normal"), so those finishers aren't here.
  {
    const googleSubs = subs.filter(
      (x) => classifySource(x) === "google_ads" && x.term && x.day >= CAMPAIGN_FROM
    );
    const keys = new Map<string, { camp: string; term: string }>();
    for (const l of adsOk?.keywords ?? [])
      keys.set(`${l.campaign}|${l.key}`, { camp: l.campaign ?? "", term: l.key });
    for (const x of googleSubs)
      keys.set(`${(x.camp ?? "").toLowerCase()}|${x.term!.toLowerCase()}`, {
        camp: (x.camp ?? "").toLowerCase(),
        term: x.term!.toLowerCase(),
      });
    // A keyword only PostHog's Google Ads visits carried: its visitors get a row too, so the rows
    // add up to "All keywords".
    if (googleVisits !== null)
      for (const k of termShare?.by.keys() ?? []) {
        const i = k.indexOf("|");
        if (i > 0 && !keys.has(k)) keys.set(k, { camp: k.slice(0, i), term: k.slice(i + 1) });
      }
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
          visitors: termVisitors ? (termVisitors.get(key) ?? 0) : null,
          starts: sourceSplitOk
            ? startsWhere(
                facts,
                scope,
                (st) =>
                  st.known &&
                  classifySource(st) === "google_ads" &&
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
      label: "Keyword",
      blocked: null,
      rows,
      total:
        rows.length > 1
          ? sumRow("All keywords", googleSubs, rows, {
              visitors: termVisitors ? [...termVisitors.values()].reduce((a, n) => a + n, 0) : null,
              starts: sourceSplitOk
                ? startsWhere(
                    facts,
                    scope,
                    (st) => st.known && classifySource(st) === "google_ads" && !!st.term
                  )
                : null,
            })
          : null,
      notes: [
        "The keyword each Search ad matched (utm_term), not the words searched. Performance Max shows no keyword, so its clicks aren't here.",
        ...(facts.from < CAMPAIGN_FROM
          ? [
              `The links pass the keyword from ${rangeLabel(CAMPAIGN_FROM, CAMPAIGN_FROM)}: before, their tag held the ad group's name, so earlier finishers aren't counted here.`,
            ]
          : []),
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
        LIVE_LANDING_NAMES.get(arm) ?? armLabel("landing", arm).long,
        test ? `${test.name} · ${test.arms[0] === arm ? "A" : "B"}` : "",
        mine,
        {
          visitors: vB ? null : visitTotal(facts, facts.from, facts.to, scope.source, arm),
          starts: armOk ? startsWhere(facts, scope, (st) => st.arm === arm) : null,
        },
        false
      );
    });
    rows.sort((a, b) => (b.counts.visitors ?? 0) - (a.counts.visitors ?? 0));
    // Visitors who never saw a landing version (they came straight to the survey, a report or
    // another page) and finishers without one: a row of their own, so the rows add up.
    const noArm = subs.filter((x) => !x.arm);
    const noArmVisits = vB
      ? null
      : visitTotal(facts, facts.from, facts.to, scope.source, "unknown");
    const hasNoArm = noArm.length > 0 || (noArmVisits ?? 0) > 0;
    if (hasNoArm)
      rows.push(
        perfRow(
          "unknown",
          "No landing version",
          "Entered on another page (the survey, a report, a legal page)",
          noArm,
          { visitors: noArmVisits },
          false,
          true
        )
      );
    tables.landing = {
      key: "landing",
      label: "Landing page",
      blocked: null,
      rows,
      total: allRow("All landing pages"),
      notes: [
        "Ad spend isn't split by landing page: both versions get the same ads.",
        ...(hasNoArm
          ? [
              "No landing version: visitors who entered on another page (the survey, a report, a legal page), and finishers without a version.",
            ]
          : []),
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
    // The live one only, as drawn: B and C have no figures yet.
    rows: [{ ...allRow("Assessment A"), key: "a", sub: "Live" }],
    total: null,
    notes: [],
  };

  // Device, country tier and new or returning: PostHog's split of each source's visits, applied
  // to that source's visitors (stratified), so Google Ads, which PostHog sees nearly whole,
  // doesn't speak for everyone.
  const aud = input.audience?.ok ? input.audience.value : null;
  const audWhy =
    (allTrafficBlocked(f) ?? splitBlocked(f))?.replace(/\.$/, "") ??
    (!input.audience
      ? "PostHog was not read for this range"
      : !input.audience.ok
        ? input.audience.error
        : perSource
          ? null
          : (attrWhy ?? "the visitors per source can't be read").replace(/\.$/, ""));
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
  /** The visitors of each value of a dimension, stratified by source; null when unknown. */
  const dimVisitors = (dim: VisitDim, keyOf: (value: string) => string | null) =>
    aud && !audWhy && perSource
      ? stratified(
          aud.filter((g) => g.dim === dim),
          perSource,
          (g) => keyOf(g.value)
        )
      : null;
  {
    const keyOf = (v: string) =>
      v === "Mobile" ? "phone" : v === "Desktop" ? "computer" : v === "Tablet" ? "tablet" : null;
    const share = dimShare("device", keyOf);
    const est = dimVisitors("device", keyOf);
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
      // PostHog counts an iPad as a desktop (it presents itself as a Mac), while the survey
      // tells it apart: tablet visitors and the survey's tablets are different people, so the
      // tablet row has no visitors to divide by.
      const row = perfRow(
        key,
        name,
        key === "tablet"
          ? "PostHog counts iPads as Desktop, so tablet visitors aren't counted"
          : aud && !audWhy && share.all
            ? `${Math.round(((share.by.get(key) ?? 0) / share.all) * 100)}% of PostHog's visits`
            : "",
        tabletEarly ? [] : mine,
        {
          visitors: key === "tablet" || !est ? null : Math.round(est.get(key) ?? 0),
          starts:
            deviceOk && !tabletEarly
              ? startsWhere(facts, scope, (st) => deviceClass(st.device) === key)
              : null,
          ...adsOf(devSpend, key),
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
    // Finishers with no device recorded (before the steps kept it, gone before the report
    // loaded): a row of their own, so the rows add up to the total.
    const noDevice = subs.filter((x) => deviceClass(x.device) === null);
    const noDeviceSub = `No device recorded (left before the report loaded, before ${rangeLabel(STEP_DEVICE_FROM, STEP_DEVICE_FROM)})`;
    if (noDevice.length)
      rows.push(perfRow("unknown", "Not recorded", noDeviceSub, noDevice, {}, true, true));
    // Google Ads' other screens (connected TVs and the like): spend, no finisher.
    const other = devSpend?.get("other");
    if (other && (other.spend || other.clicks))
      rows.push(
        perfRow(
          "other",
          "Other devices",
          "Connected TVs and other screens Google Ads reports",
          [],
          other,
          false,
          true
        )
      );
    tables.device = {
      key: "device",
      label: "Device",
      blocked: null,
      rows,
      total: allRow("All devices"),
      notes: [
        spendNote("device"),
        "Tablet: PostHog counts iPads as desktops, so tablet visitors aren't counted.",
        ...(noDevice.length
          ? [
              `Not recorded: finishers with no device recorded (they left before the report loaded, before ${rangeLabel(STEP_DEVICE_FROM, STEP_DEVICE_FROM)}).`,
            ]
          : []),
        ...(other && (other.spend || other.clicks)
          ? [
              "Other devices: connected TVs and other screens Google Ads shows its ads on, its spend only.",
            ]
          : []),
        ...(audWhy ? [`Visitors per device: ${audWhy}.`] : []),
        ...(deviceOk
          ? []
          : [
              `Survey starts record the device from ${rangeLabel(STEP_DEVICE_FROM, STEP_DEVICE_FROM)}.`,
            ]),
        ...(facts.from < SURVEY_TRACKING_FROM
          ? [
              `Tablets are told apart in ranges from ${rangeLabel(SURVEY_TRACKING_FROM, SURVEY_TRACKING_FROM)}: in one starting earlier, they count as Mobile or Desktop.`,
            ]
          : []),
        ...(est
          ? [
              "Visitors per device: each source's visitors split by PostHog's devices for that source.",
            ]
          : []),
      ],
    };
  }
  {
    // Every visit's country put in its price tier as the pricing code does (PostHog's tier
    // dimension), split per source like the device.
    const share = dimShare("tier", (v) => v || null);
    const est = dimVisitors("tier", (v) => v || null);
    const rows = TIERS.filter((t) => t.value !== "all").map((t) => {
      const mine = subs.filter((x) => x.tier === t.value);
      return perfRow(
        t.value,
        t.label,
        t.value === "default" ? "Countries in no tier" : "",
        mine,
        {
          visitors: !est || !share.all ? null : Math.round(est.get(t.value) ?? 0),
          ...adsOf(tierSpend, t.value),
        },
        true
      );
    });
    // Finishers before QUOTED_FROM without a price quote have no tier: their own row.
    const noTier = subs.filter((x) => !x.tier);
    if (noTier.length)
      rows.push(
        perfRow(
          "none",
          "No price quote",
          `No country tier (finished before ${rangeLabel(QUOTED_FROM, QUOTED_FROM)} without a price quote)`,
          noTier,
          {},
          true,
          true
        )
      );
    tables.tier = {
      key: "tier",
      label: "Country tier",
      blocked: null,
      rows,
      total: allRow("All country tiers"),
      notes: [
        spendNote("country tier"),
        "Survey starts don't record the country tier.",
        "A finisher's tier comes from the price quote made when the report opens; a visitor's from the country PostHog placed the visit in; spend's from the country Google Ads placed the click in (where people were, or showed interest in).",
        ...(noTier.length
          ? [
              `No price quote: finishers with no country tier (they finished before ${rangeLabel(QUOTED_FROM, QUOTED_FROM)} without a price quote).`,
            ]
          : []),
        ...(audWhy ? [`Visitors per tier: ${audWhy}.`] : []),
      ],
    };
  }
  {
    const keyOf = (v: string) => (v === "new" || v === "returning" ? v : null);
    const est = dimVisitors("visitor", keyOf);
    const known = subs.filter((x) => x.visitorNew !== undefined);
    const rows = (
      [
        ["new", "New", "PostHog hadn't seen them before this visit"],
        ["returning", "Returning", "PostHog saw them over 30 min before"],
      ] as const
    ).map(([key, name, sub]) =>
      perfRow(
        key,
        name,
        sub,
        known.filter((x) => x.visitorNew === (key === "new")),
        { visitors: !est ? null : Math.round(est.get(key) ?? 0) },
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
      total: allRow("All visitor types"),
      notes: [
        "New or returning comes from PostHog: whether it had seen the person more than half an hour before the visit. A finisher it never saw is in neither row.",
        ...(facts.from < VISITOR_FROM
          ? [
              `Finished surveys keep their PostHog visit from ${rangeLabel(VISITOR_FROM, VISITOR_FROM)}: earlier finishers are in neither row.`,
            ]
          : []),
        "Ad spend and survey starts can't be split this way.",
        ...(audWhy ? [`Visitors: ${audWhy}.`] : []),
      ],
    };
  }

  // Under a filter on a table's own dimension, that row alone, as the channel table: the other
  // rows' zeros would read as none, when they are only filtered out.
  for (const [k, v] of [
    ["device", scope.device],
    ["tier", scope.tier],
    ["visitor", scope.visitor],
  ] as const)
    if (v !== "all") tables[k].rows = tables[k].rows.filter((r) => r.key === v);

  // A filter the records can't follow over this range: every table about people is blank, and
  // says why, rather than a column of zeros beside the spend.
  if (tablet) for (const t of Object.values(tables)) t.blocked ??= tablet;
  // Google Ads' campaigns and keywords hold only Google Ads' people.
  if (otherSource)
    for (const t of [tables.campaign, tables.keyword])
      t.blocked ??=
        "Google Ads' campaigns and keywords hold only Google Ads visitors: under another source's filter there is nothing to show.";

  // ---- buyers against curiosity: keywords
  const keywordRows: IntentRow[] = (tables.keyword.blocked ? [] : tables.keyword.rows).map((r) => ({
    name: r.name,
    sub: r.sub,
    counts: r.counts,
  }));

  // ---- the ads as searchers see them: each keyword's row, with the ad its searchers saw most
  const adsSeenRows: AdSeenRow[] = tables.keyword.blocked
    ? []
    : tables.keyword.rows.flatMap((r) => {
        const ad = adsOk?.keywords.find((l) => `${l.campaign}|${l.key}` === r.key)?.ad;
        return ad ? [{ key: r.key, keyword: r.name, campaign: r.sub, ad, counts: r.counts }] : [];
      });
  const adsUnread =
    !!adsOk && adsOk.keywords.length > 0 && adsOk.keywords.every((l) => l.ad === undefined);
  const adsSeenWhy =
    tables.keyword.blocked ??
    adsWhy ??
    (adsUnread
      ? "Google Ads' search ads could not be read just now."
      : adsSeenRows.length === 0
        ? "No keyword with a search ad had clicks or finishers in this range."
        : null);

  // ---- cohorts by acquisition source
  const nowMs = now.getTime();
  const acquired = subs.filter(
    (x) =>
      x.uid !== null && x.userFirstAt !== null && Date.parse(x.userFirstAt) === Date.parse(x.at)
  );
  const DAYS = [0, 7, 30, 90] as const;
  const cohortRows: CohortRow[] = COHORT_ORDER.map((src) => {
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
      source: CHANNEL_ROWS.find((c) => c.source === src)?.name ?? "Not recorded",
      users: mine.length,
      rev,
      eligible: DAYS.map((d) => old(d).length) as CohortRow["eligible"],
      growth: o90.length && r0 > 0 ? r90 / r0 : null,
      repeat: mine.length ? mine.filter((x) => x.userSubs >= 2).length / mine.length : null,
      crossSell: mine.length
        ? mine.filter((x) => x.userPays.filter((p) => !p.refunded).length >= 2).length / mine.length
        : null,
      refund: sales
        ? mine.reduce((n, x) => n + x.userPays.filter((p) => p.refunded).length, 0) / sales
        : null,
    };
  }).filter((r) => r.users > 0);

  // ---- the running experiments
  const experiments = tablet
    ? { arms: [], note: "", why: tablet }
    : { ...buildExperiments(facts, scope, today), why: null };

  // ---- the audience per source
  // "Free survey" sells the EUR 1.99 only through the report's gate: with it off and none sold,
  // its pre-unlock columns are blank with why, as every page's EUR 1.99 figure is.
  const preFreeWhy =
    scope.funnel === "free"
      ? freePreBlocked(
          input.gateOn,
          subs.some((s) => preBuysOf(s).length > 0)
        )
      : null;
  const audience = buildAudience(
    subs,
    aud,
    audWhy,
    facts,
    perSource,
    allVisits,
    tablet,
    preFreeWhy
  );

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

  // Google Ads finishers carry their campaign from CAMPAIGN_FROM: before, their purchases are in
  // no campaign's dot, though the spend covers every day.
  const untaggedGoogle = subs.filter((x) => classifySource(x) === "google_ads" && !x.camp);
  const untaggedPayers = untaggedGoogle.filter((x) => x.paidAt).length;
  const qualityNote = untaggedGoogle.length
    ? `${untaggedGoogle.length.toLocaleString("en-US")} Google Ads finisher${untaggedGoogle.length === 1 ? "" : "s"}${untaggedPayers ? `, ${untaggedPayers} of them paying,` : ""} carried no campaign tag${facts.from < CAMPAIGN_FROM ? ` (the links carry it from ${rangeLabel(CAMPAIGN_FROM, CAMPAIGN_FROM)})` : ""}, so ${untaggedGoogle.length === 1 ? "it is" : "they are"} in no campaign's dot.`
    : null;

  // Nobody could pre-unlock before it was on sale: over a range starting earlier the pre-unlock
  // columns are blank, never a rate diluted by days without it, and every table says so.
  if (facts.from < PRE_ON_SALE_FROM || preFreeWhy) {
    for (const t of Object.values(tables)) {
      for (const r of [...t.rows, ...(t.total ? [t.total] : [])]) r.counts.prePayers = null;
      t.notes.push(facts.from < PRE_ON_SALE_FROM ? PRE_NOTE : preFreeWhy!);
    }
  }

  return {
    ...head(f, today, now, true, facts),
    launched: on,
    attribution,
    tiles,
    trend,
    breakdowns: tables,
    intent: {
      creative: { blocked: tables.creative.blocked! },
      keyword: { rows: keywordRows, why: tables.keyword.blocked ?? adsWhy },
    },
    adsSeen: { rows: adsSeenRows, why: adsSeenWhy },
    cohorts: {
      rows: cohortRows,
      why: tablet,
      note: `People whose first finished survey falls in the range, by where it came from; revenue is what they paid within that many days of it (refunds out). A column counts only people that many days on.${
        cohortRows.some((r) => r.source === "Not recorded")
          ? ` Not recorded: their source wasn't recorded (before ${rangeLabel(SOURCE_FROM, SOURCE_FROM)}).`
          : ""
      }`,
    },
    experiments,
    audience: { dims: audience },
    quality: {
      dots: tablet ? [] : dots,
      why:
        tablet ??
        adsWhy ??
        (dots.length ? null : "No Google Ads campaign had clicks in this range."),
      note: qualityNote,
    },
  };
}

/**
 * Google Ads finishers carry the link's campaign (utm_campaign) from this day: the tracking
 * template began passing it on 26 Aug 2026, the first whole day being the 27th.
 */
const CAMPAIGN_FROM = "2026-08-27";

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

const BERLIN_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
});

/** A running test's line under its name, as drawn: "Since 14 Oct 2026 · live". */
function liveSince(day: string, time?: string): string {
  return `Since ${rangeLabel(day, day)}${time ? `, ${time}` : ""} · live`;
}

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
  // A survey bought before it was taken (pay to start, its A3 pin included, a 100% code's EUR 0
  // too) had no arm's price, hero or email question decide its sale, so the tests read without
  // it, as the registry's readouts leave pay to start out (pay_to_start_submission() drops a
  // survey a pending checkout was bound to as well); so does a reader who paid with no report
  // checkout.
  const subsW = (w: { from: string; to: string }) =>
    subsIn(facts, scope, w.from, w.to).filter((x) => !x.pts && !(x.paidAt && !x.checkoutAt));
  const payersOf = (xs: SubFact[]) => xs.filter((x) => x.paidAt).length;
  const revOf = (xs: SubFact[]) => round2(xs.reduce((n, x) => n + x.revenue, 0));

  // #6 · the landing hero: visits per arm are counted, starts per visit decide it. Visits carry
  // no source, device, tier or visitor history: under such a filter the visitor-based figures
  // and the test are blank, rather than filtered starts over every visit.
  {
    const w = win(LANDING_TEST_START_DAY);
    const vB = visitsBlocked(scope, w?.from ?? facts.from);
    const test = "Landing hero";
    const note = liveSince(LANDING_TEST_START_DAY);
    const armsOf = [
      ["white_card", "Question card"],
      ["white_video", "Presenter video"],
    ] as const;
    const rows = armsOf.map(([arm, name]) => {
      const visitors = w && !vB ? visitTotal(facts, w.from, w.to, scope.source, arm) : 0;
      const starts =
        w && !vB && armStartsComplete(w.from, today)
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
            why: !w
              ? "Not running in this range"
              : (vB ?? "Starts per version aren't complete for this range"),
          };
    for (const [i, r] of rows.entries()) {
      arms.push({
        test,
        note,
        arm: r.name,
        control: i === 0,
        visitors: w && !vB ? r.visitors : null,
        startCvr: r.starts === null ? null : ratio(r.starts, r.visitors),
        submissions: w ? r.xs.length : null,
        paymentCvr: w ? ratio(payersOf(r.xs), r.xs.length) : null,
        revPerSub: w ? ratio(revOf(r.xs), r.xs.length) : null,
        revPerVisitor: w && !vB ? ratio(revOf(r.xs), r.visitors) : null,
        metric: "Start CVR",
        ...(i === 0 ? { lift: null, chance: null, confidence: null, why: null } : t),
      });
    }
  }

  // #5 · Pricing 3.0: the arm comes with the report, so it starts at the submission. Its
  // readers are those who finished from the restart (PRICE_TEST_START_AT, 8 Oct 17:23 Berlin),
  // each on the arm they were dealt, as the experiment readouts count them.
  {
    const start = Date.parse(PRICE_TEST_START_AT);
    const w = win(reportingDay(new Date(start)));
    const test = "Pricing 3.0";
    const note = liveSince(reportingDay(new Date(start)), BERLIN_TIME.format(start));
    const rows = (["A3", "B3"] as const).map((arm) => ({
      arm,
      xs: w ? subsW(w).filter((x) => x.priceArm === arm && Date.parse(x.at) >= start) : [],
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
    const note = liveSince(EMAIL_TEST_START_DAY);
    const startsWhy = w ? startsBlocked(scope, w.from, facts.asOf) : null;
    const ok = w !== null && startsSplit(w.from, today) && !startsWhy;
    const rows = (
      [
        ["control", "Today's question"],
        ["anonymous", "Anonymous email"],
      ] as const
    ).map(([arm, name]) => {
      const reached = ok
        ? (startsWhere(facts, scope, (st) => st.cq === arm && st.email, w!.from, w!.to) ?? 0)
        : 0;
      const finished = ok
        ? (startsWhere(
            facts,
            scope,
            (st) => st.cq === arm && st.email && st.finished,
            w!.from,
            w!.to
          ) ?? 0)
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
          why: !w
            ? "Not running in this range"
            : (startsWhy ?? "Starts per arm are kept only 30 days"),
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
 * "Other" already in the data, so there is only ever one). `weights` (each value's estimated
 * visitors) stand in for the values' own counts.
 */
function shareList(
  values: string[],
  order?: string[],
  top = 8,
  weights?: Map<string, number>
): Array<{ label: string; share: number }> {
  const counts = weights ?? new Map<string, number>();
  if (!weights) for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const sum = weights ? [...weights.values()].reduce((a, n) => a + n, 0) : values.length;
  const total = sum || 1;
  if (order)
    return order
      .filter((k) => counts.has(k))
      .map((k) => ({ label: k, share: counts.get(k)! / total }));
  const named = [...counts.keys()]
    .filter((k) => k !== "Other")
    .sort((a, b) => counts.get(b)! - counts.get(a)!);
  const keep = named.length + (counts.has("Other") ? 1 : 0) > top ? named.slice(0, top - 1) : named;
  const other = sum - keep.reduce((n, k) => n + counts.get(k)!, 0);
  return [
    ...keep.map((k) => ({ label: k, share: counts.get(k)! / total })),
    ...(other > 1e-9 ? [{ label: "Other", share: other / total }] : []),
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
  perSource: Map<Source, number> | null,
  visitTotalN: number,
  /** Why every finisher figure is blank under these filters (peopleBlocked), or null. */
  peopleWhy: string | null,
  /** Why the free survey's EUR 1.99 figures are blank (freePreBlocked), or null. */
  preFreeWhy: string | null = null
): AudienceDim[] {
  const out: AudienceDim[] = [];
  const range = rangeLabel(facts.from, facts.to);
  // The pre-unlock rate only over a range it was on sale all through, and in a funnel that sold it.
  const preOk = facts.from >= PRE_ON_SALE_FROM && !preFreeWhy;
  const preNote = preFreeWhy ?? PRE_NOTE;
  const prePaid = (x: SubFact) => preBuysOf(x).length > 0;

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
    // Each group's visitors: PostHog's split of each source's visits applied to that source's
    // own visitors (stratified), never PostHog's mostly-Google split of all its visits.
    const estRaw = perSource ? stratified(rows, perSource, (g) => d.label(g.value)) : null;
    const estAll = estRaw ? [...estRaw.values()].reduce((a, n) => a + n, 0) : 0;
    // The groups by the share shown, largest first (the countries; the rest keep their order):
    // PostHog's own count would order them by its sample, which is mostly Google Ads.
    const shown = shareList(allValues, d.order, 7, estAll ? (estRaw ?? undefined) : undefined);
    const labels = shown.map((v) => v.label);
    const fold = (l: string) => (labels.includes(l) ? l : "Other");
    const bySource = MATRIX_SOURCES.map(({ source, name }) => {
      const mine = expand(rows.filter((g) => classifySource(g) === source));
      const sh = new Map(shareList(mine.map(fold), labels).map((x) => [x.label, x.share]));
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
        const hit = shown.find((v) => v.label !== "Other" && v.label === x.country);
        return x.country ? (hit ? hit.label : "Other") : null;
      }
      return null;
    };
    // The visitors of the groups shown, the rest in "Other".
    const est = estRaw ? new Map<string, number>() : null;
    if (est) for (const [l, n] of estRaw!) est.set(fold(l), (est.get(fold(l)) ?? 0) + n);
    const perf = shown.map((v) => {
      const mine = subs.filter((x) => subValue(x) === v.label);
      const visitors = est ? (est.get(v.label) ?? 0) : null;
      return {
        label: v.label,
        share: v.share,
        // A tablet's visitors and finishers are told apart differently (PostHog calls an iPad a
        // desktop; the survey, from 17 Oct 2026, a tablet), so they aren't divided.
        completeRate:
          d.key === "daypart" || (d.key === "device" && v.label === "Tablet") || !visitors
            ? null
            : mine.length / visitors,
        preRate: preOk && mine.length ? mine.filter(prePaid).length / mine.length : null,
        fullRate: mine.length ? mine.filter((x) => x.full).length / mine.length : null,
        readMs: readMedian(mine),
      };
    });
    out.push({
      key: d.key,
      title: d.title,
      kind: "visit",
      base: `${allValues.length.toLocaleString("en-US")} visits PostHog recorded · ${range} (the site's own visit log counted ${visitTotalN.toLocaleString("en-US")})${est && estAll ? "; all sources: each source's share applied to its own visitors" : ""}`,
      values: shown,
      bySource,
      perf,
      perfNote: [
        d.key === "daypart"
          ? "Complete, unlock and reading rates need the finisher's own local time, which isn't recorded."
          : "Complete rate: finishers in the group over the group's visitors, estimated from each source's visitors and PostHog's split of that source's visits.",
        // Why the pre-unlock column is blank before it went on sale.
        preOk || d.key === "daypart" ? null : preNote,
      ]
        .filter(Boolean)
        .join(" "),
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
    {
      key: "gender",
      title: "Gender",
      // As drawn: Other, "I'd rather not label this" and no answer together.
      value: (x) => {
        const g = genderShort(x.gender);
        return ["Woman", "Man", "Non-binary"].includes(g) ? g : "Other / not shown";
      },
      base: "question 15010",
      order: ["Woman", "Man", "Non-binary", "Other / not shown"],
    },
    {
      key: "age",
      title: "Age",
      value: (x) => x.age ?? "Not shown",
      base: "question 15003",
      order: ["18–24", "25–34", "35–44", "45–54", "55–64", "65+", "Not shown"],
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
        preRate: preOk && mine.length ? mine.filter(prePaid).length / mine.length : null,
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
      perfNote: [
        "Complete rate is blank: only finishers have answered, so the people who left can't be put in a group.",
        preOk ? null : preNote,
      ]
        .filter(Boolean)
        .join(" "),
      blocked: peopleWhy ?? (subs.length ? null : "No survey finishers under these filters."),
    });
  }
  return out;
}

export { CHANNELS, CHANNEL_ROWS, MATRIX_SOURCES, shortDate as _shortDate };
export type { Bucket };
