import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseMiddleware } from "@shared/auth/supabase-middleware";
import logger from "@shared/observability/logger";
import {
  LANDING_VARIANT_COOKIE,
  LANDING_VARIANT_HEADER,
  isLandingVariant,
  type LandingVariant,
} from "@shared/experiments/landingVariant";
import { sanitizeUtmSource } from "@shared/url/utm";
import { reportingDay } from "@shared/time/reporting-day";

// Google Ads remarketing/audience pixels (`/ads/ga-audiences` and
// `/pagead/1p-user-list/<id>`) are requested from the visitor's LOCAL Google
// country domain, not google.com. CSP host-source syntax cannot wildcard a TLD
// (`https://www.google.*` is invalid), so each country domain must be named or
// that visitor's remarketing data is silently dropped. Only `www.` is allowed —
// narrower than `*.google.<tld>`.
//
// Deliberately NOT the full ~190 Google domains: that measured at +4.4KB on a
// header returned by every page and API response, to serve countries we have no
// visitors in. This is EU/EEA + UK + Balkans + the major English/LatAm/Asia
// markets (~1KB). Adding a country later is one line. Since 2017 Google
// redirects country search domains to google.com, so these pixels are already
// the minority case.
//
// Joined once at module load, not per request: the CSP is otherwise rebuilt on
// every request through the middleware.
const GOOGLE_COUNTRY_DOMAINS = [
  // EU / EEA
  "at",
  "be",
  "bg",
  "ch",
  "com.cy",
  "cz",
  "de",
  "dk",
  "ee",
  "es",
  "fi",
  "fr",
  "gr",
  "hr",
  "hu",
  "ie",
  "is",
  "it",
  "li",
  "lt",
  "lu",
  "lv",
  "com.mt",
  "nl",
  "no",
  "pl",
  "pt",
  "ro",
  "se",
  "si",
  "sk",
  // UK + Balkans (our own region)
  "co.uk",
  "ba",
  "me",
  "mk",
  "rs",
  "al",
  // Major markets outside Europe
  "com",
  "ca",
  "com.au",
  "co.nz",
  "co.in",
  "com.br",
  "com.mx",
  "co.za",
  "co.jp",
  "com.tr",
  "com.ua",
]
  .map((tld) => `https://www.google.${tld}`)
  .join(" ");

const isProduction = process.env.NODE_ENV === "production";
const CSRF_COOKIE_NAME = isProduction ? "__Host-csrf" : "__csrf";
const CSRF_TOKEN_LENGTH = 32;

// Bots are no longer given a landing cookie (see the cookie-mint block). The
// landing A/B is concluded: the white redesign won and is now served to 100% of
// traffic, so there is nothing to keep a crawler pinned to.
const LANDING_BOT_UA_REGEX =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|outbrain|pinterest|vkshare|w3c_validator|whatsapp|telegrambot|applebot|gptbot|chatgpt|ccbot|claudebot|claude-web|perplexity|google-extended|amazonbot|bytespider/i;

/**
 * Landing variant for a `/` request. **The round-2 split is over: 100% "white".**
 *
 * CONCLUDED 2026-09-19, on Marcus's 2026-09-16 instruction to shut down the
 * loser. The honest reading of the evidence is that the test could not resolve
 * at our traffic. Over the 30 days to 2026-09-19, of the people who opened a
 * report, V2 reached checkout at 9.90% (20/202) and V1 at 6.63% (12/181): a
 * +3.3pp gap with a 95% CI of -2.2 to +8.8pp, which still straddles zero.
 * Separating a gap that size needs roughly 1,150 report-opens PER ARM; a month
 * produced ~200, so resolving it would take about six more months of running a
 * design we already believe is worse.
 *
 * V1 is nominally ahead on payments (2 vs 1), and that is three payments in
 * total — noise, not a result. V2 leads every upstream metric that has enough
 * events to mean anything, so V2 ships.
 *
 * Order matters:
 *   - `?variant=` is still a QA override, so the retired design can be opened
 *     deliberately (it also re-stamps the cookie, so it sticks for the session);
 *   - everyone else, INCLUDING a returning visitor holding a "white_prev"
 *     cookie, gets "white". A concluded arm is not a thing to keep serving:
 *     leaving the cookie sticky would keep a slice of real traffic on the losing
 *     design indefinitely and keep feeding it into every per-arm number.
 *
 * The bot rule is gone with the split — with one landing there is nothing for a
 * crawler to dilute.
 */
function resolveLandingVariant(request: NextRequest): LandingVariant {
  const override = request.nextUrl.searchParams.get("variant");
  if (isLandingVariant(override)) return override;
  return "white";
}

