import type { MetadataRoute } from "next";
import { getAllSlugs } from "@/data/glossary-data";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

const coreRoutes = ["/"];

// /survey and /report are intentionally excluded — disallowed in robots.ts.
const mainRoutes = ["/about", "/glossary", "/trust-zone"];

export default function sitemap(): MetadataRoute.Sitemap {
  const siteLastModified = new Date();

  const coreEntries = coreRoutes.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: siteLastModified,
    changeFrequency: "weekly" as const,
    priority: 1.0,
  }));

  const mainEntries = mainRoutes.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: siteLastModified,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  const glossaryLastModified = new Date("2026-02-28");

  const glossaryEntries = getAllSlugs().map((slug) => ({
    url: `${siteUrl}/glossary/${slug}`,
    lastModified: glossaryLastModified,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [...coreEntries, ...mainEntries, ...glossaryEntries];
}
