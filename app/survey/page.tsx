import type { Metadata } from "next";
import SurveyPage from "@features/survey/ui/SurveyPage";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

export const metadata: Metadata = {
  title: "Survey Intro | LoveIQ",
  description:
    "Prepare to discover your sexual archetypes with LoveIQ's science-backed assessment. This short guide helps you get the most meaningful and accurate results.",
  alternates: {
    canonical: `${siteUrl}/survey`,
  },
  openGraph: {
    title: "Survey Intro | LoveIQ",
    description:
      "Prepare to discover your sexual archetypes with LoveIQ's science-backed assessment.",
    url: `${siteUrl}/survey`,
    siteName: "LoveIQ",
    type: "website",
    images: [
      {
        url: `${siteUrl}/images/og-image.png`,
        width: 1200,
        height: 630,
        alt: "LoveIQ - Science-backed sexual psychology assessment",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Survey Intro | LoveIQ",
    description:
      "Prepare to discover your sexual archetypes with LoveIQ's science-backed assessment.",
    images: [`${siteUrl}/images/og-image.png`],
  },
};

export default function Page() {
  return <SurveyPage />;
}
