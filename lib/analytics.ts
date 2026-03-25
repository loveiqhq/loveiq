type GTag = (command: "event", eventName: string, params?: Record<string, unknown>) => void;

declare global {
  interface Window {
    gtag?: GTag;
    dataLayer?: Array<Record<string, unknown>>;
  }
}

export const track = (name: string, params?: Record<string, unknown>) => {
  if (typeof window === "undefined") return;
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

export const trackSurveyComplete = (durationMs: number) => {
  // TODO: Remove legacy "survey_complete" after 2026-06-01
  track("survey_complete", { duration_ms: durationMs });
  track("survey_completed", { duration_ms: durationMs });
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
  track("report_purchase", params as unknown as Record<string, unknown>);
};
