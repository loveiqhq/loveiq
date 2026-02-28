import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

export default function robots(): MetadataRoute.Robots {
  const isProduction = siteUrl === "https://www.loveiq.org";

  return {
    rules: {
      userAgent: "*",
      allow: isProduction ? "/" : undefined,
      disallow: isProduction ? "/api/" : "/",
    },
    sitemap: isProduction ? `${siteUrl}/sitemap.xml` : undefined,
  };
}
