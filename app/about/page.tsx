import type { Metadata } from "next";
import AboutPage from "@features/about/ui/AboutPage";
import { jsonLdString } from "@shared/seo/json-ld";

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

// E-E-A-T: makes the leadership team rendered on this page machine-readable and
// reconciles each person to the LoveIQ organization entity via worksFor.
// Keep in sync with features/about/ui/TeamSection.tsx (source of truth for the roster).
const teamSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      name: "Eman Cickusic",
      jobTitle: "Tech Lead",
      worksFor: { "@id": `${siteUrl}/#organization` },
      sameAs: ["https://www.linkedin.com/in/eman-cickusic/"],
    },
    {
      "@type": "Person",
      name: "Ferhad Jukić",
      jobTitle: "Full-Stack Engineer",
      worksFor: { "@id": `${siteUrl}/#organization` },
      sameAs: ["https://www.linkedin.com/in/ferhad-juki%C4%87-7a9049333/"],
    },
    {
      "@type": "Person",
      name: "Marcus Börner",
      jobTitle: "Strategy Lead",
      worksFor: { "@id": `${siteUrl}/#organization` },
      sameAs: ["https://www.linkedin.com/in/marcusb1/"],
    },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(teamSchema) }}
      />
      <AboutPage />
    </>
  );
}
