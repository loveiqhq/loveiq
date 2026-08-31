import posthog from "posthog-js";
import { getCsrfToken } from "@shared/http/csrf-client";
import { isProductionSite } from "@shared/env/is-non-prod-deploy";
import {
  LANDING_VARIANT_COOKIE,
  isLandingVariant,
  type LandingVariant,
} from "@shared/experiments/landingVariant";

type GTag = {
  (command: "event", eventName: string, params?: Record<string, unknown>): void;
  // `set user_properties` registers a user-scoped property so every subsequent
  // GA4 event is segmentable by it in Explorations (e.g. the forced-paywall arm).
  (command: "set", target: "user_properties", params: Record<string, unknown>): void;
};
type ConsentCategory = "analytics" | "advertisement" | "functional";

const GOOGLE_ADS_TAG_ID = "AW-18068690553";
const GOOGLE_ADS_PURCHASE_LABEL = ["guQ3CPHxh5cc", "EPms6adD"].join("");
const GOOGLE_ADS_PURCHASE_SEND_TO = `${GOOGLE_ADS_TAG_ID}/${GOOGLE_ADS_PURCHASE_LABEL}`;
const COOKIEYES_CONSENT_COOKIE = "cookieyes-consent";

// GA4 web stream measurement ID (mirrors app/layout.tsx). The GA4 session cookie
// is `_ga_<id-without-G->`, so `G-QTYY69L46N` → `_ga_QTYY69L46N`.
const GA4_MEASUREMENT_ID = "G-QTYY69L46N";
const GA4_SESSION_COOKIE = `_ga_${GA4_MEASUREMENT_ID.replace(/^G-/, "")}`;

declare global {
  interface Window {
    gtag?: GTag;
    dataLayer?: Array<Record<string, unknown>>;
    /** Set by gtag.js per destination once it has initialised. */
    google_tag_manager?: Record<string, unknown>;
    __loveiqGtagBootstrapped?: boolean;
    __loveiqReportSubmissionId?: number | null;
    /** Survey white A/B arm for the current survey session. */
    __loveiqSurveyVariant?: "white" | "dark" | null;
    /** Dev-only: tracks event_types we've already warned about for missing context. */
    __loveiqPersistSkipWarned?: Set<string>;
  }
}

const PERSISTED_EVENTS = new Set([
  // Original 8 — funnel + engagement timers
  "report_viewed",
  "paywall_view",
  "paywall_initiated",
  "price_shown",
  "begin_checkout",
  "paywall_unlocked",
  "report_engagement_1min",
  "report_engagement_5min",
  "report_engagement_10min",
  // Report-page intent + dismiss events (Phase B.1)
  "report_chapter_menu_opened",
  "paywall_dismissed",
  "scroll_paywall_dismissed",
  "lock_icon_clicked",
  "sticky_unlock_clicked",
  "report_share_opened",
  "refer_friend_opened",
  "chapter_feedback_submitted",
  // Survey + wizard funnel slot (Phase B.2)
  "wizard_slide_advanced",
  "survey_confirmation_cta_clicked",
  // Invite (Phase B.4)
  "invite_modal_dismissed",
  // Checkout return (Phase B.5)
  "checkout_return_viewed",
  "checkout_retry_clicked",
  "checkout_abandoned_return",
  // UX quality signals (Phase D)
  "scroll_depth_25",
  "scroll_depth_50",
  "scroll_depth_75",
  "scroll_depth_100",
  "rage_click",
  // Forced-paywall A/B experiment (Phase E)
  "experiment_exposure",
  "scroll_paywall_shown",
  "experiment_card_flipped",
  // Locked-chapter-card paywall surface (price + countdown shown inline)
  "locked_card_price_shown",
  "paywall_countdown_expired",
]);

/**
 * Set on /report page load. Lets the persistence layer attach the submission
 * id (FK target on analytics_event) without every call site repeating it.
 */
export const setReportSubmissionContext = (submissionId: number | null | undefined) => {
  if (typeof window === "undefined") return;
  window.__loveiqReportSubmissionId = submissionId ?? null;
};

/**
 * Set on the survey engine once the survey white-A/B arm is known. Every
 * persisted analytics event then auto-carries
 * `survey_variant`, so survey completion-by-arm is a single GROUP BY. Register a
 * user-scoped GA4 custom dimension `survey_variant` to surface it in GA4 reports.
 */
export const setSurveyVariant = (variant: "white" | "dark" | null) => {
  if (typeof window === "undefined") return;
  window.__loveiqSurveyVariant = variant;
  if (variant) posthog.register({ survey_variant: variant });
  if (variant && isProductionSite() && hasCookieYesConsent("analytics")) {
    gtagSend("set", "user_properties", { survey_variant: variant });
  }
};

