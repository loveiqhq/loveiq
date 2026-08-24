/**
 * One person's journey, assembled server-side.
 *
 * Answers "where did this person come from, which experiments were they in, and
 * what did they do" for a single submission, so the Slack notifications can say
 * something useful instead of a name and a question count.
 *
 * PRIVACY BOUNDARY — this module must never return survey answer content or
 * scoring detail. The survey collects Article 9 special-category data (sexual
 * health), and its output is bound for Slack, a US processor whose registered
 * data categories are recorded in docs/compliance/ROPA.md. Journey means pages,
 * arms, timings and money. This module carries NO archetype at all — the purchase
 * ping already sources the archetype name itself, and the privacy test asserts it
 * never arrives through here.
 *
 * Reliability note: `report_price_quote` and `survey_submission` are written
 * server-side with no consent gate, so their fields are always present.
 * `analytics_event` is consent-gated at the client, so its milestones are
 * best-effort and a missing one means "not recorded", not "did not happen".
 */

import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";
import { classifyTraffic, readStampedArms, type TrafficInfo } from "./traffic";

export interface JourneyArms {
  /** Raw stored values — "white" | "white_prev" | "control" | null etc. Label via labels.ts. */
  landing: string | null;
  survey: string | null;
  pricing: string | null;
  paywall: string | null;
}

export interface SubmissionJourney {
  submissionId: number;
  firstName: string | null;
  /** Already masked (a***@example.com). The raw address never leaves this module. */
  emailMasked: string | null;
  arms: JourneyArms;
  traffic: TrafficInfo;
  /** Frozen on the quote at pricing time — "Desktop" | "iOS" | "Android". */
  device: string | null;
  /**
   * Pricing country tier, NOT an IP geolocation: it is derived from the visitor's
   * own answer to the country question (falling back to their profile), so it is
   * self-reported.
   */
  /**
   * The visitor's own country answer (falling back to their profile). This is
   * what a reader actually wants — `countryTier` is a pricing band derived from
   * it, and showing only the band put "tier_1" on screen where "Germany" was
   * already known.
   */
  country: string | null;
  countryTier: string | null;
  timings: {
    /** Client-measured survey wall time. */
    durationMs: number | null;
    startedAt: string | null;
    completedAt: string | null;
    /** completedAt → purchasedAt, when they bought. */
    msToPurchase: number | null;
    /** checkoutStartedAt → purchasedAt: how long they hesitated on the Stripe page. */
    msCheckoutHesitation: number | null;
  };
  milestones: {
    reportViewedAt: string | null;
    paywallInitiatedAt: string | null;
    checkoutStartedAt: string | null;
    purchasedAt: string | null;
  };
  money: {
    plan: string | null;
    /** The price the reader was shown for the plan they bought, in major units. */
    amount: number | null;
    currency: string;
  } | null;
  /** How many plan quotes exist — a rough proxy for paywall exposure. */
  quoteCount: number;
}

interface SubmissionRow {
  id: number;
  session_id: string | null;
  start_date_time: string | null;
  created_date_time: string | null;
  status: string | null;
  duration_ms: number | null;
  utm_tracker: string | null;
  app_user: {
    email: string | null;
    first_name: string | null;
    user_profile: { location_primary: string | null } | null;
  } | null;
}

interface QuoteRow {
  plan: string | null;
  experiment_group: string | null;
  base_price_bucket: string | null;
  forced_paywall_arm: string | null;
  device_type: string | null;
  country_tier: string | null;
  current_price: number | string | null;
  currency: string | null;
  purchased_at: string | null;
  checkout_started_at: string | null;
}

interface AnalyticsRow {
  event_type: string;
  event_time: string;
}

/** Local copy of the masking rule so the raw address is never returned to callers. */
function mask(email: string | null | undefined): string | null {
  if (!email?.trim()) return null;
  return email.trim().replace(/^(.).+(@.+)$/, "$1***$2");
}

function toNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function msBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const diff = b - a;
  // A negative interval means clock skew or an out-of-order write; report nothing
  // rather than a nonsense "-3 min".
  return diff >= 0 ? diff : null;
}

async function fetchJson<T>(path: string, what: string): Promise<T[]> {
  try {
    const res = await supabaseFetch(path);
    if (!res.ok) {
      // Deliberately warn, not error: logger.error mirrors to the ops Slack
      // channel in production, and a journey lookup failing is not an incident —
      // the notification just carries less detail.
      logger.warn({ status: res.status, what }, "journey: source fetch failed");
      return [];
    }
    return (await res.json()) as T[];
  } catch (err) {
    logger.warn({ err, what }, "journey: source fetch threw");
    return [];
  }
}

/**
 * Assemble the journey. Never throws and never rejects — every source degrades to
 * absent, because a Slack notification must still go out if one table is slow.
 */
