import { headers } from "next/headers";
import LandingPageWhite from "@features/landing/ui/white/LandingPageWhite";
import LandingPageWhiteV1 from "@features/landing/ui/white-v1/LandingPageWhiteV1";
import {
  LANDING_VARIANT_HEADER,
  normalizeLandingVariant,
} from "@shared/experiments/landingVariant";
import { jsonLdString } from "@shared/seo/json-ld";
import { faqs } from "@/data/faqs";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

// SoftwareApplication describes the product itself, so it lives on the homepage
// (the page about the product) rather than site-wide — keeps the aggregateRating
// off pages that are not about the app. publisher reconciles to the Organization
// node emitted in app/layout.tsx via its shared @id.
const assessmentId = `${siteUrl}/#assessment`;

const softwareApplicationSchema = {
  "@context": "https://schema.org",
  // Dual-typed: SoftwareApplication is the broad type, WebApplication the precise
  // one. The 2026-08-02 GEO audit found engines never describing this as a web tool
  // you can go and use; WebApplication is the type they match on. Both are emitted
  // because SoftwareApplication is the parent and some consumers only match that.
  "@type": ["SoftwareApplication", "WebApplication"],
  "@id": assessmentId,
  name: "LoveIQ",
  // Says 21 dimensions AND 14 archetypes, deliberately. This previously read
  // "across 14 psychological dimensions", which conflated the 14 ARCHETYPES with
  // the 21 DIMENSIONS. This string is the machine-readable description engines
  // quote, and the dimension count is precisely what they get wrong in the wild
  // (Claude asserted "seven dimensions" during the same audit). Keep the two
  // numbers distinct, and keep 21 in sync with data/scoring-config.ts.
  description:
    "Science-backed sexual psychology assessment that maps your desire patterns, attachment style, and intimacy blueprint across 21 measured dimensions, resolving to one of 14 archetypes.",
  url: siteUrl,
  publisher: { "@id": `${siteUrl}/#organization` },
  applicationCategory: "HealthApplication",
  operatingSystem: "Web",
  browserRequirements: "Requires JavaScript. Runs in any modern browser.",
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

// The assessment as an assessment, which SoftwareApplication does not express.
// Added after the 2026-08-02 GEO audit: on "what is my sexual archetype" the
// engines answer by listing quiz TOOLS, so being typed as a Quiz is how you get
// into that list. Lives on the homepage (the page that describes the test) and
// points at /survey where it is actually taken.
//
// TODO(timeRequired): deliberately omitted. The site says 15 minutes, the measured
// median is nearer 11 (TOTAL_MINUTES in the survey config is a hardcoded estimate,
// not a measurement). Add `timeRequired` as an ISO 8601 duration once the real
// median lands, rather than marking up a number we know is wrong.
const quizSchema = {
  "@context": "https://schema.org",
  "@type": "Quiz",
  "@id": `${siteUrl}/#quiz`,
  name: "LoveIQ Sexual Archetype Assessment",
  url: `${siteUrl}/survey`,
  description:
    "A free psychological self-assessment. Answers are scored deterministically across 21 dimensions and resolve to one of 14 sexual archetypes, with a personalised report.",
  about: [
    { "@type": "Thing", name: "Sexual psychology" },
    { "@type": "Thing", name: "Attachment theory" },
    { "@type": "Thing", name: "Relationship intimacy" },
  ],
  assesses: [
    "Desire patterns",
    "Responsive desire tendency",
    "Attachment and relational security",
    "Sexual communication comfort",
    "Risk and novelty orientation",
  ],
  learningResourceType: "Assessment",
  educationalUse: "Self-assessment",
  educationalLevel: "General audience",
  inLanguage: "en-US",
  isAccessibleForFree: true,
  isPartOf: { "@id": assessmentId },
  provider: { "@id": `${siteUrl}/#organization` },
};

// Built from the same `faqs` array that WFAQ renders, so the FAQPage markup is
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

// E-E-A-T: the academic board rendered on this page (features/landing/ui/white/WFoundation.tsx)
// emits no schema. These Person nodes make that expertise machine-readable and tie it to the
// LoveIQ organization entity via memberOf. Keep names/fields in sync with WFoundation.tsx.
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
  // 50/50 A/B between the current white landing and the one before the 2026-08-10
  // rebuild. The arm is decided in proxy.ts and handed over as a request header
  // rather than read from cookies() here — on the visit that MINTS the cookie,
  // cookies() cannot see it yet, so the first render would show the wrong arm and
  // the second would flip. Both heroes are CSS-only, so neither needs a video
  // preload, and the JSON-LD below is product/site metadata: identical for both
  // arms, which is also what keeps `/` a single canonical page for crawlers (bots
  // are always served the current arm — see resolveLandingVariant).
  const variant = normalizeLandingVariant((await headers()).get(LANDING_VARIANT_HEADER));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(softwareApplicationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(quizSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(academicBoardSchema) }}
      />
      {variant === "white_prev" ? <LandingPageWhiteV1 /> : <LandingPageWhite />}
    </>
  );
}