const persistAnalyticsEvent = (
  eventType: string,
  metadata: Record<string, unknown> | undefined,
  durationMs?: number
) => {
  if (typeof window === "undefined") return;
  if (!PERSISTED_EVENTS.has(eventType)) return;
  if (!hasCookieYesConsent("analytics")) return;

  const submissionId = window.__loveiqReportSubmissionId ?? null;
  // No submission context = nothing to persist (the timeline keys off
  // submission_id). The event still went to GA4; only durable storage is
  // skipped. In dev, emit a console.warn ONCE per event_type so missing
  // wiring is visible during QA without spamming the console (UX-signal
  // events on /landing legitimately have no context).
  if (!submissionId) {
    if (process.env.NODE_ENV === "development") {
      const warned = (window.__loveiqPersistSkipWarned ??= new Set<string>());
      if (!warned.has(eventType)) {
        warned.add(eventType);
        console.warn(
          `[analytics] Skipped persistence for "${eventType}" — no submission context. ` +
            `Call setReportSubmissionContext() before firing persisted events.`
        );
      }
    }
    return;
  }

  const csrf = getCsrfToken();
  if (!csrf) return;

  // Auto-stamp the experiment arms onto every persisted event so the whole
  // funnel is attributable without per-call wiring. The survey arm comes from a
  // window global; the white-landing variant is read straight from its cookie
  // (source of truth, readable on every page). Caller keys win over both.
  const surveyVariant = window.__loveiqSurveyVariant ?? null;
  const landingVariant = getLandingVariant();
  const mergedMetadata = {
    ...(surveyVariant ? { survey_variant: surveyVariant } : {}),
    ...(landingVariant ? { landing_variant: landingVariant } : {}),
    ...metadata,
  };

  const url = "/api/analytics-event";
  const headerBody = {
    event_type: eventType,
    submission_id: submissionId,
    metadata: mergedMetadata,
    duration_ms: durationMs,
  };

  // Prefer sendBeacon when available — it survives page navigations. Beacon
  // can't set custom headers, so we encode CSRF in the body too; the route
  // accepts either header- or body-supplied tokens.
  if (navigator.sendBeacon) {
    const beaconBody = JSON.stringify({ ...headerBody, _csrf: csrf });
    const blob = new Blob([beaconBody], { type: "application/json" });
    if (navigator.sendBeacon(url, blob)) return;
  }

  fetch(url, {
    method: "POST",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrf,
    },
    body: JSON.stringify(headerBody),
  }).catch(() => {
    /* non-blocking — durable storage is best effort */
  });
};

const getCookieValue = (name: string) => {
  if (typeof document === "undefined") return null;

  const cookie = document.cookie.split("; ").find((row) => row.startsWith(`${name}=`));
  if (!cookie) return null;

  return decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1));
};

/**
 * Every gtag call goes through here, held back until gtag.js is actually running.
 *
 * `window.gtag` stays a dataLayer pusher for the whole life of the page — that is
 * the designed snippet, and gtag.js drains the queue rather than replacing the
 * function. The theory is therefore that an early call is merely delivered late.
 * Measured on production 2026-08-28, that is NOT what happens: an event pushed
 * during hydration never reaches GA4 at all, while the identical call once gtag.js
 * has loaded sends immediately. `landing_page_view` and `experiment_exposure` fire
 * from the landing page's mount effect and had therefore never once been recorded —
 * 0 in GA4 every day for nine days, against ~100 sessions landing on `/` a day.
 *
 * Hoisting `gtag('config', …)` out of lazyOnload (same day) was a real fix and a
 * prerequisite — before it, config landed at dataLayer index 13, behind the events —
 * but it only narrowed the loss to a race, and the race is still lost: post-deploy
 * hours show web_vitals arriving and landing_page_view still at 0.
 *
 * So: buffer, then replay once `google_tag_manager["G-QTYY69L46N"]` exists, the
 * marker gtag.js sets per destination when it initialises. Order is preserved —
 * a `set user_properties` replayed after its event would not decorate it.
 */
/**
 * The two call shapes `GTag` accepts, as a tuple union.
 *
 * NOT `Parameters<GTag>` — on an overloaded type that resolves to the LAST overload
 * only, so it typechecked `set` and rejected every `event` call.
 */
type GtagCall =
  | ["event", string, Record<string, unknown>?]
  | ["set", "user_properties", Record<string, unknown>];

/** Applies a queued tuple to gtag. The cast is needed because TypeScript cannot
 *  resolve an overload from a spread of a union tuple; the runtime shim takes
 *  anything, and `GtagCall` is what constrains the call sites. */
const applyGtag = (call: GtagCall) => {
  (window.gtag as unknown as ((...a: unknown[]) => void) | undefined)?.(...call);
};

/** Pending calls, or `null` once drained — after which calls go straight through. */
let gtagQueue: GtagCall[] | null = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushAttempts = 0;

/** ~10s of retries. If gtag.js never arrives (ad blocker, blocked by consent, the
 *  script 404s) the queue is dropped rather than grown forever. */
const FLUSH_INTERVAL_MS = 250;
const FLUSH_MAX_ATTEMPTS = 40;
const QUEUE_LIMIT = 50;

const gtagIsLive = () =>
  typeof window !== "undefined" && !!window.google_tag_manager?.[GA4_MEASUREMENT_ID];

const stopFlushing = () => {
  if (flushTimer !== null) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
};

/** Drains the queue if gtag.js is live. Returns true once it has drained. */
const flushGtagQueue = (): boolean => {
  if (gtagQueue === null) return true;
  if (!gtagIsLive()) return false;

  const pending = gtagQueue;
  // Cleared BEFORE replaying: gtag is synchronous, so a re-entrant call must go
  // direct rather than land back in a queue that is mid-drain.
  gtagQueue = null;
  stopFlushing();
  for (const call of pending) applyGtag(call);
  return true;
};

const scheduleFlush = () => {
  if (flushTimer !== null || gtagQueue === null) return;
  flushAttempts = 0;
  flushTimer = setInterval(() => {
    flushAttempts += 1;
    if (flushGtagQueue()) return;
    if (flushAttempts >= FLUSH_MAX_ATTEMPTS) {
      gtagQueue = [];
      stopFlushing();
    }
  }, FLUSH_INTERVAL_MS);
};

/**
 * Call gtag, or queue it until gtag.js is live. Use this rather than
 * `gtagSend(...)` anywhere in this file: a direct call during hydration is
 * silently dropped.
 */