export async function buildSubmissionJourney(
  submissionId: number
): Promise<SubmissionJourney | null> {
  // Wave 1: everything keyed directly off the submission id, concurrently. The
  // existing admin timeline route does 13 of these sequentially; don't copy that.
  const [subs, quotes, events] = await Promise.all([
    fetchJson<SubmissionRow>(
      `/rest/v1/survey_submission?id=eq.${submissionId}` +
        `&select=id,session_id,start_date_time,created_date_time,status,duration_ms,utm_tracker,` +
        `app_user!fk_survey_submission_user(email,first_name,user_profile(location_primary))`,
      "survey_submission"
    ),
    fetchJson<QuoteRow>(
      `/rest/v1/report_price_quote?survey_submission_id=eq.${submissionId}` +
        `&select=plan,experiment_group,base_price_bucket,forced_paywall_arm,device_type,country_tier,` +
        `current_price,currency,purchased_at,checkout_started_at&order=created_date_time.asc`,
      "report_price_quote"
    ),
    fetchJson<AnalyticsRow>(
      `/rest/v1/analytics_event?survey_submission_id=eq.${submissionId}` +
        `&event_type=in.(report_viewed,paywall_initiated)` +
        `&select=event_type,event_time&order=event_time.asc`,
      "analytics_event"
    ),
  ]);

  const sub = subs[0];
  if (!sub) return null;

  const stamped = readStampedArms(sub.utm_tracker);

  // Any quote carries the person's pricing arm and their resolved device/country —
  // they are frozen per reader, not per plan. Prefer a purchased quote so the
  // money fields describe what they actually bought.
  const purchased = quotes.find((q) => q.purchased_at) ?? null;
  const anyQuote = purchased ?? quotes[0] ?? null;

  const firstOf = (type: string) => events.find((e) => e.event_type === type)?.event_time ?? null;
  const checkoutStartedAt =
    purchased?.checkout_started_at ??
    quotes.find((q) => q.checkout_started_at)?.checkout_started_at ??
    null;
  const purchasedAt = purchased?.purchased_at ?? null;

  return {
    submissionId,
    firstName: sub.app_user?.first_name?.trim() || null,
    emailMasked: mask(sub.app_user?.email),
    arms: {
      landing: stamped.landing,
      survey: stamped.survey,
      // experiment_group is the arm; base_price_bucket follows it since Pricing 2.0
      // but is the better fallback for legacy rows than nothing.
      pricing: anyQuote?.experiment_group ?? anyQuote?.base_price_bucket ?? null,
      paywall: anyQuote?.forced_paywall_arm ?? null,
    },
    traffic: classifyTraffic(sub.utm_tracker),
    device: anyQuote?.device_type ?? null,
    country: sub.app_user?.user_profile?.location_primary?.trim() || null,
    countryTier: anyQuote?.country_tier ?? null,
    timings: {
      durationMs: toNumber(sub.duration_ms),
      startedAt: sub.start_date_time,
      completedAt: sub.created_date_time,
      msToPurchase: msBetween(sub.created_date_time, purchasedAt),
      msCheckoutHesitation: msBetween(checkoutStartedAt, purchasedAt),
    },
    milestones: {
      reportViewedAt: firstOf("report_viewed"),
      paywallInitiatedAt: firstOf("paywall_initiated"),
      checkoutStartedAt,
      purchasedAt,
    },
    money: purchased
      ? {
          plan: purchased.plan,
          amount: toNumber(purchased.current_price),
          currency: (purchased.currency ?? "EUR").toUpperCase(),
        }
      : null,
    quoteCount: quotes.length,
  };
}

/**
 * Build a journey for the PURCHASE notification without touching the database.
 *
 * The Stripe webhook already holds every arm as a frozen snapshot of what the
 * buyer actually experienced (stamped onto the session at checkout creation), so
 * querying again here would add latency to the webhook path and tell us nothing
 * new. `utm_tracker` remains the source of truth for the landing arm — the Stripe
 * copy defaults to "white" when the cookie was absent, which would report an arm
 * the visitor may never have been in.
 */
export function journeyFromPurchase(input: {
  submissionId: number;
  firstName: string | null;
  email: string | null;
  utmTracker: string | null;
  experimentGroup: string | null;
  basePriceBucket: string | null;
  forcedPaywallArm: string | null;
  landingVariant: string | null;
  deviceType: string | null;
  countryTier: string | null;
  amount: number | null;
  currency: string | null;
  plan: string | null;
  purchasedAt?: string;
}): SubmissionJourney {
  const stamped = readStampedArms(input.utmTracker);
  const purchasedAt = input.purchasedAt ?? new Date().toISOString();

  return {
    submissionId: input.submissionId,
    firstName: input.firstName?.trim() || null,
    emailMasked: mask(input.email),
    arms: {
      // utm_tracker first; the Stripe metadata copy is the fallback.
      landing: stamped.landing ?? input.landingVariant,
      survey: stamped.survey,
      pricing: input.experimentGroup ?? input.basePriceBucket,
      paywall: input.forcedPaywallArm,
    },
    traffic: classifyTraffic(input.utmTracker),
    device: input.deviceType,
    // The Stripe webhook carries no country — the session metadata never held
    // one — so this stays null rather than being guessed from the pricing tier.
    country: null,
    countryTier: input.countryTier,
    timings: {
      durationMs: null,
      startedAt: null,
      completedAt: null,
      msToPurchase: null,
      msCheckoutHesitation: null,
    },
    milestones: {
      reportViewedAt: null,
      paywallInitiatedAt: null,
      checkoutStartedAt: null,
      purchasedAt,
    },
    money: {
      plan: input.plan,
      amount: input.amount,
      currency: (input.currency ?? "EUR").toUpperCase(),
    },
    quoteCount: 0,
  };
}
