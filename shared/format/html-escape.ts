/**
 * HTML entity escaping for any string that flows into a `dangerouslySetInnerHTML`,
 * an email body, or any other context where the value will be parsed as HTML.
 *
 * Treat user-controlled text (first names, archetype slugs from URLs, share
 * personal messages, etc.) as untrusted and escape before interpolating into
 * a template literal. Without this, an attacker can store XSS that fires for
 * a paying viewer when they open the report or for an admin reviewing the
 * submission queue.
 */
export function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * The inverse of `escapeHtml`: turn entities back into the characters they stand
 * for, for text we INGEST rather than render — mail bodies and paper titles that
 * arrive as HTML and are stored as prose.
 *
 * The named entities worth spelling out; every numeric form is handled generically.
 *
 * WHY A SINGLE PASS. The previous version ran `&amp;` -> `&` and then `&lt;` -> `<`
 * in sequence, so the literal text `&amp;lt;` decoded twice and came out as `<` —
 * a tag where the sender wrote an escaped one. Matching every entity in ONE regex
 * makes that impossible: each match is replaced from the original string.
 *
 * Measured 2026-09-19: 262 gmail chunks carried a raw entity, `&bull;` most often,
 * because only five were listed and marketing mail uses far more than five.
 */
const HTML_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  bull: "\u2022",
  middot: "\u00b7",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  minus: "\u2212",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  trade: "\u2122",
  reg: "\u00ae",
  copy: "\u00a9",
  deg: "\u00b0",
  euro: "\u20ac",
  rarr: "\u2192",
  larr: "\u2190",
  harr: "\u2194",
  zwnj: "",
  zwj: "",
  shy: "",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
};

/** A code point that is not text — a lone surrogate or out of range — is dropped. */
function fromCodePoint(n: number): string {
  if (!Number.isFinite(n) || n < 0x20 || n > 0x10ffff) return "";
  if (n >= 0xd800 && n <= 0xdfff) return "";
  return String.fromCodePoint(n);
}

export function decodeEntities(text: string): string {
  return text.replace(
    /&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/g,
    (whole, body: string) => {
      if (body.startsWith("#x") || body.startsWith("#X"))
        return fromCodePoint(parseInt(body.slice(2), 16));
      if (body.startsWith("#")) return fromCodePoint(Number(body.slice(1)));
      return HTML_ENTITIES[body.toLowerCase()] ?? whole;
    }
  );
}