// Daily dedup flag for the consent-independent unique-visit count (the
// Visitor→Survey-start CVR denominator). Holds only a date — no identifier, no
// cross-day linkage — so it is a strictly-functional, aggregate-analytics cookie,
// set regardless of analytics consent. The date is the Europe/Berlin reporting day
// (see shared/time/reporting-day.ts), NOT UTC, and must stay the same clock as the
// funnel_event row or every visitor in the offset window counts twice a day.
const VISIT_DAY_COOKIE = "liq_dv";

/**
 * Same idea, same clock, for the SURVEY PAGE: one row per browser per Berlin
 * day, written server-side and set regardless of analytics consent. Holds only
 * a date — no identifier, no cross-day linkage.
 *
 * WHY A SECOND SERVER-SIDE COUNTER EXISTS. `survey_engine_mount` is posted by
 * the browser using the `__liq_vid` cookie, which this middleware mints only
 * AFTER the visitor clicks Accept — so it is consent-gated, while the
 * `unique_visitor` denominator beside it is not. Measured 2026-09-19 over 30
 * days: 637 visitors reached the consent-gated step against 977 server-written
 * survey drafts. The gap was being read as people bouncing on the landing page;
 * most of it is people declining cookies.
 *
 * The identifiers do not match either: of 3,172 mount ids all time, only 632
 * (20%) ever appear as a `unique_visitor` id, because one is a per-day random
 * UUID and the other a persistent cookie value. So the old numerator could not
 * be compared to its denominator even in principle.
 *
 * `survey_page_view` fixes both: same writer, same id scheme, same consent
 * posture, same day clock as `unique_visitor`. It is a NEW event type rather
 * than a change to the old one, so the existing series keeps its meaning and
 * nothing is double counted — the two can run side by side and the difference
 * between them IS the consent gap, which is worth being able to see.
 */
const SURVEY_DAY_COOKIE = "liq_ds";

/**
 * True when this request is the survey page itself, by the same rules
 * `shouldCountVisit` uses (document GET, not a bot, not a prefetch). Exported
 * for unit testing.
 */
export function shouldCountSurveyView(request: NextRequest): boolean {
  if (!shouldCountVisit(request)) return false;
  const path = request.nextUrl.pathname;
  return path === "/survey" || path.startsWith("/survey/");
}

/**
 * True when this request is a real, countable page view for the daily
 * unique-visit metric: a top-level document GET on a public page, not a bot, not
 * `/api|/admin|/login|/_next`. (Next prefetches are already excluded by the
 * matcher; `sec-purpose` is belt-and-suspenders.) Exported for unit testing.
 */
export function shouldCountVisit(request: NextRequest): boolean {
  if (request.method !== "GET") return false;
  const path = request.nextUrl.pathname;
  if (
    path.startsWith("/api") ||
    path.startsWith("/admin") ||
    path.startsWith("/_next") ||
    path === "/login"
  ) {
    return false;
  }
  if (request.headers.get("sec-purpose")?.includes("prefetch")) return false;
  const dest = request.headers.get("sec-fetch-dest");
  const accept = request.headers.get("accept") || "";
  const isDocument = dest === "document" || (dest === null && accept.includes("text/html"));
  if (!isDocument) return false;
  return !LANDING_BOT_UA_REGEX.test(request.headers.get("user-agent") || "");
}

// Visitor id cookie for top-of-funnel attribution. Stable per-browser UUID
// (1yr) minted server-side so it survives JS being disabled / blocked. The
// companion `liq_vday` cookie is client-owned (set by VisitorPinger after
// the daily ping fires) — middleware must NOT touch it, otherwise the
// "first request of the day" signal disappears before the client can read it.
// SameSite=Lax so cross-site nav from ads/social keeps the cookie.
//
// T-02: minted ONLY after the user has accepted analytics consent via the
// CookieYes banner. Pre-consent visits do not set the cookie; the user gets
// `__liq_vid` starting with their first request AFTER clicking Accept. Mirrors
// `hasCookieYesConsent("analytics")` from features/analytics/client.ts but
// runs in the Edge runtime against `request.cookies`.
const VISITOR_ID_COOKIE = isProduction ? "__Host-liq_vid" : "__liq_vid";
const VISITOR_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const COOKIEYES_CONSENT_COOKIE = "cookieyes-consent";

function hasAnalyticsConsent(request: NextRequest): boolean {
  const raw = request.cookies.get(COOKIEYES_CONSENT_COOKIE)?.value;
  if (!raw) return false;
  // CookieYes encodes as comma-separated key:value pairs, e.g.:
  //   consentid:abc123,consent:yes,action:yes,necessary:yes,functional:yes,
  //   analytics:yes,performance:yes,advertisement:no
  // We treat ONLY `analytics:yes` as authorising a tracking cookie.
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return false;
  }
  return decoded.split(",").some((entry) => {
    const [key, value] = entry.split(":");
    return key === "analytics" && value === "yes";
  });
}

