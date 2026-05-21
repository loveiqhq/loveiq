import type { Metadata } from "next";
import { notFound } from "next/navigation";
import GlossaryTermPage from "@features/glossary/ui/GlossaryTermPage";
import { getTermBySlug, getAllSlugs, resolveRelatedTerms } from "@/data/glossary-data";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const term = getTermBySlug(slug);

  if (!term) {
    return {
      title: "Term Not Found | LoveIQ Glossary",
    };
  }

  return {
    title: `${term.term} | LoveIQ Glossary`,
    description: term.definition,
    alternates: {
      canonical: `${siteUrl}/glossary/${slug}`,
    },
    openGraph: {
      title: `${term.term} | LoveIQ Glossary`,
      description: term.definition,
      type: "article",
      images: [
        {
          url: `${siteUrl}/images/og-image.png`,
          width: 1200,
          height: 630,
          alt: `${term.term} - LoveIQ Glossary`,
        },
      ],
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const term = getTermBySlug(slug);

  if (!term) {
    notFound();
  }

  const definedTermSchema = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: term.term,
    description: term.definition,
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      name: "LoveIQ Glossary",
      url: `${siteUrl}/glossary`,
    },
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Glossary", item: `${siteUrl}/glossary` },
      { "@type": "ListItem", position: 3, name: term.term, item: `${siteUrl}/glossary/${slug}` },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(definedTermSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <GlossaryTermPage
        term={term}
        relatedTermsWithLinks={resolveRelatedTerms(term.relatedTerms)}
      />
    </>
  );
}
