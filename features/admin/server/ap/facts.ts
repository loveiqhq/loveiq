/**
 * The facts AP-Analytics counts, read once per range from `ap_facts` (migration
 * 20261013120000, which says what each one means), and the rules that sort them: where a
 * person came from and what device they used.
 *
 * Server only: the facts are one row per finished survey. The pages get totals.
 */
import { supabaseFetch } from "@features/admin/server/supabase";
import { reportingDay } from "@shared/time/reporting-day";

import type { ApFilters, DeviceFilter, Source } from "./filters";
import { markVisitors } from "./posthog";

export interface VisitFact {
  day: string;
  arm: string;
  /** The counted visit's own utm_source; never used to split visits (see the migration). */
  src: string | null;
  n: number;
}

interface Tagged {
  src: string | null;
  med: string | null;
  /** A Google Ads click id (gclid, gbraid or wbraid) in the tracker. */
  ads: boolean;
  /** The referring site's hostname (from SURVEY_TRACKING_FROM). */
  ref?: string | null;
  /** Meta's click id (fbclid) in the tracker (from SURVEY_TRACKING_FROM). */
  fb?: boolean;
}

export interface StartFact extends Tagged {
  day: string;
  /** False when neither a draft nor a submission holds the session's tracker. */
  known: boolean;
  arm: string | null;
  device: string | null;
  finished: boolean;
  n: number;
}

export interface SubFact extends Tagged {
  id: number;
  day: string;
  at: string;
  startAt: string | null;
  durationMs: number | null;
  arm: string | null;
  device: string | null;
  tier: string | null;
  priceArm: string | null;
  country: string | null;
  gender: string | null;
  relationship: string | null;
  age: string | null;
  openedAt: string | null;
  /** Report visits: sessions starting 30+ minutes after the latest end of the ones before. */
  visits: number;
  returnedAt: string | null;
  /** Reading time over the closed sessions (end recorded, under 4 hours), each up to 30 minutes. */
  readMs: number;
  closed: number;
  paywallAt: string | null;
  /** First click on a paywall button (paywall_initiated). */
  clickedAt: string | null;
  checkoutAt: string | null;
  paidAt: string | null;
  sales: number;
  revenue: number;
  gifted: boolean;
  /** The first paid plan. */
  plan: string | null;
  /** Bought Full or Full All, first or as an upgrade later. */
  full: boolean;
  shared: boolean;
  /** When the first share, vote and invite happened (for age-matched comparisons). */
  sharedAt: string | null;
  votes: number;
  votedAt: string | null;
  invited: boolean;
  invitedAt: string | null;
  /** The furthest pre-report wizard slide reached, 1-5; null when no advance was recorded. */
  wizardSlide: number | null;
  /** PostHog's id of the visit the survey was finished in. */
  ph: string | null;
  /** New or returning (markVisitors); unset until the visitor filter asks. */
  visitorNew?: boolean | null;
}

export interface MoneyFact extends Tagged {
  day: string;
  sid: number;
  amount: number;
  plan: string | null;
  arm: string | null;
  device: string | null;
  tier: string | null;
  /** The finisher's visit, as on SubFact. */
  ph: string | null;
  visitorNew?: boolean | null;
}

/** The plans that unlock the full report. */
export const FULL_PLANS: ReadonlySet<string> = new Set(["full_report", "all_reports"]);

export interface IntroFact {
  day: string;
  step: string;
  n: number;
  /** Per visitor who reached the next step that day: the ms until they did. */
  ms: number[];
  /** Slides 1 to 3: visitors who went on to question 1 without the next slide (a skip). */
  skipped: number;
  /**
   * Visitors who reached the next card that day (slide 4's is the consent, question 1 before
   * the consent recorded itself). Null from a reader without it.
   */
  wentOn: number | null;
  /** Visitors whose furthest card that day was this one: they left here. */
  left: number | null;
  /** The consent's viewers who saw no intro that day (the landing card's starters). */
  direct: number;
}

export interface QuoteFact extends Tagged {
  plan: string | null;
  priceArm: string | null;
  price: number | null;
  device: string | null;
  tier: string | null;
  quoted: number;
  checkouts: number;
  sales: number;
  revenue: number;
}

