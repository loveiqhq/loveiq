import { headers } from "next/headers";
import LandingPage from "@features/landing/ui/LandingPage";
import LandingPageWhite from "@features/landing/ui/white/LandingPageWhite";
import { jsonLdString } from "@shared/seo/json-ld";
import {
  LANDING_VARIANT_HEADER,
  normalizeLandingVariant,
} from "@shared/experiments/landingVariant";
import { faqs } from "@/data/faqs";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

// SoftwareApplication describes the product itself, so it lives on the homepage
// (the page about the product) rather than site-wide — keeps the aggregateRating
// off pages that are not about the app. publisher reconciles to the Organization
// node emitted in app/layout.tsx via its shared @id.
const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "LoveIQ",
  description:
    "Science-backed sexual psychology assessment that maps your desire patterns, attachment style, and intimacy blueprint across 14 psychological dimensions.",
  url: siteUrl,
  publisher: { "@id": `${siteUrl}/#organization` },
  applicationCategory: "HealthApplication",
  operatingSystem: "Web",
  inLanguage: "en-US",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "EUR",
    description: "Free introductory assessment. Advanced reports available as one-time purchase.",
  },
  // NOTE: aggregateRating intentionally omitted. We do not self-assert a rating in
  // our schema — on-page review social proof now comes from the Trustpilot widget,
  // which carries its own review structured data. Re-add an aggregateRating here only
  // when sourced from a genuine, owned ratings corpus (value + count); emitting an
  // unbacked figure misrepresents the data and risks a Google rich-result penalty.
};

// Built from the same `faqs` array that S13FAQ renders, so the FAQPage markup is
// byte-for-byte identical to the visible FAQ (Google requires the match).
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  })),
};

// E-E-A-T: the academic board rendered on this page (features/landing/ui/S08AcademicBoard.tsx)
// emits no schema. These Person nodes make that expertise machine-readable and tie it to the
// LoveIQ organization entity via memberOf. Keep names/fields in sync with S08AcademicBoard.tsx.
const academicBoardSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      name: "Dr. Dijana Galijašević",
      description:
        "Member of the LoveIQ academic board, advising on business ethics and social science.",
      knowsAbout: ["Business Ethics", "Social Science"],
      affiliation: [
        { "@type": "CollegeOrUniversity", name: "Columbia University" },
        { "@type": "CollegeOrUniversity", name: "HHL Leipzig Graduate School of Management" },
      ],
      memberOf: { "@id": `${siteUrl}/#organization` },
    },
    {
      "@type": "Person",
      name: "Dr. Bruno Steinkraus",
      description:
        "Member of the LoveIQ academic board, advising on biochemistry and neuroscience.",
      knowsAbout: ["Biochemistry", "Neuroscience"],
      affiliation: [
        { "@type": "CollegeOrUniversity", name: "Imperial College London" },
        { "@type": "CollegeOrUniversity", name: "University of Oxford" },
      ],
      memberOf: { "@id": `${siteUrl}/#organization` },
    },
    {
      "@type": "Person",
      name: "Dr. Quentin Ferry",
      description:
        "Member of the LoveIQ academic board, advising on machine learning and molecular biology.",
      knowsAbout: ["Machine Learning", "Molecular Biology"],
      affiliation: [
        { "@type": "CollegeOrUniversity", name: "University of Oxford" },
        { "@type": "CollegeOrUniversity", name: "Massachusetts Institute of Technology" },
      ],
      memberOf: { "@id": `${siteUrl}/#organization` },
    },
  ],
};

export default async function Page() {
  // White-landing A/B: the arm is decided in proxy.ts and handed over via the
  // x-landing-variant request header (correct even on the cookie-minting first
  // visit). JSON-LD + video preloads are variant-independent and render for both.
  const headersList = await headers();
  const variant = normalizeLandingVariant(headersList.get(LANDING_VARIANT_HEADER));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(softwareApplicationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(academicBoardSchema) }}
      />
      {/* Hero LCP preloads, per variant — the dark hero is video, the white hero
          is a decorative image. Emitting only the active arm's asset avoids
          fetching multi-MB videos on white-arm visits (and vice versa). */}
      {variant === "white" ? (
        <link rel="preload" as="image" href="/images/white/hero-bg.png" />
      ) : (
        <>
          <link
            rel="preload"
            as="video"
            href="/couple-hero-mobile.mp4"
            type="video/mp4"
            media="(max-width: 640px)"
          />
          <link
            rel="preload"
            as="video"
            href="/couple-hero.mp4"
            type="video/mp4"
            media="(min-width: 641px)"
          />
        </>
      )}
      {variant === "white" ? <LandingPageWhite /> : <LandingPage />}
    </>
  );
}
