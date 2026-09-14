import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  POSTHOG_PROXY_PATH,
  POSTHOG_UI_HOST,
  POSTHOG_UPSTREAM_API,
  POSTHOG_UPSTREAM_ASSETS,
} from "@shared/analytics/posthog-proxy";

const ROOT = join(__dirname, "../../..");

type Rule = { source: string; destination: string };

/**
 * The rewrite rules Next will actually apply, read from the real config.
 *
 * Asserts the `beforeFiles` SHAPE, not just the contents. Returning a plain array is
 * `afterFiles`, which Next evaluates after its trailing-slash redirect — and PostHog's
 * capture endpoints end in a slash, so the POST gets a 308 and the event is lost with
 * nothing logged. The rules can be perfectly correct and still never run.
 */
async function rewriteRules(): Promise<Rule[]> {
   
  const config = require(join(ROOT, "next.config.js")) as {
    rewrites?: () => Promise<{ beforeFiles?: Rule[] } | Rule[]>;
  };
  expect(typeof config.rewrites).toBe("function");
  const result = await config.rewrites!();
  expect(
    Array.isArray(result),
    "rewrites() must return { beforeFiles }, not an array — an array is afterFiles and runs after the trailing-slash redirect"
  ).toBe(false);
  const { beforeFiles } = result as { beforeFiles?: Rule[] };
  expect(beforeFiles, "the proxy rules must be in beforeFiles").toBeDefined();
  return beforeFiles!;
}

/**
 * THE FAILURE THIS FILE EXISTS FOR.
 *
 * The browser's `api_host` and the rewrite rule are in two files that cannot import each
 * other — `next.config.js` is CommonJS and loads before any TypeScript is compiled. If they
 * disagree by one character, every analytics event posts to a path with no rewrite, Next
 * answers 404, posthog-js swallows it, and NOTHING is logged in the browser, on the server,
 * or in PostHog. The data simply stops, and the only symptom is a number going quietly to
 * zero on a dashboard nobody is watching that day.
 */
describe("the PostHog proxy path is the same in every place that spells it", () => {
  it("routes the browser's api_host through a rewrite that exists", async () => {
    const rules = await rewriteRules();
    const catchAll = rules.find((r) => r.source === `${POSTHOG_PROXY_PATH}/:path*`);
    expect(catchAll, `no rewrite matches api_host ${POSTHOG_PROXY_PATH}`).toBeDefined();
    expect(catchAll!.destination).toBe(`${POSTHOG_UPSTREAM_API}/:path*`);
  });

  /**
   * PostHog serves its JS from a DIFFERENT host than its API. If `/static/` is not matched
   * before the catch-all, the bundles are fetched from the ingestion host, 404, and
   * posthog-js never loads at all — which looks like "analytics is broken" rather than
   * "one rule is in the wrong order".
   */
  it("matches /static/ BEFORE the catch-all, since the asset host differs", async () => {
    const rules = await rewriteRules();
    const staticIdx = rules.findIndex((r) => r.source === `${POSTHOG_PROXY_PATH}/static/:path*`);
    const catchAllIdx = rules.findIndex((r) => r.source === `${POSTHOG_PROXY_PATH}/:path*`);
    expect(staticIdx).toBeGreaterThanOrEqual(0);
    expect(catchAllIdx).toBeGreaterThanOrEqual(0);
    expect(staticIdx).toBeLessThan(catchAllIdx);
    expect(rules[staticIdx]!.destination).toBe(`${POSTHOG_UPSTREAM_ASSETS}/static/:path*`);
  });

  /**
   * `/array/<token>/config.js` is posthog-js's remote config. It is an asset but does NOT
   * live under /static/, so the catch-all would send it to the ingestion host — a 200, but
   * off the CDN and not the request unproxied production makes (verified with a browser
   * against www.loveiq.org). Asset rules must therefore BOTH precede the catch-all.
   */
  it("routes the remote-config bundle to the asset host, before the catch-all", async () => {
    const rules = await rewriteRules();
    const arrayIdx = rules.findIndex((r) => r.source === `${POSTHOG_PROXY_PATH}/array/:path*`);
    const catchAllIdx = rules.findIndex((r) => r.source === `${POSTHOG_PROXY_PATH}/:path*`);
    expect(arrayIdx).toBeGreaterThanOrEqual(0);
    expect(arrayIdx).toBeLessThan(catchAllIdx);
    expect(rules[arrayIdx]!.destination).toBe(`${POSTHOG_UPSTREAM_ASSETS}/array/:path*`);
  });

  /**
   * The middleware matcher is a static string Next parses at build time, so it cannot
   * interpolate the constant. Left out of the exclusion, this middleware would run on every
   * event and every session-replay chunk — the highest-volume path on the site — and the
   * staging password gate would answer analytics requests with a login page.
   */
  it("is excluded from the middleware matcher", () => {
    const proxySource = readFileSync(join(ROOT, "proxy.ts"), "utf8");
    const matcher = /source:\s*"(\/\(\(\?![^"]+)"/.exec(proxySource);
    expect(matcher, "could not find the middleware matcher").not.toBeNull();
    // The matcher spells the path without its leading slash, e.g. `relay/`.
    expect(matcher![1]).toContain(`${POSTHOG_PROXY_PATH.replace(/^\//, "")}/`);
  });

  /** A relative path is the whole point — an absolute one would be blocked on hostname. */
  it("is a same-origin path, not a hostname", () => {
    expect(POSTHOG_PROXY_PATH.startsWith("/")).toBe(true);
    expect(POSTHOG_PROXY_PATH).not.toMatch(/^https?:/);
    expect(POSTHOG_PROXY_PATH.endsWith("/")).toBe(false);
  });

  /**
   * `/ingest` is the path in PostHog's own documentation, which makes it the first one a
   * blocklist author adds. Proxying onto it would spend the work and collect a shrinking
   * share of the benefit.
   */
  it("does not use PostHog's documented default path", () => {
    expect(POSTHOG_PROXY_PATH).not.toBe("/ingest");
  });

  /** The app host and the ingestion host are different machines; mixing them breaks links. */
  it("keeps the UI host separate from the ingestion host", () => {
    expect(POSTHOG_UI_HOST).not.toBe(POSTHOG_UPSTREAM_API);
    expect(POSTHOG_UI_HOST).toMatch(/^https:\/\//);
  });

  /**
   * `NEXT_PUBLIC_POSTHOG_HOST` must stay ABSOLUTE. `features/analytics/server/posthog.ts`
   * reads it inside a Vercel function, where a relative path has no origin to resolve
   * against — the fetch throws, the send is best-effort, and server-side purchase tracking
   * disappears with nothing in the logs. Half of all purchase events come from that path.
   */
  it("never becomes the value of NEXT_PUBLIC_POSTHOG_HOST", () => {
    const serverSender = readFileSync(join(ROOT, "features/analytics/server/posthog.ts"), "utf8");
    expect(serverSender).toContain("NEXT_PUBLIC_POSTHOG_HOST");
    expect(serverSender).not.toContain("POSTHOG_PROXY_PATH");

    const client = readFileSync(join(ROOT, "instrumentation-client.ts"), "utf8");
    expect(client).toContain("api_host: POSTHOG_PROXY_PATH");
  });
});

