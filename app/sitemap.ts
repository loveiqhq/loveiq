import type { MetadataRoute } from "next";
import { getAllSlugs } from "@/data/glossary-data";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

const coreRoutes = ["/"];

const mainRoutes = ["/about", "/glossary", "/waitlist", "/trust-zone"];

const legalRoutes = [
  "/privacy-policy",
  "/terms-of-use",
  "/terms-and-conditions",
  "/medical-disclaimer",
  "/cookies",
  "/digital-content-terms",
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

  const glossaryEntries = getAllSlugs().map((slug) => ({
    url: `${siteUrl}/glossary/${slug}`,
    lastModified: siteLastModified,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [...coreEntries, ...mainEntries, ...legalEntries, ...glossaryEntries];
}
