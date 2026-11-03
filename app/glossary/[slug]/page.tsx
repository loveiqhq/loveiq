import type { Metadata } from "next";
import { notFound } from "next/navigation";
import GlossaryTermPage from "@features/glossary/ui/GlossaryTermPage";
import { getTermBySlug, getAllSlugs, resolveRelatedTerms } from "@/data/glossary-data";
import { jsonLdString } from "@shared/seo/json-ld";

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

  const title = `${term.term} | LoveIQ Glossary`;
  const url = `${siteUrl}/glossary/${slug}`;
  const image = `${siteUrl}/images/og-image.png`;

  // A page's openGraph and twitter replace the root layout's wholesale, so both are
  // spelled out: without them every term page shared the homepage's title and
  // description on X, and its OG tags had no url or site name.
  return {
    title,
    description: term.definition,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description: term.definition,
      type: "article",
      url,
      siteName: "LoveIQ",
      locale: "en_US",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: `${term.term} - LoveIQ Glossary`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: term.definition,
      images: [image],
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const term = getTermBySlug(slug);

  if (!term) {
    notFound();
  }

  // `@id`s tie each term to the one glossary set the index page declares.
  const definedTermSchema = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    "@id": `${siteUrl}/glossary/${slug}#term`,
    name: term.term,
    description: term.definition,
    url: `${siteUrl}/glossary/${slug}`,
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      "@id": `${siteUrl}/glossary#glossary`,
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
      {/* Paint the page surface white in the initial server shell (global body bg
          is dark) → no dark flash before the client component hydrates. */}
      <style dangerouslySetInnerHTML={{ __html: "html,body{background:#ffffff;}" }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(definedTermSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbSchema) }}
      />
      <GlossaryTermPage
        term={term}
        relatedTermsWithLinks={resolveRelatedTerms(term.relatedTerms)}
      />
    </>
  );
}
