import { getCsrfToken } from "@/lib/csrf-client";

type GTag = (command: "event", eventName: string, params?: Record<string, unknown>) => void;
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
  }
}

const PERSISTED_EVENTS = new Set([
  "report_viewed",
  "paywall_view",
  "price_shown",
  "begin_checkout",
  "paywall_unlocked",
  "report_engagement_1min",
  "report_engagement_5min",
  "report_engagement_10min",
]);

/**
 * Set on /report page load. Lets the persistence layer attach the submission
 * id (FK target on analytics_event) without every call site repeating it.
 */
export const setReportSubmissionContext = (submissionId: number | null | undefined) => {
  if (typeof window === "undefined") return;
  window.__loveiqReportSubmissionId = submissionId ?? null;
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
  // skipped.
  if (!submissionId) return;

  const csrf = getCsrfToken();
  if (!csrf) return;

  const url = "/api/analytics-event";
  const headerBody = {
    event_type: eventType,
    submission_id: submissionId,
    metadata,
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

const hasCookieYesConsent = (category: ConsentCategory) => {
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