const gtagSend = (...args: GtagCall) => {
  if (typeof window === "undefined") return;
  if (gtagQueue === null) {
    applyGtag(args);
    return;
  }
  if (gtagQueue.length < QUEUE_LIMIT) gtagQueue.push(args);
  if (!flushGtagQueue()) scheduleFlush();
};

export const hasCookieYesConsent = (category: ConsentCategory) => {
  const consentValue = getCookieValue(COOKIEYES_CONSENT_COOKIE);
  if (!consentValue) return false;

  return consentValue.split(",").some((entry) => {
    const [key, value] = entry.split(":");
    return key === category && value === "yes";
  });
};

/**
 * Reads the GA4 `client_id` + `session_id` from the first-party GA cookies, plus
 * the current analytics-consent state, so the server can replay a purchase via
 * the GA4 Measurement Protocol with correct attribution (see
 * `features/analytics/server/ga4.ts`). Returns null ids when GA hasn't set the
 * cookies (e.g. analytics consent was declined, so no `_ga` cookie exists) — the
 * server then skips the send, keeping server-side tracking consent-compliant.
 *
 *   `_ga`                = "GA1.1.<clientId-hi>.<clientId-lo>"  → client_id = last two segments
 *   `_ga_<measurement>`  = "GS1.1.<sessionId>.<...>"           → session_id = 3rd segment
 */
export const getGaMeasurementContext = (): {
  clientId: string | null;
  sessionId: string | null;
  consent: boolean;
} => {
  const consent = hasCookieYesConsent("analytics");

  const ga = getCookieValue("_ga");
  const gaParts = ga ? ga.split(".") : [];
  const clientId =
    gaParts.length >= 4 ? `${gaParts[gaParts.length - 2]}.${gaParts[gaParts.length - 1]}` : null;

  const gaSession = getCookieValue(GA4_SESSION_COOKIE);
  const sessionParts = gaSession ? gaSession.split(".") : [];
  const sessionId = sessionParts.length >= 3 ? (sessionParts[2] ?? null) : null;

  return { clientId, sessionId, consent };
};

/**
 * White-landing A/B arm for the current visitor, read from the assignment
 * cookie minted by `proxy.ts`. Returns null when absent (the visitor never hit
 * `/`, e.g. arrived straight at /report from an email) so events are stamped
 * only for the real experiment population. No consent gate: the cookie is a
 * no-PII functional cookie, and reading it just classifies an already-allowed
 * analytics event — it never sets anything.
 */
const getLandingVariant = (): LandingVariant | null => {
  // Guarded by the shared type guard, not a literal list: this restated the two
  // round-1 arms, so a round-2 `white_prev` cookie read as null and every durable
  // event for that arm shipped without its variant stamp.
  const v = getCookieValue(LANDING_VARIANT_COOKIE);
  return isLandingVariant(v) ? v : null;
};

/**
 * Mirror the white-landing arm into GA4 as a user-scoped property so every GA4
 * event is segmentable by it in Explorations (no per-event wiring). Consent-
 * gated like all GA4 traffic. Call once on landing-page mount. NOTE: register a
 * custom dimension "landing_variant" (user-scoped) in GA4 Admin → Custom
 * definitions to surface it in reports (one-time config, not code).
 */
export const setLandingVariant = (variant: LandingVariant | null) => {
  if (typeof window === "undefined") return;
  if (variant) posthog.register({ landing_variant: variant });
  if (variant && isProductionSite() && hasCookieYesConsent("analytics")) {
    gtagSend("set", "user_properties", { landing_variant: variant });
  }
};

export const track = (name: string, params?: Record<string, unknown>) => {
  if (typeof window === "undefined") return;
  // PostHog gets every event, and deliberately BEFORE the two GA4 gates below.
  // PostHog is not consent-gated on this site (same owner decision as Microsoft
  // Clarity — see app/layout.tsx) and does not depend on the GA bootstrap flag,
  // so gating it on either would silently drop the entire custom-event funnel
  // for visitors who declined analytics while PostHog autocapture kept
  // recording them. Placed here rather than at the ~33 call sites so a new
  // trackX() helper is mirrored automatically and can never be forgotten.
  posthog.capture(name, params);

  /**
   * Production gate is BUILD-TIME, not the `__loveiqAnalyticsEnabled` window flag
   * this used to read. That flag is set by the `ga-init` script in app/layout.tsx,
   * which runs `strategy="lazyOnload"` — i.e. at window load — while most of these
   * events fire from a mount effect long before it. So the guard silently threw the
   * event away, and it threw away the dataLayer push with it, which is the one path
   * that queues perfectly well before the tag loads.
   *
   * Measured on production 2026-08-28, GA4 against our own analytics_event table over
   * the same window. Events that fire EARLY barely arrived; events that fire after a
   * click or a timer arrived fully:
   *
   *     price_shown            1,172 rows -> 4 in GA4
   *     scroll_paywall_shown     512      -> 4
   *     experiment_exposure    1,337      -> 94
   *     wizard_slide_advanced  2,474      -> 65
   *     ---
   *     report_viewed            880      -> 1,230
   *     begin_checkout           107      -> 159
   *     report_engagement_1min   302      -> 430
   *
   * Confirmed in a real browser rather than inferred: on a fully consented landing
   * page load, `window.dataLayer` held nine entries and not one of them was ours.
   * `landing_page_view` never fired at all.
   *
   * `isProductionSite()` is inlined at build time, so it carries no race. Consent
   * still gates everything below it.
   */
  if (!isProductionSite()) return;
  if (!hasCookieYesConsent("analytics")) return;

  // Both of these are safe before gtag.js has loaded: the shim in layout.tsx makes
  // `gtag` a dataLayer pusher from `afterInteractive`, and dataLayer is an ordinary
  // array that GTM and gtag.js each drain on load. Queueing is the designed
  // behaviour — dropping was not.
  gtagSend("event", name, params);
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: name, ...params });
};

