import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { jsonLdString } from "@shared/seo/json-ld";

describe("jsonLdString", () => {
  it("escapes `<` so a value cannot terminate the script tag", () => {
    const out = jsonLdString({ name: "</script><img onerror=alert(1)>" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c");
  });

  it("still parses back to the original object", () => {
    const value = { "@type": "Thing", name: "a < b", nested: { list: ["x</script>"] } };
    expect(JSON.parse(jsonLdString(value))).toEqual(value);
  });

  it("leaves ordinary content untouched apart from the escape", () => {
    expect(jsonLdString({ a: 1 })).toBe('{"a":1}');
  });
});

// Root-cause guard. `app/glossary/**` shipped raw `JSON.stringify` into a
// `<script type="application/ld+json">` for both the term and index pages, which
// bypasses the `<` escaping above. The glossary is generated from
// data/glossary-source.csv (`node scripts/update-glossary.js`), so a term
// containing `<` would have landed unescaped — latent rather than live, because
// no current term contains one.
//
// Fixing the three call sites does not stop a fourth being added, so this walks
// the tree instead of naming files.
describe("every JSON-LD script tag is escaped", () => {
  const ROOTS = ["app", "features", "shared"];
  const SKIP = new Set(["node_modules", ".next", "tests", "__tests__"]);

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (SKIP.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
  }

  const HELPER = "shared/seo/json-ld.ts"; // defines jsonLdString; mentions the type in its docstring

  const files = ROOTS.flatMap((r) => walk(join(process.cwd(), r)))
    .map((f) => [f.replace(process.cwd() + "/", ""), readFileSync(f, "utf8")] as const)
    .filter(([f, src]) => src.includes("application/ld+json") && f !== HELPER);

  // The exact set is pinned rather than counted. A threshold ("at least N") lets a
  // file drop out of coverage unnoticed — renaming the script type in one page
  // shrank the suite by a case and still passed. Adding or removing a JSON-LD page
  // should be a deliberate edit here.
  const EXPECTED_JSONLD_FILES = [
    "app/about/page.tsx",
    "app/glossary/[slug]/page.tsx",
    "app/glossary/page.tsx",
    "app/layout.tsx",
    "app/page.tsx",
  ];

  it("covers exactly the known JSON-LD pages", () => {
    expect(files.map(([f]) => f).sort()).toEqual([...EXPECTED_JSONLD_FILES].sort());
  });

  it.each(files.map(([f]) => f))("%s serializes via jsonLdString, not JSON.stringify", (file) => {
    const src = files.find(([f]) => f === file)![1];
    const raw = [...src.matchAll(/__html:\s*JSON\.stringify\(/g)];
    expect(raw, `${file} writes raw JSON.stringify into a script tag`).toHaveLength(0);
    expect(src).toContain("jsonLdString(");
  });
});
