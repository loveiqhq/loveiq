const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["lenis"],
  poweredByHeader: false,
  /**
   * Publish browser source maps so production stack traces are readable.
   *
   * Without these, every frame PostHog captures resolves to a minified name —
   * `z`, `sK`, `sa` — against a hashed chunk, and each one is annotated
   * "Could not find sourcemap for source url". That message is PostHog already
   * TRYING to fetch a map from the asset URL: its docs only require an upload
   * step "if your source maps are not publicly hosted". Serving them is
   * therefore the whole fix — no posthog-cli, no CI secret, no API key.
   *
   * This costs nothing in exposure: the repository is public, so the
   * unminified source is already readable on GitHub. Maps are fetched on
   * demand by devtools and by PostHog's backend, never by a visitor's page
   * load, so there is no effect on what users download.
   */
  /**
   * `show_page` reads committed screenshots off disk rather than over HTTP.
   *
   * Next only bundles what a route IMPORTS, so `public/` is served to browsers but is not
   * on the filesystem a serverless function sees. The first version fetched them from the
   * site's own origin instead, which meant the tool depended on NEXT_PUBLIC_SITE_URL --
   * and that is `http://localhost:3000` in local env, so every local run threw against a
   * dead server, while a preview deployment would have read production's copy rather than
   * its own. Tracing the files in removes the network hop and the ambiguity together: each
   * deployment reads the screenshots it was built with.
   */
  outputFileTracingIncludes: {
    "/api/mcp": ["./public/page-shots/**"],
  },

  productionBrowserSourceMaps: true,
  // `next dev` appends a managed block with its own H1 to CLAUDE.md whenever it
  // detects an AI coding agent. Two H1s fail markdownlint, so the pre-push hook
  // then rejects the push -- and this repo is worked in by coding agents daily.
  // The block's one useful point (Next 16 differs from training data; read
  // node_modules/next/dist/docs/) is written into CLAUDE.md by hand instead, so
  // nothing is lost and no external tool edits our curated doc.
  agentRules: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  compiler: {
    // Remove console.log in production
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  async redirects() {
    return [
      // /waitlist was retired — keep external links working by sending them into the survey funnel.
      { source: "/waitlist", destination: "/survey", permanent: true },
    ];
  },
  /**
   * Serve PostHog from our own origin so ad blockers do not match it on hostname.
   *
   * The path is kept in ONE place — `shared/analytics/posthog-proxy.ts` — and asserted
   * against these rules by `features/analytics/tests/posthog-proxy.test.ts`, because the
   * browser's `api_host` and this rewrite silently disagreeing would send every event into
   * a 404 with nothing logged anywhere.
   *
   * ORDER MATTERS. PostHog serves its JS from a DIFFERENT host (`eu-assets`) than its API
   * (`eu.i`), so `/static/` has to be matched before the catch-all or the bundles are
   * fetched from the ingestion host and 404.
   */
  /**
   * Next normalises a trailing slash with a 308 BEFORE any rewrite is considered —
   * `beforeFiles` included, verified on a preview deployment. Several PostHog endpoints
   * end in a slash (`/i/v0/e/`, `/e/`, `/s/`), so with the default behaviour every capture
   * POST is answered with a redirect instead of being forwarded, and a 308 on a POST is
   * the quiet kind of broken: some clients re-POST, some drop the body, posthog-js reports
   * nothing either way.
   *
   * Turning the automatic redirect off is global, so `proxy.ts` now performs the identical
   * redirect itself for every path EXCEPT the proxy — see `stripTrailingSlash` there.
   * Net effect on pages: none. `/about/` still 308s to `/about`, which production does
   * today and which the sitemap and canonicals assume.
   */
  skipTrailingSlashRedirect: true,
  async rewrites() {
    const {
      POSTHOG_PROXY_PATH,
      POSTHOG_UPSTREAM_API,
      POSTHOG_UPSTREAM_ASSETS,
    } = require("./shared/analytics/posthog-proxy.constants.js");
    /**
     * `beforeFiles`, NOT a plain array.
     *
     * A plain array is `afterFiles`, which Next evaluates AFTER its automatic
     * trailing-slash redirect. Several PostHog endpoints end in a slash — `/i/v0/e/`,
     * `/e/`, `/s/` — so `afterFiles` had Next answer the capture POST with a 308 to the
     * slashless path. Measured on a preview deployment: `POST /relay/i/v0/e/` → 308,
     * while the same body sent straight to PostHog → 200. A 308 on a POST is the quiet
     * kind of broken: some clients re-POST, some drop the body, and posthog-js reports
     * nothing either way, so events would have gone missing with every test still green.
     *
     * PostHog's own docs solve this with `skipTrailingSlashRedirect: true`, which is a
     * GLOBAL switch — it would also stop `/about/` redirecting to `/about` on a marketing
     * site that relies on that today (verified: production 308s it). `beforeFiles` fixes
     * only the proxy path and leaves every page's URL behaviour exactly as it was.
     */
    return {
      beforeFiles: [
        {
          source: `${POSTHOG_PROXY_PATH}/static/:path*`,
          destination: `${POSTHOG_UPSTREAM_ASSETS}/static/:path*`,
        },
        {
          // The remote-config bundle. It is an ASSET despite not living under /static/,
          // and unproxied production fetches it from the asset host — verified by running
          // a browser against www.loveiq.org and reading the request log. The catch-all
          // below would send it to the ingestion host instead: still a 200, but off the
          // CDN and no longer the same request production makes.
          source: `${POSTHOG_PROXY_PATH}/array/:path*`,
          destination: `${POSTHOG_UPSTREAM_ASSETS}/array/:path*`,
        },
        {
          source: `${POSTHOG_PROXY_PATH}/:path*`,
          destination: `${POSTHOG_UPSTREAM_API}/:path*`,
        },
      ],
    };
  },
  // Cache headers for static public assets (security headers are in proxy.ts)
  async headers() {
    return [
      {
        // Videos — long cache, immutable (filenames change when content changes)
        source: "/:path*.mp4",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // Images — long cache
        source: "/:path*.{jpg,jpeg,png,webp,gif,avif}",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // SVGs — long cache
        source: "/:path*.svg",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // Self-hosted fonts (app/fonts.css). Content-hashed names, so a new font is a new
        // file; the same caching next/font gave them under /_next/static.
        source: "/fonts/:path*.woff2",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

module.exports = withBundleAnalyzer(nextConfig);