/**
 * Landing page view — top of the funnel per the Tracking & Pricing CSV.
 * GA4-only: there's no submission yet, so durable persistence to
 * `analytics_event` (which keys off survey_submission_id) is intentionally
 * skipped. Counts on GA4 alone for pre-submission funnel reporting.
 */
export const trackLandingPageView = () => {
  track("landing_page_view");
};

/**
 * Durable top-of-funnel ping to `funnel_event` (keyed by visitor_id + day, NOT a
 * survey_submission), mirroring the survey_engine_mount / intro_slide pings. It
 * fires regardless of analytics consent — first-party funnel measurement with no
 * third-party sharing — so pre-payment drop-off is never lost. No-op without a
 * visitor cookie or CSRF token. PK (visitor_id, day, event_type) dedupes server-side.
 */
const pingFunnelEvent = (event: string) => {
  if (typeof window === "undefined") return;
  const visitorId = getCookieValue("__Host-liq_vid") || getCookieValue("__liq_vid");
  if (!visitorId) return;
  const csrf = getCsrfToken();
  if (!csrf) return;
  const url = "/api/funnel-event";
  const payload = JSON.stringify({ event, visitor_id: visitorId, _csrf: csrf });
  // Beacon survives the page navigation to Stripe; header-CSRF fallback otherwise.
  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: "application/json" });
    if (navigator.sendBeacon(url, blob)) return;
  }
  fetch(url, {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
    body: payload,
  }).catch(() => {
    /* best-effort */
  });
};

export const trackStartSurvey = (
  location:
    | "nav"
    | "hero"
    | "report_section"
    | "footer"
    | "archetype-teaser"
    | "vocab"
    | "find_out"
    | "result_teaser"
    | "sticky"
) => {
  track("cta_click", { cta: "start_survey", location });
};

export const trackSurveyStart = () => {
  track("survey_started");
};

export const trackSurveyAnswer = (qId: string, chapter: string) => {
  track("survey_answer", { question_id: qId, chapter });
};

export const trackSurveyProgress = (
  questionId: string,
  questionIndex: number,
  totalQuestions: number
) => {
  const progress_pct = totalQuestions > 0 ? Math.round((questionIndex / totalQuestions) * 100) : 0;
  track("survey_progress", {
    question_id: questionId,
    question_index: questionIndex,
    progress_pct,
  });
};

export const trackSurveyComplete = (durationMs: number, totalQuestions?: number) => {
  track("survey_completed", {
    duration_ms: durationMs,
    completion_time_seconds: Math.round(durationMs / 1000),
    ...(typeof totalQuestions === "number" ? { total_questions: totalQuestions } : {}),
  });
};

export const trackReportViewed = (
  reportType: "essentials" | "full_report" | "core" | "all_reports" | "locked",
  archetype?: string | null
) => {
  const params = {
    report_type: reportType,
    ...(archetype ? { archetype } : {}),
  };
  track("report_viewed", params);
  persistAnalyticsEvent("report_viewed", params);
};

export interface PaywallPlanItem {
  plan: "essentials" | "full_report" | "core" | "all_reports";
  price: number;
  currency: string;
}

export const trackPaywallView = (items: PaywallPlanItem[]) => {
  if (!items.length) return;
  // items.length > 0 checked above.
  const params = { currency: items[0]!.currency, items };
  track("paywall_view", params);
  persistAnalyticsEvent("paywall_view", params);
};

/**
 * Source of a user-initiated paywall surface — what the user clicked to land
 * on the pricing screen. Kept narrow on purpose; expand only when the report
 * grows new CTAs that route to checkout. Forced/auto-mount paths (scroll
 * trigger, 24h ladder auto-open) MUST NOT call trackPaywallInitiated — that's
 * the founder's "forced" vs "initiated" distinction.
 */
export type PaywallInitiatedSource =
  | "lock_click"
  | "archetype_unlock"
  | "offer_link"
  | "archetype_breakdown_footer";

export interface PaywallInitiatedParams {
  source: PaywallInitiatedSource;
  /** Optional: which section the user clicked (lock_click source only). */
  section_id?: string;
  /** Optional: which archetype is being upgraded. */
  archetype?: string | null;
  /** Optional: required plan tier for the locked section. */
  plan_needed?: "essentials" | "full_report" | "core" | "all_reports";
}

/**
 * `unlock_click` — the one canonical "they tried to unlock" event.
 *
 * Marketing asked for `unlock_click` + `begin_checkout` so the drop-off between
 * reading the report and paying is visible, and so both can be fed to Google Ads as
 * secondary signals. `begin_checkout` already existed; this did not — the intent
 * moment was split across three differently-named events (`paywall_initiated`,
 * `lock_icon_clicked`, `sticky_unlock_clicked`), which is exactly the shape you
 * cannot build a single Google Ads conversion action from.
 *
 * Not a replacement: the three granular events keep firing and keep their durable
 * rows, because the admin funnel and the digest's leak scoring already read them.
 * This is one extra GA4/PostHog event carrying `surface`, so the same click is one
 * countable step for Ads and still fully attributable internally.
 *
 * Deliberately NOT persisted to `analytics_event`. Every path that fires it already
 * writes a durable row under its granular name, so persisting would duplicate rows
 * and double-count the step in the internal funnel.
 *
 * Fired from inside `trackPaywallInitiated` and `trackStickyUnlockClicked` rather
 * than at the call sites: those two functions are the funnels every unlock CTA
 * already routes through (all three ReportPage lock paths call the first, the sticky
 * bar calls the second), so a new CTA added later cannot forget it. They never
 * co-occur on one click, so nothing double-fires.
 *
 * One inherited caveat, worth knowing before this is used as an Ads conversion:
 * `source: "offer_link"` is not a click on this page at all — it is a click made in
 * a nurture email, reported by a mount effect when the reader lands on
 * `?offer=1`. Because it is a mount effect, RELOADING that URL fires it again. That
 * is pre-existing `paywall_initiated` behaviour, unchanged here; `unlock_click`
 * simply inherits it, so a small over-count on that one surface is expected. The
 * `surface` param is what lets it be excluded if that matters.
 */
