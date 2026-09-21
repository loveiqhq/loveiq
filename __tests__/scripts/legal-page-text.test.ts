import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs helper, no types
import { legalPageToMarkdown } from "../../scripts/lib/legal-page-text.mjs";

/**
 * THE LEGAL TEXT THE BRAIN COULD NOT QUOTE.
 *
 * Six customer-facing pages are React components, so `git ls-files "*.md"` never saw
 * them. Measured 2026-09-21: "Art. 6(1)(f) GDPR (legitimate interest)", lifted
 * verbatim out of the privacy policy, appeared in ZERO corpus chunks.
 *
 * These tests run against the REAL pages rather than a fixture, because the failure
 * mode is the JSX shape changing underneath the extractor — which a fixture, frozen
 * at the shape that worked, could never detect.
 */
const PAGES = [
  "privacy-policy",
  "terms-and-conditions",
  "terms-of-use",
  "cookies",
  "imprint",
  "digital-content-terms",
] as const;

const md = (p: string) => legalPageToMarkdown(readFileSync(`app/${p}/page.tsx`, "utf8")) as string;

describe("legal pages, extracted from JSX", () => {
  it.each(PAGES)("gets real prose out of %s", (page) => {
    const text = md(page);
    // The imprint is genuinely short; the rest are documents.
    expect(text.length).toBeGreaterThan(page === "imprint" ? 200 : 2000);
  });

  it.each(PAGES)("leaves no JSX behind in %s", (page) => {
    const text = md(page);
    // className lives inside a tag and must not survive; nor must the fragment
    // syntax, which `<[^>]+>` cannot match because it needs a character.
    expect(text).not.toMatch(/className|return \(|=>|<\/?>/);
    expect(text).not.toMatch(/<[a-zA-Z][^>]*>/);
  });

  it("keeps the headings, so a section is retrievable on its own", () => {
    const text = md("privacy-policy");
    expect((text.match(/^## /gm) ?? []).length).toBeGreaterThanOrEqual(8);
    // A heading whose source wraps across lines must still be ONE markdown line.
    expect(text).not.toMatch(/^#+\s*$/m);
  });

  it("keeps the substance somebody would actually ask about", () => {
    const text = md("privacy-policy");
    expect(text).toContain("Art. 6(1)(f) GDPR");
    expect(text).toContain("Controller");
  });

  it("decodes entities rather than indexing them raw", () => {
    const all = PAGES.map(md).join("\n");
    expect(all).not.toMatch(/&(amp|nbsp|quot|mdash|rsquo);/);
  });
});
