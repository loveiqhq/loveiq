/**
 * Where the BROWSER sends analytics, and where that gets forwarded to.
 *
 * Ad blockers match on hostname, and `*.i.posthog.com` is on every major blocklist. Routing
 * the browser's analytics through this site's own origin makes the request first-party, so
 * the blocklist does not match it. The rewrite in `next.config.js` forwards it to PostHog
 * unchanged.
 *
 * THE PATH IS DELIBERATELY NOT `/ingest`. That is the path in PostHog's own documentation,
 * which makes it the first one a blocklist author adds — a proxy on the documented path
 * buys progressively less over time. Nothing else depends on the name.
 *
 * THE VALUES LIVE IN A .js FILE next to this one, and this module only re-types them.
 * `next.config.js` is CommonJS and runs before any TypeScript is compiled, so it cannot
 * import a .ts module; having both read one CommonJS file is what stops the browser's
 * `api_host` and the rewrite rule from drifting apart — a disagreement that would send
 * every event into a 404 and log nothing anywhere.
 *
 * WHAT THIS DOES NOT CHANGE: `NEXT_PUBLIC_POSTHOG_HOST` still holds the absolute PostHog
 * origin and must keep doing so. It is read by `features/analytics/server/posthog.ts` for
 * the server-side purchase send — which runs in a Vercel function with no origin to be
 * relative to — and by `proxy.ts` to build the CSP. Pointing THAT at a relative path breaks
 * server-side purchase tracking silently, because the send is best-effort and a bad URL
 * logs nothing.
 */
import constants from "./posthog-proxy.constants.js";

/** First-party path the browser posts analytics to. Rewritten to PostHog server-side. */
export const POSTHOG_PROXY_PATH: string = constants.POSTHOG_PROXY_PATH;

/** PostHog's EU ingestion origin — events, decide, session replay. */
export const POSTHOG_UPSTREAM_API: string = constants.POSTHOG_UPSTREAM_API;

/** PostHog's EU asset origin — the JS bundles under /static/. A separate host upstream,
 *  which is why the rewrite needs two rules and why /static must be matched FIRST. */
export const POSTHOG_UPSTREAM_ASSETS: string = constants.POSTHOG_UPSTREAM_ASSETS;

/** Where "view this in PostHog" links should point. Not an ingestion host: `eu.posthog.com`
 *  is the app, `eu.i.posthog.com` is the API. Without this, posthog-js derives the app URL
 *  from `api_host` and every such link would point at our own domain. */
export const POSTHOG_UI_HOST: string = constants.POSTHOG_UI_HOST;
