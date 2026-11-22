/**
 * Mira's email links (a nudge's "Email preferences", the journal reminder's stop and a weekly
 * session's "Stop reminders") carry a signed token, `?t=`, that stands for the person and never
 * expires. Left in the address, every analytics tag on the page would read it (PostHog's
 * $current_url, GA4's page_location, Clarity's page URL). So proxy.ts moves it into this
 * httpOnly cookie, sent only to the page the link opened and kept for an hour, and opens that
 * page again without it; the page reads the token from the cookie. Links in emails already sent
 * keep working.
 */
export const LINK_COOKIE = "mira_link";
export const LINK_COOKIE_MAX_AGE = 60 * 60;
export const LINK_PAGES = ["/mira/session/stop", "/mira/nudges", "/mira/journal/reminder"];
