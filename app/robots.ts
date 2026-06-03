import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

// Paths every crawler should skip:
//   /api/      — server-side endpoints with no public content
//   /admin     — internal, auth-gated dashboard (no public content, save crawl budget)
//   /report    — per-user reports (token-protected, no SEO/training value)
//   /survey    — interactive UX flow, indexable rendering would be misleading
//   /checkout  — transactional flow, no SEO value
//   /login     — auth/staging gate, no SEO value
const SHARED_DISALLOW = ["/api/", "/admin", "/report", "/survey", "/checkout", "/login"];

// Explicit allowlist for the major AI-training and AI-search crawlers, so
// our policy toward them is intentional rather than defaulted-to via the `*`
// wildcard. Each gets the same disallow set as everyone else.
const AI_USER_AGENTS = [
  "GPTBot",
  "ChatGPT-User",
  "Google-Extended",
  "PerplexityBot",
  "ClaudeBot",
  "CCBot",
  "Applebot",
];

export default function robots(): MetadataRoute.Robots {
  const isProduction = siteUrl === "https://www.loveiq.org";

  if (!isProduction) {
    // Staging / dev: keep the whole site closed to crawlers.
    return {
      rules: { userAgent: "*", disallow: "/" },
    };
  }

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: SHARED_DISALLOW },
      ...AI_USER_AGENTS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: SHARED_DISALLOW,
      })),
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
