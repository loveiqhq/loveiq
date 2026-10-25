/**
 * The facts AP-Analytics counts, read once per range from `ap_facts` (migration
 * 20261013120000, which says what each one means), and the rules that sort them: where a
 * person came from and what device they used.
 *
 * Server only: the facts are one row per finished survey. The pages get totals.
 */
import { supabaseFetch } from "@features/admin/server/supabase";
import { PAY_TO_START_JOURNEY } from "@features/pay-to-start/logic/journey";
import { INITIAL_UNLOCK_PLAN } from "@features/report/logic/initialUnlock";
import { reportingDay } from "@shared/time/reporting-day";

import type { ApFilters, DeviceFilter, Source } from "./filters";

import { markVisitors } from "./posthog";
import { AI_HOST, EMAIL_HOST, SEARCH_HOST, SOCIAL_HOST } from "./referrers";

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
  /**
   * False when the source can't be known: untagged, before the tracker kept the source
   * (SOURCE_FROM). Unknown, never Direct. Absent from a reader without it: known.
   */
  srcKnown?: boolean;
  /**
   * Pay to start's: the survey was claimed by a completed purchase made before it (as the Pay to
   * start page reads it), so the Funnel filter's "Free survey" leaves it and its money out. A
   * start is known as one only by its finished survey: an unfinished buyer's run is the free
   * survey's.
   */
  pts?: boolean;
}

/** What the ad links tag besides the source: the campaign, the keyword and the network. */
interface AdTags {
  /** utm_campaign, as the Google Ads tracking template sets it ("performance_max"). */
  camp: string | null;
  /** utm_term: the keyword the search ad matched (Google Search only). */
  term: string | null;
}

export interface StartFact extends Tagged, AdTags {
  day: string;
  /** False when neither a draft nor a submission holds the session's tracker. */
  known: boolean;
  arm: string | null;
  device: string | null;
  finished: boolean;
  /** The email test's arm (contact_question_arm), stamped from 8 Oct 2026. */
  cq: string | null;
  /** The run reached the email question (a step on it, an email answer, or it finished). */
  email: boolean;
  n: number;
}

/** A sale of one of the person's reports (amount over 0, not a test), any time. */
export interface UserPay {
  at: string;
  amount: number;
  plan: string | null;
  refunded: boolean;
  /** On a survey bought before it was taken (pay to start); out of "Free survey". */
  pts?: boolean;
}

export interface SubFact extends Tagged, AdTags {
  id: number;
  day: string;
  at: string;
  startAt: string | null;
  durationMs: number | null;
  arm: string | null;
  device: string | null;
  tier: string | null;
  /** The price arm the reader was dealt: their first quote's, before any re-sync. */
  priceArm: string | null;
  /** When their first price quote was made (the report opened); null without one. */
  quotedAt: string | null;
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
  /**
   * Each report session, oldest first: [start (epoch seconds), its counted ms, end recorded
   * 1/0, began a visit 1/0]. What visits, readMs and closed add up from, so an earlier period
   * can be cut at the same age. Null from a reader without it.
   */
  sessions: Array<[number, number, number, number]> | null;
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
  /** Bought a full unlock (Full, Full All or Core), first or as an upgrade later. */
  full: boolean;
  /** Of their paid sales, the full unlocks and those sales' revenue. */
  fullSales: number;
  fullRevenue: number;
  /** Each paid sale, oldest first: [time (epoch seconds), amount, plan]. Null from an older reader. */
  pays: Array<[number, number, string | null]> | null;
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
  /** Google Ads' network: "g" Search, "x" Performance Max (cross-network). */
  net: string | null;
  /** The email test's arm (contact_question_arm). */
  cq: string | null;
  /** The report's archetype (scoring_result). */
  archetype: string | null;
  /** The person (an internal id, never shown); null for a submission without one. */
  uid: number | null;
  /** Their first finished survey, all time. */
  userFirstAt: string | null;
  /** Surveys they finished, all time. */
  userSubs: number;
  /** Every sale of their reports, all time, oldest first. */
  userPays: UserPay[];
}

