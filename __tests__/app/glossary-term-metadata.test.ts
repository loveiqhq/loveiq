import { describe, expect, it } from "vitest";
import { generateMetadata } from "@/app/glossary/[slug]/page";
import { getTermBySlug } from "@/data/glossary-data";

const metadataFor = (slug: string) => generateMetadata({ params: Promise.resolve({ slug }) });

// A page's openGraph and twitter objects replace the root layout's entirely. Until
// 3 Nov 2026 term pages set no twitter block, so all of them shared the homepage's
// title and description on X, and their OG tags had no url or site name.
describe("glossary term page metadata", () => {
  it("gives shares on X and OG the term's own title, description and URL", async () => {
    const term = getTermBySlug("aftercare")!;
    const metadata = await metadataFor("aftercare");
    const title = "Aftercare | LoveIQ Glossary";

    expect(metadata.title).toBe(title);
    expect(metadata.twitter).toMatchObject({ title, description: term.definition });
    expect(metadata.openGraph).toMatchObject({
      title,
      description: term.definition,
      siteName: "LoveIQ",
    });
    const canonical = metadata.alternates?.canonical;
    expect(String(canonical)).toMatch(/\/glossary\/aftercare$/);
    expect(metadata.openGraph?.url).toBe(canonical);
  });

  it("keeps the not-found title for an unknown slug", async () => {
    expect((await metadataFor("no-such-term")).title).toBe("Term Not Found | LoveIQ Glossary");
  });
});