function generateCsrfToken(): string {
  const array = new Uint8Array(CSRF_TOKEN_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Cache staging password hash at module level to avoid recomputing on every request
let stagingPasswordHash: string | null = null;
let stagingPasswordSource: string | null = null;

/**
 * Static media under `public/`, which the staging gate must let through.
 *
 * Next's image optimizer fetches the SOURCE file over HTTP before resizing it.
 * That internal request carries no staging cookie, so a gated path answers it
 * with a 307 to /login and the optimizer reports `received null` — every
 * `/_next/image` URL for it then 400s. `/images/` was already exempt; nothing
 * else under `public/` was, so `/testimonials/`, `/academic/`, `/privacy/`,
 * `/about/` and `/report-previews/` (the blurred locked-chapter images on the
 * report) all 400'd.
 *
 * SCOPE: this bit LOCALLY BUILT servers only — `npm run build && npm start`
 * with STAGING_PASSWORD set, which is the normal local setup. Measured
 * 2026-09-14: staging.loveiq.org and production served the same URLs 200 both
 * before and after, because Vercel optimizes images at the edge and its source
 * fetch never passes through this middleware. So this fixes local builds and
 * the report QA sweep (56 of its 85 failures), not anything a visitor saw.
 *
 * Matched by extension rather than by folder so a new asset directory does not
 * silently reintroduce it. Deliberately NOT matched: `.js`, `.html`, `.json`,
 * `.md` — `public/clarity-init.js` and friends stay behind the gate.
 */
const STATIC_MEDIA_RE = /\.(?:jpe?g|png|gif|webp|avif|svg|ico|mp4|webm|woff2?)$/i;

async function getStagingPasswordHash(password: string): Promise<string> {
  if (stagingPasswordHash && stagingPasswordSource === password) {
    return stagingPasswordHash;
  }
  stagingPasswordHash = await sha256(password);
  stagingPasswordSource = password;
  return stagingPasswordHash;
}

/**
 * The trailing-slash 308 that Next used to do for us.
 *
 * Next's own version of it is switched off in next.config.js, because Next applied that
 * redirect BEFORE any rewrite — `beforeFiles` included — and the proxy forwards endpoints
 * that legitimately end in a slash (`/i/v0/e/`, `/e/`, `/s/`). With the automatic redirect
 * on, every capture POST got a 308 rather than reaching PostHog.
 *
 * Doing it here instead restores the exact previous behaviour for pages, because this
 * middleware does not run on the proxy path at all (see `config.matcher`). `/about/` still
 * 308s to `/about`; the sitemap, the canonical tags and every existing inbound link keep
 * working, and search engines are not handed a second URL for every page.
 *
 * Root is excluded: "/" is entirely a trailing slash, and stripping it yields "".
 */
export function stripTrailingSlash(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (pathname === "/" || !pathname.endsWith("/")) return null;
  // A PLAIN `URL` built from `request.url`, not `request.nextUrl.clone()`.
  //
  // `nextUrl` is a NextURL, which re-applies Next's own trailing-slash normalisation when
  // `pathname` is assigned — so the slash came straight back and the response redirected
  // /about/ to /about/. Verified on a preview deployment: five hops and still 308, an
  // infinite loop on every page with a trailing slash, and browsers cache a 308.
  // A plain URL stores exactly what it is given.
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/\/+$/, "");
  return NextResponse.redirect(url, 308);
}

export async function proxy(request: NextRequest) {
  // Restore Next's trailing-slash redirect, which next.config.js disables for the
  // PostHog proxy's sake. Must run first: everything below assumes a normalised path.
  const trailingSlashRedirect = stripTrailingSlash(request);
  if (trailingSlashRedirect) return trailingSlashRedirect;

  // Staging gate: when STAGING_PASSWORD is set, require a valid session cookie
  const STAGING_PASSWORD = process.env.STAGING_PASSWORD;
  if (STAGING_PASSWORD) {
    const path = request.nextUrl.pathname;
    const isPublic =
      path === "/login" ||
      path === "/api/health" ||
      path === "/api/stripe/webhook" ||
      // Slack posts events here signed, not cookied, so it can never satisfy the
      // staging gate — same reason the two webhooks above are exempt. Without
      // this the staging deployment answers Slack with a redirect to /login and
      // the brain silently never replies.
      path === "/api/slack/events" ||
      // The MCP endpoint authenticates with a bearer token and is called by
      // Claude, not a browser, so it has no staging session cookie and never
      // could. Same reason as the webhooks above.
      path === "/api/mcp" ||
      path.startsWith("/api/cron/") ||
      path.startsWith("/api/staging-") ||
      path.startsWith("/admin") ||
      path.startsWith("/_next/") ||
      path.startsWith("/images/") ||
      path.startsWith("/emails/") ||
      STATIC_MEDIA_RE.test(path) ||
      path === "/favicon.ico" ||
      path === "/favicon.svg" ||
      path === "/apple-touch-icon.png";

    if (!isPublic) {
      const session = request.cookies.get("staging_session")?.value;
      const expected = await getStagingPasswordHash(STAGING_PASSWORD);
      if (session !== expected) {
        const loginUrl = new URL("/login", request.url);
        const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
        if (nextPath.startsWith("/") && !nextPath.startsWith("//")) {
          loginUrl.searchParams.set("next", nextPath);
        }
        return NextResponse.redirect(loginUrl);
      }
    }
  }

  // Generate a random nonce for CSP
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const isDev = !isProduction;
  const googleFontStyleSources = "https://fonts.googleapis.com";
  const googleFontSources = "https://fonts.gstatic.com";
  const stripeScriptSources = "https://js.stripe.com https://*.js.stripe.com";
  const stripeImageSources = "https://*.stripe.com";
  const stripeConnectSources =
    "https://api.stripe.com https://m.stripe.com https://m.stripe.network https://r.stripe.com";
  const stripeFrameSources =
    "https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://checkout.stripe.com";
  // Widen CSP to the configured PostHog host plus its registrable domain (the
  // SDK pulls the recorder/assets from sibling subdomains). Parsing is guarded
  // because this runs in middleware on every request: an unparseable
  // NEXT_PUBLIC_POSTHOG_HOST would otherwise throw and 500 the entire site
  // rather than merely dropping analytics.
  /*
   * Supabase origins for connect-src, including the wss:// scheme.
   *
   * The admin panel's PagePresence widget opens a Supabase Realtime WebSocket.
   * connect-src never listed supabase.co, so that socket has always been refused
   * — silently in Chromium, but Safari THROWS a SecurityError straight out of the
   * WebSocket constructor. That throw escapes PagePresence's useEffect into the
   * app error boundary, which is why every admin page except /admin/login (which
   * returns before PagePresence mounts) rendered and was then replaced by
   * "Something went wrong".
   *
   * Parsed defensively: this runs in middleware on every request, so a malformed
   * NEXT_PUBLIC_SUPABASE_URL must degrade to "no entry" rather than 500 the site.
   */
  const supabaseCspSources = (() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) return "";
    try {
      const { origin, hostname } = new URL(url);
      return `${origin} wss://${hostname}`;
    } catch {
      return "";
    }
  })();

  /**
   * Still emitted, though the browser no longer talks to PostHog directly.
   *
   * Since the /relay proxy every analytics request is same-origin and covered by 'self',
   * so these entries grant nothing that is currently used. They are kept deliberately
   * rather than tidied away: posthog-js reaches for an absolute host in paths this proxy
   * has not been exercised on — a toolbar load, a replay upload retry — and a CSP refusal
   * is invisible outside the browser console. Removing them is a separate change that
   * needs its own evidence, not a side effect of adding the proxy.
   */
  const posthogCspSources = (() => {
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
    if (!host) return "";
    try {
      const { hostname } = new URL(host);
      return `${host} https://*.${hostname.split(".").slice(-2).join(".")}`;
    } catch {
      return "";
    }
  })();

  // Build CSP header
  // Production: 'self' + 'unsafe-inline' + explicit external domain allowlist.
  //   Nonce-based CSP was tried but abandoned: Next.js App Router generates inline bootstrap
  //   scripts (webpack loader, RSC streaming) that don't receive the nonce. WebKit/Safari
  //   strictly enforces that ALL inline scripts need the nonce when nonce-* is in the policy,
  //   which blocked React hydration entirely. Chrome/Firefox are more lenient. Since this site
  //   has no user-generated content, 'unsafe-inline' is an acceptable tradeoff.
  // Development: permissive for HMR/webpack
  const cspHeader = [
    "default-src 'self'",
    isDev
      ? `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${posthogCspSources}`
      : `script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://googleads.g.doubleclick.net https://www.googleadservices.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://cdn-cookieyes.com https://cookieyes.com https://connect.facebook.net https://analytics.tiktok.com https://www.clarity.ms https://*.clarity.ms https://widget.trustpilot.com ${posthogCspSources} ${stripeScriptSources}`,
    `style-src 'self' 'unsafe-inline' ${googleFontStyleSources}`, // Tailwind requires unsafe-inline for styles
    "worker-src 'self' blob:",
    `font-src 'self' data: ${googleFontSources}`,
    `img-src 'self' data: blob: https://images.unsplash.com https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com https://googleads.g.doubleclick.net https://www.googleadservices.com https://www.google.com ${GOOGLE_COUNTRY_DOMAINS} https://cdn-cookieyes.com https://flagcdn.com https://www.facebook.com https://*.clarity.ms https://c.bing.com https://*.trustpilot.com https://*.trustpilotcdn.net ${stripeImageSources}`,
    "media-src 'self'",
    // GA4 does not post only to www.google-analytics.com: it uses region-scoped
    // hosts (region1.google-analytics.com, analytics.google.com) and Google Ads
    // conversions post to stats./ad.doubleclick.net and
    // pagead2.googlesyndication.com. None of those were allowlisted, so every
    // such /collect was refused and GA4 + Ads numbers were silently lossy while
    // the browser console filled with CSP errors. Known remaining gap: the Ads
    // remarketing pixels on Google country domains
    // (www.google.<cc>/ads/ga-audiences, /pagead/1p-user-list) still fail —
    // CSP host-source cannot wildcard a TLD and enumerating ~190 ccTLDs is worse
    // than losing audience pixels. Conversion measurement is unaffected by that.
    // `*.cookieyes.com` rather than the two subdomains we happened to know about.
    // The consent banner calls `directory.cookieyes.com/api/v1/ip` to learn the visitor's
    // region, and CSP host matching is EXACT — `cookieyes.com` does not cover a subdomain
    // — so that call was refused on every page load. Measured 2026-09-14 on a production
    // report: "Refused to connect ... directory.cookieyes.com", then `TypeError: Failed to
    // fetch` inside banner.js. Without the region the banner cannot tell a GDPR visitor
    // from a CCPA one, and this site's traffic is overwhelmingly US. The wildcard matches
    // how `*.clarity.ms` is already handled, and stops the next subdomain repeating it.
    `connect-src 'self'${isDev ? " ws://localhost:* http://localhost:*" : ""} https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://www.googletagmanager.com https://googleads.g.doubleclick.net https://stats.g.doubleclick.net https://ad.doubleclick.net https://pagead2.googlesyndication.com https://www.googleadservices.com https://www.google.com https://images.unsplash.com https://www.google.com/recaptcha/ https://cdn-cookieyes.com https://cookieyes.com https://*.cookieyes.com https://www.facebook.com https://analytics.tiktok.com https://*.clarity.ms https://c.bing.com https://widget.trustpilot.com ${posthogCspSources} ${supabaseCspSources} ${stripeConnectSources}`,
    `frame-src 'self' https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://cdn-cookieyes.com https://widget.trustpilot.com ${stripeFrameSources}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    isDev || request.nextUrl.hostname === "localhost" || request.nextUrl.hostname === "127.0.0.1"
      ? ""
      : "upgrade-insecure-requests", // Skip in dev and on localhost (Playwright WebKit on Linux doesn't implement the localhost exemption)
    // R-11: CSP violation reporting. Browsers POST a JSON report to this
    // endpoint when a directive blocks content. `report-uri` is the
    // legacy directive (still widely supported); `report-to` is the
    // Reporting API replacement. We send both so old + new browsers
    // both report. The report-to group "csp" is declared in the
    // Report-To header set below.
    isDev ? "" : "report-uri /api/csp-report",
    isDev ? "" : "report-to csp",
  ]
    .filter(Boolean)
    .join("; ");

  // Clone the request headers and set CSP nonce for use in components
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Strip any inbound copies of our internal visit headers so a client can't
  // spoof them (they are set below only for a genuine new daily visit). Without
  // this, `x-liq-new-visit` + `x-liq-new-visit-utm` echoed by a client would
  // reach the root layout and inject fake visitor rows / channel labels into
  // funnel_event. These headers are only ever produced by this middleware.
  requestHeaders.delete("x-liq-new-visit");
  requestHeaders.delete("x-liq-new-visit-utm");
  requestHeaders.delete("x-liq-new-survey");

  // R-22: mint a request correlation id per request. Honor an inbound
  // x-request-id from the client/edge if present (helps trace across
  // Vercel logs + CDN logs); otherwise mint a UUID. Propagated to API
  // routes via the cloned request headers and echoed on the response so
  // a user can quote it in a support ticket.
  const inboundRequestId = request.headers.get("x-request-id");
  const requestId =
    inboundRequestId && /^[a-zA-Z0-9_-]{1,128}$/.test(inboundRequestId)
      ? inboundRequestId
      : crypto.randomUUID();
  requestHeaders.set("x-request-id", requestId);

  // White-landing A/B: compute the arm for the landing route and hand it to the
  // server render via a request header. Reading it here (not from cookies() in
  // the page) guarantees the FIRST visit renders the assigned arm — on the
  // request that mints the cookie, cookies() wouldn't see it yet.
  const isLandingRoute = request.nextUrl.pathname === "/";
  const landingVariant = isLandingRoute ? resolveLandingVariant(request) : null;
  if (landingVariant) {
    requestHeaders.set(LANDING_VARIANT_HEADER, landingVariant);
  }

  // Consent-independent daily unique-visit count (the Visitor→Survey-start CVR
  // denominator). Aggregate only — the dedup cookie holds just a date and the
  // funnel_event row gets a throwaway random id, so there is no profiling. The
  // row itself is written by the root layout via after() when this header is
  // present (keeps the DB write in Node app code, not the edge middleware).
  const visitDay = reportingDay();
  const isNewDailyVisit =
    shouldCountVisit(request) && request.cookies.get(VISIT_DAY_COOKIE)?.value !== visitDay;
  if (isNewDailyVisit) {
    // Tag the visit with the landing arm. On "/" the arm is freshly resolved;
    // elsewhere read the sticky __liq_lv cookie.
    //
    // An unresolvable arm is recorded as "unknown", NOT as "white". It used to
    // default to white, which quietly credited one arm with every visit it could
    // not attribute: the arm is only resolved on "/", but a visit is counted on
    // any public page, so every first-time entry via /survey, /glossary/*, an
    // invite link or an email deep-link — plus every cookieless and incognito
    // client — inflated white's denominator. That is the denominator of the
    // landing→survey-start comparison, so the bias landed straight on the
    // headline number.
    const cookieVariant = request.cookies.get(LANDING_VARIANT_COOKIE)?.value;
    const visitVariant =
      landingVariant ?? (isLandingVariant(cookieVariant) ? cookieVariant : "unknown");
    requestHeaders.set("x-liq-new-visit", visitVariant);
    // Last-touch acquisition source for THIS visit. sanitizeUtmSource strips to
    // a safe charset + length-caps + lowercases at the trust boundary (the raw
    // query param is attacker-controllable) using the SAME normalizer as the
    // survey-start writer, so channel labels share one format. NB: the two
    // writers read different inputs (this = live-URL last-touch; survey-start =
    // first-touch localStorage), so per-channel start-rate is DIRECTIONAL, not an
    // exact numerator/denominator match. NULL for direct/untagged visits.
    // Google Ads auto-tagging lands with a click id (gclid / gbraid / wbraid) and
    // no utm_source, so attribute those visits to google instead of leaving them
    // untagged (Direct). Mirrors the client-side capture in shared/url/utm.ts.
    const hasGoogleClickId = ["gclid", "gbraid", "wbraid"].some((k) =>
      request.nextUrl.searchParams.has(k)
    );
    const utmSource =
      sanitizeUtmSource(request.nextUrl.searchParams.get("utm_source")) ??
      (hasGoogleClickId ? "google" : undefined);
    if (utmSource) requestHeaders.set("x-liq-new-visit-utm", utmSource);
  }

  /**
   * First survey-page view per browser per day — the consent-independent
   * sibling of the visit count above. Written by the survey page via after(),
   * so the DB write stays in Node app code rather than edge middleware.
   */
  const isNewSurveyView =
    shouldCountSurveyView(request) && request.cookies.get(SURVEY_DAY_COOKIE)?.value !== visitDay;
  if (isNewSurveyView) {
    // Same arm resolution as the visit above: an unresolvable arm is "unknown",
    // never "white". /survey is exactly the entry path that used to inflate
    // white's denominator by defaulting.
    const surveyCookieVariant = request.cookies.get(LANDING_VARIANT_COOKIE)?.value;
    requestHeaders.set(
      "x-liq-new-survey",
      landingVariant ?? (isLandingVariant(surveyCookieVariant) ? surveyCookieVariant : "unknown")
    );
  }

  // Create response with security headers
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set("x-request-id", requestId);

  // Admin gate: verify Supabase Auth session for /admin pages AND /api/admin
  // JSON routes. Both must be covered: the `isApiAdmin` 401 branch below and
  // the idle-timeout only fire for paths that ENTER this block, and the admin
  // SPA polls /api/admin/* far more often than it navigates pages — gating
  // only "/admin" would (a) leave the 401 re-auth path dead and (b) let an
  // actively-working-but-not-navigating admin's idle timer go stale. The
  // per-route verifyAdminSession() stays as belt-and-suspenders.
  const adminPath = request.nextUrl.pathname;
  if (adminPath.startsWith("/admin") || adminPath.startsWith("/api/admin")) {
    const isAdminPublic =
      adminPath === "/admin/login" ||
      adminPath === "/api/admin/login" ||
      adminPath === "/api/admin/logout" ||
      // Public-by-design: the digest-image edge route is fetched by Slack's
      // anonymous image proxy (it cannot send cookies/headers). It
      // self-authorizes via an HMAC signature in the URL (verifyImagePayload →
      // 403 on a bad signature), reads no DB and exposes no admin data, so it
      // MUST bypass the admin session gate — otherwise Slack gets a 401 and the
      // funnel-digest charts render as broken images.
      adminPath.startsWith("/api/admin/digest-image/") ||
      adminPath.startsWith("/admin/auth/"); // callback route

    if (!isAdminPublic) {
      const supabase = createSupabaseMiddleware(request, response);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // For /api/admin/* JSON callers we return 401 so the admin React
      // app can detect re-auth-required and route the user. For page
      // requests we redirect to /admin/login.
      const isApiAdmin = adminPath.startsWith("/api/admin/");

      if (!user) {
        if (isApiAdmin) {
          return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
        }
        return NextResponse.redirect(new URL("/admin/login", request.url));
      }

      // R-13: 30-min idle timeout on admin sessions. Refresh activity on
      // every authorised admin request; refuse if the prior activity is
      // too stale. Stops a walked-away laptop from leaving the admin
      // panel open for the full Supabase session lifetime (~1h-7d).
      const ADMIN_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
      const lastActivityRaw = request.cookies.get("__admin_activity")?.value;
      const lastActivity = lastActivityRaw ? parseInt(lastActivityRaw, 10) : NaN;
      const now = Date.now();
      if (Number.isFinite(lastActivity) && now - lastActivity > ADMIN_IDLE_TIMEOUT_MS) {
        // Idle — force re-auth. JSON 401 for API callers, redirect for pages.
        if (isApiAdmin) {
          const resp = NextResponse.json(
            { error: "Session idle — please re-authenticate." },
            { status: 401 }
          );
          resp.cookies.delete("__admin_activity");
          return resp;
        }
        const redirect = NextResponse.redirect(
          new URL("/admin/login?error=idle_timeout", request.url)
        );
        redirect.cookies.delete("__admin_activity");
        return redirect;
      }
      // Bump activity. SameSite=lax + secure in prod. httpOnly because the
      // client never reads it and the Edge middleware is the only writer.
      //
      // maxAge MUST outlive the Supabase session, NOT merely the 30-min idle
      // window. If the cookie expired before the session, a long-idle request
      // would arrive with NO `__admin_activity` cookie → lastActivity = NaN →
      // the idle check below is SKIPPED → the admin is let straight back in on
      // a still-valid Supabase session, silently defeating the timeout for the
      // exact walked-away-laptop case it targets. 7 days comfortably exceeds
      // any realistic idle-but-still-authenticated window (and Supabase's own
      // session cookie expiry bounds anything longer), so the absence of the
      // cookie reliably coincides with an absent session (handled by !user).
      response.cookies.set("__admin_activity", String(now), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 7 * 24 * 60 * 60, // 7d — must exceed the Supabase session, not the idle window
      });

      // Pass user email to API routes via header for audit logging
      requestHeaders.set("x-admin-email", user.email || "");
    }
  }

  // Set security headers on response
  response.headers.set("Content-Security-Policy", cspHeader);
  // R-11: reporting endpoint declarations for the `report-to csp` CSP
  // directive above. Two headers for two generations of the spec:
  //   - `Reporting-Endpoints` (modern Reporting API v1, Chrome 96+/current
  //     Edge) — the named-endpoint map that current browsers honor.
  //   - `Report-To` (legacy Reporting API v0) — kept for older browsers that
  //     predate `Reporting-Endpoints`. Both name the same "csp" group so the
  //     single `report-to csp` directive works regardless of vintage.
  if (!isDev) {
    response.headers.set("Reporting-Endpoints", 'csp="/api/csp-report"');
    response.headers.set(
      "Report-To",
      JSON.stringify({
        group: "csp",
        max_age: 10886400,
        endpoints: [{ url: "/api/csp-report" }],
      })
    );
  }
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), autoplay=(self), payment=()"
  );
  // 6 months — long enough to satisfy HSTS best practice and security scanners,
  // short enough to give operational room if a cert/CDN migration is ever needed.
  // Shortening server-side is forward-safe: existing browsers retain their cached
  // longer max-age until that TTL expires.
  // R-12: max-age=2yr + includeSubDomains + preload — the trio required to
  // submit loveiq.org to hstspreload.org. Once preloaded, browsers refuse
  // plaintext connections to the apex AND every subdomain on first visit.
  // Operator step: submit https://hstspreload.org/?domain=loveiq.org once
  // this header has been live in prod for a few days.
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  // Cross-Origin-Opener-Policy for origin isolation
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  // T-16: Cross-Origin-Resource-Policy. `same-origin` stops external sites
  // from embedding our resources (img/script/etc.) cross-origin. Pairs
  // with COOP for Spectre-class defence-in-depth. We don't use COEP yet
  // because it requires every embedded resource (Stripe, reCAPTCHA, GTM
  // iframes) to also set CORP — a separate compatibility audit.
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");

  // Set CSRF cookie if not present
  const existingCsrf = request.cookies.get(CSRF_COOKIE_NAME);
  if (!existingCsrf) {
    const csrfToken = generateCsrfToken();
    response.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false, // Must be readable by JavaScript
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });
  }

  // Visitor id cookie: mint if missing/malformed AND the user has accepted
  // analytics consent. The day-stamp companion is managed entirely by the
  // client (see shared/observability/VisitorPinger).
  //
  // T-02: skip the mint entirely when no consent. Pre-consent visitors get
  // no `__liq_vid` at all; the cookie appears on their first request after
  // they accept the CookieYes analytics category. An accepted-then-declined
  // user keeps any previously-minted `__liq_vid` until it expires naturally
  // (or they clear cookies) — we don't proactively delete it here because
  // the CookieYes script handles category-tagged cookie cleanup client-side.
  const existingVid = request.cookies.get(VISITOR_ID_COOKIE)?.value;
  const hasValidVid = existingVid && VISITOR_ID_REGEX.test(existingVid);
  if (!hasValidVid && hasAnalyticsConsent(request)) {
    response.cookies.set(VISITOR_ID_COOKIE, crypto.randomUUID(), {
      httpOnly: false,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  }

  // Landing variant cookie. The A/B concluded → everyone is "white", so we
  // (re)mint the cookie on `/` for non-bots whenever it differs from the resolved
  // arm — which is also how the `?variant=` override sticks, and how a visitor on
  // the retired "control" cookie gets moved onto a live arm. FUNCTIONAL cookie —
  // stores only the variant, no PII — set regardless of analytics consent, like
  // the CSRF cookie. Bots are never given a cookie.
  if (isLandingRoute && landingVariant) {
    const ua = request.headers.get("user-agent") || "";
    const isBot = LANDING_BOT_UA_REGEX.test(ua);
    const existing = request.cookies.get(LANDING_VARIANT_COOKIE)?.value;
    const shouldSet = !isBot && existing !== landingVariant;
    if (shouldSet) {
      response.cookies.set(LANDING_VARIANT_COOKIE, landingVariant, {
        httpOnly: false,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365, // 1 year
      });
    }
  }

  // Daily dedup flag for the unique-visit metric: a date only (no identifier),
  // HttpOnly, short-lived → strictly functional, no cross-day tracking. Set when
  // this is the browser's first countable page view today (see x-liq-new-visit).
  if (isNewDailyVisit) {
    response.cookies.set(VISIT_DAY_COOKIE, visitDay, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 36, // 36h — comfortably covers a UTC-day rollover
    });
  }

  if (isNewSurveyView) {
    response.cookies.set(SURVEY_DAY_COOKIE, visitDay, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 36,
    });
  }

  // Security logging for API routes (3.4)
  // Note: This IP is for observability logging only, not for security decisions
  // (rate limiting uses getClientIp() which trusts only x-real-ip).
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const ip =
      request.headers.get("x-real-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      "unknown";
    logger.info({
      type: "api_request",
      method: request.method,
      path: request.nextUrl.pathname,
      ip,
      // R-22: log the correlation id we mint + echo as `x-request-id`, so a
      // user quoting it in a support ticket can be traced to this log line.
      // Without this the echoed header was untraceable server-side.
      requestId,
      userAgent: request.headers.get("user-agent")?.slice(0, 100) || "unknown",
    });
  }

  return response;
}

export const config = {
  matcher: [
    // Match all paths except static files and API routes that don't need CSP
    {
      // `relay` is the PostHog reverse proxy (see shared/analytics/posthog-proxy.ts).
      // Excluded for two reasons: this middleware would otherwise run on EVERY analytics
      // event and every session-replay chunk — by far the highest-volume path on the site
      // — and none of what it does (CSP headers, CSRF cookie, staging gate, security
      // logging) means anything for a request that is forwarded verbatim to PostHog.
      // The staging gate exclusion is deliberate, not incidental: a gated preview must
      // still be able to send analytics, which is how this proxy gets verified at all.
      source: "/((?!_next/static|_next/image|favicon.ico|images/|relay/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
