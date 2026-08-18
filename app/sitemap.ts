import type { MetadataRoute } from "next";
import { getAllSlugs } from "@/data/glossary-data";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

const coreRoutes = ["/"];

// /survey and /report are intentionally excluded — disallowed in robots.ts.
const mainRoutes = ["/about", "/glossary", "/trust-zone"];

// Legal pages are indexable on purpose: they are original text, people search
// for them by name, and an accessible privacy policy / terms set is a trust
// signal for a site that takes payments and handles sensitive data. They sit at
// a low priority so they never compete with real content.
const legalRoutes = [
  "/privacy-policy",
  "/terms-of-use",
  "/terms-and-conditions",
  "/digital-content-terms",
  "/medical-disclaimer",
  "/cookies",
  "/imprint",
];

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

  const legalEntries = legalRoutes.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: siteLastModified,
    changeFrequency: "yearly" as const,
    priority: 0.3,
  }));

  const glossaryLastModified = new Date("2026-02-28");

  const glossaryEntries = getAllSlugs().map((slug) => ({
    url: `${siteUrl}/glossary/${slug}`,
    lastModified: glossaryLastModified,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [...coreEntries, ...mainEntries, ...legalEntries, ...glossaryEntries];
}