export interface MoneyFact extends Tagged, AdTags {
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
  uid: number | null;
  /** How they paid: "link" (Stripe Link) or the card's brand ("visa"); null for a free unlock. */
  method: string | null;
  net: string | null;
  /** The price arm stamped on the payment (A, B, A3, B3), or null. */
  priceArm: string | null;
  /** The journey the purchase was made in ("pay_to_start" for the offer bought first), or null. */
  journey?: string | null;
  /** A full unlock bought on a report whose EUR 1.99 Core Archetype was paid before it. */
  upgrade?: boolean;
}

/**
 * A paid checkout opened in the range (a Stripe Checkout session; free unlocks are left out),
 * grouped: it reached the payment page; `attempted`, a payment was tried (paid, or a payment
 * method or a failure recorded); `status` "succeeded" is paid.
 */
export interface CheckoutFact extends Tagged {
  /** The day the payment page was reached (an abandoned one is written a day later). */
  day: string;
  /** The finisher whose report it unlocks, and the visit they finished in (as on SubFact). */
  sid: number | null;
  ph: string | null;
  visitorNew?: boolean | null;
  status: string;
  attempted: boolean;
  plan: string | null;
  /** The price arm stamped on the checkout (A, B, A3, B3), or null. */
  priceArm: string | null;
  arm: string | null;
  device: string | null;
  tier: string | null;
  n: number;
}

/**
 * The plans that unlock a full report (Marcus's "full unlock"): Full, Full All, and Core (the
 * top three archetypes in full, retired). Essentials (retired) had no real sale.
 */
export const FULL_PLANS: ReadonlySet<string> = new Set(["full_report", "all_reports", "core"]);

/**
 * The plans that pre-unlock a report (Marcus's "Initial plan", EUR 1.99): the initial unlock
 * (features/report/logic/initialUnlock.ts), on sale on /sexual-archetype/initial (PRE_ON_SALE_FROM).
 * With none here, every pre-unlock figure says it is not on sale.
 */
export const PRE_PLANS: ReadonlySet<string> = new Set<string>([INITIAL_UNLOCK_PLAN]);

/**
 * The first whole day the pre-unlock was on sale on the live site: pay to start's EUR 1.99 page
 * went live 22 Oct 2026 18:48 Berlin (#631; the report's own gate is still off). Before it nobody
 * could pre-unlock, so a pre-unlock rate over earlier days is blank, never 0%.
 */
export const PRE_ON_SALE_FROM = "2026-10-23";

/**
 * The day pay to start went live on the site (22 Oct 2026 18:48 Berlin, #631): its pages sell
 * the report in full and the EUR 1.99 Core Archetype before the survey. A range ending earlier
 * has none of its payments to show, so its rows are blank, never 0.
 */
export const PAY_TO_START_FROM = "2026-10-22";

/**
 * A finisher's paid pre-unlocks, from their sales ([time, amount, plan]): the EUR 1.99 from
 * the report's gate or from pay to start. E07's day-4 gift is a EUR 0 row and never one.
 */
export function preBuysOf(s: Pick<SubFact, "pays">): Array<[number, number, string | null]> {
  return (s.pays ?? []).filter(([, amount, plan]) => amount > 0 && PRE_PLANS.has(plan ?? ""));
}

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
  /** Of those, saw the paywall (paywall_reached_at). */
  paywall: number;
  checkouts: number;
  sales: number;
  revenue: number;
}