/**
 * Next's automatic trailing-slash redirect is DISABLED so the proxy can forward PostHog's
 * slash-terminated capture endpoints. That is a global switch, so `proxy.ts` has to do the
 * redirect itself or every page silently gains a duplicate URL — `/about/` and `/about`
 * both returning 200, which is an SEO regression nothing would alarm on.
 */
describe("the trailing-slash redirect survives being turned off globally", () => {
  const proxySource = readFileSync(join(ROOT, "proxy.ts"), "utf8");

  /**
   * Asserted against the PARSED config, not the file text.
   *
   * The first version of this matched `/skipTrailingSlashRedirect:\s*true/` against
   * next.config.js as a string — and passed with the setting deleted, because the sentence
   * two lines above it explaining the setting contains the same characters. A guard that
   * is satisfied by the comment describing it measures nothing at all.
   */
  it("turns Next's own redirect off, which is what lets the proxy forward /e/", () => {
     
    const config = require(join(ROOT, "next.config.js")) as { skipTrailingSlashRedirect?: boolean };
    expect(config.skipTrailingSlashRedirect).toBe(true);
  });

  it("replaces it in middleware, so pages behave exactly as before", () => {
    expect(proxySource).toContain("export function stripTrailingSlash");
    // Called, not merely defined — and before anything that assumes a normalised path.
    expect(proxySource).toMatch(/const trailingSlashRedirect = stripTrailingSlash\(request\)/);
    expect(proxySource).toMatch(/if \(trailingSlashRedirect\) return trailingSlashRedirect/);
  });
});

describe("stripTrailingSlash", () => {
  /**
   * A REAL NextRequest, not a hand-rolled stand-in.
   *
   * The first version of these tests mocked `nextUrl` with a plain `URL`, and every one of
   * them passed against an implementation that produced an INFINITE REDIRECT LOOP in
   * production — `/about/` answering 308 to `/about/`, five hops deep on a preview
   * deployment. The cause is that the real `nextUrl` is a NextURL, which re-applies Next's
   * trailing-slash normalisation when `pathname` is assigned, so the slash came back. A
   * plain URL does not do that, so the mock could never show the bug.
   */
  const req = (pathname: string, search = "") =>
    new NextRequest(`https://www.loveiq.org${pathname}${search}`);

  it("redirects a trailing slash away, with a 308 as Next did", async () => {
    const { stripTrailingSlash } = await import("@/proxy");
    const res = stripTrailingSlash(req("/about/"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(308);
    const location = new URL(res!.headers.get("location")!);
    expect(location.pathname).toBe("/about");
    // The assertion that actually catches a loop: the target must not be the input.
    expect(location.pathname).not.toBe("/about/");
  });

  it("leaves a normal path alone", async () => {
    const { stripTrailingSlash } = await import("@/proxy");
    expect(stripTrailingSlash(req("/about"))).toBeNull();
  });

  /** "/" IS a trailing slash. Stripping it yields "", which is not a path. */
  it("never touches the root", async () => {
    const { stripTrailingSlash } = await import("@/proxy");
    expect(stripTrailingSlash(req("/"))).toBeNull();
  });

  it("keeps the query string, so a UTM link does not lose its attribution", async () => {
    const { stripTrailingSlash } = await import("@/proxy");
    const res = stripTrailingSlash(req("/survey/", "?utm_source=x&utm_campaign=y"));
    expect(res).not.toBeNull();
    const loc = new URL(res!.headers.get("location")!);
    expect(loc.pathname).toBe("/survey");
    expect(loc.search).toBe("?utm_source=x&utm_campaign=y");
  });
});
