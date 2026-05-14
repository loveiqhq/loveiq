import type { Metadata } from "next";
import AboutPage from "@features/about/ui/AboutPage";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

export const metadata: Metadata = {
  title: "About LoveIQ | Science-led psychometric insights",
  description:
    "Learn how LoveIQ blends science, psychology, and technology to deliver transformative self-understanding through assessments, reports, and guided growth.",
  alternates: {
    canonical: `${siteUrl}/about`,
  },
  openGraph: {
    title: "About LoveIQ | Science-led psychometric insights",
    description:
      "Learn how LoveIQ blends science, psychology, and technology to deliver transformative self-understanding through assessments, reports, and guided growth.",
    url: `${siteUrl}/about`,
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
    title: "About LoveIQ | Science-led psychometric insights",
    description:
      "Learn how LoveIQ blends science, psychology, and technology to deliver transformative self-understanding through assessments, reports, and guided growth.",
    images: [`${siteUrl}/images/og-image.png`],
  },
};

export default function Page() {
  return <AboutPage />;
}
