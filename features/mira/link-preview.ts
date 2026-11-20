import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

export const MIRA_TITLE = "Mira, your AI coach for body confidence in sex | LoveIQ";
export const MIRA_DESCRIPTION =
  "Talk privately with Mira, LoveIQ's AI coach for body confidence in sex. Free beta, no account needed to start.";
export const MIRA_IMAGE_ALT = "Mira, your AI coach for body confidence in sex, by LoveIQ";

/**
 * A Mira page's link preview (21 Nov 2026). Until then Mira's pages inherited the home page's:
 * the assessment's title and description, and the home page as og:url and canonical. Each page
 * now names itself. A page's openGraph replaces its parents' whole, image included, so each names
 * the image too: app/mira/opengraph-image.tsx, served at /mira/opengraph-image. Twitter takes the
 * image from openGraph. The pages stay noindex (their own `robots`).
 */
export function miraLinkPreview(path: `/mira${string}`): Metadata {
  const url = `${siteUrl}${path}`;
  return {
    description: MIRA_DESCRIPTION,
    alternates: { canonical: url },
    openGraph: {
      title: MIRA_TITLE,
      description: MIRA_DESCRIPTION,
      url,
      siteName: "LoveIQ",
      type: "website",
      locale: "en_US",
      images: [{ url: "/mira/opengraph-image", width: 1200, height: 630, alt: MIRA_IMAGE_ALT }],
    },
    twitter: { card: "summary_large_image", title: MIRA_TITLE, description: MIRA_DESCRIPTION },
  };
}