export interface Facts {
  from: string;
  to: string;
  /** The day the facts were read: which unfinished drafts were still kept (draftsKeptFrom). */
  asOf: string;
  visits: VisitFact[];
  starts: StartFact[];
  subs: SubFact[];
  money: MoneyFact[];
  intro: IntroFact[];
  invites: Array<{ day: string; n: number }>;
  quotes: QuoteFact[];
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const rows = (v: unknown, key: string): Record<string, unknown>[] => {
  if (!Array.isArray(v)) throw new Error(`ap_facts: ${key} is missing`);
  return v as Record<string, unknown>[];
};

/** The function's JSON, checked: a part that is missing stops the page, it never reads as zero. */
export function parseFacts(
  raw: unknown,
  from: string,
  to: string,
  asOf = reportingDay(new Date())
): Facts {
  // PostgREST answers the JSON itself; a SQL client wraps it in a row of one column.
  const j = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | undefined;
  const only = j && typeof j === "object" && !("visits" in j) ? Object.values(j) : [];
  const o = (only.length === 1 && only[0] && typeof only[0] === "object" ? only[0] : j) as
    Record<string, unknown> | undefined;
  if (!o || typeof o !== "object") throw new Error("ap_facts returned nothing");
  const tagged = (r: Record<string, unknown>) => ({
    src: str(r.src),
    med: str(r.med),
    ads: r.ads === true,
    ref: str(r.ref),
    fb: r.fb === true,
  });
  return {
    from,
    to,
    asOf,
    visits: rows(o.visits, "visits").map((r) => ({
      day: String(r.day),
      arm: str(r.arm) ?? "unknown",
      src: str(r.src),
      n: num(r.n),
    })),
    starts: rows(o.starts, "starts").map((r) => ({
      ...tagged(r),
      day: String(r.day),
      known: r.known === true,
      arm: str(r.arm),
      device: str(r.device),
      finished: r.finished === true,
      n: num(r.n),
    })),
    subs: rows(o.subs, "subs").map((r) => ({
      ...tagged(r),
      id: num(r.id),
      day: String(r.day),
      at: String(r.at),
      startAt: str(r.startAt),
      durationMs: numOrNull(r.durationMs),
      arm: str(r.arm),
      device: str(r.device),
      tier: str(r.tier),
      priceArm: str(r.priceArm),
      country: str(r.country),
      gender: str(r.gender),
      relationship: str(r.relationship),
      age: str(r.age),
      openedAt: str(r.openedAt),
      visits: num(r.visits),
      returnedAt: str(r.returnedAt),
      readMs: num(r.readMs),
      closed: num(r.closed),
      paywallAt: str(r.paywallAt),
      clickedAt: str(r.clickedAt),
      checkoutAt: str(r.checkoutAt),
      paidAt: str(r.paidAt),
      sales: num(r.sales),
      revenue: num(r.revenue),
      gifted: r.gifted === true,
      plan: str(r.plan),
      // An ap_facts from before the flag: the first plan, as it was read then.
      full: typeof r.full === "boolean" ? r.full : FULL_PLANS.has(str(r.plan) ?? ""),
      shared: r.shared === true,
      sharedAt: str(r.sharedAt),
      votes: num(r.votes),
      votedAt: str(r.votedAt),
      invited: r.invited === true,
      invitedAt: str(r.invitedAt),
      wizardSlide: numOrNull(r.wizardSlide),
      ph: str(r.ph),
    })),
    money: rows(o.money, "money").map((r) => ({
      ...tagged(r),
      day: String(r.day),
      sid: num(r.sid),
      amount: num(r.amount),
      plan: str(r.plan),
      arm: str(r.arm),
      device: str(r.device),
      tier: str(r.tier),
      ph: str(r.ph),
    })),
    intro: rows(o.intro, "intro").map((r) => ({
      day: String(r.day),
      step: String(r.step),
      n: num(r.n),
      // Absent until the function carries them: no time and no skip, never a zero time.
      ms: Array.isArray(r.ms) ? r.ms.map(num) : [],
      skipped: num(r.skipped),
      wentOn: numOrNull(r.wentOn),
      left: numOrNull(r.left),
      direct: num(r.direct),
    })),
    invites: rows(o.invites, "invites").map((r) => ({ day: String(r.day), n: num(r.n) })),
    quotes: rows(o.quotes, "quotes").map((r) => ({
      ...tagged(r),
      plan: str(r.plan),
      priceArm: str(r.priceArm),
      price: numOrNull(r.price),
      device: str(r.device),
      tier: str(r.tier),
      quoted: num(r.quoted),
      checkouts: num(r.checkouts),
      sales: num(r.sales),
      revenue: num(r.revenue),
    })),
  };
}

/** Our own test traffic: probes and verification runs tag themselves. */
const TEST_SOURCES = new Set([
  "prod-verification",
  "prod-e2e-check",
  "staging-e2e-check",
  "verify",
]);
const AI_SOURCES = new Set([
  "chatgpt.com",
  "chatgpt",
  "chat.openai.com",
  "openai",
  "perplexity",
  "perplexity.ai",
  "gemini",
  "gemini.google.com",
  "copilot",
  "copilot.microsoft.com",
  "claude.ai",
]);
const SOCIAL_SOURCES = new Set([
  "ig",
  "instagram",
  "facebook",
  "fb",
  "meta",
  "tiktok",
  "linkedin",
  "x",
  "twitter",
  "t.co",
  "pinterest",
  "reddit",
  "youtube",
  "threads",
]);
const PAID_MEDIA = new Set(["cpc", "ppc", "paid", "ads"]);
/** Meta's names for itself, its {{site_source_name}} values (fb, ig, msg, an) among them. */
const META_SOURCES = new Set([
  "facebook",
  "instagram",
  "meta",
  "fb",
  "ig",
  "messenger",
  "msg",
  "an",
  "audience_network",
  "audiencenetwork",
  "audience-network",
]);
const META_PAID_MEDIA = new Set([...PAID_MEDIA, "paid_social", "paidsocial", "cpm"]);
const SEARCH_SOURCES = new Set([
  "google",
  "bing",
  "duckduckgo",
  "yahoo",
  "ecosia",
  "yandex",
  "brave",
]);
/**
 * Search engines as a referrer: Google in every country and its Android app, Bing,
 * DuckDuckGo, Yahoo search, Ecosia, Yandex and Brave Search. Gmail on the web opens links
 * through google.com, so an untagged click in an email read there looks like organic search.
 */
const SEARCH_HOSTS = [
  /^(www\.)?google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/,
  /^com\.google\.android\.googlequicksearchbox$/,
  /(^|\.)(bing\.com|duckduckgo\.com|ecosia\.org|ya\.ru|yandex\.[a-z.]+)$/,
  /(^|\.)search\.yahoo\.(com|co\.jp|[a-z]{2})$/,
  /^search\.brave\.com$/,
];

export type SourceClass = Source | "unknown" | "test";

/**
 * Where a person came from, by the tracker their first page set, in this order: our own
 * probes ("test", never counted); Google Ads (a click id, or google with a paid medium); Meta
 * Ads (a Meta source with a paid medium: Meta's click id alone is not one, as Meta adds it to
 * ordinary clicks too, and reads as Social); organic search (no click id, and a search engine
 * tagged organic, or no tags and a search engine as the referrer); then the rest.
 */
export function classifySource(t: Tagged, known = true): SourceClass {
  if (!known) return "unknown";
  const s = (t.src ?? "").trim().toLowerCase();
  const m = (t.med ?? "").trim().toLowerCase();
  const ref = (t.ref ?? "").trim().toLowerCase();
  if (m === "probe" || TEST_SOURCES.has(s)) return "test";
  if (t.ads || (s === "google" && PAID_MEDIA.has(m))) return "google_ads";
  if (META_SOURCES.has(s) && META_PAID_MEDIA.has(m)) return "meta_ads";
  if (
    !t.fb &&
    (m === "organic" ? SEARCH_SOURCES.has(s) : !s && !m && SEARCH_HOSTS.some((re) => re.test(ref)))
  ) {
    return "organic_search";
  }
  if (AI_SOURCES.has(s)) return "ai";
  if (
    ["email", "newsletter", "nurture", "resend"].includes(s) ||
    ["email", "nurture", "newsletter"].includes(m)
  ) {
    return "email";
  }
  if (SOCIAL_SOURCES.has(s) || m === "social" || m === "paid_social" || t.fb) return "social";
  if (!s && !m) return "direct";
  return "referral";
}

/**
 * Mobile, desktop or tablet, from the device the pricing code or the survey recorded. Only the
 * AP readers say "Tablet" (from the survey's steps, SURVEY_TRACKING_FROM on).
 */
export function deviceClass(device: string | null): Exclude<DeviceFilter, "all"> | null {
  if (device === "iOS" || device === "Android") return "phone";
  if (device === "Desktop") return "computer";
  if (device === "Tablet") return "tablet";
  return null;
}

const cache = new Map<string, { at: number; facts: Promise<Facts> }>();
/** Five minutes: the pages re-read on every filter change, and the data moves slowly. */
const CACHE_MS = 5 * 60_000;

/** The facts for a range, from the database (cached for five minutes per range). */
export function fetchFacts(from: string, to: string, now = Date.now()): Promise<Facts> {
  const key = `${from}|${to}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) return hit.facts;
  const facts = (async () => {
    const res = await supabaseFetch("/rest/v1/rpc/ap_facts", {
      method: "POST",
      body: JSON.stringify({ p_from: from, p_to: to }),
      timeoutMs: 45_000,
    });
    if (!res.ok) throw new Error(`ap_facts failed (${res.status})`);
    return parseFacts(await res.json(), from, to, reportingDay(new Date(now)));
  })();
  cache.set(key, { at: now, facts });
  // A failed read must not stay cached for five minutes.
  facts.catch(() => cache.delete(key));
  if (cache.size > 50) cache.delete(cache.keys().next().value!);
  return facts;
}

/** The facts, with every finisher marked new or returning while the visitor filter is on. */
export async function fetchFactsFor(
  from: string,
  to: string,
  f: Pick<ApFilters, "visitor">
): Promise<Facts> {
  const facts = await fetchFacts(from, to);
  if (f.visitor !== "all") {
    // A payment's finisher started the survey when their submission says.
    const startOf = new Map(facts.subs.map((s) => [s.id, s.startAt]));
    await markVisitors(facts.subs, (s) => s.startAt);
    await markVisitors(facts.money, (m) => startOf.get(m.sid));
  }
  return facts;
}

/** For tests. */
export function clearFactsCache(): void {
  cache.clear();
}
