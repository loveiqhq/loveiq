/**
 * The prose out of a legal page that is written as a React component.
 *
 * Six customer-facing pages — privacy policy, both sets of terms, the cookie policy,
 * the imprint and the digital-content terms — are `.tsx`, so `git ls-files "*.md"`
 * has never seen them. Measured 2026-09-21: a sentence taken straight out of the
 * privacy policy, "Art. 6(1)(f) GDPR (legitimate interest)", appeared in ZERO chunks.
 * "What is our legal basis for processing" and "what do our refund terms say" had no
 * source at all — for a company holding sexual-health data, the document you most
 * need quoted rather than paraphrased.
 *
 * Output is MARKDOWN on purpose, so `chunkMarkdown` can section it: the heading
 * structure, the `path#slug` ids and the sweep all come for free, and
 * `## 7. Data Retention` becomes a retrievable section the way a markdown heading
 * would.
 *
 * Its own module rather than a function inside the ingest script, because that script
 * runs its work at import time and so cannot be imported by a test.
 */
const JSX_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  rsquo: "\u2019",
  lsquo: "\u2018",
  ldquo: "\u201c",
  rdquo: "\u201d",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  szlig: "ß",
};

function stripJsx(t) {
  return (
    String(t)
      // Remaining JSX expressions. className and the rest live inside a tag, so the
      // tag strip below removes them; this catches text-position ones like {" "}.
      .replace(/\{[^{}]*\}/g, " ")
      .replace(/<\/?>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&([a-zA-Z#0-9]+);/g, (m, e) => JSX_ENTITIES[e] ?? m)
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
  );
}

export function legalPageToMarkdown(tsx) {
  // Only the rendered tree: everything above `return (` is imports and metadata.
  const at = tsx.indexOf("return (");
  let s = at >= 0 ? tsx.slice(at + "return (".length) : tsx;
  s = s.replace(/\{\s*["'`][\s\S]*?["'`]\s*\}/g, " "); // <style>{"..."} and friends
  s = s.replace(/\{\/\*[\s\S]*?\*\/\}/g, " "); // {/* comments */}
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  // A heading whose text wraps across lines must still be one markdown line, or the
  // `#` ends up alone and chunkMarkdown sees an empty section.
  const oneLine = (t) => stripJsx(t).replace(/\s+/g, " ").trim();
  s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_m, t) => `\n\n# ${oneLine(t)}\n\n`);
  s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_m, t) => `\n\n## ${oneLine(t)}\n\n`);
  s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_m, t) => `\n\n### ${oneLine(t)}\n\n`);
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, t) => `\n- ${oneLine(t)}`);
  s = s.replace(/<\/p>|<br\s*\/?>/gi, "\n");
  return stripJsx(s)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
