import type { Metadata } from "next";

/**
 * Metadata for a page that must stay out of search results: a report link, /why, the survey,
 * checkout and the staging login. Spread it into the page's own metadata.
 *
 * - `robots`: noindex, nofollow. Google and Bing can read it because app/robots.ts lets them
 *   fetch these paths; a page they may not fetch never shows them its noindex.
 * - `alternates.canonical: null`: the root layout names the home page as the canonical, and a
 *   page keeps it unless its own `alternates` replaces it. Without this, a private page would
 *   tell Google "don't index me" and "I am the home page" at once.
 */
export const PRIVATE_PAGE_METADATA: Pick<Metadata, "robots" | "alternates"> = {
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};
