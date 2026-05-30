import { getCsrfToken } from "@shared/http/csrf-client";

type GTag = {
  (command: "event", eventName: string, params?: Record<string, unknown>): void;
  // `set user_properties` registers a user-scoped property so every subsequent
  // GA4 event is segmentable by it in Explorations (e.g. the forced-paywall arm).
  (command: "set", target: "user_properties", params: Record<string, unknown>): void;
};
type ConsentCategory = "analytics" | "advertisement";

const GOOGLE_ADS_TAG_ID = "AW-18068690553";
const GOOGLE_ADS_PURCHASE_LABEL = ["guQ3CPHxh5cc", "EPms6adD"].join("");
const GOOGLE_ADS_PURCHASE_SEND_TO = `${GOOGLE_ADS_TAG_ID}/${GOOGLE_ADS_PURCHASE_LABEL}`;
const COOKIEYES_CONSENT_COOKIE = "cookieyes-consent";

declare global {
  interface Window {
    gtag?: GTag;
    dataLayer?: Array<Record<string, unknown>>;
    __loveiqAnalyticsEnabled?: boolean;
    __loveiqGoogleAdsEnabled?: boolean;
    __loveiqGtagBootstrapped?: boolean;
    __loveiqReportSubmissionId?: number | null;
    /** Coupled forced-paywall A/B arm for the current report/wizard session. */
    __loveiqForcedPaywallArm?: "treatment" | "control" | null;
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
 * Set on the report + wizard once the forced-paywall arm is known. Every
 * persisted analytics event then auto-carries `forced_paywall_arm` in its
 * metadata, so the whole funnel is arm-attributable with a single GROUP BY
 * (no per-call wiring, nothing missed).
 */
export const setForcedPaywallArm = (arm: "treatment" | "control" | null) => {
  if (typeof window === "undefined") return;
  window.__loveiqForcedPaywallArm = arm;
  // Mirror the arm into GA4 as a user-scoped property so EVERY GA4 event (not
  // just experiment_exposure) is segmentable by arm in GA4 Explorations — no
  // per-event wiring. Consent-gated like all GA4 traffic. NOTE: to surface in
  // GA4 reports, register a custom dimension "forced_paywall_arm" (user-scoped)
  // in GA4 Admin → Custom definitions (one-time config, not code).
  if (arm && window.__loveiqAnalyticsEnabled && hasCookieYesConsent("analytics")) {
    window.gtag?.("set", "user_properties", { forced_paywall_arm: arm });
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

  // Auto-stamp the forced-paywall arm onto every persisted event so the whole
  // funnel is arm-attributable without per-call wiring. Caller keys win.
  const arm = window.__loveiqForcedPaywallArm ?? null;
  const mergedMetadata = arm ? { forced_paywall_arm: arm, ...metadata } : metadata;

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

export const hasCookieYesConsent = (category: ConsentCategory) => {
  const consentValue = getCookieValue(COOKIEYES_CONSENT_COOKIE);
  if (!consentValue) return false;

  return consentValue.split(",").some((entry) => {
    const [key, value] = entry.split(":");
    return key === category && value === "yes";
  });
};

export const track = (name: string, params?: Record<string, unknown>) => {
  if (typeof window === "undefined") return;
  if (!window.__loveiqAnalyticsEnabled) return;
  if (!hasCookieYesConsent("analytics")) return;
  window.gtag?.("event", name, params);
  // Also push to dataLayer for GTM consumption
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

export const trackStartSurvey = (
  location: "nav" | "hero" | "report_section" | "footer" | "archetype-teaser"
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
  reportType: "essentials" | "full_report" | "all_reports" | "locked",
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
  plan: "essentials" | "full_report" | "all_reports";
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
  plan_needed?: "essentials" | "full_report" | "all_reports";
}

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
};

export interface PriceShownParams {
  plan: "essentials" | "full_report" | "all_reports";
  /** Final EUR amount the user sees (post-multipliers, post-ladder, normalized). */
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

export const trackBeginCheckout = (
  plan: "essentials" | "full_report" | "all_reports",
  price: number,
  currency: string
) => {
  const params = { plan, price, currency };
  track("begin_checkout", params);
  persistAnalyticsEvent("begin_checkout", params);
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
  plan: "essentials" | "full_report" | "all_reports",
  priceEur: number,
  currency: string,
  transactionId: string
) => {
  const params = { plan, price: priceEur, currency, transaction_id: transactionId };
  track("paywall_unlocked", params);
  persistAnalyticsEvent("paywall_unlocked", params);
};

export type ReportEngagementThreshold = 60 | 300 | 600;
export type ReportEngagementType = "essentials" | "full_report" | "all_reports" | "locked";

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
  if (!window.__loveiqAnalyticsEnabled) return;
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
  if (!window.__loveiqGoogleAdsEnabled) return;
  if (!hasCookieYesConsent("advertisement")) return;

  window.gtag?.("event", "conversion", {
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
 * The scroll/forced pricing modal became visible. Captures modal impressions
 * per arm (treatment ≈ immediate; control = scroll-gated). `forced_paywall_arm`
 * is auto-stamped by persistAnalyticsEvent.
 */
export const trackScrollPaywallShown = (params: { surface?: string } = {}) => {
  const payload = params.surface ? { surface: params.surface } : {};
  track("scroll_paywall_shown", payload);
  persistAnalyticsEvent("scroll_paywall_shown", payload);
};

/**
 * The treatment flip card was flipped. `to` = which face is now showing.
 * Captures flip engagement; `forced_paywall_arm` is auto-stamped.
 */
export const trackExperimentCardFlipped = (params: { to: "pricing" | "archetype" }) => {
  const payload = { to: params.to };
  track("experiment_card_flipped", payload);
  persistAnalyticsEvent("experiment_card_flipped", payload);
};

export const trackLockIconClicked = (params: {
  section_id: string;
  archetype?: string | null;
  plan_needed: "essentials" | "full_report" | "all_reports";
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