export type UnlockClickSurface = PaywallInitiatedSource | "sticky_bar";

const trackUnlockClick = (surface: UnlockClickSurface, extra?: Record<string, unknown>): void => {
  track("unlock_click", { surface, ...extra });
};

/**
 * Fires when a user takes a deliberate action that surfaces the paywall:
 * clicking a locked section, clicking the unlock CTA in PremiumOverlay, or
 * opening the report via an `?offer=1` email link. Replaces `paywall_view`
 * as the digest's "did the user actually want the paywall?" signal.
 *
 * Why not just keep paywall_view: that event also fires on auto-mount paths
 * (ScrollPricingModal scroll-trigger, ReportPricingModal 24h+ ladder auto-open),
 * so the count conflates intent with passive exposure. Founder confirmed the
 * digest should track INITIATED intent only.
 *
 * No items[] payload here — we want a clean count of intent moments, not
 * per-plan attribution. Per-plan breakdown lives in the price_shown event.
 */
export const trackPaywallInitiated = (params: PaywallInitiatedParams) => {
  // Spread into a plain record so the type lines up with track()'s
  // Record<string, unknown> signature without forcing every other callsite
  // to widen its argument types.
  const payload: Record<string, unknown> = { ...params };
  track("paywall_initiated", payload);
  persistAnalyticsEvent("paywall_initiated", payload);
  // Canonical cross-surface unlock signal — see trackUnlockClick.
  trackUnlockClick(params.source, {
    ...(params.section_id ? { section_id: params.section_id } : {}),
    ...(params.archetype ? { archetype: params.archetype } : {}),
    ...(params.plan_needed ? { plan_needed: params.plan_needed } : {}),
  });
};

export interface PriceShownParams {
  plan: "essentials" | "full_report" | "core" | "all_reports";
  /**
   * Final EUR amount the user sees — post-multipliers, post-ladder, normalized, and
   * INCLUDING the urgency surcharge when it applies, because this is meant to be what
   * was on screen. See `surcharge` for how much of it that was.
   */
  price: number;
  /** ISO currency code, e.g. "EUR". */
  currency: string;
  /**
   * Elasticity bucket. Expected to be "A" | "B" | "C" but typed as `string`
   * because legacy quotes (pre-2026-04 migration) may carry codes like
   * "full_center". Downstream analytics treats unknown values as "other".
   */
  bucket: string;
  /** Full pricing cluster ID, e.g. "B-US-iOS-google-engaged". */
  pricing_cluster_id: string;
  /** Discount ladder step: 0 = initial, 1–4 = ladder. */
  discount_step: number;
  /** A/B experiment group: "A" (baseline) or "B" (full dynamic). */
  experiment_group?: "A" | "B";
  /** MSRP anchor (struck-out reference price). */
  msrp?: number;
  /** Initial price before ladder discount. */
  initial_price?: number;
  /**
   * The urgency surcharge included in `price` (EUR, 0 when the reader's countdown was
   * still running). Sent so the two cohorts can be separated without having to infer
   * them from the amount.
   */
  surcharge?: number;
}

/**
 * Fires once per (plan, pricing_cluster_id) the first time a quote is rendered
 * to the user — typically when `ReportPricingModal` paints. Powers the
 * "Price Shown" column in the user-tracking funnel + per-cluster CVR analysis.
 * Callers must dedupe (a useRef set is fine) so a modal re-open doesn't
 * double-count.
 */
export const trackPriceShown = (params: PriceShownParams) => {
  const payload = params as unknown as Record<string, unknown>;
  track("price_shown", payload);
  persistAnalyticsEvent("price_shown", payload);
};

/**
 * GA4's recommended ecommerce `begin_checkout`.
 *
 * `value` and `items[]` are not decoration: GA4 reads the amount from `value`, and
 * this event sent only `price`. So every begin_checkout arrived in GA4 — and from
 * there in Google Ads, where marketing wants it as a secondary conversion signal —
 * counted but worth nothing, and GA4's ecommerce reports stayed empty for the step
 * just before purchase. `price` is kept alongside it because the admin submission
 * timeline renders `metadata.price`, and the durable row deliberately keeps its
 * original three keys: `items[]` in Postgres would be duplicated bloat, so the
 * ecommerce shape goes to GA4/PostHog only.
 */
