type GTag = (command: "event", eventName: string, params?: Record<string, unknown>) => void;

declare global {
  interface Window {
    gtag?: GTag;
  }
}

export const track = (name: string, params?: Record<string, unknown>) => {
  if (typeof window === "undefined") return;
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
