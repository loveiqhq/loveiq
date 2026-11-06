import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getAllSlugs, glossaryTerms, resolveRelatedTerms } from "@/data/glossary-data";
import redirectsConfig from "@features/glossary/glossary-redirects.constants.js";

const { GLOSSARY_MERGED, GLOSSARY_REMOVED } = redirectsConfig;
// Old URLs the redirect and 404 tests request on purpose; they must stay dead.
const RETIRED = new Set([...Object.keys(GLOSSARY_MERGED), ...GLOSSARY_REMOVED]);

// data/glossary-data.ts is edited by hand since the CSV generator was retired
// (3 Nov 2026). These checks stop a hand edit from breaking links: related-term
// chips resolve by name (resolveRelatedTerms), and a few pages and tests
// hard-code term URLs.

const SOURCE_DIRS = ["app", "features", "shared", "data", "e2e", "scripts", "__tests__"];
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "coverage",
  "test-results",
  "playwright-report",
]);
const SOURCE_FILE = /\.(ts|tsx|js|mjs|cjs)$/;
// A term URL inside a string literal ("/glossary/<slug>"), not a file path such
// as app/glossary/page.tsx or a regex like /glossary/i.
const TERM_URL = /["'`]\/glossary\/([a-z0-9][a-z0-9-]*)(?=["'`?#)])/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP_DIRS.has(entry.name)) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return SOURCE_FILE.test(entry.name) ? [full] : [];
  });
}

describe("glossary data integrity", () => {
  const live = new Set(getAllSlugs());

  it("has unique ids and slugs", () => {
    expect(new Set(glossaryTerms.map((t) => t.id)).size).toBe(glossaryTerms.length);
    expect(live.size).toBe(glossaryTerms.length);
  });

  it("redirects every merged duplicate to a live term, never to another redirect", () => {
    for (const [from, to] of Object.entries(GLOSSARY_MERGED)) {
      expect(live.has(from), `${from} should have no page`).toBe(false);
      expect(live.has(to), `${to} should be live`).toBe(true);
    }
  });

  it("keeps removed terms removed, and never also redirects them", () => {
    expect(GLOSSARY_REMOVED.filter((slug) => live.has(slug))).toEqual([]);
    expect(GLOSSARY_REMOVED.filter((slug) => slug in GLOSSARY_MERGED)).toEqual([]);
  });

  it("has no placeholder definitions", () => {
    const placeholders = glossaryTerms.filter((t) => /^a glossary entry for\b/i.test(t.definition));
    expect(placeholders.map((t) => t.slug)).toEqual([]);
  });

  it("resolves every related-term name to a live term", () => {
    const unresolved = glossaryTerms.flatMap((t) =>
      resolveRelatedTerms(t.relatedTerms)
        .filter((related) => related.slug === null)
        .map((related) => `${t.slug} → ${related.name}`)
    );
    expect(unresolved).toEqual([]);
  });

  it("keeps at least two related terms per page, without repeats or self-links", () => {
    const problems = glossaryTerms.flatMap((t) => {
      const names = t.relatedTerms.map((n) => n.toLowerCase());
      const issues: string[] = [];
      if (names.length < 2) issues.push(`${t.slug}: ${names.length} related`);
      if (new Set(names).size !== names.length) issues.push(`${t.slug}: repeated related term`);
      if (names.includes(t.term.toLowerCase())) issues.push(`${t.slug}: lists itself`);
      return issues;
    });
    expect(problems).toEqual([]);
  });

  // Reads every source file; a cold Windows disk needs well over the 15 s default.
  it("only hard-codes term URLs that exist", { timeout: 90_000 }, () => {
    const root = process.cwd();
    const dead = SOURCE_DIRS.flatMap((dir) => sourceFiles(path.join(root, dir))).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(TERM_URL)]
        .map((match) => match[1]!)
        .filter((slug) => !live.has(slug) && !RETIRED.has(slug))
        .map((slug) => `${path.relative(root, file)}: /glossary/${slug}`)
    );
    expect(dead).toEqual([]);
  });

  it("keeps the term page the e2e and visual specs open", () => {
    expect(live.has("abandonment-insecurity")).toBe(true);
  });

  // Until 3 Nov 2026, 33 later-added terms showed only copied filler: lines prefixed
  // "Example:" / "Another example:" and texts pasted onto up to 12 unrelated terms
  // ("Feeling close after repair"). A few genuine examples fit up to three related
  // terms (e.g. "Needing time alone after conflict"), so the cap is above that.
  it("shows no placeholder or mass-copied examples", () => {
    const prefixed = glossaryTerms.filter((t) =>
      t.examples.some((e) => /^(another\s+)?example:/i.test(e))
    );
    expect(prefixed.map((t) => t.slug)).toEqual([]);

    const usedBy = new Map<string, string[]>();
    for (const t of glossaryTerms) {
      for (const example of new Set(t.examples.map((e) => e.trim().toLowerCase()))) {
        usedBy.set(example, [...(usedBy.get(example) ?? []), t.slug]);
      }
    }
    const massCopied = [...usedBy].filter(([, slugs]) => slugs.length > 3);
    expect(massCopied).toEqual([]);
  });

  // The full data is ~690 KB. A client component importing it (statically or with
  // import()) ships it to every visitor; the index used to do exactly that, which is
  // also why its server HTML had no term links. Type-only imports are fine.
  it("keeps the full term data out of client components", { timeout: 90_000 }, () => {
    const root = process.cwd();
    const valueImport =
      /import\s+(?!type\b)[^;]*?from\s+["']@\/data\/glossary-data["']|import\(\s*["']@\/data\/glossary-data["']\s*\)/;
    const offenders = ["app", "features", "shared"]
      .flatMap((dir) => sourceFiles(path.join(root, dir)))
      .filter((file) => {
        const src = readFileSync(file, "utf8");
        return /^\s*["']use client["']/.test(src) && valueImport.test(src);
      })
      .map((file) => path.relative(root, file));
    expect(offenders).toEqual([]);
  });
});
