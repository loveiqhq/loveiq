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
    ];
  },
};

module.exports = withBundleAnalyzer(nextConfig);
