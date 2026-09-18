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
    /**
     * Measured time spent reading the report — see {@link measureReportDwellMs}.
     *
     * Was a floor off the furthest `report_engagement_*` milestone (1/5/10 min)
     * until 2026-09-18, which is why every message said "1+ min": 79% of readers
     * who record any milestone record only that first one. `report_session.ended_at`
     * is the obvious home for a real duration and is still never written (0 of
     * 11,230 rows), so this is measured from the event stream instead.
     *
     * Consent-gated, like every other `analytics_event` row: null means "not
     * recorded", never "they left immediately". Callers must render the
     * difference, because a reader who declined analytics looks identical to one
     * who bounced.
     */
    reportDwellMs: number | null;
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
  /**
   * PostHog `$session_id` captured at submit, or null. Null is the ordinary case for
   * anything submitted before 2026-08-27, and for a visitor whose replay never ran
   * (no project token, ad blocker, sampled out) — so a reader must treat "no link"
   * as "no recording", not as an error.
   */
  recordingSessionId: string | null;
}

interface SubmissionRow {
  id: number;
  session_id: string | null;
  start_date_time: string | null;
  created_date_time: string | null;
  status: string | null;
  duration_ms: number | null;
  utm_tracker: string | null;
  posthog_session_id: string | null;
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

/** Server-side proof that the report was opened, via report_session. */
interface ReportSessionRow {
  started_at: string | null;
  ended_at: string | null;
}

/** Local copy of the masking rule so the raw address is never returned to callers. */
function mask(email: string | null | undefined): string | null {
  if (!email?.trim()) return null;
  // Index-based, not `^(.).+(@.+)$`: that pattern needs TWO characters before
  // the `@`, so `a@b.com` never matched and `.replace` handed the address back
  // verbatim — the helper returning exactly what it exists to withhold. 3 of
  // 1,961 live users have a one-character local part. Anything with no local
  // part or no `@` is never echoed at all.
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at < 1) return "***";
  return `${trimmed.slice(0, 1)}***${trimmed.slice(at)}`;
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

/**
 * A gap this long ends a sitting. Someone who opens the report at lunch and comes
 * back in the evening read it twice — summing the two sittings answers "how long
 * did they spend in there", where a bare last-minus-first would answer "8h".
 */
export const REPORT_IDLE_GAP_MS = 30 * 60_000;

/**
 * Below this, report nothing.
 *
 * Opening the report fires a burst of events inside a second or two — the
 * server-side `report_session` row, `locked_card_price_shown`, `report_viewed`.
 * Submission #2112 is the whole of one real reader's stream: opened at
 * 15:26:04.6, two events by 15:26:06.2, then silence. Measuring that span gives
 * "2s", which reads in #incoming-surveys as "bounced instantly" when all it
 * actually says is "the page loaded".
 *
 * One minute because that is where the instrumentation's own first heartbeat is:
 * anyone who stays a minute leaves a `report_engagement_1min` row, so at or above
 * a minute there is always purpose-built evidence, and below it there is only the
 * load burst. Those readers render an em dash, exactly as they do today.
 */
export const MIN_MEASURABLE_DWELL_MS = 60_000;

/**
 * The active time a milestone PROVES, in ms.
 *
 * A switch rather than a lookup object: `event_type` arrives from a database
 * row, and indexing an object with it is exactly the shape the
 * security/detect-object-injection rule exists to stop.
 */
function milestoneDwellMs(eventType: string): number | null {
  switch (eventType) {
    case "report_engagement_1min":
      return 60_000;
    case "report_engagement_5min":
      return 300_000;
    case "report_engagement_10min":
      return 600_000;
    default:
      return null;
  }
}

/**
 * Measured time in the report: the open, plus every later event the reader
 * produced, split into sittings on {@link REPORT_IDLE_GAP_MS} and summed — or
 * the furthest engagement milestone they crossed, whichever is larger.
 *
 * BOTH, because each sees something the other cannot. The stream sees a reader
 * who scrolls and clicks; the milestones see one who does neither, and they
 * carry a duration of their own rather than a timestamp — a `report_engagement_1min`
 * row asserts sixty seconds of ACTIVE time, which is not the same as sixty
 * seconds of wall clock. Submission #2108 is why: opened at 10:21:47, two events
 * by 10:21:49, then the one-minute milestone at 11:10:42, because the tab sat in
 * the background for 49 minutes and the timer only counts visible seconds. The
 * span alone calls that a two-second visit; the milestone calls it a minute, and
 * the milestone is right.
 *
 * `report_session.ended_at` is what stops this being a pure lower bound: it is
 * the moment they actually left, beaconed on the way out, so a reader who spends
 * four quiet minutes on the final chapter is no longer credited only up to their
 * last scroll. It still degrades to a lower bound whenever the beacon does not
 * arrive — a killed tab, a crashed browser, a blocked request — which is why
 * every other signal stays in the calculation rather than being replaced by it.
 *
 * Replaces the milestone floor ALONE, which is what made 79% of live messages
 * (160 of 202 carrying any milestone) read "1+ min" whatever the reader did.
 * Taking the larger of the two can never print less than the old line did.
 *
 * Anything under {@link MIN_MEASURABLE_DWELL_MS} becomes null, never "0s" or
 * "2s". One lone timestamp is evidence that they opened it and no evidence at
 * all about how long they stayed, and these events are consent-gated — so
 * absence has to keep meaning "not recorded".
 */
export function measureReportDwellMs(
  openedAt: string | null,
  events: Array<{ event_type: string; event_time: string | null | undefined }>,
  /**
   * This report's `report_session` rows. Server-written and NOT consent-gated,
   * so a CLOSED one is the only thing a reader who declined analytics
   * contributes at all.
   *
   * Only closed ones count, and they count as an INTERVAL rather than as two
   * loose points. An open session says a page was requested and nothing more:
   * submission #1921 carries 82 of them from one afternoon of QA, none closed,
   * chained 0–13 minutes apart, and treating each start as presence billed the
   * whole two hours as reading. The anchor already carries the first open,
   * which is the only thing those rows actually prove.
   */
  sessions: Array<{ started_at: string | null; ended_at: string | null }> = []
): number | null {
  const milestoneFloor = events.reduce<number>((furthest, e) => {
    const ms = milestoneDwellMs(e.event_type);
    return ms !== null && ms > furthest ? ms : furthest;
  }, 0);

  const open = openedAt ? new Date(openedAt).getTime() : Number.NaN;
  let span = 0;
  if (Number.isFinite(open)) {
    // Anything stamped before the report opened belongs to the survey, not to
    // reading — including a clock-skewed row, which would otherwise start the
    // first sitting in the past and inflate every sitting after it.
    const points: Array<{ at: number; isClose: boolean }> = [{ at: open, isClose: false }];
    const push = (time: string | null | undefined, isClose: boolean) => {
      if (!time) return;
      const ms = new Date(time).getTime();
      if (Number.isFinite(ms) && ms >= open) points.push({ at: ms, isClose });
    };
    for (const event of events) push(event.event_time, false);
    for (const session of sessions) {
      if (!session.started_at || !session.ended_at) continue;
      if (new Date(session.ended_at).getTime() < new Date(session.started_at).getTime()) continue;
      push(session.started_at, false);
      push(session.ended_at, true);
    }
    // Ties: the close sorts last, so a session that opens and closes in the same
    // millisecond still ends its own sitting rather than the previous one.
    points.sort((a, b) => a.at - b.at || Number(a.isClose) - Number(b.isClose));

    let sittingStart = points[0]!.at;
    let previous = points[0]!;
    for (const point of points.slice(1)) {
      /**
       * A close ends the sitting outright, whatever the gap.
       *
       * This is the whole reason `ended_at` is worth writing. Without it the only
       * evidence of absence was a long silence, so someone who read for two
       * minutes, left, and came back ten minutes later was billed for all
       * fourteen — the 30-minute threshold never fired. We now KNOW they left,
       * so the gap after a close is never reading time.
       */
      if (previous.isClose || point.at - previous.at > REPORT_IDLE_GAP_MS) {
        span += previous.at - sittingStart;
        sittingStart = point.at;
      }
      previous = point;
    }
    span += previous.at - sittingStart;
  }

  const dwell = Math.max(span, milestoneFloor);
  return dwell >= MIN_MEASURABLE_DWELL_MS ? dwell : null;
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
  const [subs, quotes, eventsDesc, reportSessions] = await Promise.all([
    fetchJson<SubmissionRow>(
      `/rest/v1/survey_submission?id=eq.${submissionId}` +
        `&select=id,session_id,start_date_time,created_date_time,status,duration_ms,utm_tracker,` +
        `posthog_session_id,` +
        `app_user!fk_survey_submission_user(email,first_name,user_profile(location_primary))`,
      "survey_submission"
    ),
    fetchJson<QuoteRow>(
      `/rest/v1/report_price_quote?survey_submission_id=eq.${submissionId}` +
        `&select=plan,experiment_group,base_price_bucket,forced_paywall_arm,device_type,country_tier,` +
        `current_price,currency,purchased_at,checkout_started_at&order=created_date_time.asc`,
      "report_price_quote"
    ),
    /**
     * Every event this reader produced AFTER the survey, newest first.
     *
     * Widened from the five named types it used to fetch, because the dwell is
     * now MEASURED from this stream rather than read off three milestone rows —
     * a scroll, a chapter open or a dismissed paywall all prove the reader was
     * still in there. `entity_type=neq.survey` drops the wizard events, which
     * fire before the report exists and can only ever sit before the anchor.
     *
     * NEWEST FIRST, then reversed below. PostgREST caps a response at 1,000 rows
     * and a Range header does not lift it, so an ascending order would silently
     * drop the TAIL on the one submission that carries 1,962 rows — and the tail
     * is the entire point: it is what says how long they stayed. Descending puts
     * any truncation on the oldest end, where the worst case is understating a
     * dwell we already document as a lower bound. 500 is ~44x the average
     * submission (11.4 non-survey rows) and well inside the cap.
     */
    fetchJson<AnalyticsRow>(
      `/rest/v1/analytics_event?survey_submission_id=eq.${submissionId}` +
        `&entity_type=neq.survey` +
        `&select=event_type,event_time&order=event_time.desc&limit=500`,
      "analytics_event"
    ),
    /**
     * The server-side record of the report being opened AND closed. `report_viewed`
     * in `analytics_event` sits behind the consent gate and misses 45% of real
     * opens (96 of 216 over 2026-08-25 → 09-05), which left `reportViewedAt`
     * null — and every timing derived from it blank — for readers who declined
     * analytics. The report route writes this row itself and its own comment
     * already calls it "the server-side truth here"; this is that truth reaching
     * the journey. Embedded filter, so one request rather than a lookup hop.
     *
     * ALL the sessions now, not just the first. `ended_at` is written by
     * /api/report-session-end on the way out, and it is the only record of when
     * a reader actually LEFT — every other signal is the last thing they
     * happened to click. Both boundaries feed the dwell below, which is also
     * what finally gives a consent-declining reader a measured time instead of
     * an em dash. Fifty rows is ~9x the busiest report (11,230 sessions across
     * 2,051 reports) and the earliest is still [0], so the anchor is unchanged.
     */
    fetchJson<ReportSessionRow>(
      `/rest/v1/report_session?select=started_at,ended_at,personal_report!inner(survey_submission_id)` +
        `&personal_report.survey_submission_id=eq.${submissionId}` +
        `&order=started_at.asc&limit=50`,
      "report_session"
    ),
  ]);

  const sub = subs[0];
  if (!sub) return null;

  // Back to ascending. The query asks for newest-first only so that truncation
  // lands on the oldest end; everything below reads this as a timeline. Sorted
  // rather than reversed, so `firstOf` cannot be silently re-pointed at the last
  // row by a change to the query's `order`.
  const events = [...eventsDesc].sort((a, b) => a.event_time.localeCompare(b.event_time));

  const stamped = readStampedArms(sub.utm_tracker);

  // Any quote carries the person's pricing arm and their resolved device/country —
  // they are frozen per reader, not per plan. Prefer a purchased quote so the
  // money fields describe what they actually bought.
  const purchased = quotes.find((q) => q.purchased_at) ?? null;
  const anyQuote = purchased ?? quotes[0] ?? null;

  const firstOf = (type: string) => events.find((e) => e.event_type === type)?.event_time ?? null;

  // Earliest of the two: whichever actually recorded the open first. The
  // consent-gated event is kept as a fallback rather than dropped, so a row
  // predating report_session still resolves.
  const reportViewedAt =
    [reportSessions[0]?.started_at ?? null, firstOf("report_viewed")]
      .filter((v): v is string => Boolean(v))
      .sort()[0] ?? null;
  const reportDwellMs = measureReportDwellMs(reportViewedAt, events, reportSessions);
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
    /**
     * Capped for the same reason `classifyTraffic` caps utm values at 100: this
     * string is interpolated straight into a Slack section, and a section is
     * clamped from the END at 2,900 characters — so an oversized value here
     * silently truncates whatever renders after it, which in the compact survey
     * layout is the progress rail.
     *
     * It is not hypothetical. `location_primary` is the visitor's own answer to
     * Q15001; the column is `text` with no length limit and no check constraint,
     * and `surveyAnswersSchema` accepts an array of 20 x 500 characters for any
     * key that has no selection cap — 10,000 characters, which the RPC writes
     * with a bare `#>> '{}'`. The longest real country name is 56.
     */
    country: sub.app_user?.user_profile?.location_primary?.trim().slice(0, 100) || null,
    countryTier: anyQuote?.country_tier ?? null,
    timings: {
      durationMs: toNumber(sub.duration_ms),
      startedAt: sub.start_date_time,
      completedAt: sub.created_date_time,
      msToPurchase: msBetween(sub.created_date_time, purchasedAt),
      msCheckoutHesitation: msBetween(checkoutStartedAt, purchasedAt),
      reportDwellMs,
    },
    milestones: {
      reportViewedAt,
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
    recordingSessionId: sub.posthog_session_id?.trim() || null,
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
      // The forced-paywall axis was removed on 2026-08-31 and nothing stamps it
      // any more. Historical purchases keep their arm on report_price_quote; the
      // Slack message never rendered this axis (see armFields).
      paywall: null,
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
      // This builder never reads the database, so there is no event stream to
      // measure a dwell from. The purchase message does not render it.
      reportDwellMs: null,
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
    // This builder deliberately does not touch the database (it exists so the
    // purchase ping cannot be delayed by a read), so there is no session id to
    // offer. The purchase message therefore carries no replay link; the survey
    // message for the same person does.
    recordingSessionId: null,
  };
}
