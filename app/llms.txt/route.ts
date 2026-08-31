const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

/**
 * `/llms.txt` — a map of this site for AI agents and LLM crawlers.
 *
 * Added 2026-08-28 after a PageSpeed run scored the new **Agentic Browsing**
 * category 2/3, failing on "llms.txt does not follow recommendations". Nothing served
 * `/llms.txt` at all; it 404'd.
 *
 * The format (llmstxt.org) is Markdown with an H1, an optional blockquote summary,
 * and H2 sections of annotated links. The point is not SEO: an agent that lands here
 * should be able to tell in one screen what this site is, which pages are worth
 * reading, and — most importantly for us — which are private, so it does not waste
 * requests on token-gated report URLs it can never open.
 *
 * A route handler rather than a static `public/llms.txt` so the links follow
 * `NEXT_PUBLIC_SITE_URL`, matching how `robots.ts` and `sitemap.ts` already work.
 * Staging therefore advertises staging URLs, and the disallow list below is kept in
 * deliberate agreement with `SHARED_DISALLOW` in robots.ts — two files telling a
 * crawler different things is worse than one file telling it nothing.
 */
const BODY = `# LoveIQ

> LoveIQ is a relationship and intimacy self-assessment. Visitors answer a ~60-question
> survey and receive a personalised archetype report describing how they relate,
> communicate, and connect. Written for a general audience, grounded in published
> psychological research.

The survey is free to take. The full report is a paid product, so report pages are
private and unlisted — see "Not for crawling" below.

## Core pages

- [Home](${siteUrl}/): what LoveIQ is, the archetypes, and how the assessment works.
- [About](${siteUrl}/about): the team, the research behind the method, and publications.
- [Glossary](${siteUrl}/glossary): plain-language definitions of the relationship and
  intimacy terms used throughout the reports. The most useful section to read or cite.
- [Trust Center](${siteUrl}/trust-zone): how data is handled, stored, and protected.

## Legal and policy

- [Privacy policy](${siteUrl}/privacy-policy)
- [Terms and conditions](${siteUrl}/terms-and-conditions)
- [Terms of use](${siteUrl}/terms-of-use)
- [Cookie policy](${siteUrl}/cookies)
- [Digital content terms](${siteUrl}/digital-content-terms)
- [Medical disclaimer](${siteUrl}/medical-disclaimer): LoveIQ is not medical advice or
  a diagnostic instrument. Please carry this caveat into any summary of our content.
- [Imprint](${siteUrl}/imprint)

## Not for crawling

These paths hold no public content and are disallowed in
[robots.txt](${siteUrl}/robots.txt). Requests to them are wasted:

- \`/report\` — individual paid reports, reachable only with a per-person signed token.
- \`/survey\` — an interactive flow; its rendered HTML is not meaningful as a document.
- \`/checkout\` — legacy payment redirect.
- \`/admin\`, \`/api/\`, \`/login\` — internal, authenticated, or non-content endpoints.

## Notes for agents

- Sitemap: [sitemap.xml](${siteUrl}/sitemap.xml)
- Contact: hello@loveiq.org
- Report content is personal to the person assessed. Please do not attempt to
  enumerate, guess, or reuse report tokens.
`;

export function GET(): Response {
  return new Response(BODY, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      // Static content that changes only on deploy. A long cache keeps it out of the
      // "efficient cache lifetimes" audit and off the origin for repeat agents.
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