/** A sale of the range that was refunded, in full or in part, whenever the refund came. */
export interface RefundFact {
  day: string;
  sid: number;
  plan: string | null;
  amount: number;
  refund: number;
  /** In full: the payment left the sales (status 'refunded'). */
  full: boolean;
  /** As on MoneyFact. */
  journey?: string | null;
  upgrade?: boolean;
  pts?: boolean;
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
  /** Absent from a reader older than 21 Oct 2026: refunds were not read, never "none". */
  refunds?: RefundFact[];
  checkouts: CheckoutFact[];
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
    srcKnown: r.srcKnown !== false,
    pts: r.pts === true,
  });
  const adTags = (r: Record<string, unknown>) => ({ camp: str(r.camp), term: str(r.term) });
  const pays = (v: unknown): UserPay[] =>
    Array.isArray(v)
      ? (v as Record<string, unknown>[]).map((p) => ({
          at: String(p.at),
          amount: num(p.amount),
          plan: str(p.plan),
          refunded: p.refunded === true,
          pts: p.pts === true,
        }))
      : [];
  return {
    from,
    to,
    asOf,
    // The pay-to-start pages' visits are their own funnel's (its AP page reads them): those
    // visitors can't start the free survey, so every page here leaves them out, as the
    // digests do, and its starts per visit are not diluted once the campaigns send traffic.
    visits: rows(o.visits, "visits")
      .map((r) => ({
        day: String(r.day),
        arm: str(r.arm) ?? "unknown",
        src: str(r.src),
        n: num(r.n),
      }))
      .filter((v) => v.arm !== PAY_TO_START_JOURNEY),
    starts: rows(o.starts, "starts").map((r) => ({
      ...tagged(r),
      ...adTags(r),
      day: String(r.day),
      known: r.known === true,
      arm: str(r.arm),
      device: str(r.device),
      finished: r.finished === true,
      cq: str(r.cq),
      email: r.email === true,
      n: num(r.n),
    })),
    subs: rows(o.subs, "subs").map((r) => ({
      ...tagged(r),
      ...adTags(r),
      id: num(r.id),
      day: String(r.day),
      at: String(r.at),
      startAt: str(r.startAt),
      durationMs: numOrNull(r.durationMs),
      arm: str(r.arm),
      device: str(r.device),
      tier: str(r.tier),
      priceArm: str(r.priceArm),
      quotedAt: str(r.quotedAt),
      country: str(r.country),
      gender: str(r.gender),
      relationship: str(r.relationship),
      age: str(r.age),
      openedAt: str(r.openedAt),
      visits: num(r.visits),
      returnedAt: str(r.returnedAt),
      readMs: num(r.readMs),
      closed: num(r.closed),
      sessions: Array.isArray(r.sessions)
        ? (r.sessions as unknown[]).map((x) => {
            const a = Array.isArray(x) ? x : [];
            return [num(a[0]), num(a[1]), num(a[2]), num(a[3])] as [number, number, number, number];
          })
        : null,
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
      // A reader of the facts without them: its first plan, when that was a full unlock.
      fullSales:
        r.fullSales !== undefined
          ? num(r.fullSales)
          : FULL_PLANS.has(str(r.plan) ?? "")
            ? num(r.sales)
            : 0,
      pays: Array.isArray(r.pays)
        ? (r.pays as unknown[]).map((x) => {
            const a = Array.isArray(x) ? x : [];
            return [num(a[0]), num(a[1]), str(a[2])] as [number, number, string | null];
          })
        : null,
      fullRevenue:
        r.fullRevenue !== undefined
          ? num(r.fullRevenue)
          : FULL_PLANS.has(str(r.plan) ?? "")
            ? num(r.revenue)
            : 0,
      shared: r.shared === true,
      sharedAt: str(r.sharedAt),
      votes: num(r.votes),
      votedAt: str(r.votedAt),
      invited: r.invited === true,
      invitedAt: str(r.invitedAt),
      wizardSlide: numOrNull(r.wizardSlide),
      ph: str(r.ph),
      net: str(r.net),
      cq: str(r.cq),
      archetype: str(r.archetype),
      uid: numOrNull(r.uid),
      userFirstAt: str(r.userFirstAt),
      userSubs: num(r.userSubs),
      userPays: pays(r.userPays),
    })),
    money: rows(o.money, "money").map((r) => ({
      ...tagged(r),
      ...adTags(r),
      day: String(r.day),
      sid: num(r.sid),
      amount: num(r.amount),
      plan: str(r.plan),
      arm: str(r.arm),
      device: str(r.device),
      tier: str(r.tier),
      ph: str(r.ph),
      uid: numOrNull(r.uid),
      method: str(r.method),
      net: str(r.net),
      priceArm: str(r.priceArm),
      journey: str(r.journey),
      upgrade: r.upgrade === true,
    })),
    ...(o.refunds === undefined
      ? {}
      : {
          refunds: rows(o.refunds, "refunds").map((r) => ({
            day: String(r.day),
            sid: num(r.sid),
            plan: str(r.plan),
            amount: num(r.amount),
            refund: num(r.refund),
            full: r.full === true,
            journey: str(r.journey),
            upgrade: r.upgrade === true,
            pts: r.pts === true,
          })),
        }),
    checkouts: rows(o.checkouts, "checkouts").map((r) => ({
      ...tagged(r),
      day: String(r.day),
      sid: numOrNull(r.sid),
      ph: str(r.ph),
      status: String(r.status),
      attempted: r.attempted === true,
      plan: str(r.plan),
      priceArm: str(r.priceArm),
      arm: str(r.arm),
      device: str(r.device),
      tier: str(r.tier),
      n: num(r.n),
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
      paywall: num(r.paywall),
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
  "copilot.com",
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
const SEARCH_RE = new RegExp(SEARCH_HOST);
const AI_RE = new RegExp(AI_HOST);
const EMAIL_RE = new RegExp(EMAIL_HOST);
const SOCIAL_RE = new RegExp(SOCIAL_HOST);

export type SourceClass = Source | "unknown" | "test";

/**
 * Where a person came from, by the tracker their first page set, in this order: our own
 * probes ("test", never counted); Google Ads (a click id, or google with a paid medium); Meta
 * Ads (a Meta source with a paid medium: Meta's click id alone is not one, as Meta adds it to
 * ordinary clicks too, and reads as Social); organic search (no click id, and a search engine
 * tagged organic, or no tags and a search engine as the referrer); then the rest. A visit with
 * no tags at all is sorted by its referring site (referrers.ts): an AI assistant, an email app
 * or webmail, a social site; another site is Referral, and only no referrer is Direct.
 */
export function classifySource(t: Tagged, known = true): SourceClass {
  if (!known || t.srcKnown === false) return "unknown";
  const s = (t.src ?? "").trim().toLowerCase();
  const m = (t.med ?? "").trim().toLowerCase();
  if (m === "probe" || TEST_SOURCES.has(s)) return "test";
  if (t.ads || (s === "google" && PAID_MEDIA.has(m))) return "google_ads";
  if (META_SOURCES.has(s) && META_PAID_MEDIA.has(m)) return "meta_ads";
  // The referrer counts only on a visit with no tags and no Meta click id, as PostHog's reader
  // passes it.
  const ref = !s && !m && !t.fb ? (t.ref ?? "").trim().toLowerCase() : "";
  if (!t.fb && (m === "organic" ? SEARCH_SOURCES.has(s) : SEARCH_RE.test(ref))) {
    return "organic_search";
  }
  if (AI_SOURCES.has(s) || AI_RE.test(ref)) return "ai";
  if (
    ["email", "newsletter", "nurture", "resend"].includes(s) ||
    ["email", "nurture", "newsletter"].includes(m) ||
    EMAIL_RE.test(ref)
  ) {
    return "email";
  }
  if (SOCIAL_SOURCES.has(s) || m === "social" || m === "paid_social" || t.fb || SOCIAL_RE.test(ref))
    return "social";
  if (!s && !m) return ref ? "referral" : "direct";
  return "referral";
}

/**
 * A visit's source as far as the visit log can tell: it keeps only the link's utm_source, and
 * "google" there is Google Ads' tracking template (its visits match Google's clicks from
 * SOURCE_FROM). Null for an untagged visit, which could be from any untagged source.
 */
export function visitSource(src: string | null): SourceClass | null {
  const s = (src ?? "").trim().toLowerCase();
  if (!s) return null;
  return classifySource({ src: s, med: s === "google" ? "cpc" : null, ads: false });
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
    await markVisitors(facts.checkouts, (c) => (c.sid === null ? null : startOf.get(c.sid)));
  }
  return facts;
}

/** For tests. */
export function clearFactsCache(): void {
  cache.clear();
}
