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
  }
}

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

export const trackStartSurvey = (
  location: "nav" | "hero" | "report_section" | "footer" | "archetype-teaser"
) => {
  track("cta_click", { cta: "start_survey", location });
};

export const trackLearnMore = (location: "hero") => {
  track("cta_click", { cta: "learn_more", location });
};

export const trackWaitlistSignup = (source: string) => {
  track("waitlist_signup", { method: "form", source });
};

export const trackSurveyStart = () => {
  // TODO: Remove legacy "survey_start" after 2026-06-01
  track("survey_start");
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
  // TODO: Remove legacy "survey_complete" after 2026-06-01
  track("survey_complete", { duration_ms: durationMs });
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
  track("report_viewed", {
    report_type: reportType,
    ...(archetype ? { archetype } : {}),
  });
};

export interface PaywallPlanItem {
  plan: "essentials" | "full_report" | "all_reports";
  price: number;
  currency: string;
}

export const trackPaywallView = (items: PaywallPlanItem[]) => {
  if (!items.length) return;
  track("paywall_view", { currency: items[0].currency, items });
};

export const trackBeginCheckout = (
  plan: "essentials" | "full_report" | "all_reports",
  price: number,
  currency: string
) => {
  track("begin_checkout", { plan, price, currency });
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
