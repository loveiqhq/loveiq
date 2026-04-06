type GTag = (command: "event", eventName: string, params?: Record<string, unknown>) => void;
type ConsentCategory = "analytics" | "advertisement";

const GOOGLE_ADS_TAG_ID = "AW-18068690553";
const GOOGLE_ADS_WAITLIST_LABEL = ["guQ3CPHxh5cc", "EPms6adD"].join("");
const GOOGLE_ADS_WAITLIST_SEND_TO = `${GOOGLE_ADS_TAG_ID}/${GOOGLE_ADS_WAITLIST_LABEL}`;
const COOKIEYES_CONSENT_COOKIE = "cookieyes-consent";

declare global {
  interface Window {
    gtag?: GTag;
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

export const trackGoogleAdsWaitlistConversion = () => {
  if (typeof window === "undefined") return;
  if (!window.__loveiqGoogleAdsEnabled) return;
  if (!hasCookieYesConsent("advertisement")) return;

  window.gtag?.("event", "conversion", {
    send_to: GOOGLE_ADS_WAITLIST_SEND_TO,
    value: 1.0,
    currency: "MXN",
  });
};
