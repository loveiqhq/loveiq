/**
 * Where an untagged visit came from, by the referring site's host: the rules classifySource
 * applies and the info cards' queries spell out. Regular expressions that Postgres (`~`),
 * ClickHouse (`match`) and JavaScript read the same way; our own sites (OWN_HOST) are never a
 * referrer (the tracker and the PostHog reader drop them).
 */

/**
 * Search engines: Google in every country and its Android app, Bing, DuckDuckGo, Ecosia, Qwant,
 * Startpage, Yandex, Yahoo search and Brave Search. Gmail on the web opens links through
 * google.com, so an untagged click in an email read there looks like organic search.
 */
export const SEARCH_HOST = String.raw`^(www\.)?google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$|^com\.google\.android\.googlequicksearchbox$|(^|\.)(bing\.com|duckduckgo\.com|ecosia\.org|qwant\.com|startpage\.com|ya\.ru|yandex\.[a-z.]+)$|(^|\.)search\.yahoo\.(com|co\.jp|[a-z]{2})$|^search\.brave\.com$`;

/** AI assistants, as their own pages link out. */
export const AI_HOST = String.raw`(^|\.)(chatgpt\.com|chat\.openai\.com|perplexity\.ai|gemini\.google\.com|copilot\.microsoft\.com|copilot\.com|claude\.ai)$`;

/**
 * Email: the Gmail app, webmail (mail., email., webmail. hosts, Outlook, iCloud) and the link
 * checkers mail providers send clicks through (GMX and web.de, Mimecast).
 */
export const EMAIL_HOST = String.raw`^com\.google\.android\.gm$|^(mail|email|webmail)\.|(^|\.)(outlook\.live\.com|outlook\.office\.com|outlook\.office365\.com|icloud\.com|temp-mail\.org|ui-deref\.de|deref-gmx\.net|deref-web\.de|mimecastprotect\.com)$`;

/** Social sites and messengers, on the web or as their Android apps (com.facebook.katana). */
export const SOCIAL_HOST = String.raw`(^|\.)(facebook|instagram|telegram|whatsapp|linkedin|reddit|tiktok|pinterest|youtube|threads|twitter)\.|^(t\.co|x\.com|t\.me|lnkd\.in)$`;

/** Our own sites: a visit from one of them has no referrer of its own. */
export const OWN_HOST = String.raw`(^|\.)(loveiq\.org|stripe\.com)$`;

/** A rule as it is written inside a HogQL string, where a backslash escapes. */
export const inHogql = (re: string) => re.replaceAll("\\", "\\\\");
