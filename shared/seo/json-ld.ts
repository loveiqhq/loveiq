/**
 * Serialize a JSON-LD object for embedding in a `<script type="application/ld+json">`.
 *
 * Escapes `<` so a string value can never terminate the script tag early (e.g. a
 * stray `</script>` or a misconfigured `NEXT_PUBLIC_SITE_URL`), which would break
 * HTML parsing and, the moment any dynamic value enters the schema, become a
 * script-injection vector. Mirrors how Next.js serializes `__NEXT_DATA__`.
 */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
