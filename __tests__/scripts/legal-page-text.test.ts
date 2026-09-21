import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  /**
   * EVERY NEXT ROUTE FILE IS CALLED `page.tsx`.
   *
   * Left alone, all six legal pages produced titles beginning "page.tsx > …" — a token
   * shared by all of them, carrying no meaning, in the field the ranker weights twice.
   * The folder is the name a person would use.
   */
  it("titles a route chunk by its folder, not by page.tsx", async () => {
    // Same trick brain-upsert uses: copy the script to a temp dir so importing it
    // does not run its work, and bring `scripts/lib` along for its own imports.
    const src = readFileSync("scripts/brain-ingest-repo.mjs", "utf8").split("\n");
    const end = src.findIndex((l) => l.startsWith("process.chdir("));
    expect(end, "the script's top-level execution boundary moved").toBeGreaterThan(0);
    const dir = mkdtempSync(join(tmpdir(), "legal-chunk-"));
    mkdirSync(join(dir, "lib"), { recursive: true });
    cpSync("scripts/lib", join(dir, "lib"), { recursive: true });
    const file = join(dir, "chunker.mjs");
    writeFileSync(file, src.slice(0, end).join("\n"));
    const { chunkMarkdown } = (await import(file)) as {
      chunkMarkdown: (p: string, t: string) => Array<{ source_id: string; title: string }>;
    };

    const rows = chunkMarkdown("app/privacy-policy/page.tsx", md("privacy-policy"));
    expect(rows.length).toBeGreaterThan(3);
    for (const r of rows) {
      expect(r.title).not.toMatch(/^page\.tsx/);
      expect(r.title).toMatch(/^privacy-policy/);
      // The id still points at the real file, so the sweep and the URL stay correct.
      expect(r.source_id).toMatch(/^app\/privacy-policy\/page\.tsx#/);
    }
  });

  it("decodes entities rather than indexing them raw", () => {
    const all = PAGES.map(md).join("\n");
    expect(all).not.toMatch(/&(amp|nbsp|quot|mdash|rsquo);/);
  });
});
