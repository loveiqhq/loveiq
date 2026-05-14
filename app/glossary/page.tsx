import { Suspense } from "react";
import type { Metadata } from "next";
import GlossaryPage from "@features/glossary/ui/GlossaryPage";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

export const metadata: Metadata = {
  title: "Glossary | LoveIQ Psychology Terms & Concepts",
  description:
    "Your guide to the terminology of self-understanding. Decode the language of intimacy, psychology, and personal growth with LoveIQ's comprehensive glossary.",
  alternates: {
    canonical: `${siteUrl}/glossary`,
  },
  openGraph: {
    title: "Glossary | LoveIQ Psychology Terms & Concepts",
    description:
      "Your guide to the terminology of self-understanding. Decode the language of intimacy, psychology, and personal growth with LoveIQ's comprehensive glossary.",
    url: `${siteUrl}/glossary`,
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
    title: "Glossary | LoveIQ Psychology Terms & Concepts",
    description:
      "Your guide to the terminology of self-understanding. Decode the language of intimacy, psychology, and personal growth with LoveIQ's comprehensive glossary.",
    images: [`${siteUrl}/images/og-image.png`],
  },
};

const definedTermSetSchema = {
  "@context": "https://schema.org",
  "@type": "DefinedTermSet",
  name: "LoveIQ Glossary",
  description:
    "Your guide to the terminology of self-understanding. Decode the language of intimacy, psychology, and personal growth with LoveIQ's comprehensive glossary.",
  url: `${siteUrl}/glossary`,
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(definedTermSetSchema) }}
      />
      <Suspense fallback={null}>
        <GlossaryPage />
      </Suspense>
    </>
  );
}