export const trackBeginCheckout = (
  plan: "essentials" | "full_report" | "core" | "all_reports",
  price: number | null,
  currency: string | null
) => {
  // `price` is nullable, and that is the point. Every call site used to read
  //     const quote = quotes?.[plan];
  //     if (quote) trackBeginCheckout(...)
  //     onUnlock(plan)            // ← ran regardless
  // so a click whose plan was missing from the client-side quote map sent the buyer
  // to Stripe and recorded nothing. Measured: GA4 begin_checkout fell 137 (Jul) to
  // 22 (Aug) and our own analytics_event fell ~78 to 10, in the same week pricing 2.0
  // split one plan into three — while price_shown DOUBLED and payments held steady.
  // Both pipelines agreeing ruled out a persistence bug; the guard was the cause.
  // An unpriced checkout start is still a checkout start, so the event always fires
  // and only the monetary fields drop out.
  const priced = typeof price === "number" && Number.isFinite(price);
  const cur = currency ?? "EUR";
  const params = priced ? { plan, price, currency: cur } : { plan, currency: cur };
  track("begin_checkout", {
    ...params,
    ...(priced
      ? { value: price, items: [{ item_id: plan, item_name: plan, price, quantity: 1 }] }
      : {}),
  });
  persistAnalyticsEvent("begin_checkout", params);
};

/**
 * Fires once per report the first time a LOCKED CHAPTER CARD renders a live
 * price + urgency countdown (the `PremiumOverlay` surface — distinct from the
 * pricing modal's `price_shown`). Lets the funnel measure the inline card as
 * its own price-exposure surface, tagged `surface: "locked_chapter_card"`.
 * Caller dedupes to one fire per report load.
 */
export const trackLockedCardPriceShown = (params: PriceShownParams) => {
  const payload = {
    ...params,
    surface: "locked_chapter_card",
  } as unknown as Record<string, unknown>;
  track("locked_card_price_shown", payload);
  persistAnalyticsEvent("locked_card_price_shown", payload);
};

/**
 * Fires once per report when the shared urgency countdown reaches
 * 0:00 *during the session* (the same deadline drives the modal + every locked
 * card). Powers "did the timer expire before they bought?" urgency analysis.
 * Not fired for returning visitors who land after the deadline already passed.
 * Caller dedupes + only schedules when time remains.
 */
export const trackPaywallCountdownExpired = (archetype?: string | null) => {
  const params = { ...(archetype ? { archetype } : {}) };
  track("paywall_countdown_expired", params);
  persistAnalyticsEvent("paywall_countdown_expired", params);
};

/**
 * Testimonial carousel engagement in the pricing modal (pause/resume, arrow
 * nudge, drag). GA4-only — low-signal interaction, intentionally NOT persisted
 * to `analytics_event` (same row-volume policy as section navigation).
 */
export type TestimonialAction = "pause" | "resume" | "prev" | "next" | "drag";
export const trackTestimonialInteraction = (action: TestimonialAction) => {
  track("testimonial_interaction", { action });
};

/**
 * Persists the "paywall unlocked" event when a checkout return page confirms
 * a successful purchase. Mirrors `trackReportPurchase` (GA4 dataLayer) but
 * lands in `analytics_event` so the admin submission funnel can show the
 * conversion as a durable timestamp.
 *
 * Idempotency: callers gate on the same `transaction_id` localStorage key as
 * `trackReportPurchase`, so a refresh of the return page doesn't double-write.
 */
export const trackPaywallUnlocked = (
  plan: "essentials" | "full_report" | "core" | "all_reports",
  priceEur: number,
  currency: string,
  transactionId: string
) => {
  const params = { plan, price: priceEur, currency, transaction_id: transactionId };
  track("paywall_unlocked", params);
  persistAnalyticsEvent("paywall_unlocked", params);
};

export type ReportEngagementThreshold = 60 | 300 | 600;
export type ReportEngagementType = "essentials" | "full_report" | "core" | "all_reports" | "locked";

export const trackReportEngagement = (
  thresholdSeconds: ReportEngagementThreshold,
  reportType: ReportEngagementType,
  archetype: string | null,
  scrollDepthPct: number
) => {
  const minutes = thresholdSeconds / 60;
  const eventName = `report_engagement_${minutes}min`;
  const params = {
    engagement_seconds: thresholdSeconds,
    report_type: reportType,
    ...(archetype ? { archetype } : {}),
    scroll_depth_pct: scrollDepthPct,
  };
  track(eventName, params);
  persistAnalyticsEvent(eventName, params, thresholdSeconds * 1000);
};

export const trackSurveyPause = (qId: string, progress: number) => {
  track("survey_pause", { question_id: qId, progress_pct: progress });
};

export const trackSurveyInvite = (method: string = "email") => {
  track("survey_invite", { method });
};

/* ------------------------------------------------------------------ */
/*  Report Purchase — infrastructure for future Stripe integration    */
/* ------------------------------------------------------------------ */

export interface ReportPurchaseParams {
  /** Revenue amount (required for GA4 monetisation reports). */
  value: number;
  /** ISO currency code, e.g. "EUR" (required for GA4 revenue reports). */
  currency: string;
  /** Unique order/transaction ID for deduplication. */
  transaction_id: string;
  /** Plan / product display name for GA4 ecommerce items[0].item_name. */
  item_name?: string;
  /** Full pricing cluster ID, e.g. "B-US-iOS-google-engaged". */
  pricing_cluster_id?: string;
  /** Elasticity test bucket (A/B/C). */
  base_price_bucket?: string;
  /** A/B experiment group: "A" (static) or "B" (dynamic). */
  experiment_group?: string;
  /** Discount ladder step: 0 = initial, 1–4 = ladder. */
  discount_step?: number;
  /** Country multiplier tier (1–5 or "default"). */
  country_tier?: string;
  /** "iOS" | "Android" | "Desktop". */
  device_type?: string;
  /** Channel that drove the session (utm_source value). */
  traffic_source?: string;
  /** Engagement score 0–80. */
  engagement_score?: number;
  /** Behavioral investment signal bucket. */
  behavioral_bucket?: string;
  /** Original price before discounts. */
  initial_price?: number;
}

