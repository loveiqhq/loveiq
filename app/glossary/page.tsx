import type { Metadata } from "next";
import { glossaryTerms } from "@/data/glossary-data";
import GlossaryPage from "@features/glossary/ui/GlossaryPage";
import { toIndexEntries } from "@features/glossary/logic/index-entries";
import { jsonLdString } from "@shared/seo/json-ld";

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

// Each term page's DefinedTerm points back here through this @id.
const definedTermSetSchema = {
  "@context": "https://schema.org",
  "@type": "DefinedTermSet",
  "@id": `${siteUrl}/glossary#glossary`,
  name: "LoveIQ Glossary",
  description:
    "Your guide to the terminology of self-understanding. Decode the language of intimacy, psychology, and personal growth with LoveIQ's comprehensive glossary.",
  url: `${siteUrl}/glossary`,
};

// Built once per server instance. The index gets only name, link, filter group and
// definition (for search): ~70 KB instead of the ~630 KB of full term data.
const ENTRIES = toIndexEntries(glossaryTerms);

type Props = {
  searchParams: Promise<{ q?: string | string[] }>;
};

// No Suspense around GlossaryPage and no useSearchParams inside it: the term links
// must be in the first HTML response, never behind a fallback or a client-only render.
export default async function Page({ searchParams }: Props) {
  const { q } = await searchParams;
  const initialQuery = typeof q === "string" ? q.slice(0, 100) : "";

  return (
    <>
      {/* Paint the page surface white before the client component hydrates (global
          body bg is dark). Rendered into the server HTML → no dark flash. */}
      <style dangerouslySetInnerHTML={{ __html: "html,body{background:#ffffff;}" }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(definedTermSetSchema) }}
      />
      <GlossaryPage entries={ENTRIES} initialQuery={initialQuery} />
    </>
  );
}
