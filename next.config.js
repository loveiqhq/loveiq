const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["lenis"],
  poweredByHeader: false,
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