export const trackReportPurchase = (params: ReportPurchaseParams) => {
  if (typeof window === "undefined") return;
  if (!isProductionSite()) return;
  if (!hasCookieYesConsent("analytics")) return;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: "purchase",
    transaction_id: params.transaction_id,
    value: params.value,
    currency: params.currency,
    items: [
      {
        item_name: params.item_name || "LoveIQ Report",
        price: params.value,
        quantity: 1,
      },
    ],
    pricing_cluster_id: params.pricing_cluster_id,
    base_price_bucket: params.base_price_bucket,
    experiment_group: params.experiment_group,
    discount_step: params.discount_step,
    country_tier: params.country_tier,
    device_type: params.device_type,
    traffic_source: params.traffic_source,
    engagement_score: params.engagement_score,
    behavioral_bucket: params.behavioral_bucket,
    initial_price: params.initial_price,
  });

  trackGoogleAdsPurchaseConversion(params);
};

export const trackGoogleAdsPurchaseConversion = (params: ReportPurchaseParams) => {
  if (typeof window === "undefined") return;
  if (!isProductionSite()) return;
  if (!hasCookieYesConsent("advertisement")) return;

  gtagSend("event", "conversion", {
    send_to: GOOGLE_ADS_PURCHASE_SEND_TO,
    value: typeof params.value === "number" ? params.value : 1.0,
    currency: params.currency || "MXN",
    transaction_id: params.transaction_id || "",
  });
};

/* ============================================================ */
/*  Phase B.1 — Report-page funnel events                       */
/* ============================================================ */

export const trackReportChapterMenuOpened = (params: {
  archetype?: string | null;
  active_section_id?: string | null;
}) => {
  const payload = {
    ...(params.active_section_id ? { active_section_id: params.active_section_id } : {}),
    ...(params.archetype ? { archetype: params.archetype } : {}),
  };
  track("report_chapter_menu_opened", payload);
  persistAnalyticsEvent("report_chapter_menu_opened", payload);
};

export type PaywallDismissSource = "backdrop" | "close_button" | "escape" | "browser_back";

export const trackPaywallDismissed = (params: {
  source: PaywallDismissSource;
  view_duration_ms: number;
  archetype?: string | null;
}) => {
  const payload = {
    source: params.source,
    view_duration_ms: Math.max(0, Math.round(params.view_duration_ms)),
    ...(params.archetype ? { archetype: params.archetype } : {}),
  };
  track("paywall_dismissed", payload);
  persistAnalyticsEvent("paywall_dismissed", payload, payload.view_duration_ms);
};

export const trackScrollPaywallDismissed = (params: {
  source: PaywallDismissSource | "scroll_modal_close";
  view_duration_ms: number;
  scroll_depth_pct?: number;
}) => {
  const payload = {
    source: params.source,
    view_duration_ms: Math.max(0, Math.round(params.view_duration_ms)),
    ...(typeof params.scroll_depth_pct === "number"
      ? { scroll_depth_pct: params.scroll_depth_pct }
      : {}),
  };
  track("scroll_paywall_dismissed", payload);
  persistAnalyticsEvent("scroll_paywall_dismissed", payload, payload.view_duration_ms);
};

/**
 * A/B experiment exposure — fired once per surface when a user is bucketed into
 * an arm. The canonical "entered arm X on surface Y" record (the per-arm
 * denominator). Persisted to `analytics_event` so the experiment is analyzable
 * in the DB, not just GA4.
 */
export const trackExperimentExposure = (params: {
  experiment: string;
  variant: string;
  surface?: string;
}) => {
  const payload = {
    experiment: params.experiment,
    variant: params.variant,
    ...(params.surface ? { surface: params.surface } : {}),
  };
  track("experiment_exposure", payload);
  persistAnalyticsEvent("experiment_exposure", payload);
};

/**
 * The scroll pricing modal became visible. Captures modal impressions.
 */
export const trackScrollPaywallShown = (params: { surface?: string } = {}) => {
  const payload = params.surface ? { surface: params.surface } : {};
  track("scroll_paywall_shown", payload);
  persistAnalyticsEvent("scroll_paywall_shown", payload);
};

/**
 * The flip card was flipped. `to` = which face is now showing.
 */
export const trackExperimentCardFlipped = (params: { to: "pricing" | "archetype" }) => {
  const payload = { to: params.to };
  track("experiment_card_flipped", payload);
  persistAnalyticsEvent("experiment_card_flipped", payload);
};

export const trackLockIconClicked = (params: {
  section_id: string;
  archetype?: string | null;
  plan_needed: "essentials" | "full_report" | "core" | "all_reports";
}) => {
  const payload = {
    section_id: params.section_id,
    plan_needed: params.plan_needed,
    ...(params.archetype ? { archetype: params.archetype } : {}),
  };
  track("lock_icon_clicked", payload);
  persistAnalyticsEvent("lock_icon_clicked", payload);
};

export const trackStickyUnlockClicked = (params: {
  variant: "mobile" | "desktop";
  archetype?: string | null;
}) => {
  const payload = {
    variant: params.variant,
    ...(params.archetype ? { archetype: params.archetype } : {}),
  };
  track("sticky_unlock_clicked", payload);
  persistAnalyticsEvent("sticky_unlock_clicked", payload);
  // The sticky bar goes straight to checkout without opening the paywall, so it is
  // the one unlock CTA that never reaches trackPaywallInitiated — hence its own
  // call. See trackUnlockClick for why these are the only two places.
  trackUnlockClick("sticky_bar", payload);
};

export const trackReportShareOpened = (params: { source: "sidebar" | "drawer" | "modal" }) => {
  const payload = { source: params.source };
  track("report_share_opened", payload);
  persistAnalyticsEvent("report_share_opened", payload);
};

export const trackReferFriendOpened = (params: { source: "sidebar" | "drawer" | "modal" }) => {
  const payload = { source: params.source };
  track("refer_friend_opened", payload);
  persistAnalyticsEvent("refer_friend_opened", payload);
};

export const trackSectionNavigated = (params: {
  section_id: string;
  source: "desktop_sidebar" | "mobile_drawer";
}) => {
  // GA4-only — would 50× the analytics_event row count if persisted.
  track("section_navigated", params);
};

export const trackChapterFeedbackSubmitted = (params: {
  section_id: string;
  feedback: "up" | "down";
  issue?: string;
  has_comment: boolean;
}) => {
  const payload = {
    section_id: params.section_id,
    feedback: params.feedback,
    has_comment: params.has_comment,
    ...(params.issue ? { issue: params.issue } : {}),
  };
  track("chapter_feedback_submitted", payload);
  persistAnalyticsEvent("chapter_feedback_submitted", payload);
};

/* ============================================================ */
/*  Phase B.2 — Survey funnel events (GA4-only + persisted)     */
/* ============================================================ */

export const trackSurveyPauseModalOpened = (params: {
  question_id: string;
  progress_pct: number;
}) => track("survey_pause_modal_opened", params);

export const trackSurveyAutoAdvanceToggled = (params: { enabled: boolean; question_id?: string }) =>
  track("survey_auto_advance_toggled", params);

export const trackSurveyGuidanceExpanded = (params: { question_id: string; expanded: boolean }) =>
  track("survey_guidance_expanded", params);

export const trackSurveyFormError = (params: {
  question_id: string;
  error_kind: "required" | "too_short" | "invalid_email" | "out_of_range" | string;
}) => track("survey_form_error", params);

export const trackWizardSlideAdvanced = (params: {
  from_slide: number;
  to_slide: number;
  direction: "next" | "previous";
}) => {
  track("wizard_slide_advanced", params);
  persistAnalyticsEvent("wizard_slide_advanced", params);
};

export const trackSurveyConfirmationCtaClicked = (params: {
  cta: "view_report" | "back" | string;
}) => {
  track("survey_confirmation_cta_clicked", params);
  persistAnalyticsEvent("survey_confirmation_cta_clicked", params);
};

/* ============================================================ */
/*  Phase B.3 — Landing page events (GA4-only)                  */
/* ============================================================ */

export const trackFaqExpanded = (params: { question_index: number; question_text_hash: string }) =>
  track("faq_expanded", params);

export const trackHeroVideoPaused = (params: { current_time_sec: number }) =>
  track("hero_video_paused", params);

export const trackHeroVideoResumed = (params: { current_time_sec: number }) =>
  track("hero_video_resumed", params);

export const trackTestimonialAdvanced = (params: {
  from_index: number;
  to_index: number;
  direction: "next" | "previous";
}) => track("testimonial_advanced", params);

export const trackLandingSectionViewed = (params: { section_id: string }) =>
  track("landing_section_viewed", params);

export const trackFooterLinkClicked = (params: { href: string; label: string }) =>
  track("footer_link_clicked", params);

/* ============================================================ */
/*  Phase B.4 — Invite / share events                           */
/* ============================================================ */

export const trackInviteModalDismissed = (params: {
  shared_methods: string[];
  view_duration_ms: number;
}) => {
  const payload = {
    shared_methods: params.shared_methods,
    view_duration_ms: Math.max(0, Math.round(params.view_duration_ms)),
  };
  track("invite_modal_dismissed", payload);
  persistAnalyticsEvent("invite_modal_dismissed", payload, payload.view_duration_ms);
};

export const trackInviteLinkCopied = (params: { source: "social" | "card" | string }) =>
  track("invite_link_copied", params);

/* ============================================================ */
/*  Phase B.5 — Checkout return events                          */
/* ============================================================ */

export const trackCheckoutReturnViewed = (params: {
  status: "success" | "failed" | "pending";
  plan?: string;
}) => {
  track("checkout_return_viewed", params);
  persistAnalyticsEvent("checkout_return_viewed", params);
};

export const trackCheckoutRetryClicked = (params: { failure_reason?: string }) => {
  track("checkout_retry_clicked", params);
  persistAnalyticsEvent("checkout_retry_clicked", params);
};

export const trackCheckoutAbandonedReturn = (params: { failure_reason?: string }) => {
  track("checkout_abandoned_return", params);
  persistAnalyticsEvent("checkout_abandoned_return", params);
};

/* ============================================================ */
/*  Phase D — UX quality signals (used by uxSignals.ts)         */
/* ============================================================ */

export const trackScrollDepth = (
  bucket: 25 | 50 | 75 | 100,
  params: { pathname: string; max_scroll_pct: number }
) => {
  const eventName = `scroll_depth_${bucket}` as const;
  track(eventName, params);
  persistAnalyticsEvent(eventName, params);
};

export const trackRageClick = (params: {
  pathname: string;
  target_selector: string;
  click_count: number;
  window_ms: number;
}) => {
  track("rage_click", params);
  persistAnalyticsEvent("rage_click", params);
};

export const trackDeadClick = (params: { pathname: string; target_selector: string }) =>
  track("dead_click", params);

export const trackTabHidden = (params: { pathname: string; visible_ms: number }) =>
  track("tab_hidden", params);

export const trackTabVisible = (params: { pathname: string; hidden_ms: number }) =>
  track("tab_visible", params);
